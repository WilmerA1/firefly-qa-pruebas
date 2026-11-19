import { test, expect, Page } from '@playwright/test';
import {
  Divisa, anotarMensajes, asegurarDivisa, asegurarDivisaHabilitada, borrarDivisas, camposEnRojo,
  cerrarTourAutomaticamente, divisasConCodigo, divisasConNombre, enviarYEsperar, exitoCon, largo,
  llenarDivisa, paginaDeSesion, qatlas,
} from './helpers';
import { SESIONES } from './sesiones';

// Los casos usan los datos fijos del plan y algunos dependen de otros (CP-UI-03/05/07 de CP-UI-01,
// CP-UI-10 de CP-UI-09): dentro de este archivo corren en orden en un solo worker, y en paralelo con
// 02-presupuestos.spec.ts. Si un caso falla, los siguientes igual se ejecutan (no se omiten).
test.describe.configure({ mode: 'default' });

// Sesión propia de este archivo, para no mezclar mensajes con el otro archivo en paralelo.
test.use({ storageState: SESIONES.divisas });

const NOMBRE_48 = largo(48); // "QA-" + 45 letras x
const DIVISA_01: Divisa = { nombre: NOMBRE_48, simbolo: 'QA-S01', codigo: 'QA-01', decimales: '2' };
const DIVISA_09: Divisa = { nombre: 'QA-Divisa-09', simbolo: 'QA-S09', codigo: 'QA-09', decimales: '12' };

type Esperado = { camposEnRojo: string[]; exito: boolean; enLista: number };

type Caso = {
  codigo: string; titulo: string; datos: Divisa;
  precondicion?: (page: Page) => Promise<void>;
  buscarPor: 'codigo' | 'nombre'; // cómo se comprueba en /currencies si la divisa se creó
  esperado: Esperado;
};

const ACEPTADA: Esperado = { camposEnRojo: [], exito: true, enLista: 1 };
const rechazada = (campo: string): Esperado => ({ camposEnRojo: [campo], exito: false, enLista: 0 });

// Un caso por fila: código del plan, título, datos de los pasos, precondición y resultado esperado.
const CASOS: Caso[] = [
  { codigo: 'CP-UI-01', titulo: 'divisa con nombre de 48 caracteres es aceptada', datos: DIVISA_01,
    precondicion: (page) => borrarDivisas(page, { codigos: ['QA-01'] }), // "No existe una divisa con el código QA-01"
    buscarPor: 'codigo', esperado: ACEPTADA },
  { codigo: 'CP-UI-02', titulo: 'divisa con nombre de 49 caracteres es rechazada',
    datos: { nombre: largo(49), simbolo: 'QA-S02', codigo: 'QA-02', decimales: '2' },
    buscarPor: 'codigo', esperado: rechazada('name') },
  { codigo: 'CP-UI-03', titulo: 'divisa con nombre duplicado es rechazada',
    datos: { nombre: NOMBRE_48, simbolo: 'QA-S03', codigo: 'QA-03', decimales: '2' },
    precondicion: (page) => asegurarDivisa(page, DIVISA_01),
    buscarPor: 'codigo', esperado: rechazada('name') },
  { codigo: 'CP-UI-04', titulo: 'divisa con código de 2 caracteres es rechazada',
    datos: { nombre: 'QA-Divisa-04', simbolo: 'QA-S04', codigo: 'AB', decimales: '2' },
    buscarPor: 'nombre', esperado: rechazada('code') },
  { codigo: 'CP-UI-05', titulo: 'divisa con código duplicado es rechazada',
    datos: { nombre: 'QA-Divisa-05', simbolo: 'QA-S05', codigo: 'QA-01', decimales: '2' },
    precondicion: (page) => asegurarDivisa(page, DIVISA_01),
    buscarPor: 'nombre', esperado: rechazada('code') },
  { codigo: 'CP-UI-06', titulo: 'divisa con símbolo de 52 caracteres es rechazada',
    datos: { nombre: 'QA-Divisa-06', simbolo: largo(52, ''), codigo: 'QA-06', decimales: '2' },
    buscarPor: 'codigo', esperado: rechazada('symbol') },
  { codigo: 'CP-UI-07', titulo: 'divisa con símbolo duplicado es rechazada',
    datos: { nombre: 'QA-Divisa-07', simbolo: 'QA-S01', codigo: 'QA-07', decimales: '2' },
    precondicion: (page) => asegurarDivisa(page, DIVISA_01),
    buscarPor: 'codigo', esperado: rechazada('symbol') },
  { codigo: 'CP-UI-08', titulo: 'divisa con 13 decimales es rechazada',
    datos: { nombre: 'QA-Divisa-08', simbolo: 'QA-S08', codigo: 'QA-08', decimales: '13' },
    buscarPor: 'codigo', esperado: rechazada('decimal_places') },
  { codigo: 'CP-UI-09', titulo: 'divisa con 12 decimales es aceptada', datos: DIVISA_09,
    precondicion: (page) => borrarDivisas(page, { codigos: ['QA-09'] }),
    buscarPor: 'codigo', esperado: ACEPTADA },
];

// Todo lo que esta suite puede crear en Firefly (se borra antes y después de la corrida).
const DATOS_DE_LA_SUITE = {
  codigos: CASOS.map((c) => c.datos.codigo).filter((codigo) => codigo.startsWith('QA-')),
  nombres: CASOS.map((c) => c.datos.nombre),
};

test.describe('PL-UI · Divisas · formulario de creación', () => {

  test.beforeAll('borrar las divisas QA que hayan quedado de corridas anteriores', async ({ browser }, testInfo) => {
    const page = await paginaDeSesion(browser, testInfo, SESIONES.divisas);
    await borrarDivisas(page, DATOS_DE_LA_SUITE);
    await page.context().close();
  });

  test.beforeEach('cerrar el tour de introducción si aparece', async ({ page }) => {
    await cerrarTourAutomaticamente(page);
  });

  test.afterAll('borrar las divisas creadas por la suite', async ({ browser }, testInfo) => {
    const page = await paginaDeSesion(browser, testInfo, SESIONES.divisas);
    await borrarDivisas(page, DATOS_DE_LA_SUITE);
    await page.context().close();
  });

  for (const c of CASOS) {
    test(`${c.codigo}: ${c.titulo}`, async ({ page }, testInfo) => {
      // Un caso de CASOS por test, con los mismos 4 pasos que tiene en QAtlas.
      // Resultado esperado (c.esperado): campos en rojo, mensaje de éxito con el nombre y filas en /currencies.
      testInfo.annotations.push(qatlas(c.codigo));
      if (c.precondicion) await c.precondicion(page);

      await test.step('1. Abrir Divisas y presionar el botón para crear una nueva divisa', async () => {
        await page.goto('/currencies');
        await page.locator('a[href$="/currencies/create"]').first().click();
        await page.waitForURL('**/currencies/create');
      });

      await test.step('2. Ingresar nombre, símbolo, código y lugares decimales', async () => {
        await llenarDivisa(page, c.datos);
      });

      await test.step('3. Enviar el formulario con el botón de crear', async () => {
        await enviarYEsperar(page, 'form#store button[type="submit"]');
      });

      await test.step('4. Revisar el mensaje en pantalla y la lista de Divisas', async () => {
        await testInfo.attach('pantalla tras enviar', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await anotarMensajes(page, testInfo);
        const observado = {
          camposEnRojo: await camposEnRojo(page),
          exito: await exitoCon(page, c.datos.nombre),
          enLista: c.buscarPor === 'codigo'
            ? await divisasConCodigo(page, c.datos.codigo)
            : await divisasConNombre(page, c.datos.nombre),
        };

        expect(observado).toEqual(c.esperado);
      });
    });
  }

  test('CP-UI-10: divisa se deshabilita y se vuelve a habilitar', async ({ page }, testInfo) => {
    // Caso: CP-UI-10 — 5 pasos, igual que en QAtlas
    // Resultado esperado: al desactivar y al activar aparece el mensaje de confirmación con el nombre
    // y la fila cambia de estado ("deshabilitada" ↔ habilitada).
    testInfo.annotations.push(qatlas('CP-UI-10'));
    await asegurarDivisaHabilitada(page, DIVISA_09); // "Existe la divisa QA-Divisa-09, que nace habilitada"

    const fila = page.locator('table tbody tr', { hasText: `(${DIVISA_09.codigo})` });
    const estado = async () => ({
      mensaje: await exitoCon(page, DIVISA_09.nombre),
      deshabilitada: (await fila.locator('.enable-currency').count()) === 1,
    });
    let inicial = { deshabilitada: true };
    let trasDesactivar = { mensaje: false, deshabilitada: false };

    await test.step('1. Abrir Divisas y ubicar la fila de QA-Divisa-09', async () => {
      await page.goto('/currencies');
      inicial = { deshabilitada: (await estado()).deshabilitada };
    });

    await test.step('2. Deshabilitar la divisa con la opción de desactivar', async () => {
      await enviarYEsperar(page, `a.disable-currency[data-code="${DIVISA_09.codigo}"]`);
    });

    await test.step('3. Revisar el mensaje y el estado de la fila', async () => {
      trasDesactivar = await estado();
      await testInfo.attach('tras desactivar', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });

    await test.step('4. Habilitar nuevamente la divisa con la opción de activar', async () => {
      await enviarYEsperar(page, `a.enable-currency[data-code="${DIVISA_09.codigo}"]`);
    });

    await test.step('5. Revisar el mensaje y el estado de la fila', async () => {
      const trasActivar = await estado();
      await testInfo.attach('tras activar', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      expect({ inicial, trasDesactivar, trasActivar }).toEqual({
        inicial: { deshabilitada: false },
        trasDesactivar: { mensaje: true, deshabilitada: true },
        trasActivar: { mensaje: true, deshabilitada: false },
      });
    });
  });
});
