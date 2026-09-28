// Client-facing page behind the approval link (/p/:token): review the frozen version and sign or ask for changes.
import { iso, type MaterialDefinition } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api, type CatalogMaterial, type PublicView } from '../api';
import { budgetRows } from '../approval/ApprovalView';
import { Photo, SignaturePad } from '../approval/shared';
import { installEngine, sceneCfg } from '../editor/engine';
import { Icon, MUTED, Svg } from '../ui';

type Load = { kind: 'loading' } | { kind: 'error'; title: string; message: string } | { kind: 'ready'; view: PublicView };

export function PublicApprovalPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [decision, setDecision] = useState<'aprobado' | 'cambios'>('aprobado');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [comment, setComment] = useState('');
  const [sig, setSig] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<'aprobado' | 'cambios' | null>(null);
  const [wall, setWall] = useState('A');

  useEffect(() => {
    api
      .publicView(token)
      .then((view) => {
        installEngine(view.materials.map((m) => ({ id: m.code, code: m.code, name: m.name, type: m.type, color: m.color ?? '#cccccc', kind: '', uses: m.groups, grain: 'ninguna', sizeWcm: null, roughness: null, source: 'estandar', maps: { baseColor: null } }) as CatalogMaterial));
        setName(view.project.client ?? '');
        setState({ kind: 'ready', view });
      })
      .catch((e) => {
        const gone = e instanceof ApiError && e.status === 410;
        setState({ kind: 'error', title: gone ? 'Este enlace ya no está activo' : e instanceof ApiError && e.status === 404 ? 'Enlace no encontrado' : 'No pudimos abrir la propuesta', message: e instanceof ApiError ? e.message : 'Revisa tu conexión e inténtalo de nuevo.' });
      });
  }, [token]);

  const view = state.kind === 'ready' ? state.view : null;
  const matsRec = useMemo(() => Object.fromEntries((view?.materials ?? []).map((m) => [m.code, { ...m, color: m.color ?? '#cccccc' }])) as unknown as Record<string, MaterialDefinition>, [view]);
  const cfg = useMemo(() => (view ? sceneCfg(view.data, { sel: null, cotas: false, altos: true, dark: false }) : null), [view]);

  if (state.kind === 'loading')
    return (
      <Shell>
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: MUTED }}>Cargando propuesta…</div>
      </Shell>
    );
  if (state.kind === 'error')
    return (
      <Shell>
        <div style={{ maxWidth: 520, margin: '12vh auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
          <Icon name="link-2-off" size={30} style={{ color: 'var(--color-accent)' }} />
          <h1 style={{ margin: 0, fontSize: 28 }}>{state.title}</h1>
          <p style={{ margin: 0 }}>{state.message}</p>
        </div>
      </Shell>
    );
  const v = state.view;
  const walls = Object.keys(v.elevations);
  const est = v.estimateDetail;
  const needSig = decision === 'aprobado';
  const canSubmit = name.trim() && accept && (needSig ? !!sig && v.canApprove : comment.trim().length > 0) && !busy;
  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.publicDecide(token, { decision, signerName: name.trim(), signerEmail: email.trim() || undefined, comment: comment.trim() || undefined, signature: needSig ? (sig ?? undefined) : undefined, accepted: true });
      setDone(decision);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo enviar tu respuesta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Shell org={v.organization.name} logo={v.organization.logoUrl} color={v.organization.brandColor}>
        <div style={{ maxWidth: 560, margin: '12vh auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
          <Icon name={done === 'aprobado' ? 'badge-check' : 'message-square'} size={34} style={{ color: 'var(--color-accent)' }} />
          <h1 style={{ margin: 0, fontSize: 30 }}>{done === 'aprobado' ? '¡Gracias! Tu proyecto quedó aprobado' : 'Recibimos tus comentarios'}</h1>
          <p style={{ margin: 0 }}>
            {done === 'aprobado'
              ? `${v.organization.name} ya tiene tu firma y pasará el proyecto a producción. Te contactaremos para coordinar la instalación.`
              : `${v.organization.name} revisará tus cambios y te enviará una propuesta actualizada.`}
          </p>
        </div>
      </Shell>
    );

  return (
    <Shell org={v.organization.name} logo={v.organization.logoUrl} color={v.organization.brandColor}>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-accent-700)' }}>Propuesta para revisar · versión {v.project.version}</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 'clamp(28px,5vw,40px)', lineHeight: 1.05 }}>{v.project.name}</h1>
          <div style={{ fontSize: 15, color: MUTED }}>
            {v.project.client ? `${v.project.client} · ` : ''}Enlace válido hasta el {new Date(v.expiresAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <section className="pub-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16 }}>
          <Card title="Vista en perspectiva" h={440}>
            {cfg && <Photo cfg={cfg} opts={v.data.cams?.persp ? { w: 1100, h: 800, cam: v.data.cams.persp } : { w: 1100, h: 800 }} fallback={iso(v.data, matsRec, { cotas: false, altos: true })} title="Vista en perspectiva" />}
          </Card>
          <Card title="Planta acotada" h={440} pad>
            <Svg drawing={v.plan} title="Planta acotada" />
          </Card>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 22, flex: 1 }}>Alzados</h2>
            <div className="seg">
              {walls.map((w) => (
                <label key={w} className="seg-opt">
                  <input type="radio" name="wall" checked={wall === w} onChange={() => setWall(w)} />
                  Muro {w}
                </label>
              ))}
            </div>
          </div>
          <Card title={`Alzado muro ${wall}`} h={360} pad>
            <Svg drawing={v.elevations[wall] ?? null} title={`Alzado muro ${wall}`} />
          </Card>
          {v.views.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
              {v.views.map((x) => (
                <a key={x.url} href={x.url} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--color-surface)' }}>
                  <img src={x.thumb ?? x.url} alt={x.name} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="pub-grid" style={{ display: 'grid', gridTemplateColumns: est ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ background: 'var(--color-surface)', padding: 16 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Materiales</h2>
            {v.materials.map((m) => (
              <div key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ width: 34, height: 34, background: m.color ?? '#ccc', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)', flex: 'none' }} />
                <span>
                  <strong style={{ display: 'block', fontSize: 14 }}>{m.name}</strong>
                  <span style={{ fontSize: 12, color: MUTED }}>{m.type}</span>
                </span>
              </div>
            ))}
          </div>
          {est && (
          <div style={{ background: 'var(--color-surface)', padding: 16 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Presupuesto</h2>
            {budgetRows(est, est.currency).map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--color-divider)', fontSize: k === 'Total' ? 18 : 14, fontWeight: k === 'Total' ? 800 : 400 }}>
                <span>{k}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{val}</span>
              </div>
            ))}
            {v.pdfUrl && (
              <a className="btn btn-secondary" href={v.pdfUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, width: 'max-content' }}>
                <Icon name="file-text" size={15} />
                Descargar PDF
              </a>
            )}
          </div>
          )}
        </section>

        <section style={{ background: 'var(--color-surface)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Tu respuesta</h2>
          <div className="seg">
            <label className="seg-opt">
              <input type="radio" name="decision" checked={decision === 'aprobado'} onChange={() => setDecision('aprobado')} />
              Aprobar y firmar
            </label>
            <label className="seg-opt">
              <input type="radio" name="decision" checked={decision === 'cambios'} onChange={() => setDecision('cambios')} />
              Pedir cambios
            </label>
          </div>
          {decision === 'aprobado' && !v.canApprove && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>Esta versión tiene observaciones técnicas pendientes; pide cambios y tu diseñador te enviará una versión corregida.</p>}
          <div className="field">
            <label htmlFor="pub-name">Nombre completo</label>
            <input id="pub-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="pub-email">Correo (opcional)</label>
            <input id="pub-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="pub-comment">{decision === 'cambios' ? '¿Qué te gustaría cambiar?' : 'Comentarios (opcional)'}</label>
            <textarea id="pub-comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} style={{ resize: 'vertical' }} />
          </div>
          {needSig && <SignaturePad onChange={setSig} />}
          <label style={{ display: 'flex', gap: 10, alignItems: 'start', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={accept} onChange={() => setAccept(!accept)} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', margin: 0, flex: 'none' }} />
            {decision === 'aprobado' ? v.organization.terms : 'Confirmo que estos comentarios son míos y quiero una versión actualizada.'}
          </label>
          {err && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>{err}</p>}
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSubmit} style={{ height: 46, width: 'max-content' }}>
            <Icon name={decision === 'aprobado' ? 'badge-check' : 'send'} size={16} />
            {busy ? 'Enviando…' : decision === 'aprobado' ? 'Aprobar proyecto' : 'Enviar comentarios'}
          </button>
        </section>
      </main>
      <style>{'@media (max-width: 860px){.pub-grid{grid-template-columns:minmax(0,1fr)!important}}'}</style>
    </Shell>
  );
}

function Shell({ children, org, logo, color }: { children: React.ReactNode; org?: string; logo?: string | null; color?: string | null }) {
  return (
    <div
      data-theme="light"
      // The organisation's brand colour drives the page accent (buttons, highlights).
      style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', ...(color ? ({ '--color-accent': color } as React.CSSProperties) : {}) }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)' }}>
        {logo ? (
          <img src={logo} alt={org ?? ''} style={{ height: 36, maxWidth: 160, objectFit: 'contain' }} />
        ) : (
          <span style={{ width: 32, height: 32, background: color ?? 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{(org ?? 'P').slice(0, 1).toUpperCase()}</span>
        )}
        <strong style={{ fontSize: 16 }}>{org ?? 'Propuesta de diseño'}</strong>
      </header>
      {children}
    </div>
  );
}

function Card({ title, h, pad, children }: { title: string; h: number; pad?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', fontWeight: 800, fontSize: 14, borderBottom: '2px solid var(--color-divider)' }}>{title}</div>
      <div style={{ height: h, background: 'var(--sp-canvas)', padding: pad ? 12 : 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
