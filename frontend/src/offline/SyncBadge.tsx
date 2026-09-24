import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, MUTED } from '../ui';
import { onStatus, type SyncStatus, syncNow } from './sync';

export function useSyncStatus() {
  const [s, setS] = useState<SyncStatus | null>(null);
  useEffect(() => onStatus(setS), []);
  return s;
}

/** Connection / sync pill for the top bars. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const s = useSyncStatus();
  if (!s) return null;
  const n = s.pending.length;
  const [icon, label, color] = s.needsLogin
    ? ['lock', 'Inicia sesión para sincronizar', 'var(--color-accent-700)']
    : !s.online
      ? ['wifi-off', n ? `Sin conexión · ${n} por subir` : 'Sin conexión', 'var(--color-accent-700)']
      : s.syncing && n
        ? ['refresh-cw', `Sincronizando ${n}…`, MUTED]
        : n
          ? ['cloud-upload', `${n} por subir`, MUTED]
          : ['cloud-check', 'Sincronizado', MUTED];
  const body = (
    <>
      <Icon name={icon} size={14} />
      {!compact && <span className="sync-label">{label}</span>}
    </>
  );
  const style = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color, whiteSpace: 'nowrap' as const, background: 'none', border: 0, font: 'inherit', padding: '4px 6px', cursor: 'pointer' };
  if (s.needsLogin)
    return (
      <Link to={`/login?reauth=1&next=${encodeURIComponent(location.pathname)}`} style={{ ...style, textDecoration: 'none' }} title={label}>
        {body}
      </Link>
    );
  return (
    <button type="button" style={style} title={s.online ? 'Sincronizar ahora' : 'Los cambios se guardan en este dispositivo y se subirán al volver la conexión.'} onClick={() => void syncNow()}>
      {body}
    </button>
  );
}
