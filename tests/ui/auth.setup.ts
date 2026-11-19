import { test as setup } from '@playwright/test';
import { SESIONES } from './sesiones';

/**
 * Pre-condición común de la suite SU-UI ("sesión iniciada"): inicia sesión en Firefly III con
 * FF_EMAIL y FF_PASSWORD del .env y guarda una sesión por archivo de pruebas (ver sesiones.ts).
 * Las pruebas reutilizan esas sesiones, así que ninguna tiene que volver a iniciar sesión.
 */
setup('iniciar sesión en Firefly III (una sesión por archivo de pruebas)', async ({ browser }, testInfo) => {
  const email = process.env.FF_EMAIL;
  const password = process.env.FF_PASSWORD;
  if (!email || !password) {
    throw new Error('Faltan FF_EMAIL o FF_PASSWORD en el .env: no se puede iniciar sesión en Firefly.');
  }

  for (const [archivo, ruta] of Object.entries(SESIONES)) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await context.newPage();

    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form[action$="/login"] button[type="submit"]').click();

    // Si las credenciales son incorrectas, Firefly vuelve a /login.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }).catch(() => {
      throw new Error(`Firefly no aceptó FF_EMAIL / FF_PASSWORD (sesión de ${archivo}: la página sigue en /login).`);
    });

    await context.storageState({ path: ruta });
    await context.close();
  }
});
