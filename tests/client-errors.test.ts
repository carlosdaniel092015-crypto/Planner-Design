import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

const report = (message: string) =>
  t.app.request('/api/v1/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, version: '1.5.0' }) });

describe('errores del navegador', () => {
  it('registra el error en el log como una línea JSON y limita a 20 por minuto', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await report('TypeError: x is undefined');
      expect(r.status).toBe(200);
      expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ level: 'error', source: 'navegador', message: 'TypeError: x is undefined', version: '1.5.0', user: null });
      for (let i = 0; i < 25; i++) await report(`e${i}`);
      expect(spy.mock.calls.length).toBe(20);
    } finally {
      spy.mockRestore();
    }
  });

  it('rechaza un cuerpo mal formado', async () => {
    const r = await t.app.request('/api/v1/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stack: 'x' }) });
    expect(r.status).toBe(400);
  });
});
