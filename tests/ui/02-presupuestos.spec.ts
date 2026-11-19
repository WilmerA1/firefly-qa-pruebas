import { test, expect, Page } from '@playwright/test';
import {
  Presupuesto, anotarMensajes, asegurarPresupuesto, borrarPresupuestos, camposEnRojo,
  cerrarTourAutomaticamente, enviarYEsperar, exitoCon, largo, llenarAutopresupuesto,
  llenarNombrePresupuesto, paginaDeSesion, presupuestosConNombre, qatlas,
} from './helpers';
import { SESIONES } from './sesiones';

// Los casos usan los datos fijos del plan y CP-UI-16 depende de CP-UI-11: dentro de este archivo
// corren en orden en un solo worker, y en paralelo con 01-divisas.spec.ts.
// Si un caso falla, los siguientes igual se ejecutan (no se omiten).
test.describe.configure({ mode: 'default' });

// Sesión propia de este archivo, para no mezclar mensajes con el otro archivo en paralelo.
test.use({ storageState: SESIONES.presupuestos });

const PRESUPUESTO_11: Presupuesto = { nombre: 'QA-Presupuesto-11', tipo: '1', importe: '100', periodo: 'half_year' };
const PRESUPUESTO_17: Presupuesto = { nombre: 'QA-Presupuesto-17', tipo: '0' };

type Esperado = { camposEnRojo: string[]; exito: boolean; enLista: number; importeDeshabilitado?: boolean };

type Caso = {
  codigo: string; titulo: string; datos: Presupuesto;
  paso3: string; // texto del paso 3 del plan (varía según el caso)
  precondicion?: (page: Page) => Promise<void>;
  revisarImporte?: boolean; // CP-UI-17: el paso 3 verifica que el importe quede deshabilitado
  esperado: Esperado;
};

const CREADO: Esperado = { camposEnRojo: [], exito: true, enLista: 1 };
const rechazado = (campo: string, enLista = 0): Esperado => ({ camposEnRojo: [campo], exito: false, enLista });

const SIN_AUTOPRESUPUESTO = '3. Elegir el tipo 0 (sin autopresupuesto)';

// Un caso por fila: código del plan, título, datos de los pasos, precondición y resultado esperado.
const CASOS: Caso[] = [
  { codigo: 'CP-UI-11', titulo: 'presupuesto con tipo 1, importe 100 y periodo semestral es creado', datos: PRESUPUESTO_11,
    paso3: '3. Elegir el tipo 1 (cantidad fija), importe 100 y periodo semestral (half_year)',
    precondicion: (page) => borrarPresupuestos(page, [PRESUPUESTO_11.nombre]),
    esperado: CREADO },
  { codigo: 'CP-UI-12', titulo: 'presupuesto con nombre de 255 caracteres es creado', datos: { nombre: largo(255), tipo: '0' },
    paso3: SIN_AUTOPRESUPUESTO,
    precondicion: (page) => borrarPresupuestos(page, [largo(255)]),
    esperado: CREADO },
  { codigo: 'CP-UI-13', titulo: 'presupuesto con nombre de 256 caracteres es rechazado', datos: { nombre: largo(256), tipo: '0' },
    paso3: SIN_AUTOPRESUPUESTO,
    esperado: rechazado('name') },
  { codigo: 'CP-UI-14', titulo: 'presupuesto de tipo 1 sin importe es rechazado',
    datos: { nombre: 'QA-Presupuesto-14', tipo: '1', importe: '' },
    paso3: '3. Elegir el tipo 1 (cantidad fija) y dejar vacío el importe',
    esperado: rechazado('auto_budget_amount') },
  { codigo: 'CP-UI-15', titulo: 'presupuesto de tipo 1 con importe cero es rechazado',
    datos: { nombre: 'QA-Presupuesto-15', tipo: '1', importe: '0' },
    paso3: '3. Elegir el tipo 1 (cantidad fija) e ingresar importe 0',
    esperado: rechazado('auto_budget_amount') },
  { codigo: 'CP-UI-16', titulo: 'presupuesto con nombre duplicado es rechazado', datos: { nombre: PRESUPUESTO_11.nombre, tipo: '0' },
    paso3: SIN_AUTOPRESUPUESTO,
    precondicion: (page) => asegurarPresupuesto(page, PRESUPUESTO_11), // "Existe el presupuesto QA-Presupuesto-11"
    esperado: rechazado('name', 1) }, // sigue habiendo uno solo con ese nombre
  { codigo: 'CP-UI-17', titulo: 'presupuesto sin autopresupuesto es creado con el importe deshabilitado', datos: PRESUPUESTO_17,
    paso3: '3. Elegir el tipo 0 (sin autopresupuesto) y revisar el campo Importe',
    precondicion: (page) => borrarPresupuestos(page, [PRESUPUESTO_17.nombre]),
    revisarImporte: true,
    esperado: { ...CREADO, importeDeshabilitado: true } },
];

const NOMBRES_DE_LA_SUITE = [...new Set(CASOS.map((c) => c.datos.nombre))];
// QA-Presupuesto-11 y QA-Presupuesto-17 quedan creados al final: son precondición de los casos
// manuales CP-UI-22 y CP-UI-18.
const PARA_CASOS_MANUALES = [PRESUPUESTO_11.nombre, PRESUPUESTO_17.nombre];

test.describe('PL-UI · Presupuestos · formulario de creación', () => {

  test.beforeAll('borrar los presupuestos QA que hayan quedado de corridas anteriores', async ({ browser }, testInfo) => {
    const page = await paginaDeSesion(browser, testInfo, SESIONES.presupuestos);
    await borrarPresupuestos(page, NOMBRES_DE_LA_SUITE);
    await page.context().close();
  });

  test.beforeEach('cerrar el tour de introducción si aparece', async ({ page }) => {
    await cerrarTourAutomaticamente(page);
  });

  test.afterAll('borrar los presupuestos creados, salvo los que usan los casos manuales', async ({ browser }, testInfo) => {
    const page = await paginaDeSesion(browser, testInfo, SESIONES.presupuestos);
    await borrarPresupuestos(page, NOMBRES_DE_LA_SUITE.filter((n) => !PARA_CASOS_MANUALES.includes(n)));
    await page.context().close();
  });

  for (const c of CASOS) {
    test(`${c.codigo}: ${c.titulo}`, async ({ page }, testInfo) => {
      // Un caso de CASOS por test, con los mismos 5 pasos que tiene en QAtlas.
      // Resultado esperado (c.esperado): campos en rojo, mensaje de éxito con el nombre y filas en /budgets.
      testInfo.annotations.push(qatlas(c.codigo));
      if (c.precondicion) await c.precondicion(page);
      let importeDeshabilitado: boolean | undefined;

      await test.step('1. Abrir Presupuestos y presionar el botón para crear un nuevo presupuesto', async () => {
        await page.goto('/budgets');
        await page.locator('a[href$="/budgets/create"]').first().click();
        await page.waitForURL('**/budgets/create');
      });

      await test.step('2. Ingresar el nombre del presupuesto', async () => {
        await llenarNombrePresupuesto(page, c.datos.nombre);
      });

      await test.step(c.paso3, async () => {
        await llenarAutopresupuesto(page, c.datos);
        if (c.revisarImporte) importeDeshabilitado = await page.locator('#ffInput_auto_budget_amount').isDisabled();
      });

      await test.step('4. Enviar el formulario con el botón de guardar', async () => {
        await enviarYEsperar(page, 'form#store button[type="submit"]');
      });

      await test.step('5. Revisar el mensaje en pantalla y la lista de Presupuestos', async () => {
        await testInfo.attach('pantalla tras enviar', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await anotarMensajes(page, testInfo);
        const observado: Esperado = {
          camposEnRojo: await camposEnRojo(page),
          exito: await exitoCon(page, c.datos.nombre),
          enLista: await presupuestosConNombre(page, c.datos.nombre),
          ...(c.revisarImporte ? { importeDeshabilitado } : {}),
        };

        expect(observado).toEqual(c.esperado);
      });
    });
  }
});
