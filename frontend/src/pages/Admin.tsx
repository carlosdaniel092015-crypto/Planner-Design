// Administración: organización (logo, color, términos), usuarios, precios, catálogo, clientes y auditoría.
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, isNetworkError, type Role, request } from '../api';
import { useAuth } from '../auth';
import { uploadFile } from '../library/upload';
import { UserMenu } from '../UserMenu';
import { Brand, Dialog, fmtMoney, Icon, MUTED, relativeTime, useToast } from '../ui';

type Tab = 'plan' | 'organizacion' | 'usuarios' | 'precios' | 'catalogo' | 'clientes' | 'auditoria';
const ROLE: Record<Role, string> = { admin: 'Administrador', disenador: 'Diseñador', taller: 'Taller', lectura: 'Solo lectura' };
const errText = (e: unknown) => (isNetworkError(e) ? 'Sin conexión: la administración necesita internet.' : e instanceof ApiError ? e.message : 'No se pudo completar.');

export function AdminPage() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { flash, toast } = useToast();
  const isAdmin = me?.user.role === 'admin';
  const tabs: { k: Tab; label: string; icon: string; admin?: boolean }[] = [
    { k: 'organizacion', label: 'Organización', icon: 'building-2', admin: true },
    { k: 'plan', label: 'Plan', icon: 'gem', admin: true },
    { k: 'usuarios', label: 'Usuarios', icon: 'users', admin: true },
    { k: 'precios', label: 'Precios', icon: 'banknote', admin: true },
    { k: 'catalogo', label: 'Catálogo', icon: 'package', admin: true },
    { k: 'clientes', label: 'Clientes', icon: 'contact' },
    { k: 'auditoria', label: 'Auditoría', icon: 'scroll-text', admin: true },
  ];
  const visible = tabs.filter((t) => isAdmin || !t.admin);
  const tab = (visible.find((t) => t.k === params.get('t'))?.k ?? visible[0]?.k) as Tab;
  useEffect(() => {
    if (me && !visible.length) nav('/', { replace: true });
  }, [me, visible.length, nav]);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', flex: 'none' }}>
        <Brand />
        <span style={{ fontWeight: 800, fontSize: 15, color: MUTED }} className="adm-title">
          · Administración
        </span>
        <span style={{ marginLeft: 'auto' }} />
        <Link to="/" className="btn btn-ghost">
          <Icon name="arrow-left" />
          <span className="adm-hide-xs">Mis proyectos</span>
        </Link>
        <UserMenu />
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }} className="adm-body">
        <nav className="adm-nav" aria-label="Secciones" style={{ width: 220, flex: 'none', borderRight: '2px solid var(--color-divider)', padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visible.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setParams({ t: t.k })}
              aria-current={tab === t.k ? 'page' : undefined}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', fontWeight: tab === t.k ? 800 : 600, background: tab === t.k ? 'var(--color-neutral-200)' : undefined, whiteSpace: 'nowrap' }}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px 64px' }} className="adm-main">
            {tab === 'organizacion' && <OrgTab flash={flash} onSaved={(o) => me && setMe({ ...me, organization: { ...me.organization, name: o.name, logoUrl: o.logoUrl, brandColor: o.brandColor } })} />}
            {tab === 'plan' && <PlanTab flash={flash} paid={params.get('pago') === 'ok'} />}
            {tab === 'usuarios' && <UsersTab flash={flash} meId={me?.user.id ?? ''} />}
            {tab === 'precios' && <PricingTab flash={flash} />}
            {tab === 'catalogo' && <CatalogTab flash={flash} />}
            {tab === 'clientes' && <ClientsTab flash={flash} />}
            {tab === 'auditoria' && <AuditTab />}
          </div>
        </main>
      </div>
      {toast}
      <style>{`
        .adm-table{width:100%;border-collapse:collapse;font-size:14px}
        .adm-table th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:600;padding:8px 8px;border-bottom:1px solid var(--color-divider)}
        .adm-table td{padding:8px;border-bottom:1px solid var(--color-divider);vertical-align:middle}
        .adm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        @media (max-width: 760px){
          .adm-body{flex-direction:column}
          .adm-nav{width:auto!important;flex-direction:row!important;overflow-x:auto;border-right:0!important;border-bottom:2px solid var(--color-divider);padding:6px!important}
          .adm-main{padding:18px 14px 48px!important}
          .adm-grid{grid-template-columns:minmax(0,1fr)}
          .adm-hide-xs,.adm-title{display:none}
          .adm-scroll{overflow-x:auto}
        }
      `}</style>
    </div>
  );
}

function Section({ title, lead, children, right }: { title: string; lead?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, borderBottom: '2px solid var(--color-divider)', paddingBottom: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
          {lead && <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>{lead}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    request<T>('GET', path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errText(e)));
  useEffect(() => {
    reload();
  }, [path]);
  return { data, setData, error, reload };
}
const Err = ({ error }: { error: string | null }) => (error ? <p style={{ color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p> : null);

// ---------- Organización ----------
interface Org {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  approvalTerms: string;
}
function OrgTab({ flash, onSaved }: { flash: (m: string) => void; onSaved: (o: Org) => void }) {
  const { data, setData, error } = useLoad<Org>('/organization');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Org | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (!form) return <Err error={error} />;
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      const o = await request<Org>('PATCH', '/organization', patch);
      setData(o);
      onSaved(o);
      flash('Organización actualizada');
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Organización" lead="El nombre, el logo y el color aparecen en la página de aprobación del cliente y en el PDF.">
      <div className="adm-grid">
        <div className="field">
          <label htmlFor="org-name">Nombre</label>
          <input id="org-name" className="input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="org-color">Color de marca</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="org-color" type="color" value={form.brandColor ?? '#ec3013'} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} style={{ width: 48, height: 40, padding: 0, border: '1px solid var(--color-divider)' }} />
            <input className="input" aria-label="Color en hexadecimal" value={form.brandColor ?? ''} placeholder="#ec3013" onChange={(e) => setForm({ ...form, brandColor: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="org-terms">Texto que acepta el cliente al aprobar</label>
        <textarea id="org-terms" className="input" rows={3} maxLength={2000} value={form.approvalTerms} onChange={(e) => setForm({ ...form, approvalTerms: e.target.value })} style={{ resize: 'vertical', minHeight: 72 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !form.name.trim()}
          onClick={() => save({ name: form.name.trim(), brandColor: /^#[0-9a-fA-F]{6}$/.test(form.brandColor ?? '') ? form.brandColor : null, approvalTerms: form.approvalTerms.trim() || undefined })}
        >
          <Icon name="save" />
          Guardar
        </button>
      </div>

      <h3 style={{ margin: '28px 0 8px', fontSize: 16 }}>Logo</h3>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 160, height: 80, display: 'grid', placeItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-divider)' }}>
          {form.logoUrl ? <img src={form.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 12, color: MUTED }}>Sin logo</span>}
        </div>
        <label className="btn btn-secondary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <Icon name="upload" />
          Subir logo (PNG, JPG o WebP)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              try {
                const up = await uploadFile('miniatura', f, f.name);
                setBusy(false);
                await save({ logoFileId: up.id });
              } catch (err) {
                flash(errText(err));
                setBusy(false);
              }
            }}
          />
        </label>
        {form.logoUrl && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save({ logoFileId: null })}>
            Quitar logo
          </button>
        )}
      </div>
    </Section>
  );
}

// ---------- Usuarios ----------
interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
}
function UsersTab({ flash, meId }: { flash: (m: string) => void; meId: string }) {
  const { data, setData, error } = useLoad<{ items: User[] }>('/users');
  const [inv, setInv] = useState({ name: '', email: '', role: 'disenador' as Role });
  const [busy, setBusy] = useState(false);
  const patch = async (u: User, body: Partial<User>) => {
    try {
      const n = await request<User>('PATCH', `/users/${u.id}`, body);
      setData((d) => (d ? { items: d.items.map((x) => (x.id === n.id ? n : x)) } : d));
      flash('Usuario actualizado');
    } catch (e) {
      flash(errText(e));
    }
  };
  return (
    <>
      <Section title="Invitar a alguien" lead="Recibirá un correo para crear su contraseña (vence en 7 días). Si ya usa Planner, le llega una solicitud para unirse a tu organización.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const u = await request<(User & { emailSent?: boolean }) | { joinRequest: true; name: string; email: string; emailSent: boolean }>('POST', '/users', inv);
              setInv({ name: '', email: '', role: 'disenador' });
              if ('joinRequest' in u) {
                flash(
                  u.emailSent
                    ? `${u.name} ya tenía cuenta: le enviamos una solicitud para unirse. Cuando la acepte aparecerá aquí.`
                    : `${u.name} ya tenía cuenta: la solicitud quedó creada, pero el correo no salió. Pídele que entre a Planner y la verá al iniciar sesión.`,
                );
              } else {
                setData((d) => (d ? { items: [...d.items, u] } : d));
                flash(u.emailSent === false ? `Usuario creado, pero el correo a ${u.email} no salió. Revisa la configuración de correo.` : `Invitación enviada a ${u.email}`);
              }
            } catch (err) {
              flash(errText(err));
            } finally {
              setBusy(false);
            }
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
        >
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="inv-name">Nombre</label>
            <input id="inv-name" className="input" required maxLength={120} value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="inv-email">Correo</label>
            <input id="inv-email" className="input" type="email" required value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '0 1 170px' }}>
            <label htmlFor="inv-role">Rol</label>
            <select id="inv-role" className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>
              {(Object.keys(ROLE) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ height: 40 }}>
            <Icon name="send" />
            Invitar
          </button>
        </form>
      </Section>
      <Section title="Usuarios" lead="Administrador: todo. Diseñador: sus proyectos, clientes y bibliotecas. Taller: ve lo que le compartan y descarga planos. Solo lectura: ve lo que le compartan.">
        <Err error={error} />
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th className="adm-hide-xs">Último acceso</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {u.id === meId && ' (tú)'}
                    <div style={{ fontSize: 12, color: MUTED }}>{u.email}</div>
                  </td>
                  <td>
                    <select className="input" aria-label={`Rol de ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u, { role: e.target.value as Role })} style={{ height: 34, minWidth: 130 }}>
                      {(Object.keys(ROLE) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="adm-hide-xs" style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : u.active ? 'Nunca' : 'Invitación pendiente'}</td>
                  <td>
                    <label className="switch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={u.active} disabled={u.id === meId} onChange={(e) => patch(u, { active: e.target.checked })} />
                      <span style={{ fontSize: 13 }}>{u.active ? 'Sí' : 'No'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// ---------- Precios ----------
interface Pricing {
  baseCurrency: 'USD' | 'DOP';
  exchangeRateDopPerUsd: number;
  rateUpdatedAt: string | null;
  taxName: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  wasteRate: number;
  marginRate: number;
  rounding: 'ninguno' | 'unidad' | 'decena' | 'centena';
}
const pct = (v: number) => Math.round(v * 10000) / 100;
function PricingTab({ flash }: { flash: (m: string) => void }) {
  const { data, setData, error } = useLoad<Pricing>('/settings/pricing');
  const [f, setF] = useState<Pricing | null>(null);
  const [bulk, setBulk] = useState({ scope: 'materials' as 'materials' | 'hardware' | 'modules', percent: 5 });
  const [preview, setPreview] = useState<{ count: number; items: { code: string; name: string; from: number; to: number; currency: string }[] } | null>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  if (!f) return <Err error={error} />;
  const num = (label: string, id: string, value: number, onChange: (v: number) => void, suffix?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input id={id} className="input" type="number" inputMode="decimal" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <span style={{ fontSize: 13, color: MUTED }}>{suffix}</span>}
      </div>
    </div>
  );
  return (
    <>
      <Section title="Precios" lead="Aplican a los proyectos en diseño. Los proyectos aprobados conservan los precios con los que se aprobaron.">
        <div className="adm-grid">
          {num('Tasa de cambio (RD$ por US$)', 'p-rate', f.exchangeRateDopPerUsd, (v) => setF({ ...f, exchangeRateDopPerUsd: v }), 'RD$')}
          <div className="field">
            <label htmlFor="p-cur">Moneda base</label>
            <select id="p-cur" className="input" value={f.baseCurrency} onChange={(e) => setF({ ...f, baseCurrency: e.target.value as 'USD' | 'DOP' })}>
              <option value="DOP">Peso dominicano (RD$)</option>
              <option value="USD">Dólar (US$)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-tax">Nombre del impuesto</label>
            <input id="p-tax" className="input" maxLength={20} value={f.taxName} onChange={(e) => setF({ ...f, taxName: e.target.value })} />
          </div>
          {num('Impuesto', 'p-taxr', pct(f.taxRate), (v) => setF({ ...f, taxRate: v / 100 }), '%')}
          {num('Merma de material', 'p-waste', pct(f.wasteRate), (v) => setF({ ...f, wasteRate: v / 100 }), '%')}
          {num('Margen', 'p-margin', pct(f.marginRate), (v) => setF({ ...f, marginRate: v / 100 }), '%')}
          <div className="field">
            <label htmlFor="p-round">Redondeo del total</label>
            <select id="p-round" className="input" value={f.rounding} onChange={(e) => setF({ ...f, rounding: e.target.value as Pricing['rounding'] })}>
              <option value="ninguno">Sin redondeo</option>
              <option value="unidad">A la unidad</option>
              <option value="decena">A la decena</option>
              <option value="centena">A la centena</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" checked={f.pricesIncludeTax} onChange={(e) => setF({ ...f, pricesIncludeTax: e.target.checked })} />
            Los precios del catálogo ya incluyen el impuesto
          </label>
        </div>
        {f.rateUpdatedAt && <p style={{ fontSize: 12, color: MUTED }}>Tasa actualizada {relativeTime(f.rateUpdatedAt).toLowerCase()}.</p>}
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          onClick={async () => {
            try {
              const { rateUpdatedAt: _r, ...patch } = f;
              setData(await request<Pricing>('PUT', '/settings/pricing', patch));
              flash('Precios guardados');
            } catch (e) {
              flash(errText(e));
            }
          }}
        >
          <Icon name="save" />
          Guardar precios
        </button>
      </Section>
      <Section title="Ajuste masivo" lead="Sube o baja un porcentaje todos los precios de materiales, herrajes o módulos. Primero verás la vista previa.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="field" style={{ flex: '0 1 200px' }}>
            <label htmlFor="b-scope">Qué ajustar</label>
            <select id="b-scope" className="input" value={bulk.scope} onChange={(e) => (setBulk({ ...bulk, scope: e.target.value as typeof bulk.scope }), setPreview(null))}>
              <option value="materials">Materiales</option>
              <option value="hardware">Herrajes</option>
              <option value="modules">Módulos</option>
            </select>
          </div>
          <div className="field" style={{ flex: '0 1 140px' }}>
            <label htmlFor="b-pct">Porcentaje</label>
            <input id="b-pct" className="input" type="number" step="any" value={bulk.percent} onChange={(e) => (setBulk({ ...bulk, percent: Number(e.target.value) }), setPreview(null))} />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ height: 40 }}
            onClick={async () => {
              try {
                setPreview(await request('POST', '/admin/prices/bulk?dryRun=true', bulk));
              } catch (e) {
                flash(errText(e));
              }
            }}
          >
            Vista previa
          </button>
          {preview && preview.count > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 40 }}
              onClick={async () => {
                try {
                  const r = await request<{ count: number }>('POST', '/admin/prices/bulk', bulk);
                  setPreview(null);
                  flash(`${r.count} precios actualizados`);
                } catch (e) {
                  flash(errText(e));
                }
              }}
            >
              Aplicar a {preview.count}
            </button>
          )}
        </div>
        {preview && (
          <div className="adm-scroll" style={{ marginTop: 12, maxHeight: 280, overflow: 'auto' }}>
            <table className="adm-table">
              <tbody>
                {preview.items.slice(0, 50).map((i) => (
                  <tr key={i.code}>
                    <td>{i.name}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmtMoney(i.from, i.currency as 'USD' | 'DOP')} → <strong>{fmtMoney(i.to, i.currency as 'USD' | 'DOP')}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ---------- Catálogo ----------
interface Item {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  type?: string;
  unitPrice?: number;
  priceM2?: number;
  priceCurrency: 'USD' | 'DOP';
  active: boolean;
}
function CatalogTab({ flash }: { flash: (m: string) => void }) {
  const [scope, setScope] = useState<'modules' | 'materials' | 'hardware'>('modules');
  const [q, setQ] = useState('');
  const { data, setData, error } = useLoad<{ items: Item[] }>(`/admin/${scope}`);
  const priceKey = scope === 'materials' ? 'priceM2' : 'unitPrice';
  const save = async (it: Item, body: Partial<Item>) => {
    try {
      const n = await request<Item>('PATCH', `/admin/${scope}/${it.id}`, body);
      setData((d) => (d ? { items: d.items.map((x) => (x.id === it.id ? { ...x, ...n } : x)) } : d));
      flash(`${it.name} actualizado`);
    } catch (e) {
      flash(errText(e));
    }
  };
  const list = (data?.items ?? []).filter((i) => !q || `${i.code} ${i.name} ${i.category ?? ''} ${i.type ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section
      title="Catálogo y precios"
      lead={scope === 'materials' ? 'Precio por m² de cada material.' : 'Precio unitario. Desactivar oculta el elemento en el editor sin borrarlo de los proyectos que ya lo usan.'}
      right={
        <div style={{ display: 'flex', gap: 4 }}>
          {(
            [
              ['modules', 'Módulos'],
              ['materials', 'Materiales'],
              ['hardware', 'Herrajes'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={scope === k ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setScope(k)} style={{ height: 34 }}>
              {l}
            </button>
          ))}
        </div>
      }
    >
      <input className="input" placeholder="Buscar por código o nombre" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10, maxWidth: 360 }} />
      <Err error={error} />
      <div className="adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Elemento</th>
              <th style={{ width: 170 }}>{scope === 'materials' ? 'Precio por m²' : 'Precio'}</th>
              <th style={{ width: 80 }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {list.map((it) => (
              <tr key={it.id} style={{ opacity: it.active ? 1 : 0.55 }}>
                <td>
                  <strong>{it.name}</strong>
                  <div style={{ fontSize: 12, color: MUTED }}>
                    {it.code}
                    {it.category ? ` · ${it.category}` : it.type ? ` · ${it.type}` : ''}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: MUTED }}>{it.priceCurrency === 'DOP' ? 'RD$' : 'US$'}</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Precio de ${it.name}`}
                      defaultValue={it[priceKey] ?? 0}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0 && v !== (it[priceKey] ?? 0)) save(it, { [priceKey]: v });
                      }}
                      style={{ height: 34 }}
                    />
                  </div>
                </td>
                <td>
                  <input type="checkbox" aria-label={`${it.name} activo`} checked={it.active} onChange={(e) => save(it, { active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------- Clientes ----------
interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  updatedAt: string;
}
function ClientsTab({ flash }: { flash: (m: string) => void }) {
  const { data, error, reload } = useLoad<{ items: Client[] }>('/clients?limit=100');
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [del, setDel] = useState<Client | null>(null);
  const [q, setQ] = useState('');
  const list = (data?.items ?? []).filter((c) => !q || `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section
      title="Clientes"
      right={
        <button type="button" className="btn btn-primary" onClick={() => setEdit({ name: '' })}>
          <Icon name="user-plus" />
          Nuevo cliente
        </button>
      }
    >
      <input className="input" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10, maxWidth: 360 }} />
      <Err error={error} />
      {data?.items.length === 0 && <p style={{ fontSize: 14, color: MUTED }}>Todavía no hay clientes.</p>}
      <div className="adm-scroll">
        <table className="adm-table">
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div style={{ fontSize: 12, color: MUTED }}>{[c.phone, c.email, c.address].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-icon" aria-label={`Editar ${c.name}`} onClick={() => setEdit(c)}>
                    <Icon name="pencil" size={16} />
                  </button>
                  <button type="button" className="btn btn-icon" aria-label={`Eliminar ${c.name}`} onClick={() => setDel(c)}>
                    <Icon name="trash-2" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Dialog
          title={edit.id ? 'Editar cliente' : 'Nuevo cliente'}
          onClose={() => setEdit(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!edit.name?.trim()}
                onClick={async () => {
                  const body = { name: edit.name?.trim(), email: edit.email || null, phone: edit.phone || null, address: edit.address || null, notes: edit.notes || null };
                  try {
                    await request(edit.id ? 'PATCH' : 'POST', edit.id ? `/clients/${edit.id}` : '/clients', body);
                    setEdit(null);
                    reload();
                    flash('Cliente guardado');
                  } catch (e) {
                    flash(errText(e));
                  }
                }}
              >
                Guardar
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(
              [
                ['name', 'Nombre', 'text'],
                ['phone', 'Teléfono', 'tel'],
                ['email', 'Correo', 'email'],
                ['address', 'Dirección', 'text'],
              ] as const
            ).map(([k, l, type]) => (
              <div className="field" key={k}>
                <label htmlFor={`cl-${k}`}>{l}</label>
                <input id={`cl-${k}`} className="input" type={type} value={(edit[k] as string | null) ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="cl-notes">Notas</label>
              <textarea id="cl-notes" className="input" rows={3} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
          </div>
        </Dialog>
      )}
      {del && (
        <Dialog
          title="¿Eliminar cliente?"
          onClose={() => setDel(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDel(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await request('DELETE', `/clients/${del.id}`);
                    setDel(null);
                    reload();
                    flash('Cliente eliminado');
                  } catch (e) {
                    flash(errText(e));
                  }
                }}
              >
                Eliminar
              </button>
            </>
          }
        >
          «{del.name}» dejará de aparecer en la lista. Sus proyectos se conservan.
        </Dialog>
      )}
    </Section>
  );
}

// ---------- Auditoría ----------
interface Log {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  userName: string | null;
  createdAt: string;
}
const ACTION: Record<string, string> = {
  crear: 'creó',
  actualizar: 'actualizó',
  eliminar: 'eliminó',
  enviar: 'envió al cliente',
  revocar: 'revocó un enlace de',
  aprobar: 'aprobó',
  solicitar_cambios: 'pidió cambios en',
  restaurar: 'restauró una versión de',
  cambiar_precios: 'cambió los precios de',
  cambiar_tasa: 'cambió la tasa de',
  cambiar_rol: 'cambió el rol de',
  invitar: 'invitó a',
  importar: 'importó en',
  iniciar_sesion: 'inició sesión en',
  compartir: 'compartió',
  dejar_de_compartir: 'dejó de compartir',
};
const ENTITY: Record<string, string> = { project: 'un proyecto', organization: 'la organización', user: 'un usuario', client: 'un cliente', material: 'un material', module: 'un módulo', hardware: 'un herraje', file: 'un archivo', library: 'la biblioteca' };
function AuditTab() {
  const [items, setItems] = useState<Log[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const more = (cursor?: string | null) =>
    request<{ items: Log[]; nextCursor: string | null }>('GET', `/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      .then((r) => {
        setItems((xs) => (cursor ? [...xs, ...r.items] : r.items));
        setNext(r.nextCursor);
      })
      .catch((e) => setError(errText(e)));
  useEffect(() => {
    more();
  }, []);
  const detail = (l: Log) => {
    const name = (l.meta.name ?? l.meta.email) as string | undefined;
    return name ? ` «${name}»` : '';
  };
  return (
    <Section title="Auditoría" lead="Quién hizo qué y cuándo, del más reciente al más antiguo.">
      <Err error={error} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
            <span style={{ width: 120, flex: 'none', fontSize: 12, color: MUTED }}>{relativeTime(l.createdAt)}</span>
            <span>
              <strong>{l.userName ?? 'Sistema'}</strong> {ACTION[l.action] ?? l.action} {ENTITY[l.entity] ?? l.entity}
              {detail(l)}
            </span>
          </div>
        ))}
      </div>
      {next && (
        <button type="button" className="btn btn-secondary" onClick={() => more(next)} style={{ marginTop: 12 }}>
          Ver más
        </button>
      )}
    </Section>
  );
}

// ---------- Plan ----------
interface Billing {
  enabled: boolean;
  plan: 'gratis' | 'profesional' | 'empresa';
  effectivePlan: 'gratis' | 'profesional' | 'empresa';
  status: string | null;
  renewsAt: string | null;
  canManage: boolean;
  contactEmail: string | null;
  usage: { users: number; activeProjects: number };
  plans: { key: 'gratis' | 'profesional' | 'empresa'; name: string; users: number | null; activeProjects: number | null; highlights: string[]; price: string | null; available: boolean }[];
}
const STATUS_TXT: Record<string, string> = { manual: 'asignado por la plataforma', active: 'activo', trialing: 'en prueba', past_due: 'pago pendiente', canceled: 'cancelado', unpaid: 'sin pagar', incomplete: 'pago incompleto' };
// Apple (guideline 3.1.1): the iPhone app must not sell subscriptions outside in-app purchase, so it only shows the plan.
const inIosApp = () => (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'ios';

function PlanTab({ flash, paid }: { flash: (m: string) => void; paid: boolean }) {
  const { data: raw, error } = useLoad<Billing>('/billing');
  const data = raw && inIosApp() ? { ...raw, canManage: false } : raw;
  const [busy, setBusy] = useState<string | null>(null);
  const { me } = useAuth();
  if (!data) return <Err error={error} />;
  const go = async (path: string, body?: unknown) => {
    setBusy(path);
    try {
      const { url } = await request<{ url: string }>('POST', path, body);
      window.location.href = url;
    } catch (e) {
      flash(errText(e));
      setBusy(null);
    }
  };
  const cur = data.plans.find((p) => p.key === data.effectivePlan);
  const bar = (label: string, used: number, limit: number | null) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
      <span style={{ fontSize: 13 }}>
        {label}: <strong>{used}</strong> {limit == null ? '(ilimitado)' : `de ${limit}`}
      </span>
      {limit != null && (
        <div style={{ height: 6, background: 'var(--color-neutral-300)' }}>
          <div style={{ height: 6, width: `${Math.min(100, (used / limit) * 100)}%`, background: used >= limit ? 'var(--color-accent-700)' : 'var(--color-accent)' }} />
        </div>
      )}
    </div>
  );
  return (
    <Section
      title="Plan"
      lead={
        data.enabled
          ? 'Elige el plan de tu organización. El pago es seguro con Stripe; puedes cambiarlo o cancelarlo cuando quieras.'
          : 'Los pagos en línea todavía no están activos. Para cambiar de plan, escríbenos y lo activamos en tu organización.'
      }
      right={
        data.enabled && data.plan !== 'gratis' && data.canManage ? (
          <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => go('/billing/portal')}>
            <Icon name="credit-card" />
            Pagos y facturas
          </button>
        ) : undefined
      }
    >
      {raw && inIosApp() && raw.canManage && <p style={{ fontSize: 14 }}>Para cambiar el plan entra a Planner desde el navegador.</p>}
      {paid && <p style={{ fontSize: 14, background: 'var(--color-accent-100)', padding: '10px 12px' }}>¡Gracias! En cuanto Stripe confirme el pago verás el plan nuevo aquí (puede tardar unos segundos; recarga la página).</p>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 15 }}>
          Plan actual: <strong>{cur?.name}</strong>
          {data.status && ` · ${STATUS_TXT[data.status] ?? data.status}`}
          {data.renewsAt && data.status !== 'canceled' && ` · se renueva el ${new Date(data.renewsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </span>
        {data.plan !== data.effectivePlan && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>El pago está pendiente: mientras tanto aplican los límites del plan Gratis.</span>}
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        {bar('Usuarios', data.usage.users, cur?.users ?? null)}
        {bar('Proyectos activos (los aprobados no cuentan)', data.usage.activeProjects, cur?.activeProjects ?? null)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {data.plans.map((p) => {
          const current = p.key === data.effectivePlan;
          return (
            <div key={p.key} style={{ border: `2px solid ${current ? 'var(--color-accent)' : 'var(--color-divider)'}`, background: 'var(--color-surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 20 }}>{p.name}</strong>
                {current && <span className="tag tag-accent">Actual</span>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{p.price ?? (data.enabled ? 'Precio por configurar' : 'Precio a consultar')}</span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {p.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {data.enabled && data.canManage && !current && p.key !== 'gratis' && (
                <button type="button" className="btn btn-primary" disabled={!p.available || !!busy} onClick={() => go('/billing/checkout', { plan: p.key })}>
                  {p.available ? `Cambiar a ${p.name}` : 'No disponible'}
                </button>
              )}
              {!data.enabled && data.canManage && !current && p.key !== 'gratis' && data.contactEmail && (
                <a
                  className="btn btn-primary"
                  href={`mailto:${data.contactEmail}?subject=${encodeURIComponent(`Plan ${p.name} para ${me?.organization.name ?? 'mi organización'}`)}&body=${encodeURIComponent(
                    `Hola, quiero el plan ${p.name} para «${me?.organization.name ?? ''}» (administrador: ${me?.user.email ?? ''}).`,
                  )}`}
                  style={{ justifyContent: 'center', textDecoration: 'none' }}
                >
                  <Icon name="mail" />
                  Solicitar {p.name}
                </a>
              )}
              {data.enabled && data.canManage && !current && p.key === 'gratis' && data.plan !== 'gratis' && (
                <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => go('/billing/portal')}>
                  Cancelar plan de pago
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
