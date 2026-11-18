import { defineConfig } from '@playwright/test';

try { process.loadEnvFile('.env'); } catch { /* sin .env */ }

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,   // el orden importa (CP-API-16 antes de CP-API-06)
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['./qatlas-reporter.js', { project: process.env.QATLAS_PROJECT }],
  ],
  use: {
    baseURL: process.env.FF_BASE_URL,
    actionTimeout: 8000,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FF_TOKEN}`,
    },
  },
});