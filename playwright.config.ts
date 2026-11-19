import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const baseURL = process.env.FF_BASE_URL;
const proyecto = process.env.QATLAS_PROJECT;

// Interruptor de subida a QAtlas: QATLAS_SUBIR=0 (en el .env) corre las pruebas sin enviar resultados.
// Sin la variable, o con cualquier otro valor, se suben como siempre (igual que en correr-y-subir de SU-UN).
const subirAQAtlas = process.env.QATLAS_SUBIR !== '0';

const reportersQAtlas: ReporterDescription[] = [
  ['./qatlas-reporter.js', {
    project: proyecto, onlyProject: 'api',
    runName: 'EJ-API-02 Ejecución automatizada PL-API',
    createBugOnFailure: true,
  }],
  ['./qatlas-reporter.js', {
    project: proyecto, onlyProject: 'ui',
    runName: 'EJ-UI-02 Ejecución automatizada PL-UI',
  }],
];

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ...(subirAQAtlas ? reportersQAtlas : []),
  ],
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      fullyParallel: false, // CP-API-16 debe correr antes que CP-API-06 (mismo archivo, en orden)
      use: {
        baseURL,
        actionTimeout: 8000,
        extraHTTPHeaders: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FF_TOKEN}`,
        },
      },
    },
    {
      // Inicia sesión en Firefly antes de las pruebas UI y guarda una sesión por archivo (tests/ui/sesiones.ts).
      name: 'ui-setup',
      testDir: './tests/ui',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL, actionTimeout: 8000 },
    },
    {
      // Cada archivo de tests/ui elige su sesión con test.use({ storageState: SESIONES.<archivo> }).
      name: 'ui',
      testDir: './tests/ui',
      fullyParallel: true,
      dependencies: ['ui-setup'],
      use: { ...devices['Desktop Chrome'], baseURL, actionTimeout: 8000 },
    },
  ],
});