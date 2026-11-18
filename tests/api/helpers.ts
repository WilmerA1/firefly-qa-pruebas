import { APIRequestContext } from '@playwright/test';

export const CUENTA = Number(process.env.ID_CUENTA);
export const CUENTA_EUR = Number(process.env.ID_CUENTA_EUR);
export const CUENTA_AJENA = Number(process.env.ID_CUENTA_AJENA);

export const largo = (n: number, c = 'a') => c.repeat(n);
export const unico = (prefijo: string) => `${prefijo}-${Date.now()}`;

/** Un split válido; `extra` agrega o sobreescribe campos y `quitar` borra campos. */
export function split(extra: Record<string, unknown> = {}, quitar: string[] = []) {
  const s: Record<string, unknown> = {
    type: 'withdrawal', date: '2026-10-10', amount: '10',
    description: 'QA-ok', source_id: CUENTA, destination_name: 'QA-Tienda',
    ...extra,
  };
  quitar.forEach((k) => delete s[k]);
  return s;
}

export const transaccion = (extra = {}, quitar: string[] = []) =>
  ({ transactions: [split(extra, quitar)] });

export type Creado = { recurso: 'transactions' | 'budgets'; id: string };

/** Borra lo que una prueba creó, para dejar Firefly limpio. */
export async function limpiar(request: APIRequestContext, creados: Creado[]) {
  for (const c of creados) await request.delete(`/api/v1/${c.recurso}/${c.id}`);
  creados.length = 0;
}

/** Anotación que enlaza el test con su caso en QAtlas: CP-API-01 → FF3-TC-1. */
export const qatlas = (codigo: string) =>
  ({ type: 'qatlas', description: `FF3-TC-${Number(codigo.slice(-2))}` });