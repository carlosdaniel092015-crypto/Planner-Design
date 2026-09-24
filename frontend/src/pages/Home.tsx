import { DEFAULT_MATERIALS, iso, newProject, type ProjectKind } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, type ProjectSummary } from '../api';
import { canCreate, canEdit, useAuth } from '../auth';
import { LibraryDialog } from '../library/LibraryDialog';
import { UserMenu } from '../UserMenu';
import { Brand, Dialog, fmtMoney, Icon, MUTED, relativeTime, STATUS, Svg, useToast } from '../ui';

const MATERIALS = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));

const TYPES: { k: ProjectKind; name: string; kicker: string; desc: string }[] = [
  { k: 'cocina', name: 'Cocina', kicker: 'Lineal · L · U · Isla', desc: 'Bajos, alacenas, columnas y electrodomésticos con validación de instalaciones.' },
  { k: 'closet', name: 'Closet', kicker: 'Puertas abatibles', desc: 'Colgado largo y corto, cajoneras y zapateras en un muro o en esquina.' },
  { k: 'vestidor', name: 'Vestidor', kicker: 'Abierto · en U', desc: 'Módulos abiertos con isla cajonera e iluminación integrada.' },
];

const art = (k: ProjectKind, ang = 45, pad = 10) => iso(newProject(k), MATERIALS, { ang, pad, altos: true });

export function HomePage() {
  const { me } = useAuth();
  const nav = useNavigate();
  const { flash, toast } = useToast();
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<ProjectKind | null>(null);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const arts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t.k, art(t.k)])), []);
  const thumbs = useMemo(() => ({ cocina: art('cocina', 45, 30), closet: art('closet', 45, 30) }), []);

  const load = () =>
    api
      .listProjects()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los proyectos.'));
  useEffect(() => {
    load();
  }, []);

  const create = async (k: ProjectKind) => {
    if (!canCreate(me)) return flash('Tu rol no permite crear proyectos.');
    setCreating(k);
    try {
      const p = await api.createProject({ ptype: k });
      nav(`/proyectos/${p.id}`);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'No se pudo crear el proyecto.');
      setCreating(null);
    }
  };

  const duplicate = async (p: ProjectSummary) => {
    setMenu(null);
    try {
      const d = await api.duplicateProject(p.id);
      flash(`Se creó "${d.name}"`);
      load();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'No se pudo duplicar.');
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    const p = toDelete;
    setToDelete(null);
    try {
      await api.deleteProject(p.id);
      setItems((xs) => xs?.filter((x) => x.id !== p.id) ?? null);
      flash(`"${p.name}" eliminado`);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'No se pudo eliminar.');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-bg)', flex: 'none' }}>
        <Brand />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setLibOpen(true)} title="Bibliotecas de texturas y módulos" style={{ height: 38 }}>
            <Icon name="library" size={16} />
            Bibliotecas
          </button>
          <a className="btn btn-ghost" href="/prototipo/" title="Prototipo original de Claude Design">
            <Icon name="circle-help" />
            Prototipo
          </a>
          <UserMenu />
        </div>
      </header>
      {libOpen && <LibraryDialog canWrite={canEdit(me)} onClose={() => setLibOpen(false)} onChanged={() => flash('Biblioteca actualizada')} />}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '44px 32px 72px' }} className="home">
          <div className="home-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,380px)', alignItems: 'end', gap: 32, paddingBottom: 24, borderBottom: '2px solid var(--color-divider)' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 10, fontWeight: 600 }}>Nuevo proyecto</div>
              <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.02 }}>¿Qué vamos a diseñar?</h1>
            </div>
            <p style={{ margin: 0, fontSize: 15, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)', textWrap: 'pretty' }}>
              Elige el tipo de mueble. Te guiamos por medidas, instalaciones y preferencias, y después generamos una propuesta en 3D con módulos a medida.
            </p>
          </div>
          <div className="home-types" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 24, marginTop: 28 }}>
            {TYPES.map((t) => (
              <button type="button" key={t.k} className="type-card" onClick={() => create(t.k)} disabled={!!creating} style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', background: 'var(--color-surface)', border: '2px solid transparent', padding: 0, cursor: 'pointer', color: 'var(--color-text)', font: 'inherit' }}>
                <div style={{ aspectRatio: '4/3', background: 'var(--sp-canvas)', width: '100%', overflow: 'hidden' }}>
                  <Svg drawing={arts[t.k] ?? null} />
                </div>
                <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '2px solid var(--color-divider)' }}>
                  <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', fontWeight: 600 }}>{t.kicker}</span>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.015em' }}>{t.name}</span>
                  <span style={{ fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)', minHeight: 44 }}>{t.desc}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14, color: 'var(--color-accent-700)', marginTop: 6 }}>
                    {creating === t.k ? 'Creando…' : 'Empezar'}
                    <Icon name="arrow-right" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 56, paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
            <h2 style={{ margin: 0, fontSize: 28 }}>Mis proyectos</h2>
            <span style={{ fontSize: 13, color: MUTED }}>{items ? `${items.length} ${items.length === 1 ? 'proyecto' : 'proyectos'}` : ''}</span>
          </div>
          <div className="proj-row proj-head" style={{ padding: '10px 0', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, borderBottom: '1px solid var(--color-divider)' }}>
            <span>Vista</span>
            <span>Proyecto</span>
            <span>Última edición</span>
            <span>Estado</span>
            <span />
          </div>
          {error && <p style={{ color: 'var(--color-accent-700)' }}>{error}</p>}
          {!items && !error && <p style={{ color: MUTED }}>Cargando proyectos…</p>}
          {items?.length === 0 && (
            <div style={{ padding: 24, border: '2px dashed var(--color-divider)', marginTop: 16, fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>
              Todavía no tienes proyectos. Elige Cocina, Closet o Vestidor arriba para empezar.
            </div>
          )}
          {items?.map((p) => {
            const st = STATUS[p.status] ?? STATUS.borrador!;
            return (
              <div key={p.id} className="proj-row proj-item" onClick={() => nav(`/proyectos/${p.id}`)} style={{ alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', position: 'relative' }}>
                <div style={{ height: 84, background: 'var(--sp-canvas)', overflow: 'hidden' }}>{p.coverUrl ? <img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Svg drawing={thumbs[p.type]} />}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: MUTED }}>
                    {p.type === 'cocina' ? 'Cocina' : 'Closet'} · {p.moduleCount} módulos · {fmtMoney(p.estimate.amount, p.estimate.currency)}
                  </div>
                </div>
                <span style={{ fontSize: 14 }}>{relativeTime(p.updatedAt)}</span>
                <span>
                  <span className={st.tag}>{st.label}</span>
                </span>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <span className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                    Abrir
                    <Icon name="arrow-right" size={15} />
                  </span>
                  <button type="button"
                    className="btn btn-icon"
                    aria-label="Más acciones"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === p.id ? null : p.id);
                    }}
                  >
                    <Icon name="ellipsis-vertical" size={17} />
                  </button>
                </span>
                {menu === p.id && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={(e) => (e.stopPropagation(), setMenu(null))} />
                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 'calc(100% - 8px)', zIndex: 21, width: 200, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
                      {canCreate(me) && (
                        <button type="button" className="btn btn-ghost" onClick={() => duplicate(p)} style={{ justifyContent: 'flex-start' }}>
                          <Icon name="copy" />
                          Duplicar
                        </button>
                      )}
                      {canEdit(me, p.ownerId) && (
                        <button type="button" className="btn btn-ghost" onClick={() => (setMenu(null), setToDelete(p))} style={{ justifyContent: 'flex-start', color: 'var(--color-accent-700)' }}>
                          <Icon name="trash-2" />
                          Eliminar
                        </button>
                      )}
                      {!canCreate(me) && !canEdit(me, p.ownerId) && <span style={{ padding: 12, fontSize: 13, color: MUTED }}>Solo lectura</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>
      {toDelete && (
        <Dialog
          title="¿Eliminar proyecto?"
          onClose={() => setToDelete(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={remove}>
                Eliminar
              </button>
            </>
          }
        >
          "{toDelete.name}" dejará de aparecer en tu lista. Un administrador puede recuperarlo desde la base de datos si fue un error.
        </Dialog>
      )}
      {toast}
      <style>{`
        .type-card:hover{border-color:var(--color-accent)!important}
        .proj-row{display:grid;grid-template-columns:132px minmax(0,2fr) minmax(0,1fr) 150px 150px;gap:20px}
        .proj-item:hover{background:color-mix(in srgb,var(--color-text) 4%,transparent)}
        @media (max-width: 900px){
          .home{padding:28px 16px 56px!important}
          .home-hero{grid-template-columns:minmax(0,1fr)!important}
          .home-hero h1{font-size:38px!important}
          .home-types{grid-template-columns:minmax(0,1fr)!important}
          .proj-row{grid-template-columns:96px minmax(0,1fr) 44px}
          .proj-row>*:nth-child(3),.proj-row>*:nth-child(4){display:none}
          .proj-row>*:nth-child(5) .btn-secondary{display:none}
        }
      `}</style>
    </div>
  );
}
