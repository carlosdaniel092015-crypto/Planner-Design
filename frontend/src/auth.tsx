import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError, api, type Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.warn('sesión', e);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setMe(await api.signIn(email, password));
  }, []);
  const signOut = useCallback(async () => {
    await api.signOut().catch(() => {});
    setMe(null);
  }, []);

  return <AuthContext.Provider value={{ me, loading, signIn, signOut, setMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

export const canEdit = (me: Me | null, ownerId?: string) => !!me && (me.user.role === 'admin' || (me.user.role === 'disenador' && (!ownerId || ownerId === me.user.id)));
export const canCreate = (me: Me | null) => !!me && (me.user.role === 'admin' || me.user.role === 'disenador');

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function FullScreenLoader({ label = 'Cargando' }: { label?: string }) {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)' }}>
      <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, height: 40 }}>
          {[0, 0.15, 0.3, 0.45].map((d) => (
            <span key={d} style={{ background: 'var(--color-neutral-300)', animation: `sppulse 1.2s ${d}s infinite` }} />
          ))}
        </div>
        <span style={{ fontWeight: 800 }}>{label}</span>
      </div>
    </div>
  );
}
