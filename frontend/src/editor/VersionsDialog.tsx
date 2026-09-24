import { useEffect, useState } from 'react';
import { ApiError, api, isNetworkError, type ProjectDetail, type ProjectVersion } from '../api';
import { Dialog, fmtMoney, Icon, MUTED, relativeTime } from '../ui';

/**
 * Project history: saved versions (manual ones, and the one frozen when it goes to approval).
 * Restoring first saves the current state as a version, so going back never loses work.
 */
export function VersionsDialog({
  projectId,
  canEdit,
  ensureOnServer,
  onRestored,
  onClose,
}: {
  projectId: string;
  canEdit: boolean;
  /** Pushes this device's pending changes first; false when offline. */
  ensureOnServer: () => Promise<boolean>;
  onRestored: (p: ProjectDetail) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ProjectVersion[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ProjectVersion | null>(null);
  const local = projectId.startsWith('local-');

  const fail = (e: unknown) => setError(isNetworkError(e) ? 'El historial necesita conexión a internet.' : e instanceof ApiError ? e.message : 'No se pudo completar.');
  const load = () =>
    api
      .versions(projectId)
      .then((r) => setItems(r.items))
      .catch(fail);
  useEffect(() => {
    if (!local) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureOnServer())) return;
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Versiones del proyecto" onClose={onClose} width={560}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED }}>
        Guarda una versión antes de un cambio grande para poder volver a ella. Al enviar a aprobación se guarda una automáticamente con los precios de ese momento.
      </p>
      {local && <p style={{ fontSize: 14 }}>Este proyecto se creó sin conexión; su historial estará disponible cuando se suba al servidor.</p>}
      {error && <p style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}
      {canEdit && !local && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="ver-note">Nota (opcional)</label>
            <input id="ver-note" className="input" maxLength={500} placeholder="Ej.: antes de cambiar la encimera" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            style={{ height: 40 }}
            onClick={() =>
              run(async () => {
                await api.createVersion(projectId, note.trim() || undefined);
                setNote('');
                await load();
              })
            }
          >
            <Icon name="bookmark-plus" />
            Guardar versión
          </button>
        </div>
      )}
      {items === null && !local && !error && <p style={{ fontSize: 13, color: MUTED }}>Cargando…</p>}
      {items?.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Todavía no hay versiones guardadas.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: items?.length ? '1px solid var(--color-divider)' : 0 }}>
        {items?.map((v) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <span style={{ width: 40, height: 32, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--color-neutral-200)', fontWeight: 800, fontSize: 13 }}>v{v.version}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.note || 'Versión sin nota'}</strong>
              <span style={{ fontSize: 12, color: MUTED }}>
                {relativeTime(v.createdAt)} · {v.createdByName ?? 'Sistema'} · {fmtMoney(v.estimate.amount, v.estimate.currency)}
              </span>
            </span>
            {canEdit && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(v)} style={{ height: 34 }}>
                <Icon name="history" size={15} />
                Restaurar
              </button>
            )}
          </div>
        ))}
      </div>
      {confirm && (
        <Dialog
          title={`¿Restaurar la versión ${confirm.version}?`}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const v = confirm;
                    setConfirm(null);
                    await api.createVersion(projectId, `Antes de restaurar la v${v.version}`);
                    const p = await api.restoreVersion(projectId, v.id);
                    onRestored(p);
                    onClose();
                  })
                }
              >
                Restaurar
              </button>
            </>
          }
        >
          El diseño vuelve a como estaba en esa versión y el precio se recalcula con los precios actuales. Antes se guarda una versión del estado actual, así que puedes deshacerlo.
        </Dialog>
      )}
    </Dialog>
  );
}
