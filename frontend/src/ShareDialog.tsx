import { useEffect, useMemo, useState } from 'react';
import { type Access, ApiError, api, isNetworkError, type Person, type Share } from './api';
import { Dialog, Icon, initials, MUTED } from './ui';

const ROLE: Record<string, string> = { admin: 'Administrador', disenador: 'Diseñador', taller: 'Taller', lectura: 'Solo lectura' };
const canEditRole = (role: string) => role === 'admin' || role === 'disenador';

/**
 * Who can see a project. Projects are private: only the owner and the people listed here see it, and they
 * all see the same project (not a copy). The owner adds, changes and removes access; others can leave.
 */
export function ShareDialog({ projectId, projectName, myAccess, meId, onClose, onChange }: { projectId: string; projectName: string; myAccess: Access; meId: string; onClose: () => void; onChange?: (count: number) => void }) {
  const [owner, setOwner] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [items, setItems] = useState<Share[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [pick, setPick] = useState('');
  const [access, setAccess] = useState<'ver' | 'editar'>('ver');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = myAccess === 'propietario';
  const localOnly = projectId.startsWith('local-');

  const fail = (e: unknown) => setError(isNetworkError(e) ? 'Compartir necesita conexión a internet. Inténtalo cuando vuelvas a estar en línea.' : e instanceof ApiError ? e.message : 'No se pudo completar.');

  useEffect(() => {
    if (localOnly) return;
    api
      .shares(projectId)
      .then((r) => {
        setOwner(r.owner);
        setItems(r.items);
      })
      .catch(fail);
    if (isOwner) api.directory().then((r) => setPeople(r.items), () => {});
  }, [projectId, isOwner, localOnly]);

  const available = useMemo(() => people.filter((p) => p.id !== owner?.userId && !items?.some((s) => s.userId === p.id)), [people, items, owner]);
  const picked = people.find((p) => p.id === pick);
  useEffect(() => {
    if (picked && !canEditRole(picked.role)) setAccess('ver');
  }, [picked]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const update = (next: Share[]) => {
    setItems(next);
    onChange?.(next.length);
  };

  return (
    <Dialog title={`Compartir «${projectName}»`} onClose={onClose} width={520}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED }}>
        Tus proyectos son privados. Solo los ven las personas con las que los compartes, y todas ven este mismo proyecto con sus cambios.
      </p>
      {localOnly && <p style={{ fontSize: 14 }}>Este proyecto se creó sin conexión. Podrás compartirlo cuando se haya subido al servidor.</p>}
      {error && <p style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{error}</p>}

      {isOwner && !localOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="share-user">Persona</label>
            <select id="share-user" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{available.length ? 'Elige a alguien de tu organización' : 'No hay más personas para agregar'}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {ROLE[p.role] ?? p.role}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 140px' }}>
            <label htmlFor="share-access">Acceso</label>
            <select id="share-access" className="input" value={access} onChange={(e) => setAccess(e.target.value as 'ver' | 'editar')}>
              <option value="ver">Solo ver</option>
              <option value="editar" disabled={!!picked && !canEditRole(picked.role)}>
                Puede editar
              </option>
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pick || busy}
            onClick={() =>
              run(async () => {
                const s = await api.share(projectId, pick, access);
                update([...(items ?? []).filter((x) => x.userId !== s.userId), s].sort((a, b) => a.name.localeCompare(b.name)));
                setPick('');
                setAccess('ver');
              })
            }
            style={{ height: 40 }}
          >
            <Icon name="user-plus" />
            Compartir
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-divider)' }}>
        {owner && <Row name={owner.name} email={owner.email} right={<span style={{ fontSize: 13, color: MUTED }}>Dueño{owner.userId === meId ? ' (tú)' : ''}</span>} />}
        {items === null && !localOnly && !error && <p style={{ fontSize: 13, color: MUTED }}>Cargando…</p>}
        {items?.map((s) => (
          <Row
            key={s.userId}
            name={s.name + (s.userId === meId ? ' (tú)' : '')}
            email={`${s.email} · ${ROLE[s.role] ?? s.role}`}
            right={
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isOwner ? (
                  <select
                    className="input"
                    aria-label={`Acceso de ${s.name}`}
                    value={s.access}
                    disabled={busy}
                    onChange={(e) =>
                      run(async () => {
                        const n = await api.share(projectId, s.userId, e.target.value as 'ver' | 'editar');
                        update((items ?? []).map((x) => (x.userId === n.userId ? n : x)));
                      })
                    }
                    style={{ height: 34, width: 130 }}
                  >
                    <option value="ver">Solo ver</option>
                    <option value="editar" disabled={!canEditRole(s.role)}>
                      Puede editar
                    </option>
                  </select>
                ) : (
                  <span style={{ fontSize: 13 }}>{s.access === 'editar' ? 'Puede editar' : 'Solo ver'}</span>
                )}
                {(isOwner || s.userId === meId) && (
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={s.userId === meId ? 'Salir de este proyecto' : `Quitar a ${s.name}`}
                    aria-label={s.userId === meId ? 'Salir de este proyecto' : `Quitar a ${s.name}`}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api.unshare(projectId, s.userId);
                        update((items ?? []).filter((x) => x.userId !== s.userId));
                        if (s.userId === meId) onClose();
                      })
                    }
                  >
                    <Icon name={s.userId === meId ? 'log-out' : 'x'} size={16} />
                  </button>
                )}
              </span>
            }
          />
        ))}
        {items?.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Todavía no lo has compartido con nadie.</p>}
      </div>
    </Dialog>
  );
}

function Row({ name, email, right }: { name: string; email: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-divider)' }}>
      <span style={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--color-neutral-200)', fontWeight: 800, fontSize: 12 }}>{initials(name)}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <strong style={{ fontSize: 14 }}>{name}</strong>
        <span style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      </span>
      {right}
    </div>
  );
}
