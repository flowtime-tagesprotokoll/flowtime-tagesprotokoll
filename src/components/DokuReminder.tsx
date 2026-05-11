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
  emoji: string;
}

const KAT_JSP: CategoryItem[] = [
  { key: 'spielverhalten_ansprache', emoji: '💬', label: 'Gast auf Spielverhalten angesprochen' },
  { key: 'beratung_kontakte', emoji: '📞', label: 'Kontaktdaten Beratung weitergegeben' },
  { key: 'flyer_ausgabe', emoji: '📄', label: 'Infomaterial / Flyer weitergegeben' },
  { key: 'js_minderjaehrig_abgewiesen', emoji: '🚫', label: 'Minderjährig — Eintritt verweigert' },
  { key: 'fremde_kundenkarte', emoji: '🪪', label: 'Gast mit fremder Kundenkarte' },
  { key: 'app_selbstsperre_24h', emoji: '⏱️', label: 'Kunde versehentlich über App 24 h gesperrt' },
  { key: 'gespraech_verantwortliche', emoji: '🗣️', label: 'Gespräch mit Verantwortlichem über Spielgast' },
  { key: 'spiel_ausschluss', emoji: '⛔', label: 'Auffällige Person vom Spiel ausgeschlossen' },
  { key: 'spielersperre', emoji: '🛑', label: 'Spielersperre (Selbst- / Fremdsperre)' },
  { key: 'hausverbot', emoji: '🚷', label: 'Hausverbot' },
  { key: 'gesperrte_person_abgewiesen', emoji: '🔒', label: 'Gesperrte Person am Zutritt gehindert' },
  { key: 'oasis_aufmerksam', emoji: '👁️', label: 'Auf Oasis-Spielersperre aufmerksam gemacht' },
];

const KAT_GW: CategoryItem[] = [
  { key: 'gw_hohe_einzahlung_kleine_quoten', emoji: '💸', label: 'Hohe Einzahlung — kaum Spiel / nur kleine Quoten' },
  { key: 'gw_auszahlung_mit_nachweis', emoji: '🧾', label: 'Hohe Einzahlung als Gewinn auszahlen + Nachweis verlangt' },
  { key: 'gw_fremdkonto_auszahlung', emoji: '🔀', label: 'Versuch Auszahlung über fremdes Konto' },
  { key: 'gw_falsche_identitaet', emoji: '🎭', label: 'Falsche Identitätsangabe' },
  { key: 'gw_fremde_gewinnnachweise', emoji: '📋', label: 'Frage nach fremden Gewinnnachweisen' },
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-3 sm:p-6 overflow-auto">
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 w-full max-w-3xl my-4 space-y-5 shadow-2xl">
        {step === 'ask' && logoutMode && (
          <>
            <div>
              <div className="flex items-center gap-3">
                <div className="text-4xl">⚠️</div>
                <div>
                  <h2 className="text-2xl font-bold">Dokumentation vor Logout</h2>
                  <p className="text-base text-muted mt-1">
                    Hattest du heute einen <strong className="text-warn">dokumentationspflichtigen Vorfall</strong>?
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted mt-3">
                Jugend- und Spielerschutz, Geldwäsche-Verdacht, Hausverbot, Spielersperre etc.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleNein}
                disabled={busy}
                className="rounded-xl bg-surface-2 border-2 border-border hover:border-plus py-5 px-4 text-base font-semibold transition-colors disabled:opacity-50"
              >
                <div className="text-3xl mb-1">✓</div>
                Nein, alles ok
              </button>
              <button
                type="button"
                onClick={() => setStep('doku')}
                disabled={busy}
                className="rounded-xl bg-warn/20 border-2 border-warn text-warn hover:bg-warn/30 py-5 px-4 text-base font-bold transition-colors disabled:opacity-50"
              >
                <div className="text-3xl mb-1">📋</div>
                Ja, dokumentieren
              </button>
            </div>
            <div
              className="text-[11px] text-muted text-center mt-1"
              style={{ opacity: 0.7 }}
            >
              Pflicht-Abfrage — bitte eine der beiden Antworten wählen.
            </div>
          </>
        )}

        {step === 'doku' && (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span className="text-3xl">📋</span> Vorfall dokumentieren
                </h2>
                <p className="text-sm text-muted mt-1">
                  Tippe auf die zutreffenden Felder. Mehrfachauswahl möglich.
                </p>
              </div>
              {selected.size > 0 && (
                <div className="bg-accent/20 border border-accent/40 text-accent rounded-full px-3 py-1 text-sm font-bold">
                  {selected.size} ausgewählt
                </div>
              )}
            </div>

            <CategoryBlock
              title="Jugend- und Spielerschutz"
              icon="⚖️"
              accent="#fbbf24"
              items={KAT_JSP}
              selected={selected}
              onToggle={toggle}
            />

            <CategoryBlock
              title="Verdacht auf Geldwäsche"
              icon="💰"
              accent="#f87171"
              items={KAT_GW}
              selected={selected}
              onToggle={toggle}
            />

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-muted uppercase tracking-wider">
                ✏️ Sonstiges / Details
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Zusätzliche Beschreibung (Uhrzeit, Personen, Verlauf, …)"
                className="field-input text-base"
              />
            </label>

            {err && (
              <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded-lg px-4 py-3">
                {err}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={logoutMode ? () => setStep('ask') : onCancel}
                disabled={busy}
                className="btn-ghost py-3 text-base"
              >
                {logoutMode ? '← Zurück' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={handleSpeichern}
                disabled={busy}
                className="btn-primary py-3 text-base font-bold"
              >
                {busy
                  ? 'Speichere …'
                  : logoutMode
                    ? '💾 Speichern & Abmelden'
                    : '💾 Speichern'}
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
                transform: checked ? 'scale(0.99)' : 'scale(1)',
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
