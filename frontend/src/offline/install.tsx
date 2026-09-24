import { useEffect, useState } from 'react';
import { Dialog, Icon, MUTED } from '../ui';

// The browser fires beforeinstallprompt once, often before React mounts: keep it from the first moment.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/**
 * "Instalar app": opens the browser's real install dialog (Chrome/Edge/Samsung: the app lands in the app
 * drawer / Start menu like a native one). iPhone/iPad have no such dialog, so it shows the Safari steps.
 */
export function InstallButton({ variant = 'button' }: { variant?: 'button' | 'menu' }) {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(l);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (installed) return null;
  const ios = isIOS();
  // Without the event (already installed elsewhere, unsupported browser, or not yet eligible) we explain the menu route.
  const onClick = async () => {
    if (deferred) {
      const d = deferred;
      deferred = null;
      await d.prompt();
      const { outcome } = await d.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      force((n) => n + 1);
    } else setHelp(true);
  };
  return (
    <>
      <button type="button" className={variant === 'menu' ? 'btn btn-ghost' : 'btn btn-secondary'} onClick={onClick} style={variant === 'menu' ? { justifyContent: 'flex-start' } : { height: 36 }} title="Instalar el planeador como aplicación">
        <Icon name="download" />
        <span className={variant === 'button' ? 'install-label' : undefined}>Instalar app</span>
      </button>
      {help && (
        <Dialog title="Instalar el planeador" onClose={() => setHelp(false)} width={460}>
          {ios ? (
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <li>Abre esta página en <strong>Safari</strong>.</li>
              <li>
                Toca <strong>Compartir</strong> <Icon name="share" size={14} /> (abajo en iPhone, arriba en iPad).
              </li>
              <li>
                Elige <strong>Agregar a inicio</strong> y luego <strong>Agregar</strong>.
              </li>
              <li>Ábrela desde el ícono: se abre a pantalla completa, sin la barra de Safari, y funciona sin conexión.</li>
            </ol>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                En <strong>Chrome</strong> o <strong>Edge</strong> abre el menú <Icon name="ellipsis-vertical" size={14} /> y elige <strong>Instalar aplicación</strong> (en computadora también
                aparece el ícono <Icon name="monitor-down" size={14} /> en la barra de direcciones).
              </p>
              <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>
                Si el menú solo ofrece "Agregar a pantalla principal", eso crea un acceso directo, no la app. Suele pasar si la página no se abrió con https, en modo incógnito, o
                si la app ya está instalada en este dispositivo (búscala en tus aplicaciones). Recarga la página una vez con internet y vuelve a intentarlo.
              </p>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
