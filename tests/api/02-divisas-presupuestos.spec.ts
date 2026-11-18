import { test, expect } from '@playwright/test';
import { Creado, largo, limpiar, qatlas, unico } from './helpers';

type Caso = {
  codigo: string; titulo: string; endpoint: string; datos: string; campo: string; body: () => object;
};

const presupuestoAuto = (extra: Record<string, unknown>) => ({
  name: unico('QA-Presupuesto'), auto_budget_amount: '100', auto_budget_period: 'monthly',
  auto_budget_currency_code: 'EUR', ...extra,
});

const CASOS_422: Caso[] = [
  { codigo: 'CP-API-20', titulo: 'enabled inválido en divisa es rechazado', endpoint: '/api/v1/currencies',
    datos: 'enabled = 2', campo: 'enabled',
    body: () => ({ name: 'QA-Divisa-20', code: 'QA20', symbol: 'Q20', decimal_places: 2, enabled: 2 }) },
  { codigo: 'CP-API-21', titulo: 'active no booleano en presupuesto es rechazado', endpoint: '/api/v1/budgets',
    datos: 'active = "x"', campo: 'active',
    body: () => ({ name: unico('QA-Presupuesto'), active: 'x' }) },
  { codigo: 'CP-API-22', titulo: 'auto_budget_type inválido es rechazado', endpoint: '/api/v1/budgets',
    datos: 'auto_budget_type = "invalid"', campo: 'auto_budget_type',
    body: () => presupuestoAuto({ auto_budget_type: 'invalid' }) },
  { codigo: 'CP-API-23', titulo: 'auto_budget_period inválido es rechazado', endpoint: '/api/v1/budgets',
    datos: 'auto_budget_type = "reset", auto_budget_period = "biweekly"', campo: 'auto_budget_period',
    body: () => presupuestoAuto({ auto_budget_type: 'reset', auto_budget_period: 'biweekly' }) },
  { codigo: 'CP-API-25', titulo: 'notas de 32769 caracteres en presupuesto son rechazadas', endpoint: '/api/v1/budgets',
    datos: 'notes de 32769 caracteres', campo: 'notes',
    body: () => ({ name: unico('QA-Presupuesto'), notes: largo(32769) }) },
];

test.describe('PL-API · Divisas y presupuestos · validación de campos (422)', () => {
  const creados: Creado[] = [];

  test.afterEach(async ({ request }) => {
    await limpiar(request, creados);
  });

  for (const c of CASOS_422) {
    test(`${c.codigo}: ${c.titulo}`, async ({ request }) => {
      // Caso: ${c.codigo}
      // Objetivo: ${c.titulo}
      // Datos de entrada: ${c.datos}
      // Resultado esperado: HTTP 422 con error en el campo ${c.campo}
      test.info().annotations.push(qatlas(c.codigo));

      const res = await request.post(c.endpoint, { data: c.body() });
      const json = await res.json();
      if (res.ok() && c.endpoint.endsWith('/budgets')) creados.push({ recurso: 'budgets', id: json.data.id });

      expect({ status: res.status(), campo: Object.keys(json.errors ?? {})[0] })
        .toEqual({ status: 422, campo: c.campo });
    });
  }

  test('CP-API-24: auto_budget_currency_code inexistente es rechazado', async ({ request }) => {
    // Caso: CP-API-24
    // Objetivo: verificar que una divisa de auto-presupuesto inexistente es rechazada
    // Datos de entrada: auto_budget_type = reset, auto_budget_currency_code = ZZZ
    // Resultado esperado: HTTP 422 con error en auto_budget_currency_code
    // Hallazgo D-1: Firefly devuelve 200, por lo que este caso FALLA (defecto RF-PR-08).
    test.info().annotations.push(qatlas('CP-API-24'));

    const res = await request.post('/api/v1/budgets', {
      data: presupuestoAuto({ auto_budget_type: 'reset', auto_budget_currency_code: 'ZZZ' }),
    });
    const json = await res.json();
    if (res.ok()) creados.push({ recurso: 'budgets', id: json.data.id });

    expect({ status: res.status(), campo: Object.keys(json.errors ?? {})[0] })
      .toEqual({ status: 422, campo: 'auto_budget_currency_code' });
  });
});