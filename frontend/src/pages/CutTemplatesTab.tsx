// Administración → Lista de corte: the organisation's cut list templates (columns, headers, units and CSV dialect of each
// company's optimiser or order form), next to the ready-made ones from src/core.
import { corte, CUT_FIELDS, type CutField, type CutTemplate, cutTemplateCsv, DEFAULT_KITCHEN, DEFAULT_MATERIALS, PRESET_CUT_TEMPLATES } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, isNetworkError, request } from '../api';
import { Icon, MUTED } from '../ui';

const errText = (e: unknown) => (isNetworkError(e) ? 'Sin conexión: la administración necesita internet.' : e instanceof ApiError ? e.message : 'No se pudo completar.');
const SAMPLE = corte(DEFAULT_KITCHEN, Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m])));
const slugOf = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 34) || 'plantilla';

/** Rows of the template applied to the sample kitchen, for the preview table. */
function preview(t: CutTemplate): string[][] {
  const csv = cutTemplateCsv(SAMPLE, { ...t, sep: 'tab', quote: false, bom: false, header: true });
  return csv
    .split('\r\n')
    .slice(0, 9)
    .map((l) => l.split('\t'));
}

export function CutTemplatesTab({ flash }: { flash: (m: string) => void }) {
  const [own, setOwn] = useState<CutTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState('estandar');
  const [draft, setDraft] = useState<CutTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    request<{ cutTemplates: CutTemplate[] }>('GET', '/organization')
      .then((o) => setOwn(o.cutTemplates ?? []))
      .catch((e) => setError(errText(e)));
  }, []);

  const all = [...PRESET_CUT_TEMPLATES, ...(own ?? [])];
  const isPreset = PRESET_CUT_TEMPLATES.some((t) => t.id === selId);
  const current = draft ?? all.find((t) => t.id === selId) ?? PRESET_CUT_TEMPLATES[0]!;
  const rows = useMemo(() => preview(current), [current]);

  const save = async (list: CutTemplate[], keep?: string) => {
    setBusy(true);
    try {
      const o = await request<{ cutTemplates: CutTemplate[] }>('PATCH', '/organization', { cutTemplates: list });
      setOwn(o.cutTemplates);
      setDraft(null);
      setSelId(keep ?? 'estandar');
      flash('Plantillas guardadas');
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const duplicate = (t: CutTemplate) => {
    const taken = new Set(all.map((x) => x.id));
    let id = slugOf(`${t.name}-copia`);
    for (let i = 2; taken.has(id); i++) id = `${slugOf(`${t.name}-copia`)}-${i}`;
    const copy = { ...structuredClone(t), id, name: `${t.name} (copia)`.slice(0, 60) };
    setSelId(id);
    setDraft(copy);
  };
  const edit = (patch: Partial<CutTemplate>) => {
    // Headers like "Largo (mm)" follow the unit.
    const cols = patch.unit && !patch.cols ? current.cols.map((c) => (/\((mm|cm|m|in)\)$/.test(c.label) && (c.k === 'largo' || c.k === 'ancho') ? { ...c, label: c.label.replace(/\((mm|cm|m|in)\)$/, `(${patch.unit})`) } : c)) : undefined;
    setDraft({ ...current, ...patch, ...(cols ? { cols } : {}) });
  };
  /** A new template takes its id (and download file name) from its name. */
  const withNameId = (t: CutTemplate): CutTemplate => {
    const taken = new Set(all.map((x) => x.id));
    let id = slugOf(t.name);
    for (let i = 2; taken.has(id); i++) id = `${slugOf(t.name)}-${i}`;
    return { ...t, id };
  };
  const setCol = (i: number, patch: Partial<CutTemplate['cols'][number]>) => edit({ cols: current.cols.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: -1 | 1) => {
    const cols = [...current.cols];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j]!, cols[i]!];
    edit({ cols });
  };
  const editable = !isPreset || (!!draft && !PRESET_CUT_TEMPLATES.some((t) => t.id === draft.id));
  const isNew = !!draft && !all.some((t) => t.id === draft.id);

  if (error) return <p style={{ color: 'var(--color-accent-700)' }}>{error}</p>;
  if (!own) return <p>Cargando…</p>;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, borderBottom: '2px solid var(--color-divider)', paddingBottom: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Lista de corte</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
            Arma el formato que pide cada empresa (su optimizador o su formulario de pedido): columnas, nombres, unidades y separador. Al descargar la lista de corte en
            Aprobación eliges la plantilla.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => duplicate(PRESET_CUT_TEMPLATES[0]!)}>
          <Icon name="plus" />
          Nueva plantilla
        </button>
      </div>
      <div className="adm-cut" style={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...all, ...(isNew && draft ? [draft] : [])].map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-ghost"
              onClick={() => (setSelId(t.id), setDraft(null))}
              aria-current={selId === t.id}
              style={{ justifyContent: 'space-between', fontWeight: selId === t.id ? 800 : 500, background: selId === t.id ? 'var(--color-neutral-200)' : undefined, textAlign: 'left' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              {PRESET_CUT_TEMPLATES.some((p) => p.id === t.id) && <span className="tag tag-neutral">Predefinida</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 260px' }}>
              <label htmlFor="ct-name">Nombre</label>
              <input id="ct-name" className="input" maxLength={60} value={current.name} disabled={!editable} onChange={(e) => edit({ name: e.target.value })} />
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => duplicate(current)}>
              <Icon name="copy" />
              Duplicar
            </button>
            {editable && (
              <>
                {!isNew && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => window.confirm(`¿Borrar la plantilla «${current.name}»?`) && save((own ?? []).filter((t) => t.id !== current.id))}
                  >
                    <Icon name="trash-2" />
                    Borrar
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !draft || !current.name.trim() || !current.cols.length}
                  onClick={() => {
                    const t = isNew ? withNameId(current) : current;
                    save(isNew ? [...(own ?? []), t] : (own ?? []).map((x) => (x.id === t.id ? t : x)), t.id);
                  }}
                >
                  {busy ? 'Guardando…' : 'Guardar'}
                </button>
              </>
            )}
          </div>
          {!editable && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Las plantillas predefinidas no se editan: duplícala para adaptarla a tu empresa.</p>}

          <div>
            <h6 style={{ margin: '0 0 8px' }}>Columnas</h6>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {current.cols.map((c, i) => (
                <div key={`${i}-${c.k}`} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1.2fr) minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: MUTED, textAlign: 'right' }}>{i + 1}</span>
                  <select className="input" aria-label={`Dato de la columna ${i + 1}`} value={c.k} disabled={!editable} onChange={(e) => setCol(i, { k: e.target.value as CutField, label: CUT_FIELDS[e.target.value as CutField] })}>
                    {(Object.keys(CUT_FIELDS) as CutField[]).map((k) => (
                      <option key={k} value={k}>
                        {CUT_FIELDS[k]}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" aria-label={`Encabezado de la columna ${i + 1}`} maxLength={40} value={c.label} disabled={!editable} onChange={(e) => setCol(i, { label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                    {c.k === 'fijo' && <input className="input" aria-label={`Valor fijo de la columna ${i + 1}`} placeholder="Valor" maxLength={60} value={c.v ?? ''} disabled={!editable} onChange={(e) => setCol(i, { v: e.target.value })} style={{ flex: 1, minWidth: 0 }} />}
                  </div>
                  {editable ? (
                    <div style={{ display: 'flex' }}>
                      <button type="button" className="btn btn-icon" aria-label="Subir columna" disabled={i === 0} onClick={() => move(i, -1)}>
                        <Icon name="arrow-up" size={15} />
                      </button>
                      <button type="button" className="btn btn-icon" aria-label="Bajar columna" disabled={i === current.cols.length - 1} onClick={() => move(i, 1)}>
                        <Icon name="arrow-down" size={15} />
                      </button>
                      <button type="button" className="btn btn-icon" aria-label="Quitar columna" disabled={current.cols.length === 1} onClick={() => edit({ cols: current.cols.filter((_, j) => j !== i) })}>
                        <Icon name="x" size={15} />
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            {editable && current.cols.length < 30 && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => edit({ cols: [...current.cols, { k: 'pieza', label: CUT_FIELDS.pieza }] })}>
                <Icon name="plus" />
                Agregar columna
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
            {(
              [
                ['Unidad de largo y ancho', 'unit', [['mm', 'Milímetros'], ['cm', 'Centímetros'], ['m', 'Metros'], ['in', 'Pulgadas']]],
                ['Decimales', 'decimal', [['.', 'Punto (12.5)'], [',', 'Coma (12,5)']]],
                ['Separador', 'sep', [[',', 'Coma ,'], [';', 'Punto y coma ;'], ['tab', 'Tabulador']]],
                ['Veta', 'grain', [['texto', 'Vertical / Horizontal'], ['si-no', 'Sí / No'], ['0-1', '1 / 0']]],
                ['Cantos por lado', 'edge', [['0-1', '1 / 0'], ['si-no', 'Sí / No'], ['texto', '«Canto» o vacío']]],
              ] as const
            ).map(([label, key, opts]) => (
              <div key={key} className="field">
                <label htmlFor={`ct-${key}`}>{label}</label>
                <select id={`ct-${key}`} className="input" value={current[key]} disabled={!editable} onChange={(e) => edit({ [key]: e.target.value } as Partial<CutTemplate>)}>
                  {opts.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {(
              [
                ['header', 'Fila de encabezados'],
                ['perPiece', 'Una fila por pieza (cantidad 1)'],
                ['quote', 'Textos entre comillas'],
                ['bom', 'Para Excel (acentos correctos)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: editable ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={current[key]} disabled={!editable} onChange={() => edit({ [key]: !current[key] } as Partial<CutTemplate>)} style={{ width: 17, height: 17, accentColor: 'var(--color-accent)', margin: 0 }} />
                {label}
              </label>
            ))}
          </div>

          <div>
            <h6 style={{ margin: '0 0 6px' }}>Vista previa (cocina de ejemplo)</h6>
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-divider)' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: i === 0 && current.header ? 'var(--color-neutral-200)' : undefined, fontWeight: i === 0 && current.header ? 800 : 400 }}>
                      {r.map((v, j) => (
                        <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid var(--color-divider)', whiteSpace: 'nowrap' }}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <style>{'@media (max-width: 760px){.adm-cut{grid-template-columns:minmax(0,1fr)!important}}'}</style>
    </section>
  );
}
