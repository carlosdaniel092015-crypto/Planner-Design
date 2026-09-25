// /unirse: invitations to join another organisation (sent when an admin invites an email that already had an account).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, isNetworkError, type JoinRequest } from '../api';
import { useAuth } from '../auth';
import { syncNow, wipeUser } from '../offline/sync';
import { UserMenu } from '../UserMenu';
import { Brand, Icon, MUTED, useToast } from '../ui';

const ROLE: Record<string, string> = { admin: 'Administrador', disenador: 'Diseñador', taller: 'Taller', lectura: 'Solo lectura' };
const errText = (e: unknown) => (isNetworkError(e) ? 'Necesitas conexión a internet para esto.' : e instanceof ApiError ? e.message : 'No se pudo completar.');

export function JoinPage() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const { flash, toast } = useToast();
  const [items, setItems] = useState<JoinRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .joinRequests()
      .then((r) => setItems(r.items))
      .catch((e) => setError(errText(e)));
  }, []);
  if (!me) return null;

  const accept = async (r: JoinRequest) => {
    const warn = r.current.projects
      ? `Pasarás a ${r.organizationName}. Tus ${r.current.projects} proyectos de «${r.current.name}» se quedan allí y dejarás de verlos. ¿Continuar?`
      : `Pasarás a ${r.organizationName} como ${ROLE[r.role] ?? r.role}. ¿Continuar?`;
    if (!window.confirm(warn)) return;
    setBusy(r.id);
    try {
      await syncNow().catch(() => {});
      const next = await api.acceptJoin(r.id);
      // Projects cached on this device belong to the organisation just left.
      await wipeUser(me.user.id).catch(() => {});
      setMe(next);
      nav('/', { replace: true });
    } catch (e) {
      flash(errText(e));
      setBusy(null);
    }
  };
  const decline = async (r: JoinRequest) => {
    setBusy(r.id);
    try {
      await api.declineJoin(r.id);
      setItems((xs) => xs?.filter((x) => x.id !== r.id) ?? null);
      flash('Invitación rechazada');
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(null);
    }
  };

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
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Invitaciones</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED }}>
            Ahora estás en <strong>{me.organization.name}</strong>. Solo puedes pertenecer a una organización a la vez.
          </p>
        </div>
        {error && <p style={{ color: 'var(--color-accent-700)' }}>{error}</p>}
        {items && !items.length && <p style={{ fontSize: 15 }}>No tienes invitaciones pendientes. Si te invitaron, pide que te envíen una nueva (vencen a los 7 días).</p>}
        {items?.map((r) => (
          <div key={r.id} style={{ background: 'var(--color-surface)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 20 }}>{r.organizationName}</strong>
            <span style={{ fontSize: 14 }}>
              {r.invitedBy ? `${r.invitedBy} te invita` : 'Te invitaron'} como <strong>{ROLE[r.role] ?? r.role}</strong>. Vence el{' '}
              {new Date(r.expiresAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.
            </span>
            {r.current.projects > 0 && (
              <span style={{ fontSize: 13, color: MUTED }}>
                Tus {r.current.projects} proyectos de «{r.current.name}» se quedan en esa organización; si los necesitas, expórtalos o compártelos antes de aceptar.
              </span>
            )}
            {r.reason && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{r.reason}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={!r.canAccept || !!busy} onClick={() => accept(r)}>
                <Icon name="check" />
                {busy === r.id ? 'Uniéndote…' : 'Aceptar y unirme'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => decline(r)}>
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </main>
      {toast}
    </div>
  );
}

/** Home banner: shows up only when there is a pending invitation. */
export function JoinBanner() {
  const [n, setN] = useState(0);
  useEffect(() => {
    api
      .joinRequests()
      .then((r) => setN(r.items.length))
      .catch(() => {});
  }, []);
  if (!n) return null;
  return (
    <Link to="/unirse" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', textDecoration: 'none', fontSize: 14 }}>
      <Icon name="mail" />
      {n === 1 ? 'Te invitaron a unirte a otra organización.' : `Tienes ${n} invitaciones para unirte a otra organización.`}
      <strong style={{ marginLeft: 'auto' }}>Ver</strong>
    </Link>
  );
}
