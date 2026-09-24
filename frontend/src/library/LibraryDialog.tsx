// Bibliotecas: the organisation's own textures and modules (JSON, GLB and 3DS/OBJ/DAE/FBX converted to GLB), stored on the server.
import { DEFAULT_MODULES } from '@core';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { Icon, MUTED } from '../ui';
import { formatOf, MODEL_EXT, SKP_HELP, toGlb } from './convert';
import { type LibModule, type LibTexture, lib, uploadFile } from './upload';

type Tab = 'tex' | 'mod';
const BUILTIN = new Set(DEFAULT_MODULES.map((d) => d.code));
const TEX_TYPES = ['Melamina', 'Melamina texturizada', 'Chapa natural', 'Lacado', 'Cuarzo', 'Granito', 'Madera maciza', 'Metal', 'Vidrio'];
const CATS = ['Mis módulos', 'Bajos', 'Altos', 'Columnas', 'Esquinas', 'Cajoneras', 'Closet', 'Electro'];
const USES = [
  ['frentes', 'Frentes', 'door-closed'],
  ['cuerpo', 'Cuerpo', 'box'],
  ['encimera', 'Encimera', 'square'],
  ['jaladeras', 'Jaladeras', 'grip-horizontal'],
] as const;

/** Guess material kind/type from the file name (roble.jpg → madera). */
function guessTexture(name: string) {
  const n = name.toLowerCase();
  if (/roble|nogal|fresno|pino|cedro|teca|madera|wood|oak|walnut|haya/.test(n)) return { kind: 'madera', type: 'Melamina texturizada', uses: ['frentes', 'cuerpo'] };
  if (/marm|granit|cuarz|piedra|stone|marble|quartz|terrazo/.test(n)) return { kind: 'piedra', type: 'Cuarzo', uses: ['encimera'] };
  if (/acero|inox|metal|alumin|laton|brass|steel|cobre/.test(n)) return { kind: 'metal', type: 'Metal', uses: ['jaladeras'] };
  if (/vidrio|glass|cristal/.test(n)) return { kind: 'vidrio', type: 'Vidrio', uses: ['frentes'] };
  return { kind: 'solido', type: 'Melamina', uses: ['frentes', 'cuerpo'] };
}
const finishOf = (t: LibTexture & { roughness?: number | null }) => ((t.roughness ?? 0.6) < 0.3 ? 'Brillante' : (t.roughness ?? 0.6) < 0.5 ? 'Satinado' : 'Mate');
const prettyName = (file: string) => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);

const TEMPLATE = [
  { code: 'MB-100', name: 'Bajo 2 puertas con cajón', type: 'base', category: 'Mis módulos', minW: 60, maxW: 120, defW: 100, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'drawer', f: 0.25 }, { t: 'door', n: 2, f: 0.75 }] }, unitPrice: 3000, priceCurrency: 'DOP' },
  { code: 'MA-80', name: 'Alacena abatible', type: 'upper', category: 'Mis módulos', minW: 60, maxW: 100, defW: 80, fixedH: 40, fixedD: 35, recipe: { fr: [{ t: 'door', n: 1, f: 1 }] }, unitPrice: 2500, priceCurrency: 'DOP' },
];

export function LibraryDialog({ onClose, onChanged, canWrite, initialTab = 'tex' }: { onClose: () => void; onChanged: () => void; canWrite: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tex, setTex] = useState<LibTexture[] | null>(null);
  const [mods, setMods] = useState<LibModule[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const changed = useRef(false);
  const zipRef = useRef<HTMLInputElement>(null);

  const load = () =>
    Promise.all([lib.textures(), lib.modules()])
      .then(([t, m]) => {
        setTex(t.items.filter((x) => x.active));
        setMods(m.items.filter((x) => x.active && (!BUILTIN.has(x.code) || x.source === 'modelo3d')));
      })
      .catch((e) => setMsgs([e instanceof ApiError ? e.message : 'No se pudo cargar la biblioteca.']));
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once
  useEffect(() => {
    load();
  }, []);
  const close = () => {
    if (changed.current) onChanged();
    onClose();
  };
  const touch = () => {
    changed.current = true;
  };
  const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'error desconocido');

  const addTextures = async (files: File[]) => {
    const out: string[] = [];
    for (const [i, f] of files.entries()) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        out.push(`${f.name}: solo JPG, PNG o WebP.`);
        continue;
      }
      setBusy(`Subiendo ${f.name} (${i + 1} de ${files.length})…`);
      try {
        const up = await uploadFile('textura', f, f.name);
        const g = guessTexture(f.name);
        await lib.createTexture({ name: prettyName(f.name), type: g.type, kind: g.kind, uses: g.uses, tileCm: 60, finish: 'Mate', baseColorFileId: up.id });
        touch();
      } catch (e) {
        out.push(`${f.name}: ${errText(e)}`);
      }
    }
    return out;
  };

  const addModules = async (files: File[]) => {
    const out: string[] = [];
    for (const [i, f] of files.entries()) {
      const ext = f.name.toLowerCase().split('.').pop();
      try {
        if (ext === 'json') {
          setBusy(`Leyendo ${f.name}…`);
          const parsed = JSON.parse(await f.text());
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.modules) ? parsed.modules : [parsed];
          for (const m of list) {
            try {
              await lib.createModule({ source: 'parametrico', category: 'Mis módulos', ...m });
              touch();
            } catch (e) {
              out.push(`${f.name} · ${m?.code ?? m?.name ?? 'módulo'}: ${errText(e)}`);
            }
          }
          continue;
        }
        const fmt = formatOf(f.name);
        if (!fmt) {
          out.push(`${f.name}: formato no admitido. Usa JSON, ${MODEL_EXT.join(', ')}.`);
          continue;
        }
        if (fmt === 'skp') {
          out.push(`${f.name}: ${SKP_HELP}`);
          continue;
        }
        let glb: Blob = f;
        let name = f.name;
        if (fmt !== 'glb' && fmt !== 'gltf') {
          setBusy(`Convirtiendo ${f.name} a GLB (${i + 1} de ${files.length})…`);
          const c = await toGlb(f);
          glb = c.glb;
          name = c.name;
          if (c.note) out.push(`${f.name}: ${c.note}`);
        }
        setBusy(`Subiendo ${name}…`);
        const up = await uploadFile('modelo3d', glb, name);
        const info = await lib.inspect(up.id);
        const tall = info.bbox.h > 120;
        const r = await lib.createModule({
          name: prettyName(f.name),
          source: 'modelo3d',
          modelFileId: up.id,
          type: tall ? 'fridge' : 'base',
          category: tall ? 'Electro' : 'Mis módulos',
          compressDraco: glb.size > 4 * 1048576,
          unitPrice: 0,
          priceCurrency: 'DOP',
        });
        touch();
        if (info.warnings.length) out.push(`${f.name}: ${info.warnings.join(' ')}`);
        out.push(`${f.name}: listo como "${r.module.name}" (${Math.round(r.module.defW)} × ${Math.round(r.module.fixedH)} × ${Math.round(r.module.fixedD)} cm).`);
      } catch (e) {
        out.push(`${f.name}: ${errText(e)}`);
      }
    }
    return out;
  };

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list?.length || !canWrite) return;
    const files = [...list];
    setMsgs([]);
    const out = tab === 'tex' ? await addTextures(files) : await addModules(files);
    setBusy(null);
    setMsgs(out);
    await load();
  };

  const patchTex = async (t: LibTexture, patch: Record<string, unknown>) => {
    setTex((xs) => xs?.map((x) => (x.id === t.id ? ({ ...x, ...patch } as LibTexture) : x)) ?? null);
    try {
      await lib.updateTexture(t.id, patch);
      touch();
    } catch (e) {
      setMsgs([`${t.name}: ${errText(e)}`]);
      load();
    }
  };
  const patchMod = async (m: LibModule, patch: Record<string, unknown>) => {
    setMods((xs) => xs?.map((x) => (x.id === m.id ? ({ ...x, ...patch } as LibModule) : x)) ?? null);
    try {
      await lib.updateModule(m.id, patch);
      touch();
    } catch (e) {
      setMsgs([`${m.name}: ${errText(e)}`]);
      load();
    }
  };

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(TEMPLATE, null, 2)], { type: 'application/json' }));
    a.download = 'plantilla-modulos.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const importZip = async (f: File | undefined) => {
    if (!f) return;
    setBusy(`Importando ${f.name}…`);
    try {
      const r = await lib.importZip(f);
      touch();
      setMsgs([`ZIP importado: ${r.created.length} creados, ${r.updated.length} actualizados.`, ...r.errors.map((e) => `${e.code}: ${e.message}`)]);
    } catch (e) {
      setMsgs([errText(e)]);
    }
    setBusy(null);
    load();
  };

  const accept = tab === 'tex' ? 'image/jpeg,image/png,image/webp' : `.json,${MODEL_EXT.join(',')}`;
  const blurNum = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

  return (
    <div className="dialog-backdrop" style={{ zIndex: 70, position: 'fixed' }} onClick={close}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Bibliotecas" onClick={(e) => e.stopPropagation()} style={{ width: 'min(1040px,100%)', height: 'min(760px,100%)', gap: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: 12, padding: '20px 20px 0' }}>
          <div style={{ flex: 1 }}>
            <div className="dialog-title">Bibliotecas</div>
            <div className="dialog-body">Sube tus propias texturas y módulos. Se guardan en el servidor de tu organización y quedan disponibles en todos los proyectos.</div>
          </div>
          <button type="button" className="btn btn-icon" onClick={close} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', padding: '0 20px', borderBottom: '2px solid var(--color-divider)', marginTop: 12, alignItems: 'center' }}>
          {(
            [
              ['tex', 'Texturas', 'palette', tex?.length ?? 0],
              ['mod', 'Módulos', 'package', mods?.length ?? 0],
            ] as const
          ).map(([k, label, icon, n]) => (
            <button type="button" key={k} className="tab-btn" onClick={() => (setTab(k), setMsgs([]))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 10px', background: 'none', border: 0, borderBottom: `3px solid ${tab === k ? 'var(--color-accent)' : 'transparent'}`, marginBottom: -2, font: 'inherit', fontSize: 14, fontWeight: tab === k ? 800 : 600, color: 'var(--color-text)', cursor: 'pointer' }}>
              <Icon name={icon} size={16} />
              {label}
              <span className="tag tag-neutral">{n}</span>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {canWrite && (
            <button type="button" className="btn btn-ghost" onClick={() => zipRef.current?.click()} style={{ fontSize: 13 }}>
              <Icon name="file-archive" size={15} />
              Importar ZIP
            </button>
          )}
          <a className="btn btn-ghost" href="/api/v1/library/export" style={{ fontSize: 13 }}>
            <Icon name="download" size={15} />
            Exportar ZIP
          </a>
          <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              importZip(file);
            }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {canWrite ? (
            <label
              onDragOver={(e) => (e.preventDefault(), setDrag(true))}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 22, border: `2px dashed ${drag ? 'var(--color-accent)' : 'var(--color-divider)'}`, background: drag ? 'var(--color-accent-100)' : 'var(--color-bg)', cursor: 'pointer', position: 'relative' }}
            >
              <input type="file" multiple accept={accept} onChange={(e) => {
                const picked = e.target.files ? [...e.target.files] : [];
                e.target.value = '';
                addFiles(picked);
              }}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }} />
              <Icon name="upload" size={28} style={{ color: 'var(--color-accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{tab === 'tex' ? 'Arrastra tus texturas aquí' : 'Arrastra tus módulos aquí'}</div>
                <div style={{ fontSize: 13, color: MUTED }}>
                  {tab === 'tex'
                    ? 'JPG, PNG o WebP. Detectamos madera, piedra y metal por el nombre del archivo; puedes ajustarlo después.'
                    : 'JSON con módulos paramétricos, o modelos 3D: GLB/glTF, 3DS, OBJ, COLLADA (.dae) y FBX (se convierten a GLB). SketchUp (.skp): expórtalo como .dae o .3ds.'}
                </div>
              </div>
              <span className="btn btn-primary">Elegir archivos</span>
            </label>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Tu rol puede consultar la biblioteca pero no modificarla.</p>
          )}
          {busy && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span style={{ width: 16, height: 16, border: '2px solid var(--color-neutral-400)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spspin .8s linear infinite' }} />
              {busy}
            </div>
          )}
          {msgs.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'start', padding: '10px 12px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 13 }}>
              <Icon name="info" size={16} style={{ flex: 'none', marginTop: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {msgs.map((m, i) => (
                  <span key={`${i}${m}`}>{m}</span>
                ))}
              </div>
            </div>
          )}

          {tab === 'tex' && (
            <>
              {tex?.length === 0 && <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Aún no hay texturas propias. Recomendado: imágenes sin costuras (seamless) de 1024 px o más, con la medida real de la muestra.</p>}
              {tex?.map((t) => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 36px', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--color-divider)', alignItems: 'start' }}>
                  <div style={{ width: 88, height: 88, background: t.maps.baseColor ? `url(${t.maps.baseColor.thumb ?? t.maps.baseColor.url}) center/cover` : t.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                    <div className="field">
                      <label>Nombre</label>
                      <input className="input" defaultValue={t.name} disabled={!canWrite} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && patchTex(t, { name: e.target.value.trim() })} />
                    </div>
                    <div className="field">
                      <label>Tipo</label>
                      <select className="input" value={TEX_TYPES.includes(t.type) ? t.type : 'Melamina'} disabled={!canWrite} onChange={(e) => patchTex(t, { type: e.target.value })}>
                        {TEX_TYPES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Medida real de la muestra</label>
                      <div style={{ position: 'relative' }}>
                        <input className="input" type="number" min={5} max={400} defaultValue={t.sizeWcm ?? 60} disabled={!canWrite} onBlur={(e) => patchTex(t, { tileCm: blurNum(e.target.value, 5, 400) })} style={{ paddingRight: 36, width: '100%' }} />
                        <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, opacity: 0.6 }}>cm</span>
                      </div>
                    </div>
                    <div className="field">
                      <label>Acabado</label>
                      <select className="input" value={t.finish ?? finishOf(t)} disabled={!canWrite} onChange={(e) => patchTex(t, { finish: e.target.value })}>
                        {['Mate', 'Satinado', 'Brillante'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 12, marginBottom: 5, color: MUTED }}>Usar en</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {USES.map(([k, l, icon]) => {
                          const on = t.uses.includes(k);
                          return (
                            <button
                              type="button"
                              key={k}
                              disabled={!canWrite || (on && t.uses.length === 1)}
                              onClick={() => patchTex(t, { uses: on ? t.uses.filter((u) => u !== k) : [...t.uses, k] })}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'inherit', fontSize: 12, padding: '5px 10px', cursor: 'pointer', background: on ? 'var(--color-text)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)', border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}` }}
                            >
                              <Icon name={icon} size={13} />
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label="Descontinuar textura"
                      title="Descontinuar (los proyectos que ya la usan la conservan)"
                      onClick={() =>
                        lib
                          .deleteTexture(t.id)
                          .then(() => (touch(), load()))
                          .catch((e) => setMsgs([errText(e)]))
                      }
                    >
                      <Icon name="trash-2" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {tab === 'mod' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: MUTED, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 240 }}>JSON para módulos paramétricos (frentes, rango de ancho, precio). Modelos 3D para electrodomésticos y accesorios; se colocan a su medida real.</span>
                <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
                  <Icon name="file-json" size={15} />
                  Descargar plantilla JSON
                </button>
              </div>
              {mods?.length === 0 && <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Aún no hay módulos propios.</p>}
              {mods?.map((m) => (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 36px', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--color-divider)', alignItems: 'start' }}>
                  <div style={{ width: 88, height: 88, background: m.thumbnailUrl ? `url(${m.thumbnailUrl}) center/contain no-repeat var(--sp-canvas)` : 'var(--sp-canvas)', display: 'grid', placeItems: 'center' }}>
                    {!m.thumbnailUrl && <Icon name={m.source === 'modelo3d' ? 'box' : 'layout-grid'} size={30} style={{ opacity: 0.5 }} />}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label>Nombre</label>
                      <input className="input" defaultValue={m.name} disabled={!canWrite} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && patchMod(m, { name: e.target.value.trim() })} />
                    </div>
                    <div className="field">
                      <label>Código</label>
                      <input className="input" value={m.code} disabled readOnly />
                    </div>
                    <div className="field">
                      <label>Categoría</label>
                      <select className="input" value={m.category} disabled={!canWrite} onChange={(e) => patchMod(m, { category: e.target.value })}>
                        {[...new Set([...CATS, m.category])].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Montaje</label>
                      <select className="input" value={m.type} disabled={!canWrite} onChange={(e) => patchMod(m, { type: e.target.value })}>
                        <option value="base">Bajo (con encimera)</option>
                        <option value="upper">Alto (a 150 cm)</option>
                        <option value="tall">Columna</option>
                        <option value="fridge">Libre / de piso</option>
                        <option value="hood">Campana</option>
                      </select>
                    </div>
                    {(
                      [
                        ['defW', 'Ancho cm'],
                        ['fixedH', 'Alto cm'],
                        ['fixedD', 'Fondo cm'],
                        ['minW', 'Ancho mín.'],
                        ['maxW', 'Ancho máx.'],
                      ] as const
                    ).map(([k, l]) => (
                      <div key={k} className="field">
                        <label>{l}</label>
                        <input className="input" type="number" defaultValue={Math.round(m[k])} disabled={!canWrite} onBlur={(e) => Number(e.target.value) !== m[k] && patchMod(m, { [k]: blurNum(e.target.value, 1, 1000) })} />
                      </div>
                    ))}
                    <div className="field">
                      <label>Precio ({m.priceCurrency === 'USD' ? 'US$' : 'RD$'})</label>
                      <input className="input" type="number" min={0} defaultValue={m.unitPrice} disabled={!canWrite} onBlur={(e) => Number(e.target.value) !== m.unitPrice && patchMod(m, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: MUTED }}>
                      <span className="tag tag-neutral">{m.source === 'modelo3d' ? 'Modelo 3D (GLB)' : 'Paramétrico'}</span>
                      {m.source === 'modelo3d' ? 'Se dibuja con su modelo en el 3D; el ancho del catálogo solo sirve para ubicarlo.' : 'Frentes y despiece según su receta.'}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label="Descontinuar módulo"
                      title="Descontinuar (los proyectos que ya lo usan lo conservan)"
                      onClick={() =>
                        lib
                          .deleteModule(m.id)
                          .then(() => (touch(), load()))
                          .catch((e) => setMsgs([errText(e)]))
                      }
                    >
                      <Icon name="trash-2" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '2px solid var(--color-divider)' }}>
          <span style={{ flex: 1, fontSize: 13, color: MUTED }}>{tab === 'tex' ? 'Las texturas aparecen en la pestaña Materiales según su uso.' : 'Los módulos aparecen en la pestaña Módulos, en su categoría.'}</span>
          <button type="button" className="btn btn-primary" onClick={close}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
