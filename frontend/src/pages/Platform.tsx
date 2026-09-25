// /plataforma: every organisation, its users and its plan. Only for PLATFORM_ADMIN_EMAILS.
import { Fragment, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError, isNetworkError, request } from '../api';
import { useAuth } from '../auth';
import { UserMenu } from '../UserMenu';
import { Brand, Icon, MUTED, relativeTime, useToast } from '../ui';

type Plan = 'gratis' | 'profesional' | 'empresa';
interface Org {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  effectivePlan: Plan;
  planStatus: string | null;
  stripeSubscription: boolean;
  users: number;
  activeProjects: number;
  admins: string[];
  lastLoginAt: string | null;
  createdAt: string;
}
interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  hasPassword: boolean;
  providers: string[];
  lastLoginAt: string | null;
}

const PLAN_NAME: Record<Plan, string> = { gratis: 'Gratis', profesional: 'Profesional', empresa: 'Empresa' };
const ROLE: Record<string, string> = { admin: 'Administrador', disenador: 'Diseñador', taller: 'Taller', lectura: 'Solo lectura' };
const errText = (e: unknown) => (isNetworkError(e) ? 'Necesitas conexión a internet para esto.' : e instanceof ApiError ? e.message : 'No se pudo completar.');
const statusText = (o: Org) =>
  o.stripeSubscription ? `Stripe · ${o.planStatus ?? '—'}` : o.planStatus === 'manual' ? 'Asignado por la plataforma' : o.plan === 'gratis' ? '—' : (o.planStatus ?? '—');

export function PlatformPage() {
  const { me } = useAuth();
  const { flash, toast } = useToast();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Org[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, OrgUser[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      request<{ items: Org[] }>('GET', `/platform/organizations${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((r) => {
          setItems(r.items);
          setError(null);
        })
        .catch((e) => setError(errText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (!me) return null;
  if (!me.user.platformAdmin) return <Navigate to="/" replace />;

  const toggle = async (o: Org) => {
    if (open === o.id) return setOpen(null);
    setOpen(o.id);
    if (!people[o.id])
      try {
        const r = await request<{ items: OrgUser[] }>('GET', `/platform/organizations/${o.id}/users`);
        setPeople((p) => ({ ...p, [o.id]: r.items }));
      } catch (e) {
        flash(errText(e));
      }
  };
  const setPlan = async (o: Org, plan: Plan) => {
    if (plan === o.plan) return;
    if (!window.confirm(`¿Cambiar «${o.name}» de ${PLAN_NAME[o.plan]} a ${PLAN_NAME[plan]}?`)) return;
    setBusy(o.id);
    try {
      const n = await request<Org>('PATCH', `/platform/organizations/${o.id}`, { plan });
      setItems((xs) => xs?.map((x) => (x.id === n.id ? n : x)) ?? null);
      flash(`«${n.name}» ahora tiene el plan ${PLAN_NAME[n.plan]}`);
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const count = (p: Plan) => items?.filter((o) => o.effectivePlan === p).length ?? 0;
  const th = { textAlign: 'left', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', padding: '10px 8px', color: MUTED } as const;
  const td = { padding: '10px 8px', borderTop: '1px solid var(--color-divider)', fontSize: 14, verticalAlign: 'top' } as const;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)' }}>
        <Brand />
        <span style={{ marginLeft: 'auto' }} />
        <Link to="/" className="btn btn-ghost">
          <Icon name="arrow-left" />
          Mis proyectos
        </Link>
        <UserMenu />
      </header>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Plataforma</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED }}>
            Todas las organizaciones, sus usuarios y su plan. Sin pagos en línea, el plan que asignes aquí queda como «Asignado por la plataforma».
          </p>
        </div>
        {items && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              ['Organizaciones', items.length],
              ['Usuarios', items.reduce((n, o) => n + o.users, 0)],
              ['Gratis', count('gratis')],
              ['Profesional', count('profesional')],
              ['Empresa', count('empresa')],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--color-surface)', padding: '10px 16px', minWidth: 120 }}>
                <div style={{ fontSize: 12, color: MUTED }}>{k}</div>
                <strong style={{ fontSize: 24 }}>{v}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="pl-q">Buscar</label>
          <input id="pl-q" className="input" placeholder="Nombre de la organización o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <p style={{ color: 'var(--color-accent-700)' }}>{error}</p>}
        {items && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={th}>Organización</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Usuarios</th>
                  <th style={th}>Proyectos activos</th>
                  <th style={th}>Último acceso</th>
                  <th style={th}>Creada</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <Fragment key={o.id}>
                    <tr>
                      <td style={td}>
                        <button type="button" className="btn btn-ghost" onClick={() => toggle(o)} aria-expanded={open === o.id} style={{ padding: 0, height: 'auto', textAlign: 'left', justifyContent: 'flex-start' }}>
                          <Icon name={open === o.id ? 'chevron-down' : 'chevron-right'} />
                          <strong>{o.name}</strong>
                        </button>
                        <div style={{ fontSize: 12, color: MUTED }}>{o.admins.join(', ') || 'Sin administrador activo'}</div>
                      </td>
                      <td style={td}>
                        <select className="input" aria-label={`Plan de ${o.name}`} value={o.plan} disabled={busy === o.id || o.stripeSubscription} onChange={(e) => setPlan(o, e.target.value as Plan)} style={{ minWidth: 130 }}>
                          {(Object.keys(PLAN_NAME) as Plan[]).map((p) => (
                            <option key={p} value={p}>
                              {PLAN_NAME[p]}
                            </option>
                          ))}
                        </select>
                        {o.effectivePlan !== o.plan && <div style={{ fontSize: 12, color: 'var(--color-accent-700)' }}>Aplica: {PLAN_NAME[o.effectivePlan]}</div>}
                      </td>
                      <td style={td}>{statusText(o)}</td>
                      <td style={td}>{o.users}</td>
                      <td style={td}>{o.activeProjects}</td>
                      <td style={td}>{o.lastLoginAt ? relativeTime(o.lastLoginAt) : 'Nunca'}</td>
                      <td style={td}>{new Date(o.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                    {open === o.id && (
                      <tr>
                        <td colSpan={7} style={{ ...td, background: 'var(--color-surface)' }}>
                          {!people[o.id] ? (
                            'Cargando…'
                          ) : !people[o.id]!.length ? (
                            'Sin usuarios.'
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {people[o.id]!.map((u) => (
                                <li key={u.id}>
                                  <strong>{u.name}</strong> · {u.email} · {ROLE[u.role] ?? u.role}
                                  {!u.active && ' · invitación pendiente'}
                                  <span style={{ color: MUTED }}>
                                    {' '}
                                    · entra con {[u.hasPassword ? 'contraseña' : null, ...u.providers.map((p) => (p === 'google' ? 'Google' : 'Microsoft'))].filter(Boolean).join(', ') || '—'}
                                    {u.lastLoginAt ? ` · ${relativeTime(u.lastLoginAt)}` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {!items.length && <p style={{ fontSize: 14 }}>No hay organizaciones que coincidan.</p>}
          </div>
        )}
      </main>
      {toast}
    </div>
  );
}
