<?php

/*
 * ejecutar.php — Punto de entrada DENTRO del contenedor desechable ff-qa.
 *
 *   1. Corre la suite SU-UN con PHPUnit (SQLite en memoria) y genera el reporte JUnit.
 *   2. Sube los resultados a QAtlas con la API de ingesta (subir-a-qatlas.php).
 *
 * Código de salida: 0 si todo pasó y se subió; 1 si alguna prueba falló o si la subida falló.
 */

declare(strict_types=1);

require __DIR__ . '/subir-a-qatlas.php';

$dir = __DIR__ . '/resultados';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}
foreach (glob($dir . '/*') ?: [] as $viejo) {
    unlink($viejo);
}

// Las pruebas escriben su línea ">>" en resultados/<CASO>.txt (ver QaTestCase::evidencia).
putenv('EVIDENCIA_DIR=' . $dir);

echo "== SU-UN: ejecutando PHPUnit ==\n";
$comando = 'vendor/bin/phpunit -c tests/qa/phpunit.xml --testdox --log-junit ' . escapeshellarg($dir . '/junit.xml');
passthru($comando, $codigoPhpunit);

if (!is_file($dir . '/junit.xml')) {
    fwrite(STDERR, "\n[QAtlas] PHPUnit no generó junit.xml (error de ejecución). No se sube nada.\n");
    exit(1);
}

if ('0' === getenv('QATLAS_SUBIR')) {
    echo "\n[QAtlas] QATLAS_SUBIR=0: solo se ejecutaron las pruebas.\n";
    exit(0 === $codigoPhpunit ? 0 : 1);
}

echo "\n== SU-UN: subiendo resultados a QAtlas ==\n";
$codigoSubida = subirAQatlas($dir);

exit((0 === $codigoPhpunit && 0 === $codigoSubida) ? 0 : 1);
