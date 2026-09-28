// Especificaciones → "Módulos de la propuesta": which of the organisation's own modules the generated layout uses
// instead of each standard one (prefs.mods), optionally saved as the default for new projects.
import { DEFAULT_MODULES, type ModuleDefinition, moduleChoicesFor, moduleRolesFor, placedFor, type ProjectData } from '@core';
import { useState } from 'react';
import { ApiError, request } from '../api';
import { Icon, MUTED } from '../ui';

/** Codes of the standard catalogue: anything else was uploaded or created by the organisation. */
const STANDARD = new Set(DEFAULT_MODULES.map((m) => m.code));

const range = (m: ModuleDefinition) => {
  const [lo, hi] = m.rw ?? [m.w, m.w];
  return lo === hi ? `${lo} cm` : `${lo}–${hi} cm`;
};

export function ModulePicker(props: {
  data: ProjectData;
  modules: Record<string, ModuleDefinition>;
  /** Organisation defaults (settings.modulos) applied when the project has not chosen. */
  defaults: Record<string, string>;
  readOnly: boolean;
  canSaveDefault: boolean;
  onChange: (mods: Record<string, string>) => void;
  onSavedDefault: (mods: Record<string, string>) => void;
  flash: (m: string) => void;
}) {
  const { data, modules, defaults } = props;
  const own = (data.prefs as { mods?: Record<string, string> }).mods ?? {};
  const [busy, setBusy] = useState(false);
  const roles = moduleRolesFor(data)
    .map((r) => ({ ...r, std: modules[r.code], choices: moduleChoicesFor(r.code, modules), placed: placedFor(r.code, modules) }))
    .filter((r) => r.choices.length > 0);
  /** '' = automatic (own modules with this location, else standard) · '-' = always standard · code = that module. */
  const choiceOf = (code: string) => {
    const v = code in own ? own[code]! : (defaults[code] ?? '');
    return v === '-' || (v && modules[v]?.active) ? v : '';
  };
  const effective = Object.fromEntries(roles.map((r) => [r.code, choiceOf(r.code)]).filter(([, v]) => v));
  const set = (code: string, v: string) => props.onChange({ ...own, [code]: v });
  const count = Object.keys(effective).length;

  return (
    <div style={{ paddingTop: 24, borderTop: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h6 style={{ margin: 0 }}>Módulos de la propuesta</h6>
          <p style={{ fontSize: 12, margin: '4px 0 0', color: MUTED }}>
            Elige tus módulos para cada pieza y «Generar distribución» los usará en lugar de los estándar. Los que tienen «Ubicación predeterminada» en Bibliotecas ya salen como
            «Automático». Si alguno no admite el ancho de un hueco, ahí se usa el estándar.
          </p>
        </div>
        {props.canSaveDefault && roles.length > 0 && !props.readOnly && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await request<{ moduleDefaults: Record<string, string> }>('PATCH', '/organization', { moduleDefaults: effective });
                props.onSavedDefault(r.moduleDefaults);
                props.flash(count ? 'Listo: los proyectos nuevos empezarán con estos módulos.' : 'Listo: los proyectos nuevos usarán los módulos estándar.');
              } catch (e) {
                props.flash(e instanceof ApiError ? e.message : 'No se pudo guardar. Revisa tu conexión.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="bookmark" />
            {busy ? 'Guardando…' : 'Usar siempre en proyectos nuevos'}
          </button>
        )}
      </div>
      {roles.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          Aún no tienes módulos propios para este tipo de proyecto. Súbelos o créalos en <strong>Bibliotecas → Módulos</strong> y aparecerán aquí para elegirlos.
        </p>
      ) : (
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px 24px' }}>
          {roles.map((r) => (
            <div key={r.code} className="field">
              <label htmlFor={`mod-${r.code}`}>{r.label}</label>
              <select id={`mod-${r.code}`} className="input" value={choiceOf(r.code)} disabled={props.readOnly} onChange={(e) => set(r.code, e.target.value)}>
                {r.placed.length ? (
                  <>
                    <option value="">Automático · {r.placed.map((m) => m.name).join(', ')}</option>
                    <option value="-">Estándar{r.std ? ` · ${r.std.name}` : ''}</option>
                  </>
                ) : (
                  <option value="">Estándar{r.std ? ` · ${r.std.name}` : ''}</option>
                )}
                {(
                  [
                    ['Mis módulos', r.choices.filter((m) => !STANDARD.has(m.code))],
                    ['Otros del catálogo', r.choices.filter((m) => STANDARD.has(m.code))],
                  ] as const
                )
                  .filter(([, list]) => list.length)
                  .map(([label, list]) => (
                    <optgroup key={label} label={label}>
                      {list.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.name}
                          {r.choices.filter((x) => x.name === m.name).length > 1 ? ` (${m.code})` : ''} · {range(m)}
                          {m.source === 'modelo3d' ? ' · 3D' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
