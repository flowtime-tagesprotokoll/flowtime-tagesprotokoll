import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';

interface Props {
  /** Wenn true, ist es der Logout-Pflicht-Modus (mit "Nein-alles-ok"-Option). */
  logoutMode?: boolean;
  onCancel: () => void;
  onDone: () => void;
}

interface CategoryItem {
  key: string;
  label: string;
}

const KAT_JSP: CategoryItem[] = [
  { key: 'spielverhalten_ansprache', label: 'Gast auf Spielverhalten angesprochen' },
  { key: 'beratung_kontakte', label: 'Kontaktdaten Beratung weitergegeben' },
  { key: 'flyer_ausgabe', label: 'Infomaterial / Flyer weitergegeben' },
  { key: 'js_minderjaehrig_abgewiesen', label: 'Jugendschutz: Minderjährig — Eintritt verweigert' },
  { key: 'js_volljaehrig_kontrolliert', label: 'Jugendschutz: Auf Verdacht kontrolliert, volljährig — Eintritt' },
  { key: 'gespraech_verantwortliche', label: 'Gespräch mit Verantwortlichem über Spielgast' },
  { key: 'spiel_ausschluss', label: 'Auffällige Person vom Spiel ausgeschlossen' },
  { key: 'spielersperre', label: 'Spielersperre (Selbst- / Fremdsperre)' },
  { key: 'hausverbot', label: 'Hausverbot' },
  { key: 'gesperrte_person_abgewiesen', label: 'Gesperrte Person am Zutritt gehindert' },
  { key: 'oasis_aufmerksam', label: 'Gast auf Oasis-Spielersperre aufmerksam gemacht' },
];

const KAT_GW: CategoryItem[] = [
  { key: 'gw_hohe_einzahlung_kleine_quoten', label: 'Hohe Einzahlung, kaum Spiel / nur kleine Quoten' },
  { key: 'gw_auszahlung_mit_nachweis', label: 'Will hohe Einzahlung als Gewinn auszahlen + Nachweis verlangt' },
  { key: 'gw_fremdkonto_auszahlung', label: 'Versuch Auszahlung über fremdes Konto' },
  { key: 'gw_falsche_identitaet', label: 'Falsche Identitätsangabe' },
  { key: 'gw_fremde_gewinnnachweise', label: 'Frage nach fremden Gewinnnachweisen' },
];

export function DokuReminderModal({ logoutMode = false, onCancel, onDone }: Props) {
  const session = useAuth((s) => s.session);
  const [step, setStep] = useState<'ask' | 'doku'>(logoutMode ? 'ask' : 'doku');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function logAudit(action: string, payload: object | null) {
    if (!session) return;
    const { error } = await supabase.from('audit_log').insert({
      profile_id: session.profile.id,
      user_name: session.profile.name,
      rolle: session.profile.rolle,
      action,
      new_val: payload,
    });
    if (error) throw error;
  }

  async function handleNein() {
    setBusy(true);
    setErr(null);
    try {
      await logAudit('DOKU_REMINDER_OK', null);
      onDone();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSpeichern() {
    if (selected.size === 0 && !text.trim()) {
      setErr('Bitte mindestens einen Punkt auswählen oder Text eingeben.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const allItems = [...KAT_JSP, ...KAT_GW];
      const labels = allItems
        .filter((i) => selected.has(i.key))
        .map((i) => i.label);
      const payload = {
        kategorien: [...selected],
        labels,
        text: text.trim() || null,
      };
      await logAudit('VORFALL', payload);
      onDone();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-2xl my-4 space-y-4">
        {step === 'ask' && logoutMode && (
          <>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-warn">⚠</span> Dokumentation vor Logout
              </h2>
              <p className="text-sm text-muted mt-2">
                Hattest du heute einen <strong>dokumentationspflichtigen Vorfall</strong> in Sachen{' '}
                <strong>Jugend- und Spielerschutz</strong> oder <strong>Geldwäsche</strong>?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleNein}
                disabled={busy}
                className="btn-ghost"
              >
                Nein, alles ok
              </button>
              <button
                type="button"
                onClick={() => setStep('doku')}
                disabled={busy}
                className="btn-primary"
              >
                Ja, dokumentieren
              </button>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-xs text-muted hover:text-accent w-full text-center"
            >
              Abbrechen (zurück zum Protokoll)
            </button>
          </>
        )}

        {step === 'doku' && (
          <>
            <div>
              <h2 className="text-lg font-bold">📋 Vorfall dokumentieren</h2>
              <p className="text-sm text-muted mt-1">
                Wähle alle zutreffenden Punkte aus. Mehrfachauswahl möglich.
              </p>
            </div>

            <CategoryBlock
              title="Jugend- und Spielerschutz"
              accent="#fbbf24"
              items={KAT_JSP}
              selected={selected}
              onToggle={toggle}
            />

            <CategoryBlock
              title="Verdacht auf Geldwäsche"
              accent="#f87171"
              items={KAT_GW}
              selected={selected}
              onToggle={toggle}
            />

            <label className="block space-y-1">
              <span className="text-xs text-muted uppercase tracking-wider">
                Sonstiges / Details
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Zusätzliche Beschreibung (Uhrzeit, Personen, Verlauf, …)"
                className="field-input"
              />
            </label>

            {err && (
              <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2">
                {err}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={logoutMode ? () => setStep('ask') : onCancel}
                disabled={busy}
                className="btn-ghost"
              >
                {logoutMode ? '← Zurück' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={handleSpeichern}
                disabled={busy}
                className="btn-primary"
              >
                {busy
                  ? 'Speichere …'
                  : logoutMode
                    ? 'Speichern & Abmelden'
                    : 'Speichern'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryBlock({
  title,
  accent,
  items,
  selected,
  onToggle,
}: {
  title: string;
  accent: string;
  items: CategoryItem[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((i) => {
          const checked = selected.has(i.key);
          return (
            <label
              key={i.key}
              className="flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors"
              style={{
                borderColor: checked ? accent : '#2a2a2a',
                background: checked ? `${accent}1a` : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(i.key)}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: accent }}
              />
              <span className="text-sm leading-snug">{i.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
