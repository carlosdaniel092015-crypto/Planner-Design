import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corte, type CutTemplate, cutTemplateCsv, DEFAULT_KITCHEN, DEFAULT_MATERIALS, edgeSides, PRESET_CUT_TEMPLATES } from '../src/core';
import { organizations } from '../src/db/schema';
import { setup, type Ctx, type TestUser } from './helpers';
import { eq } from 'drizzle-orm';

const materials = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));
const groups = corte(DEFAULT_KITCHEN, materials);
const preset = (id: string) => PRESET_CUT_TEMPLATES.find((t) => t.id === id)!;
const rows = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('plantillas de lista de corte (núcleo)', () => {
  it('estándar: mismas columnas y piezas que la lista de corte', () => {
    const r = rows(cutTemplateCsv(groups, preset('estandar')));
    expect(r[0]).toBe('"Material","Espesor (mm)","Pieza","Módulos","Cantidad","Largo (mm)","Ancho (mm)","Veta","Cantos"');
    expect(r).toHaveLength(1 + groups.reduce((a, g) => a + g.rows.length, 0));
  });

  it('centímetros con coma decimal y punto y coma; una fila por pieza; cantos por lado', () => {
    const tpl: CutTemplate = {
      ...preset('excel-cm'),
      id: 'mi-taller',
      name: 'Mi taller',
      perPiece: true,
      quote: false,
      bom: false,
      cols: [
        { k: 'n', label: '#' },
        { k: 'largo', label: 'L' },
        { k: 'ancho', label: 'A' },
        { k: 'cantidad', label: 'Cant' },
        { k: 'cantoL1', label: 'L1' },
        { k: 'cantoA2', label: 'A2' },
        { k: 'fijo', label: 'Taller', v: 'Norte' },
        { k: 'proyecto', label: 'Obra' },
      ],
      edge: 'si-no',
    };
    const csv = cutTemplateCsv(groups, tpl, { proyecto: 'Cocina Ortega' });
    const r = rows(csv);
    expect(csv.startsWith('﻿')).toBe(false);
    expect(r[0]).toBe('#;L;A;Cant;L1;A2;Taller;Obra');
    const pieces = groups.reduce((a, g) => a + g.pieces, 0);
    expect(r).toHaveLength(1 + pieces);
    // Every row is one piece; lengths in cm with comma decimals.
    const first = groups[0]!.rows[0]!;
    const cells = r[1]!.split(';');
    expect(cells[0]).toBe('1');
    expect(cells[1]).toBe(String(first.L / 10).replace('.', ','));
    expect(cells[3]).toBe('1');
    expect(cells[6]).toBe('Norte');
    expect(cells[7]).toBe('Cocina Ortega');
  });

  it('veta como 1/0 y cantos desde el código nL', () => {
    expect(edgeSides('4L')).toEqual([true, true, true, true]);
    expect(edgeSides('1L')).toEqual([true, false, false, false]);
    expect(edgeSides('—')).toEqual([false, false, false, false]);
    const r = rows(cutTemplateCsv(groups, preset('optimizador')));
    expect(r[0]).toBe('Largo,Ancho,Cantidad,Material,Etiqueta,Veta');
    for (const line of r.slice(1)) expect(['0', '1']).toContain(line.split(',').at(-1));
  });
});

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-corte@a.test');
});
afterAll(() => t.close());

describe('plantillas de lista de corte (API)', () => {
  const mine: CutTemplate = { ...preset('cantos-por-lado'), id: 'maderas-norte', name: 'Formulario Maderas Norte', unit: 'cm', sep: ';' };

  it('el admin guarda plantillas propias; no puede usar ids predefinidos ni repetidos', async () => {
    expect((await t.req('PATCH', '/organization', { user: t.adminA, body: { cutTemplates: [{ ...mine, id: 'estandar' }] } })).status).toBe(400);
    expect((await t.req('PATCH', '/organization', { user: t.adminA, body: { cutTemplates: [mine, mine] } })).status).toBe(400);
    expect((await t.req('PATCH', '/organization', { user: dis, body: { cutTemplates: [mine] } })).status).toBe(403);
    const ok = await t.req('PATCH', '/organization', { user: t.adminA, body: { cutTemplates: [mine] } });
    expect(ok.status).toBe(200);
    expect(ok.data.cutTemplates.map((x: any) => x.id)).toEqual(['maderas-norte']);
    expect((await t.req('GET', '/organization', { user: dis })).data.cutTemplates[0].name).toBe('Formulario Maderas Norte');
  });

  it('la descarga usa la plantilla elegida (predefinida o propia) y 404 si no existe', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: { data: DEFAULT_KITCHEN } })).data;
    const std = await t.req('GET', `/projects/${p.id}/cutlist.csv`, { user: dis });
    expect(std.status).toBe(200);
    const own = await t.req('GET', `/projects/${p.id}/cutlist.csv?plantilla=maderas-norte`, { user: dis });
    expect(own.status).toBe(200);
    expect(String(own.data).replace(/^﻿/, '').split('\r\n')[0]).toContain('"L1";"L2";"A1";"A2"');
    expect(own.headers.get('content-disposition')).toContain('-maderas-norte.csv');
    const opt = await t.req('GET', `/projects/${p.id}/cutlist.csv?plantilla=optimizador`, { user: dis });
    expect(String(opt.data).split('\r\n')[0]).toBe('Largo,Ancho,Cantidad,Material,Etiqueta,Veta');
    expect((await t.req('GET', `/projects/${p.id}/cutlist.csv?plantilla=no-existe`, { user: dis })).status).toBe(404);
    // Another organisation's template is not visible.
    await t.db.update(organizations).set({ plan: 'empresa' }).where(eq(organizations.id, t.orgB.id));
    const pb = (await t.req('POST', '/projects', { user: t.adminB, body: { data: DEFAULT_KITCHEN } })).data;
    expect((await t.req('GET', `/projects/${pb.id}/cutlist.csv?plantilla=maderas-norte`, { user: t.adminB })).status).toBe(404);
  });
});
