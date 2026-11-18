import { test, expect } from '@playwright/test';

const cuenta = Number(process.env.ID_CUENTA);

const base = () => ({
  transactions: [{
    type: 'withdrawal', date: '2026-10-10', amount: '10',
    description: 'ok', source_id: cuenta, destination_name: 'QA-Tienda',
  }],
});

test.describe('PL-API · Transacciones (validación de campos)', () => {

  test('CP-API-01: type inválido es rechazado', async ({ request }) => {
    // Caso: CP-API-01
    // Objetivo: verificar que type=payment es rechazado
    // Datos de entrada: type = "payment"
    // Resultado esperado: HTTP 422 con error en transactions.0.type
    test.info().annotations.push({ type: 'qatlas', description: 'CP-API-01' });

    const body = base();
    body.transactions[0].type = 'payment';
    const res = await request.post('/api/v1/transactions', { data: body });
    const json = await res.json();

    expect({ status: res.status(), campo: Object.keys(json.errors ?? {})[0] })
      .toEqual({ status: 422, campo: 'transactions.0.type' });
  });
});