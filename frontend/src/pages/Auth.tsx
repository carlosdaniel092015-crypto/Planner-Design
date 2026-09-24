import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { InstallButton } from '../offline/install';
import { Brand, Icon, MUTED } from '../ui';

function Shell({ kicker, title, lead, children }: { kicker: string; title: string; lead: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <header style={{ display: 'flex', alignItems: 'center', height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', flex: 'none' }}>
        <Brand />
        <span style={{ marginLeft: 'auto' }}>
          <InstallButton />
        </span>
      </header>
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,440px)', maxWidth: 1240, width: '100%', margin: '0 auto', padding: '56px 32px', gap: 48, alignItems: 'start' }} className="auth-grid">
        <div style={{ borderBottom: '2px solid var(--color-divider)', paddingBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 10, fontWeight: 600 }}>{kicker}</div>
          <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.02 }}>{title}</h1>
          <p style={{ margin: '18px 0 0', fontSize: 15, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)', maxWidth: 520, textWrap: 'pretty' }}>{lead}</p>
        </div>
        <div style={{ background: 'var(--color-surface)', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </main>
      <style>{'@media (max-width: 860px){.auth-grid{grid-template-columns:minmax(0,1fr)!important;padding:32px 16px!important}.auth-grid h1{font-size:38px!important}}'}</style>
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'start', padding: '10px 12px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 14 }}>
      <Icon name="circle-x" size={17} style={{ flex: 'none', marginTop: 1 }} />
      <span>{error}</span>
    </div>
  );
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor. Revisa tu conexión.');

export function LoginPage() {
  const { me, signIn } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next') || '/';
  if (me) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      nav(next, { replace: true });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell kicker="Acceso" title="Diseña cocinas y closets a medida." lead="Inicia sesión para ver tus proyectos, editarlos en 3D y enviarlos a tus clientes para su aprobación.">
      <h2 style={{ margin: 0, fontSize: 24 }}>Iniciar sesión</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ height: 44 }}>
          {busy ? 'Entrando…' : 'Entrar'}
          <Icon name="arrow-right" style={{ marginLeft: 'auto' }} />
        </button>
      </form>
      <Link to="/olvide" style={{ fontSize: 14 }}>
        ¿Olvidaste tu contraseña?
      </Link>
    </Shell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgot(email);
      setSent(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell kicker="Recuperar acceso" title="Te ayudamos a entrar de nuevo." lead="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva. El enlace vence en 1 hora.">
      {sent ? (
        <>
          <h2 style={{ margin: 0, fontSize: 24 }}>Revisa tu correo</h2>
          <p style={{ margin: 0, fontSize: 15 }}>Si {email} tiene una cuenta, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.</p>
          <Link to="/login" className="btn btn-secondary">
            Volver a iniciar sesión
          </Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Olvidé mi contraseña</h2>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ height: 44 }}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </button>
          <Link to="/login" style={{ fontSize: 14 }}>
            Volver a iniciar sesión
          </Link>
        </form>
      )}
    </Shell>
  );
}

/** Shared by /restablecer?token= (reset) and /invitacion?token= (accept invite). */
export function SetPasswordPage({ mode }: { mode: 'reset' | 'invite' }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setMe } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const invite = mode === 'invite';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError(null);
    try {
      if (invite) {
        setMe(await api.acceptInvite(token, password, name || undefined));
        nav('/', { replace: true });
      } else {
        await api.reset(token, password);
        setDone(true);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      kicker={invite ? 'Invitación' : 'Nueva contraseña'}
      title={invite ? 'Bienvenido al equipo.' : 'Crea una contraseña nueva.'}
      lead={invite ? 'Crea tu contraseña para empezar a diseñar con tu equipo.' : 'Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.'}
    >
      {!token ? (
        <ErrorBox error="El enlace no es válido. Revisa que lo hayas copiado completo." />
      ) : done ? (
        <>
          <h2 style={{ margin: 0, fontSize: 24 }}>Contraseña actualizada</h2>
          <Link to="/login" className="btn btn-primary">
            Iniciar sesión
          </Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {invite && (
            <div className="field">
              <label htmlFor="name">Tu nombre (opcional)</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span style={{ fontSize: 12, color: MUTED }}>Mínimo 10 caracteres.</span>
          </div>
          <div className="field">
            <label htmlFor="pw2">Repite la contraseña</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ height: 44 }}>
            {busy ? 'Guardando…' : invite ? 'Crear cuenta' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </Shell>
  );
}
