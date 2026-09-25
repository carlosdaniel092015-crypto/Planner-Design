import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
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

/** ?error=<code> from the Google / Microsoft sign-in (src/routes/oauth.ts). */
const OAUTH_ERRORS: Record<string, string> = {
  cancelado: 'Cancelaste el inicio de sesión. Puedes intentarlo de nuevo cuando quieras.',
  estado_invalido: 'La sesión de inicio caducó o se abrió en otra pestaña. Vuelve a intentarlo.',
  proveedor_no_disponible: 'Ese proveedor no está configurado en esta instalación.',
  proveedor_error: 'El proveedor no respondió. Inténtalo de nuevo en un momento.',
  intercambio_fallido: 'No pudimos confirmar tu acceso con el proveedor. Inténtalo de nuevo.',
  token_invalido: 'No pudimos verificar tu identidad con el proveedor. Inténtalo de nuevo.',
  sin_correo: 'Tu cuenta del proveedor no comparte un correo. Usa otra cuenta o entra con correo y contraseña.',
  correo_no_verificado:
    'Tu proveedor no confirma que ese correo sea tuyo (pasa con algunas cuentas de trabajo de Microsoft). Entra con Google, con una cuenta personal de Microsoft o con correo y contraseña.',
  cuenta_desactivada: 'Tu cuenta está desactivada. Pide a tu administrador que la active.',
};

function ProviderLogo({ id }: { id: 'google' | 'microsoft' }) {
  return id === 'google' ? (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

/** "Continuar con Google / Microsoft": full-page navigation to the server, which talks to the provider. */
function ProviderButtons({ next }: { next: string }) {
  const [providers, setProviders] = useState<{ id: 'google' | 'microsoft'; name: string }[]>([]);
  useEffect(() => {
    api
      .authProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);
  if (!providers.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {providers.map((p) => (
        <a key={p.id} className="btn btn-secondary" href={`/api/v1/auth/oauth/${p.id}/start?redirect=${encodeURIComponent(next)}`} style={{ height: 44, justifyContent: 'center', gap: 10, textDecoration: 'none' }}>
          <ProviderLogo id={p.id} />
          Continuar con {p.name}
        </a>
      ))}
      <span style={{ fontSize: 12, color: MUTED }}>¿Primera vez? Se crea tu cuenta con tu propio espacio de trabajo (plan Gratis).</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: MUTED }} aria-hidden="true">
        <span style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} />o con tu correo<span style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} />
      </div>
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
  const oauthError = params.get('error');
  const [error, setError] = useState<string | null>(oauthError ? (OAUTH_ERRORS[oauthError] ?? 'No se pudo iniciar sesión con el proveedor.') : null);
  const next = params.get('next') || '/';
  // ?reauth=1: the session expired while the app kept working offline; show the form even though `me` is still cached.
  if (me && !params.get('reauth')) return <Navigate to={next} replace />;

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
      {params.get('borrada') && <p style={{ margin: 0, fontSize: 14 }}>Tu cuenta se borró. Gracias por usar Planner.</p>}
      <ProviderButtons next={next} />
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
      <span style={{ fontSize: 12, color: MUTED }}>
        Al entrar aceptas los <Link to="/terminos">términos de uso</Link> y la <Link to="/privacidad">política de privacidad</Link>.
      </span>
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
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
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
            <span style={{ fontSize: 12, color: MUTED }}>Mínimo 8 caracteres.</span>
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
