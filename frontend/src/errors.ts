// Sends uncaught browser errors to the server log (POST /api/v1/client-errors), at most 10 per page load.
let sent = 0;
function report(message: string, stack?: string) {
  if (sent++ >= 10 || !message) return;
  const body = JSON.stringify({ message: message.slice(0, 1000), stack: stack?.slice(0, 8000), url: location.href.slice(0, 1000), version: __APP_VERSION__, userAgent: navigator.userAgent.slice(0, 400) });
  try {
    if (navigator.sendBeacon?.('/api/v1/client-errors', new Blob([body], { type: 'application/json' }))) return;
  } catch {}
  fetch('/api/v1/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'include' }).catch(() => {});
}
window.addEventListener('error', (e) => report(e.message, (e.error as Error | undefined)?.stack));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string; stack?: string } | string;
  report(typeof r === 'string' ? r : (r?.message ?? 'Promesa rechazada'), typeof r === 'string' ? undefined : r?.stack);
});
