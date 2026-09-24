import changelog from '../../CHANGELOG.md?raw';
import { Dialog, MUTED } from './ui';

/** "Novedades": the repo's CHANGELOG.md, rendered with just what it uses (## version, ### section, - item). */
export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const blocks = changelog.split('\n').filter((l) => l.startsWith('## ') || l.startsWith('### ') || l.startsWith('- '));
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p));
  return (
    <Dialog title="Novedades" onClose={onClose} width={560}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: MUTED }}>
        Estás usando Planner v{__APP_VERSION__} (compilada el {new Date(__BUILT_AT__).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}).
      </p>
      {blocks.map((l, i) =>
        l.startsWith('## ') ? (
          <h3 key={i} style={{ margin: '16px 0 4px', fontSize: 18 }}>
            {l.slice(3)}
          </h3>
        ) : l.startsWith('### ') ? (
          <h4 key={i} style={{ margin: '10px 0 2px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-accent-700)' }}>
            {l.slice(4)}
          </h4>
        ) : (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 14, padding: '2px 0' }}>
            <span aria-hidden>·</span>
            <span>{inline(l.slice(2))}</span>
          </div>
        ),
      )}
    </Dialog>
  );
}
