import { DEFAULT_MATERIALS, iso, newProject, type ProjectData, type ProjectKind } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, type ProjectSummary } from '../api';
import { canCreate, isOwner, useAuth } from '../auth';
import { LibraryDialog } from '../library/LibraryDialog';
import { ShareDialog } from '../ShareDialog';
import { InstallButton } from '../offline/install';
import { SyncBadge, useSyncStatus } from '../offline/SyncBadge';
import { createProject, deleteProject, duplicateProject, isLocalId, listProjects, onSyncEvent } from '../offline/sync';
import { UserMenu } from '../UserMenu';
import { Brand, Dialog, fmtMoney, Icon, MUTED, relativeTime, STATUS, Svg, useToast } from '../ui';

const MATERIALS = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));

const TYPES: { k: ProjectKind; name: string; kicker: string; desc: string }[] = [
  { k: 'cocina', name: 'Cocina', kicker: 'Lineal · L · U · Isla', desc: 'Bajos, alacenas, columnas y electrodomésticos con validación de instalaciones.' },
  { k: 'closet', name: 'Closet', kicker: 'Puertas abatibles', desc: 'Colgado largo y corto, cajoneras y zapateras en un muro o en esquina.' },
  { k: 'vestidor', name: 'Vestidor', kicker: 'Abierto · en U', desc: 'Módulos abiertos con isla cajonera e iluminación integrada.' },
];

// Same look as the Claude Design prototype's home: each type drawn in its own finishes, closets without the door.
const ART_MATS: Record<ProjectKind, ProjectData['mats']> = {
  cocina: { cuerpo: 'blanco', frentes: 'roble', encimera: 'cuarzo', jaladeras: 'negro' },
  closet: { cuerpo: 'blanco', frentes: 'blanco', encimera: 'cuarzo', jaladeras: 'laton' },
  vestidor: { cuerpo: 'nogal', frentes: 'nogal', encimera: 'cuarzo', jaladeras: 'laton' },
};
const art = (k: ProjectKind, ang = 45, pad = 10) => {
  const p = newProject(k);
  return iso({ ...p, mats: ART_MATS[k], ops: k === 'cocina' ? p.ops : [] }, MATERIALS, { ang, pad, altos: true });
};

export function HomePage() {
  const { me } = useAuth();
  const nav = useNavigate();
  const { flash, toast } = useToast();
  // First sign-in with Google / Microsoft lands here with ?bienvenida=1.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.get('bienvenida')) return;
    flash(`¡Bienvenido! Creamos «${me?.organization.name ?? 'tu espacio'}» para tus proyectos (plan Gratis).`);
    setParams((p) => {
      p.delete('bienvenida');
      return p;
    }, { replace: true });
    // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  }, []);
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<ProjectKind | null>(null);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [fromDevice, setFromDevice] = useState(false);
  const [tab, setTab] = useState<'todos' | 'mios' | 'compartidos'>('todos');
  const [sharing, setSharing] = useState<ProjectSummary | null>(null);
  const sync = useSyncStatus();
  const pending = new Set(sync?.pending ?? []);
  const [libOpen, setLibOpen] = useState(false);
  const arts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t.k, art(t.k)])), []);
  const thumbs = useMemo(() => ({ cocina: art('cocina', 45, 30), closet: art('closet', 45, 30) }), []);

  const load = () =>
    listProjects()
      .then((r) => {
        setItems(r.items);
        setFromDevice(r.fromDevice);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los proyectos.'));
  useEffect(() => {
    load();
    // Reload when the queue settles (ids of offline projects change, conflict copies appear).
    return onSyncEvent((e) => {
      if (e.type === 'conflict') flash(`Se guardó "${e.copyName}". ${e.reason}`);
      if (e.type === 'dropped') flash(e.message);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = items?.filter((p) => (tab === 'todos' ? true : tab === 'mios' ? p.access === 'propietario' : p.access !== 'propietario')) ?? null;
  const wasOnline = useRef(sync?.online);
  useEffect(() => {
    if (sync?.online && wasOnline.current === false) load();
    wasOnline.current = sync?.online;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync?.online]);

  const create = async (k: ProjectKind) => {
    if (!canCreate(me)) return flash('Tu rol no permite crear proyectos.');
    setCreating(k);
    try {
      const p = await createProject(k);
      nav(`/proyectos/${p.id}`);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'No se pudo crear el proyecto.');
      setCreating(null);
    }
  };

  const duplicate = async (p: ProjectSummary) => {
    setMenu(null);
    try {
      const d = await duplicateProject(p.id);
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
      await deleteProject(p.id);
      setItems((xs) => xs?.filter((x) => x.id !== p.id) ?? null);
      flash(`"${p.name}" eliminado`);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'No se pudo eliminar.');
    }
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-bg)', flex: 'none' }}>
        <Brand />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <SyncBadge />
          <InstallButton />
          <button type="button" className="btn btn-secondary home-lib" onClick={() => setLibOpen(true)} title="Bibliotecas de texturas y módulos" style={{ height: 38 }}>
            <Icon name="library" size={16} />
            <span className="install-label">Bibliotecas</span>
          </button>
          <a className="btn btn-ghost home-proto" href="/prototipo/" title="Prototipo original de Claude Design">
            <Icon name="circle-help" />
            Prototipo
          </a>
          <UserMenu />
        </div>
      </header>
      {libOpen && <LibraryDialog canWrite={canCreate(me)} onClose={() => setLibOpen(false)} onChanged={() => flash('Biblioteca actualizada')} />}
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
                <div className="type-art" style={{ aspectRatio: '4/3', background: 'var(--sp-canvas)', width: '100%', overflow: 'hidden' }}>
                  <Svg drawing={arts[t.k] ?? null} />
                </div>
                <div className="type-body" style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '2px solid var(--color-divider)' }}>
                  <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', fontWeight: 600 }}>{t.kicker}</span>
                  <span className="type-name" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.015em' }}>{t.name}</span>
                  <span className="type-desc" style={{ fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)', minHeight: 44 }}>{t.desc}</span>
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
            <span style={{ fontSize: 13, color: MUTED }}>{shown ? `${shown.length} ${shown.length === 1 ? 'proyecto' : 'proyectos'}` : ''}</span>
          </div>
          <div role="tablist" aria-label="Filtrar proyectos" style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
            {(
              [
                ['todos', 'Todos'],
                ['mios', 'Míos'],
                ['compartidos', 'Compartidos conmigo'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setTab(k)} style={{ height: 34 }}>
                {l}
                {k === 'compartidos' && items ? ` (${items.filter((p) => p.access !== 'propietario').length})` : ''}
              </button>
            ))}
          </div>
          <div className="proj-row proj-head" style={{ padding: '10px 0', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, borderBottom: '1px solid var(--color-divider)' }}>
            <span>Vista</span>
            <span>Proyecto</span>
            <span>Última edición</span>
            <span>Estado</span>
            <span />
          </div>
          {fromDevice && (
            <p style={{ fontSize: 13, color: MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Icon name="wifi-off" size={14} />
              Sin conexión: ves la lista guardada en este dispositivo. Puedes abrir y editar los proyectos que ya abriste aquí; los cambios se subirán solos.
            </p>
          )}
          {error && <p style={{ color: 'var(--color-accent-700)' }}>{error}</p>}
          {!items && !error && <p style={{ color: MUTED }}>Cargando proyectos…</p>}
          {tab === 'compartidos' && shown?.length === 0 && (
            <div style={{ padding: 24, border: '2px dashed var(--color-divider)', marginTop: 16, fontSize: 14, color: MUTED }}>Nadie te ha compartido proyectos todavía.</div>
          )}
          {tab !== 'compartidos' && shown?.length === 0 && (
            <div style={{ padding: 24, border: '2px dashed var(--color-divider)', marginTop: 16, fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>
              Todavía no tienes proyectos. Elige Cocina, Closet o Vestidor arriba para empezar.
            </div>
          )}
          {shown?.map((p) => {
            const st = STATUS[p.status] ?? STATUS.borrador!;
            return (
              <div key={p.id} className="proj-row proj-item" onClick={() => nav(`/proyectos/${p.id}`)} style={{ alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer', position: 'relative' }}>
                <div style={{ height: 84, background: 'var(--sp-canvas)', overflow: 'hidden' }}>{p.coverUrl ? <img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Svg drawing={thumbs[p.type]} />}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.name}
                    {pending.has(p.id) && (
                      <span className="tag tag-neutral" title="Guardado en este dispositivo; se subirá al servidor cuando haya conexión" style={{ fontSize: 11 }}>
                        {isLocalId(p.id) ? 'Nuevo · por subir' : 'Por subir'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED }}>
                    {p.type === 'cocina' ? 'Cocina' : 'Closet'} · {p.moduleCount} módulos · {fmtMoney(p.estimate.amount, p.estimate.currency)}
                  </div>
                  {p.access !== 'propietario' ? (
                    <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="users" size={13} />
                      De {p.ownerName ?? 'otra persona'} · {p.access === 'editar' ? 'puedes editar' : 'solo ver'}
                    </div>
                  ) : p.shareCount > 0 ? (
                    <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, color: MUTED }}>
                      <Icon name="users" size={13} />
                      Compartido con {p.shareCount} {p.shareCount === 1 ? 'persona' : 'personas'}
                    </div>
                  ) : null}
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
                      {!isLocalId(p.id) && (
                        <button type="button" className="btn btn-ghost" onClick={() => (setMenu(null), setSharing(p))} style={{ justifyContent: 'flex-start' }}>
                          <Icon name="share-2" />
                          {isOwner(me, p.access) ? 'Compartir' : 'Personas con acceso'}
                        </button>
                      )}
                      {canCreate(me) && (
                        <button type="button" className="btn btn-ghost" onClick={() => duplicate(p)} style={{ justifyContent: 'flex-start' }}>
                          <Icon name="copy" />
                          Duplicar
                        </button>
                      )}
                      {isOwner(me, p.access) && (
                        <button type="button" className="btn btn-ghost" onClick={() => (setMenu(null), setToDelete(p))} style={{ justifyContent: 'flex-start', color: 'var(--color-accent-700)' }}>
                          <Icon name="trash-2" />
                          Eliminar
                        </button>
                      )}

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
      {sharing && me && (
        <ShareDialog
          projectId={sharing.id}
          projectName={sharing.name}
          myAccess={sharing.access}
          meId={me.user.id}
          onClose={() => {
            setSharing(null);
            load();
          }}
        />
      )}
      {toast}
      <style>{`
        .type-card:hover{border-color:var(--color-accent)!important}
        .proj-row{display:grid;grid-template-columns:132px minmax(0,2fr) minmax(0,1fr) 150px 150px;gap:20px}
        .proj-item:hover{background:color-mix(in srgb,var(--color-text) 4%,transparent)}
        @media (max-width: 900px){
          .home{padding:28px 16px 56px!important}
          .home-hero{grid-template-columns:minmax(0,1fr)!important}
          .home-hero h1{font-size:32px!important}
          .home-hero p{font-size:14px!important}
          .home-types{grid-template-columns:minmax(0,1fr)!important;gap:12px!important;margin-top:20px!important}
          /* Phones: compact rows (drawing on the left, text on the right) instead of a full-screen card each */
          .type-card{flex-direction:row!important;align-items:stretch}
          .type-art{width:42%!important;aspect-ratio:auto!important;min-height:120px;flex:none}
          .type-body{border-top:0!important;border-left:2px solid var(--color-divider);padding:12px 14px!important;gap:4px!important;justify-content:center;min-width:0}
          .type-name{font-size:20px!important}
          .type-desc{min-height:0!important;font-size:13px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
          .home-proto,.sync-label,.install-label{display:none!important}
        }
        @media (max-width: 560px){
          header{gap:8px!important;padding:0 10px!important}
          .proj-row{grid-template-columns:96px minmax(0,1fr) 44px}
          .proj-row>*:nth-child(3),.proj-row>*:nth-child(4){display:none}
          .proj-row>*:nth-child(5) .btn-secondary{display:none}
        }
      `}</style>
    </div>
  );
}
