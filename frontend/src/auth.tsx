import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError, api, isTransient, type Me } from './api';
import { pendingCount, resumeAfterLogin, startSync, syncNow, wipeUser } from './offline/sync';

// The last signed-in user, so the app opens without a connection. Cleared on sign-out.
const ME_KEY = 'planner:me';
// Set when the user signs out offline: the session cookie is still valid on the server, so the next
// time there is a connection the app ends it before doing anything else.
const PENDING_SIGNOUT = 'planner:signout';
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  },
};
const cachedMe = (): Me | null => {
  try {
    return JSON.parse(ls.get(ME_KEY) ?? 'null');
  } catch {
    return null;
  }
};

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Pushes pending work first; returns how many projects still had unsent changes if `force` is false. */
  signOut: (force?: boolean) => Promise<number>;
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const setMe = useCallback((m: Me | null) => {
    setMeState(m);
    ls.set(ME_KEY, m ? JSON.stringify(m) : null);
    if (m) {
      ls.set(PENDING_SIGNOUT, null);
      startSync(m.user.id);
      resumeAfterLogin();
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (ls.get(PENDING_SIGNOUT)) {
        try {
          await api.signOut();
          ls.set(PENDING_SIGNOUT, null);
        } catch {}
        return;
      }
      try {
        setMe(await api.me(8000));
      } catch (e) {
        const offline = cachedMe();
        if (isTransient(e) && offline) {
          // No connection: work with the last session on this device; sync resumes when it comes back.
          setMeState(offline);
          startSync(offline.user.id);
        } else {
          if (!(e instanceof ApiError && e.status === 401)) console.warn('sesión', e);
          ls.set(ME_KEY, null);
        }
      }
    })().finally(() => setLoading(false));
  }, [setMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setMe(await api.signIn(email, password));
    },
    [setMe],
  );
  const signOut = useCallback(
    async (force = false) => {
      if (!me) return 0;
      await syncNow().catch(() => {});
      const left = pendingCount();
      if (left && !force) return left;
      try {
        await api.signOut();
      } catch (e) {
        if (isTransient(e)) ls.set(PENDING_SIGNOUT, '1');
      }
      await wipeUser(me.user.id).catch(() => {});
      ls.set(ME_KEY, null);
      setMeState(null);
      return 0;
    },
    [me],
  );

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
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)' }}>
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
