import { useEffect, useState } from 'react';
import { Icon } from '../ui';

/** Registers the service worker (production builds only) and offers to reload when a new version is ready. */
export function PwaUpdater() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let reloading = false;
    // The first install also fires controllerchange (clients.claim); only an update should reload.
    const hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && setWaiting(w));
        };
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // Look for new versions every hour while the app stays open.
        setInterval(() => reg.update().catch(() => {}), 3_600_000);
      })
      .catch((e) => console.warn('service worker', e));
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(16px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 200, background: 'var(--color-text)', color: 'var(--color-bg)', padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-lg)', fontSize: 14, maxWidth: 'calc(100vw - 32px)' }}>
      <Icon name="sparkles" size={16} />
      Hay una versión nueva del planeador.
      <button type="button" className="btn btn-primary" style={{ height: 32 }} onClick={() => waiting.postMessage('skip-waiting')}>
        Actualizar
      </button>
    </div>
  );
}
