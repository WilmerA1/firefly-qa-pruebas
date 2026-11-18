import { test, expect } from '@playwright/test';
import { CUENTA_AJENA, CUENTA_EUR, Creado, largo, limpiar, split, transaccion, unico, qatlas } from './helpers';

type Caso = {
  codigo: string; titulo: string; datos: string; campo: string; body: () => object;
};

// Un caso por fila: código del plan, título, dato de entrada y campo con error esperado.
const CASOS_422: Caso[] = [
  { codigo: 'CP-API-01', titulo: 'type inválido es rechazado', datos: 'type = "payment"',
    campo: 'transactions.0.type', body: () => transaccion({ type: 'payment' }) },
  { codigo: 'CP-API-02', titulo: 'type ausente es rechazado', datos: 'sin campo type',
    campo: 'transactions.0.type', body: () => transaccion({}, ['type']) },
  { codigo: 'CP-API-03', titulo: 'fecha inválida es rechazada', datos: 'date = "no-es-fecha"',
    campo: 'transactions.0.date', body: () => transaccion({ date: 'no-es-fecha' }) },
  { codigo: 'CP-API-04', titulo: 'descripción de 1001 caracteres es rechazada', datos: 'description de 1001 caracteres',
    campo: 'transactions.0.description', body: () => transaccion({ description: largo(1001) }) },
  { codigo: 'CP-API-05', titulo: 'group_title de 1001 caracteres es rechazado', datos: 'dos splits + group_title de 1001 caracteres',
    campo: 'group_title', body: () => ({ group_title: largo(1001), transactions: [split(), split()] }) },
  { codigo: 'CP-API-07', titulo: 'cuenta origen de otro usuario es rechazada', datos: 'source_id = cuenta de otro usuario',
    campo: 'transactions.0.source_id', body: () => transaccion({ source_id: CUENTA_AJENA }) },
  { codigo: 'CP-API-08', titulo: 'IBAN inválido es rechazado', datos: 'source_iban = DE88370400440532013000',
    campo: 'transactions.0.source_iban', body: () => transaccion({ source_iban: 'DE88370400440532013000' }) },
  { codigo: 'CP-API-09', titulo: 'BIC inválido es rechazado', datos: 'source_bic = DEUT1',
    campo: 'transactions.0.source_bic', body: () => transaccion({ source_bic: 'DEUT1' }) },
  { codigo: 'CP-API-10', titulo: 'presupuesto inexistente es rechazado', datos: 'budget_id = 99999',
    campo: 'transactions.0.budget_id', body: () => transaccion({ budget_id: 99999 }) },
  { codigo: 'CP-API-11', titulo: 'notas de 32769 caracteres son rechazadas', datos: 'notes de 32769 caracteres',
    campo: 'transactions.0.notes', body: () => transaccion({ notes: largo(32769) }) },
  { codigo: 'CP-API-12', titulo: 'etiqueta de 256 caracteres es rechazada', datos: 'tags = [256 caracteres]',
    campo: 'transactions.0.tags.0', body: () => transaccion({ tags: [largo(256)] }) },
  { codigo: 'CP-API-13', titulo: 'internal_reference de 256 caracteres es rechazada', datos: 'internal_reference de 256 caracteres',
    campo: 'transactions.0.internal_reference', body: () => transaccion({ internal_reference: largo(256) }) },
  { codigo: 'CP-API-14', titulo: 'order negativo es rechazado', datos: 'order = -1',
    campo: 'transactions.0.order', body: () => transaccion({ order: -1 }) },
  { codigo: 'CP-API-15', titulo: 'reconciled no booleano es rechazado', datos: 'reconciled = "abc"',
    campo: 'transactions.0.reconciled', body: () => transaccion({ reconciled: 'abc' }) },
  { codigo: 'CP-API-18', titulo: 'foreign_amount negativo es rechazado', datos: 'foreign_amount = -1',
    campo: 'transactions.0.foreign_amount', body: () => transaccion({ foreign_amount: '-1' }) },
  { codigo: 'CP-API-19', titulo: 'divisa extranjera inexistente es rechazada', datos: 'foreign_currency_code = ZZZ',
    campo: 'transactions.0.foreign_currency_code', body: () => transaccion({ foreign_currency_code: 'ZZZ' }) },
];

test.describe('PL-API · Transacciones · validación de campos (422)', () => {
  for (const c of CASOS_422) {
    test(`${c.codigo}: ${c.titulo}`, async ({ request }) => {
      // Caso: ${c.codigo}
      // Objetivo: ${c.titulo}
      // Datos de entrada: ${c.datos}
      // Resultado esperado: HTTP 422 con error en el campo ${c.campo}
      test.info().annotations.push(qatlas(c.codigo));

      const res = await request.post('/api/v1/transactions', { data: c.body() });
      const json = await res.json();

      expect({ status: res.status(), campo: Object.keys(json.errors ?? {})[0] })
        .toEqual({ status: 422, campo: c.campo });
    });
  }
});

test.describe('PL-API · Transacciones · creación válida y duplicados', () => {
  const creados: Creado[] = [];

  test.afterEach(async ({ request }) => {
    await limpiar(request, creados);
  });

  // CP-API-16 debe ejecutarse antes que CP-API-06 (orden del plan).
  test('CP-API-16: segundo envío con error_if_duplicate_hash es rechazado', async ({ request }) => {
    // Caso: CP-API-16
    // Objetivo: verificar que un envío idéntico con error_if_duplicate_hash=true es rechazado
    // Datos de entrada: misma transacción enviada dos veces, error_if_duplicate_hash = true
    // Resultado esperado: primer envío 200 y segundo envío 422
    test.info().annotations.push(qatlas('CP-API-16'));

    const body = { error_if_duplicate_hash: true, transactions: [split({ description: unico('QA-dup') })] };
    const primero = await request.post('/api/v1/transactions', { data: body });
    if (primero.ok()) creados.push({ recurso: 'transactions', id: (await primero.json()).data.id });
    const segundo = await request.post('/api/v1/transactions', { data: body });

    expect({ primero: primero.status(), segundo: segundo.status() })
      .toEqual({ primero: 200, segundo: 422 });
  });

  test('CP-API-06: transacción dividida con group_title válido es aceptada', async ({ request }) => {
    // Caso: CP-API-06
    // Objetivo: verificar que dos splits con group_title válido se crean
    // Datos de entrada: dos splits + group_title = "Compra dividida"
    // Resultado esperado: HTTP 200 con 2 splits en la respuesta
    test.info().annotations.push(qatlas('CP-API-06'));

    const res = await request.post('/api/v1/transactions', {
      data: { group_title: 'Compra dividida',
              transactions: [split({ description: unico('QA-div-1') }), split({ description: unico('QA-div-2') })] },
    });
    const json = await res.json();
    if (res.ok()) creados.push({ recurso: 'transactions', id: json.data.id });

    expect({ status: res.status(), splits: json.data?.attributes?.transactions?.length })
      .toEqual({ status: 200, splits: 2 });
  });

  test('CP-API-17: divisa extranjera válida es aceptada', async ({ request }) => {
    // Caso: CP-API-17
    // Objetivo: verificar que foreign_amount con foreign_currency_code válido se guarda
    // Datos de entrada: cuenta origen en EUR, foreign_amount = 11, foreign_currency_code = USD
    // Resultado esperado: HTTP 200 con foreign_currency_code = USD
    test.info().annotations.push(qatlas('CP-API-17'));

    const res = await request.post('/api/v1/transactions', {
      data: transaccion({ source_id: CUENTA_EUR, description: unico('QA-fx'), foreign_amount: '11', foreign_currency_code: 'USD' }),
    });
    const json = await res.json();
    if (res.ok()) creados.push({ recurso: 'transactions', id: json.data.id });

    expect({ status: res.status(), divisa: json.data?.attributes?.transactions?.[0]?.foreign_currency_code })
      .toEqual({ status: 200, divisa: 'USD' });
  });
});