import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { Icon, initials, MUTED } from './ui';

const ROLE: Record<string, string> = { admin: 'Administrador', disenador: 'Diseñador', taller: 'Taller', lectura: 'Solo lectura' };

export function UserMenu() {
  const { me, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Cuenta"
        title={me.user.name}
        style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 13, fontWeight: 800, border: 0, cursor: 'pointer', font: 'inherit' }}
      >
        {initials(me.user.name)}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 89 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 44, width: 260, background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-divider)', zIndex: 90, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 14, borderBottom: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>{me.user.name}</strong>
              <span style={{ fontSize: 13, color: MUTED }}>{me.user.email}</span>
              <span style={{ fontSize: 12, marginTop: 6 }}>
                {me.organization.name} · <span className="tag tag-neutral">{ROLE[me.user.role] ?? me.user.role}</span>
              </span>
            </div>
            <a className="btn btn-ghost" href="/api/v1/docs" target="_blank" rel="noreferrer" style={{ justifyContent: 'flex-start' }}>
              <Icon name="book-open" />
              Documentación de la API
            </a>
            <button type="button"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start' }}
              onClick={async () => {
                const left = await signOut();
                if (
                  left &&
                  !window.confirm(
                    `Hay ${left === 1 ? 'un proyecto' : `${left} proyectos`} con cambios que todavía no se subieron (sin conexión). Si cierras sesión ahora se borrarán de este dispositivo. ¿Cerrar sesión de todos modos?`,
                  )
                )
                  return;
                if (left) await signOut(true);
                nav('/login', { replace: true });
              }}
            >
              <Icon name="log-out" />
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
