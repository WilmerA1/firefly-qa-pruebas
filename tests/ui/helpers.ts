import { Browser, Page, TestInfo } from '@playwright/test';

/* ============================================================================
 * Utilidades de la suite SU-UI (plan FF3-PLAN-3). Ninguna función tiene expect:
 * solo preparan datos u observan la pantalla; cada prueba hace un único expect.
 * ========================================================================== */

/** Anotación que enlaza el test con su caso en QAtlas: CP-UI-01 → FF3-TC-45 … CP-UI-22 → FF3-TC-66. */
export const qatlas = (codigo: string) =>
  ({ type: 'qatlas', description: `FF3-TC-${44 + Number(codigo.slice(-2))}` });

/** Texto de n caracteres: el prefijo seguido de letras x (p. ej. "QA-" + 45 x = 48 caracteres). */
export const largo = (n: number, prefijo = 'QA-') => prefijo + 'x'.repeat(n - prefijo.length);

/** Página nueva con la sesión del archivo y la URL base del project (para beforeAll / afterAll). */
export async function paginaDeSesion(browser: Browser, testInfo: TestInfo, sesion: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: sesion });
  return context.newPage();
}

/** Si aparece el tour de introducción de Firefly (intro.js), lo cierra antes de cualquier acción. */
export async function cerrarTourAutomaticamente(page: Page) {
  await page.addLocatorHandler(page.locator('.introjs-skipbutton'), async (boton) => {
    await boton.click();
  });
}

/** Envía un formulario y espera a que cargue la página que Firefly devuelve. */
export async function enviarYEsperar(page: Page, boton: string) {
  await Promise.all([page.waitForEvent('load'), page.locator(boton).click()]);
}

/* ------------------------------- Observaciones ------------------------------ */

/** Campos del formulario marcados en rojo (bloque con has-error y un mensaje text-danger). */
export async function camposEnRojo(page: Page): Promise<string[]> {
  return page.locator('form#store .has-error').evaluateAll((bloques) =>
    bloques
      .filter((b) => (b.querySelector('.text-danger')?.textContent ?? '').trim() !== '')
      .map((b) => b.id.replace(/_holder$/, '')));
}

/** Textos de los mensajes de error (se guardan como observación para el informe). */
export async function mensajesDeError(page: Page): Promise<string[]> {
  return (await page.locator('form#store .has-error .text-danger').allInnerTexts()).map((t) => t.trim());
}

/** ¿Hay un mensaje de éxito en pantalla que mencione el texto dado (nombre de la divisa o presupuesto)? */
export async function exitoCon(page: Page, texto: string): Promise<boolean> {
  const alertas = await page.locator('.alert-success').allInnerTexts();
  return alertas.some((a) => a.includes(texto));
}

/** Guarda los mensajes de error como anotación "observación" (se ven en el reporte HTML). */
export async function anotarMensajes(page: Page, testInfo: TestInfo) {
  const mensajes = await mensajesDeError(page);
  if (mensajes.length > 0) testInfo.annotations.push({ type: 'observación', description: mensajes.join(' | ') });
}

/* --------------------------------- Divisas --------------------------------- */

export type Divisa = { nombre: string; simbolo: string; codigo: string; decimales: string };

type FilaDivisa = { nombre: string; codigo: string; habilitada: boolean; borrar: string };

/** Lee la tabla de /currencies: nombre, código, si está habilitada y el enlace para borrarla. */
export async function filasDeDivisas(page: Page): Promise<FilaDivisa[]> {
  await page.goto('/currencies');
  return page.locator('table tbody tr').evaluateAll((filas) => filas.map((tr) => {
    const celda = (tr.querySelectorAll('td')[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const m = /^(.*) \(([^()]*)\) \(([^()]*)\)/.exec(celda);
    return {
      nombre: m ? m[1] : celda,
      codigo: m ? m[2] : '',
      habilitada: tr.querySelector('.disable-currency') !== null,
      borrar: tr.querySelector<HTMLAnchorElement>('a[href*="/currencies/delete/"]')?.getAttribute('href') ?? '',
    };
  }));
}

/** Cuántas filas de /currencies tienen ese código. */
export async function divisasConCodigo(page: Page, codigo: string) {
  return (await filasDeDivisas(page)).filter((f) => f.codigo === codigo).length;
}

/** Cuántas filas de /currencies tienen ese nombre. */
export async function divisasConNombre(page: Page, nombre: string) {
  return (await filasDeDivisas(page)).filter((f) => f.nombre === nombre).length;
}

/** Llena el formulario de creación de divisa (ya abierto). */
export async function llenarDivisa(page: Page, d: Divisa) {
  await page.locator('#ffInput_name').fill(d.nombre);
  await page.locator('#ffInput_symbol').fill(d.simbolo);
  await page.locator('#ffInput_code').fill(d.codigo);
  await page.locator('#ffInput_decimal_places').fill(d.decimales);
}

/** Crea una divisa por la interfaz (para preparar precondiciones). */
export async function crearDivisa(page: Page, d: Divisa) {
  await page.goto('/currencies/create');
  await llenarDivisa(page, d);
  await enviarYEsperar(page, 'form#store button[type="submit"]');
}

/** Borra por la interfaz las divisas cuyo código o nombre esté en las listas dadas. */
export async function borrarDivisas(page: Page, { codigos = [], nombres = [] }: { codigos?: string[]; nombres?: string[] }) {
  const objetivo = (f: FilaDivisa) => codigos.includes(f.codigo) || nombres.includes(f.nombre);
  for (const fila of (await filasDeDivisas(page)).filter(objetivo)) {
    await page.goto(fila.borrar);
    await enviarYEsperar(page, 'form#destroy input[type="submit"]');
  }
  const quedan = (await filasDeDivisas(page)).filter(objetivo);
  if (quedan.length > 0) {
    console.warn(`[SU-UI] Firefly no permitió borrar: ${quedan.map((f) => f.codigo).join(', ')}`);
  }
}

/** Precondición: la divisa existe (si no está, la crea). */
export async function asegurarDivisa(page: Page, d: Divisa) {
  if ((await divisasConCodigo(page, d.codigo)) === 0) await crearDivisa(page, d);
}

/** Precondición: la divisa con ese código existe y está habilitada. */
export async function asegurarDivisaHabilitada(page: Page, d: Divisa) {
  await asegurarDivisa(page, d);
  const fila = (await filasDeDivisas(page)).find((f) => f.codigo === d.codigo);
  if (fila && !fila.habilitada) {
    await enviarYEsperar(page, `a.enable-currency[data-code="${d.codigo}"]`);
  }
}

/* ------------------------------- Presupuestos ------------------------------- */

export type Presupuesto = { nombre: string; tipo: '0' | '1' | '2' | '3'; importe?: string; periodo?: string };

/** Llena el formulario de creación de presupuesto (ya abierto). */
export async function llenarNombrePresupuesto(page: Page, nombre: string) {
  await page.locator('#ffInput_name').fill(nombre);
}

export async function llenarAutopresupuesto(page: Page, p: Presupuesto) {
  await page.locator('#ffInput_auto_budget_type').selectOption(p.tipo);
  if (p.tipo !== '0') {
    await page.locator('#ffInput_auto_budget_amount').fill(p.importe ?? '');
    if (p.periodo) await page.locator('#ffInput_auto_budget_period').selectOption(p.periodo);
  }
}

/** Enlaces de /budgets: nombre del presupuesto y enlace para borrarlo. */
async function filasDePresupuestos(page: Page) {
  await page.goto('/budgets');
  return page.locator('table tbody tr').evaluateAll((filas) => filas.map((tr) => {
    const enlace = tr.querySelector<HTMLAnchorElement>('a[href*="/budgets/show/"]');
    return {
      nombre: (enlace?.textContent ?? '').trim(),
      borrar: tr.querySelector<HTMLAnchorElement>('a[href*="/budgets/delete/"]')?.getAttribute('href') ?? '',
    };
  }).filter((f) => f.nombre !== ''));
}

/** Cuántos presupuestos de /budgets tienen exactamente ese nombre. */
export async function presupuestosConNombre(page: Page, nombre: string) {
  return (await filasDePresupuestos(page)).filter((f) => f.nombre === nombre).length;
}

/** Crea un presupuesto por la interfaz (para preparar precondiciones). */
export async function crearPresupuesto(page: Page, p: Presupuesto) {
  await page.goto('/budgets/create');
  await llenarNombrePresupuesto(page, p.nombre);
  await llenarAutopresupuesto(page, p);
  await enviarYEsperar(page, 'form#store button[type="submit"]');
}

/** Borra por la interfaz los presupuestos con esos nombres (las transacciones asociadas se conservan). */
export async function borrarPresupuestos(page: Page, nombres: string[]) {
  for (const fila of (await filasDePresupuestos(page)).filter((f) => nombres.includes(f.nombre))) {
    await page.goto(fila.borrar);
    await enviarYEsperar(page, 'form#destroy input[type="submit"]');
  }
}

/** Precondición: el presupuesto existe (si no está, lo crea con los mismos datos de su caso). */
export async function asegurarPresupuesto(page: Page, p: Presupuesto) {
  if ((await presupuestosConNombre(page, p.nombre)) === 0) await crearPresupuesto(page, p);
}
