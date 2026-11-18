<?php

/*
 * QaTestCase.php — Base de las pruebas unitarias de caja blanca (suite SU-UN, plan FF3-PLAN-1).
 *
 * Arranca la aplicación Laravel de Firefly III 6.6.6 y aplica la PROTECCIÓN DE CONEXIÓN
 * pedida en los criterios de entrada del plan: si la conexión activa no es SQLite en memoria,
 * aborta ANTES de que cualquier prueba toque una base de datos (riesgo 1 del plan).
 */

declare(strict_types=1);

namespace Tests\qa;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class QaTestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        /** @var Application $app */
        $app = require __DIR__ . '/../../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        $driver   = (string) $app['config']->get('database.default');
        $database = (string) $app['config']->get('database.connections.sqlite.database');

        if ('sqlite' !== $driver || ':memory:' !== $database) {
            throw new RuntimeException(sprintf(
                'PROTECCIÓN ACTIVADA: la conexión es "%s" (%s), no SQLite en memoria. Se aborta para no tocar MariaDB.',
                $driver,
                'sqlite' === $driver ? $database : 'otra base'
            ));
        }

        return $app;
    }

    /**
     * Imprime una línea de evidencia en la terminal (sirve para la captura del paso 3).
     */
    protected function evidencia(string $caso, string $texto): void
    {
        $linea = sprintf('>> %s | %s', $caso, $texto);
        fwrite(STDERR, "\n  " . $linea . "\n");

        // Además la guarda en un archivo por caso para subirla a QAtlas como evidencia.
        $dir = getenv('EVIDENCIA_DIR');
        if (is_string($dir) && '' !== $dir && is_dir($dir)) {
            file_put_contents($dir . '/' . $caso . '.txt', $linea . "\n");
        }
    }
}
