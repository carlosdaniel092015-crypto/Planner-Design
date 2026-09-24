// Mi cuenta: nombre, contraseña y borrar la cuenta (requisito de las tiendas de apps).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, isNetworkError, request } from '../api';
import { useAuth } from '../auth';
import { wipeUser } from '../offline/sync';
import { UserMenu } from '../UserMenu';
import { Brand, Icon, MUTED, useToast } from '../ui';

const errText = (e: unknown) => (isNetworkError(e) ? 'Necesitas conexión a internet para esto.' : e instanceof ApiError ? e.message : 'No se pudo completar.');

export function AccountPage() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const { flash, toast } = useToast();
  const [name, setName] = useState(me?.user.name ?? '');
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });
  const [del, setDel] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;

  const run = async (k: string, fn: () => Promise<void>) => {
    setBusy(k);
    try {
      await fn();
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
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Mi cuenta</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED }}>
            {me.user.email} · {me.organization.name}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('name', async () => {
              await request('PATCH', '/me', { name: name.trim() });
              setMe({ ...me, user: { ...me.user, name: name.trim() } });
              flash('Nombre actualizado');
            });
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Nombre</h2>
          <input className="input" aria-label="Nombre" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={busy === 'name' || !name.trim() || name.trim() === me.user.name} style={{ alignSelf: 'start' }}>
            Guardar nombre
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.repeat) return flash('Las contraseñas nuevas no coinciden.');
            run('pw', async () => {
              await request('POST', '/me/password', { currentPassword: pw.current, newPassword: pw.next });
              setPw({ current: '', next: '', repeat: '' });
              flash('Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.');
            });
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Contraseña</h2>
          <div className="field">
            <label htmlFor="pw-cur">Contraseña actual</label>
            <input id="pw-cur" className="input" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pw-new">Nueva contraseña (mínimo 8 caracteres)</label>
            <input id="pw-new" className="input" type="password" autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pw-rep">Repite la nueva contraseña</label>
            <input id="pw-rep" className="input" type="password" autoComplete="new-password" required minLength={8} value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy === 'pw'} style={{ alignSelf: 'start' }}>
            Cambiar contraseña
          </button>
        </form>

        <section style={{ border: '2px solid var(--color-accent-700)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--color-accent-700)' }}>Borrar mi cuenta</h2>
          <p style={{ margin: 0, fontSize: 14 }}>
            Se eliminan tus proyectos, los accesos que te compartieron, tus sesiones y tu contraseña, y se borran tu nombre y correo. No se puede deshacer. Las aprobaciones firmadas por clientes y
            el registro de auditoría se conservan sin tus datos personales. Si eres el único administrador, primero nombra a otro en Administración → Usuarios.
          </p>
          <div className="field">
            <label htmlFor="del-pw">Tu contraseña</label>
            <input id="del-pw" className="input" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="del-ok">Escribe ELIMINAR para confirmar</label>
            <input id="del-ok" className="input" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy === 'del' || !del.password || del.confirm !== 'ELIMINAR'}
            style={{ alignSelf: 'start', background: 'var(--color-accent-700)' }}
            onClick={() =>
              run('del', async () => {
                await request('DELETE', '/me', { password: del.password, confirm: 'ELIMINAR' });
                await wipeUser(me.user.id).catch(() => {});
                try {
                  localStorage.removeItem('planner:me');
                } catch {}
                nav('/login?borrada=1', { replace: true });
                window.location.reload();
              })
            }
          >
            <Icon name="trash-2" />
            Borrar mi cuenta para siempre
          </button>
        </section>

        <p style={{ fontSize: 13, color: MUTED }}>
          <Link to="/privacidad">Política de privacidad</Link> · <Link to="/terminos">Términos de uso</Link>
        </p>
      </main>
      {toast}
    </div>
  );
}
