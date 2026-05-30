import { useState } from 'react';
import { KAT_JSP, KAT_GW } from './DokuReminder';
import type { CategoryItem } from './DokuReminder';

interface Props {
  /** Vorgewählte Kategorien (key-Strings). Leer für Nachtrag. */
  initialKategorien?: string[];
  initialText?: string;
  title: string;
  subtitle?: string;
  saveLabel: string;
  busy?: boolean;
  err?: string | null;
  onCancel: () => void;
  onSave: (args: {
    kategorien: string[];
    labels: string[];
    text: string;
    grund: string;
  }) => void;
  /** Pflicht-Begründungs-Feld zeigen? */
  showGrund?: boolean;
}

export function VorfallEditModal({
  initialKategorien,
  initialText,
  title,
  subtitle,
  saveLabel,
  busy,
  err,
  onCancel,
  onSave,
  showGrund = true,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialKategorien ?? []),
  );
  const [text, setText] = useState(initialText ?? '');
  const [grund, setGrund] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave() {
    if (selected.size === 0 && !text.trim()) {
      setLocalErr('Bitte mindestens einen Punkt auswählen oder Text eingeben.');
      return;
    }
    setLocalErr(null);
    const allItems = [...KAT_JSP, ...KAT_GW];
    const labels = allItems
      .filter((i) => selected.has(i.key))
      .map((i) => i.label);
    onSave({
      kategorien: [...selected],
      labels,
      text: text.trim(),
      grund: grund.trim(),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-start justify-center p-3 sm:p-6 overflow-auto">
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 w-full max-w-3xl my-4 space-y-5 shadow-2xl">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-3xl">📝</span> {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted mt-1">{subtitle}</p>
          )}
        </div>

        <Block title="Jugend- und Spielerschutz" icon="⚖️" accent="#fbbf24" items={KAT_JSP} selected={selected} onToggle={toggle} />
        <Block title="Verdacht auf Geldwäsche" icon="💰" accent="#f87171" items={KAT_GW} selected={selected} onToggle={toggle} />

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-muted uppercase tracking-wider">
            ✏️ Sonstiges / Details
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Zusätzliche Beschreibung"
            className="field-input text-base"
          />
        </label>

        {showGrund && (
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">
              Korrektur-Grund (optional)
            </span>
            <input
              type="text"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="z.B. 'Kategorie falsch ausgewählt', 'MA hatte vergessen zu dokumentieren'"
              className="field-input text-sm"
            />
          </label>
        )}

        {(err || localErr) && (
          <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded-lg px-4 py-3">
            {err ?? localErr}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost py-3 text-base"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="btn-primary py-3 text-base font-bold"
          >
            {busy ? 'Speichere …' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Block({
  title,
  icon,
  accent,
  items,
  selected,
  onToggle,
}: {
  title: string;
  icon: string;
  accent: string;
  items: CategoryItem[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-2 text-base font-bold uppercase tracking-wider"
        style={{ color: accent }}
      >
        <span className="text-2xl">{icon}</span>
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((i) => {
          const checked = selected.has(i.key);
          return (
            <button
              key={i.key}
              type="button"
              onClick={() => onToggle(i.key)}
              className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all text-left"
              style={{
                borderColor: checked ? accent : '#2a2a2a',
                background: checked ? `${accent}26` : '#1c1c1c',
                color: checked ? accent : '#f5f5f5',
                fontWeight: checked ? 600 : 400,
              }}
            >
              <span className="text-2xl flex-shrink-0">{i.emoji}</span>
              <span className="text-sm leading-snug flex-1">{i.label}</span>
              {checked && (
                <span className="text-xl flex-shrink-0" style={{ color: accent }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
