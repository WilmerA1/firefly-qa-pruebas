<?php

/*
 * subir-a-qatlas.php — "Reporter" de PHPUnit para QAtlas.
 *
 * Lee resultados/junit.xml + las líneas de evidencia, y con la API de QAtlas:
 *   1. POST /test-runs/ingest      → crea (o actualiza) la ejecución con 1 resultado por caso y 3 por paso.
 *   2. POST /attachments           → sube la evidencia de cada caso al PASO 3 (step_order=3).
 *   3. POST /test-runs/{id}/complete → cierra la ejecución si todo se subió bien.
 *
 * Variables de entorno:
 *   QATLAS_URL      (obligatoria) p. ej. https://servidor/qatlas/api
 *   QATLAS_TOKEN    (obligatoria) token "Solo ingesta (CI)" del proyecto
 *   QATLAS_PROJECT  código del proyecto (por defecto FF3)
 *   QATLAS_RUN_NAME nombre de la ejecución
 *   QATLAS_RUN_ID   external_id: con el mismo valor se actualiza la misma ejecución
 *   QATLAS_ENVIRONMENT, QATLAS_BUILD, QATLAS_BRANCH, QATLAS_COMMIT, QATLAS_CI_URL  contexto de la corrida
 *   QATLAS_CREATE_BUG_ON_FAILURE  "1" para abrir un defecto por cada caso fallido (por defecto no)
 *   QATLAS_COMPLETE "0" para dejar la ejecución En progreso (por defecto se completa)
 */

declare(strict_types=1);

function qatlasEnv(string $nombre, string $porDefecto = ''): string
{
    $valor = getenv($nombre);

    return (is_string($valor) && '' !== trim($valor)) ? trim($valor) : $porDefecto;
}

function qatlasLog(string $texto): void
{
    echo '[QAtlas] ' . $texto . "\n";
}

/**
 * @return array{0:int,1:mixed,2:string} [código HTTP, cuerpo decodificado, cuerpo crudo]
 */
function qatlasPeticion(string $base, string $token, string $metodo, string $ruta, ?array $json = null, ?array $multipart = null): array
{
    $ch      = curl_init($base . $ruta);
    $headers = ['Authorization: Bearer ' . $token, 'Accept: application/json'];
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $metodo);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    if (null !== $json) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    if (null !== $multipart) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $multipart);
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $crudo = curl_exec($ch);
    if (false === $crudo) {
        $error = curl_error($ch);

        return [0, null, 'Sin conexión con QAtlas: ' . $error];
    }
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

    return [$codigo, json_decode((string) $crudo, true), (string) $crudo];
}

function qatlasExplicarError(int $codigo, string $crudo): string
{
    $causa = match ($codigo) {
        0       => 'no se pudo conectar (revisá QATLAS_URL y tu internet)',
        400     => 'ningún resultado coincidió con un caso del proyecto (revisá los códigos en casos-qatlas.json)',
        401     => 'token mal copiado, vencido o revocado',
        403     => 'tu rol en el proyecto no permite ejecutar (necesitás Tester o Test Manager) o el token no es de este proyecto',
        404     => 'el código del proyecto no existe (revisá QATLAS_PROJECT, mayúsculas incluidas) o la URL está mal',
        409     => 'la ejecución con ese QATLAS_RUN_ID ya está completada; usá otro QATLAS_RUN_ID',
        422     => 'QAtlas rechazó el JSON',
        default => 'respuesta inesperada',
    };

    return sprintf('HTTP %d: %s. Respuesta: %s', $codigo, $causa, mb_substr($crudo, 0, 500));
}

/**
 * Convierte cada <testcase> del JUnit en un resultado de QAtlas con sus 3 pasos.
 *
 * @return array{0:list<array>,1:array<string,array>} [resultados para la API, detalle por código de caso]
 */
function qatlasArmarResultados(string $dir, array $casos): array
{
    $xml = simplexml_load_file($dir . '/junit.xml');
    if (false === $xml) {
        throw new RuntimeException('No se pudo leer resultados/junit.xml');
    }

    $resultados = [];
    $detalle    = [];

    foreach ($xml->xpath('//testcase') ?: [] as $tc) {
        $metodo = (string) $tc['name'];
        if (!isset($casos[$metodo])) {
            qatlasLog(sprintf('Aviso: el test "%s" no está en casos-qatlas.json; no se sube.', $metodo));

            continue;
        }
        $info    = $casos[$metodo];
        $archivo = $dir . '/' . $info['caso'] . '.txt';
        $linea   = is_file($archivo) ? trim((string) file_get_contents($archivo)) : '(la prueba no llegó a escribir su línea de evidencia)';
        [$p1, $p2, $p3] = $info['pasos'];

        if (isset($tc->error)) {
            $mensaje = trim((string) $tc->error);
            $estado  = 'failed';
            $pasos   = [
                ['title' => $p1, 'status' => 'passed'],
                ['title' => $p2, 'status' => 'failed', 'error_message' => 'Error de ejecución de PHPUnit: ' . $mensaje],
                ['title' => $p3, 'status' => 'blocked', 'error_message' => 'No se pudo comparar: la prueba no terminó de ejecutarse.'],
            ];
        } elseif (isset($tc->failure)) {
            $mensaje = trim((string) $tc->failure);
            $estado  = 'failed';
            $pasos   = [
                ['title' => $p1, 'status' => 'passed'],
                ['title' => $p2, 'status' => 'passed'],
                ['title' => $p3, 'status' => 'failed', 'error_message' => $linea],
            ];
        } elseif (isset($tc->skipped)) {
            $mensaje = 'Prueba omitida por PHPUnit.';
            $estado  = 'skipped';
            $pasos   = [
                ['title' => $p1, 'status' => 'skipped'],
                ['title' => $p2, 'status' => 'skipped'],
                ['title' => $p3, 'status' => 'skipped'],
            ];
        } else {
            $mensaje = null;
            $estado  = 'passed';
            $pasos   = [
                ['title' => $p1, 'status' => 'passed'],
                ['title' => $p2, 'status' => 'passed'],
                ['title' => $p3, 'status' => 'passed'],
            ];
        }

        $resultado = [
            'test_case_code' => $info['codigo'],
            'status'         => $estado,
            'duration_ms'    => (int) round(((float) $tc['time']) * 1000),
            'attempts'       => 1,
            'steps'          => $pasos,
        ];
        if (null !== $mensaje) {
            $resultado['error_message'] = mb_substr($linea . "\n" . $mensaje, 0, 4000);
        }
        $resultados[] = $resultado;

        $detalle[$info['codigo']] = [
            'caso'    => $info['caso'],
            'metodo'  => $metodo,
            'clase'   => (string) $tc['class'],
            'estado'  => $estado,
            'linea'   => $linea,
            'mensaje' => $mensaje,
            'tiempo'  => (string) $tc['time'],
        ];
    }

    return [$resultados, $detalle];
}

function qatlasEscribirEvidencia(string $dir, string $codigo, array $d, array $contexto): string
{
    $estado = ['passed' => 'APROBADO', 'failed' => 'FALLIDO', 'skipped' => 'OMITIDO'][$d['estado']] ?? $d['estado'];
    $texto  = implode("\n", array_filter([
        'Evidencia automática — Suite SU-UN (FF3-PLAN-1)',
        str_repeat('=', 50),
        'Caso:        ' . $codigo . ' · ' . $d['caso'],
        'Prueba:      ' . $d['clase'] . '::' . $d['metodo'],
        'Resultado:   ' . $estado . ' (' . $d['tiempo'] . ' s)',
        'Ejecutado:   ' . $contexto['fecha'],
        'Entorno:     ' . $contexto['entorno'] . ' · Firefly III 6.6.6 · ' . $contexto['php'] . ' · SQLite en memoria',
        $contexto['commit'] ? 'Commit:      ' . $contexto['commit'] : null,
        $contexto['ci_url'] ? 'Corrida CI:  ' . $contexto['ci_url'] : null,
        '',
        'Paso 3 — comparación obtenida vs. esperada:',
        '  ' . $d['linea'],
        $d['mensaje'] ? "\nDetalle de PHPUnit:\n" . $d['mensaje'] : null,
    ], static fn ($l) => null !== $l)) . "\n";

    $ruta = $dir . '/evidencia-' . $d['caso'] . '.txt';
    file_put_contents($ruta, $texto);

    return $ruta;
}

function subirAQatlas(string $dir): int
{
    $base     = rtrim(qatlasEnv('QATLAS_URL'), '/');
    $token    = qatlasEnv('QATLAS_TOKEN');
    $proyecto = qatlasEnv('QATLAS_PROJECT', 'FF3');

    if ('' === $base || '' === $token) {
        qatlasLog('Configuración incompleta: falta QATLAS_URL o QATLAS_TOKEN. No se subió nada.');

        return 1;
    }
    if (!str_ends_with($base, '/api')) {
        qatlasLog('Aviso: QATLAS_URL normalmente termina en /api (p. ej. https://servidor/qatlas/api).');
    }

    $mapa  = json_decode((string) file_get_contents(__DIR__ . '/casos-qatlas.json'), true);
    $casos = $mapa['casos'] ?? [];

    try {
        [$resultados, $detalle] = qatlasArmarResultados($dir, $casos);
    } catch (Throwable $e) {
        qatlasLog('Error: ' . $e->getMessage());

        return 1;
    }
    if ([] === $resultados) {
        qatlasLog('No hay resultados para subir.');

        return 1;
    }

    $zona  = new DateTimeZone(qatlasEnv('TZ', 'America/Costa_Rica'));
    $ahora = new DateTimeImmutable('now', $zona);
    $enCi  = '' !== qatlasEnv('GITHUB_ACTIONS');

    $run = array_filter([
        'name'        => qatlasEnv('QATLAS_RUN_NAME', 'EJ-UN-02 Ejecución automatizada PL-UN · ' . ($enCi ? 'GitHub Actions' : 'local') . ' · ' . $ahora->format('Y-m-d H:i')),
        'external_id' => qatlasEnv('QATLAS_RUN_ID', 'su-un-local-' . $ahora->format('Ymd-His')),
        'environment' => qatlasEnv('QATLAS_ENVIRONMENT', $enCi ? 'GitHub Actions' : 'Docker local'),
        'build'       => qatlasEnv('QATLAS_BUILD'),
        'branch'      => qatlasEnv('QATLAS_BRANCH'),
        'commit_sha'  => qatlasEnv('QATLAS_COMMIT'),
        'ci_url'      => qatlasEnv('QATLAS_CI_URL'),
    ], static fn ($v) => '' !== $v);

    $cuerpo = [
        'project'               => $proyecto,
        'run'                   => $run,
        'results'               => $resultados,
        'create_missing_cases'  => false,
        'create_bug_on_failure' => '1' === qatlasEnv('QATLAS_CREATE_BUG_ON_FAILURE'),
    ];
    file_put_contents($dir . '/ingesta-enviada.json', json_encode($cuerpo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    // 1. Ingesta
    [$codigo, $resp, $crudo] = qatlasPeticion($base, $token, 'POST', '/test-runs/ingest', $cuerpo);
    if ($codigo < 200 || $codigo >= 300 || !is_array($resp)) {
        qatlasLog('La ingesta falló — ' . qatlasExplicarError($codigo, $crudo));

        return 1;
    }
    file_put_contents($dir . '/ingesta-respuesta.json', json_encode($resp, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    $ejecucion = $resp['test_run'] ?? [];
    $runId     = $ejecucion['id'] ?? null;
    $runCodigo = (string) ($ejecucion['code'] ?? '?');
    qatlasLog(sprintf('Ejecución %s %s (external_id: %s).', $runCodigo, !empty($resp['created_run']) ? 'creada' : 'actualizada', $run['external_id']));

    $todoBien  = true;
    $idsCaso   = [];
    foreach ($resp['rows'] ?? [] as $fila) {
        $clave = (string) ($fila['test_case_code'] ?? $fila['key'] ?? '?');
        if (empty($fila['matched'])) {
            $todoBien = false;
            qatlasLog(sprintf('  ✘ %s sin caso en QAtlas: %s', $fila['key'] ?? $clave, $fila['message'] ?? ''));

            continue;
        }
        $idsCaso[$clave] = $fila['test_run_case_id'] ?? null;
        $bug             = !empty($fila['bug_code']) ? ' · defecto ' . $fila['bug_code'] : '';
        qatlasLog(sprintf('  %s %s %s → %s%s', ['aprobado' => '✔', 'fallido' => '✘', 'bloqueado' => '■', 'omitido' => '○'][$fila['status'] ?? ''] ?? '•', $clave, $detalle[$clave]['caso'] ?? '', $fila['status'] ?? '?', $bug));
    }

    // 2. Evidencia al paso 3 de cada caso
    $contexto = [
        'fecha'   => $ahora->format('Y-m-d H:i:s T'),
        'entorno' => $run['environment'],
        'php'     => 'PHP ' . PHP_VERSION,
        'commit'  => $run['commit_sha'] ?? '',
        'ci_url'  => $run['ci_url'] ?? '',
    ];
    $subidas = 0;
    foreach ($idsCaso as $codigoCaso => $idCaso) {
        if (null === $idCaso || !isset($detalle[$codigoCaso])) {
            continue;
        }
        $ruta = qatlasEscribirEvidencia($dir, $codigoCaso, $detalle[$codigoCaso], $contexto);
        [$c, , $cr] = qatlasPeticion($base, $token, 'POST', '/attachments', null, [
            'entity_type' => 'test_run_case',
            'entity_id'   => (string) $idCaso,
            'step_order'  => '3',
            'file'        => new CURLFile($ruta, 'text/plain', basename($ruta)),
        ]);
        if ($c >= 200 && $c < 300) {
            ++$subidas;
        } else {
            $todoBien = false;
            qatlasLog(sprintf('  No se pudo subir la evidencia de %s — %s', $codigoCaso, qatlasExplicarError($c, $cr)));
        }
    }
    qatlasLog(sprintf('Evidencia subida: %d de %d casos (paso 3).', $subidas, count($idsCaso)));

    // 3. Resumen y cierre
    $s = $resp['summary'] ?? [];
    qatlasLog(sprintf('Resumen: %d aprobados, %d fallidos, %d bloqueados, %d omitidos, %d sin caso.',
        $s['passed'] ?? 0, $s['failed'] ?? 0, $s['blocked'] ?? 0, $s['skipped'] ?? 0, $s['unmatched'] ?? 0));

    $enlace = preg_replace('#/api$#', '', $base) . '/test-runs/' . rawurlencode($runCodigo);

    if (null !== $runId && $todoBien && '0' !== qatlasEnv('QATLAS_COMPLETE')) {
        [$c, , $cr] = qatlasPeticion($base, $token, 'POST', '/test-runs/' . $runId . '/complete');
        if ($c >= 200 && $c < 300) {
            qatlasLog('Ejecución completada → ' . $enlace);
        } elseif (403 === $c && str_contains($cr, 'token scope')) {
            // El alcance "Solo ingesta (CI)" sube resultados y evidencia, pero no puede completar ejecuciones.
            // No es un fallo de la corrida: los 19 resultados ya están en QAtlas.
            qatlasLog('Resultados subidos. El token "Solo ingesta" no puede completar ejecuciones:');
            qatlasLog('  completala con el botón "Completar ejecución" → ' . $enlace);
        } else {
            $todoBien = false;
            qatlasLog('No se pudo completar la ejecución — ' . qatlasExplicarError($c, $cr));
        }
    } else {
        qatlasLog('La ejecución queda En progreso (' . ($todoBien ? 'QATLAS_COMPLETE=0' : 'hubo problemas al subir') . ') → ' . $enlace);
    }

    return $todoBien ? 0 : 1;
}
