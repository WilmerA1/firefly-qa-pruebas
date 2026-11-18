import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const baseURL = process.env.FF_BASE_URL;
const proyecto = process.env.QATLAS_PROJECT;

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['./qatlas-reporter.js', {
      project: proyecto, onlyProject: 'api',
      runName: 'EJ-API-02 Ejecución automatizada PL-API',
      createBugOnFailure: true,
    }],
    ['./qatlas-reporter.js', {
      project: proyecto, onlyProject: 'ui',
      runName: 'EJ-UI-02 Ejecución automatizada PL-UI',
    }],
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
      name: 'ui',
      testDir: './tests/ui',
      fullyParallel: true,
      use: { ...devices['Desktop Chrome'], baseURL, actionTimeout: 8000 },
    },
  ],
});