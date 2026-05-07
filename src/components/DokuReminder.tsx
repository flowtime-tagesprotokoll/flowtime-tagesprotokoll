import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';

interface Props {
  onCancel: () => void;
  onDone: () => void;
}

/**
 * Modal vor dem Logout: Mitarbeiter sollen ggf. einen Vorfall dokumentieren.
 * Schreibt einen Eintrag ins audit_log.
 */
export function DokuReminderModal({ onCancel, onDone }: Props) {
  const session = useAuth((s) => s.session);
  const [step, setStep] = useState<'ask' | 'doku'>('ask');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function logAudit(action: string, vorfallText: string | null) {
    if (!session) return;
    await supabase.from('audit_log').insert({
      profile_id: session.profile.id,
      user_name: session.profile.name,
      rolle: session.profile.rolle,
      action,
      new_val: vorfallText ? { text: vorfallText } : null,
    });
  }

  async function handleNein() {
    setBusy(true);
    await logAudit('DOKU_REMINDER_OK', null);
    setBusy(false);
    onDone();
  }

  async function handleJaSubmit() {
    if (!text.trim()) return;
    setBusy(true);
    await logAudit('VORFALL', text.trim());
    setBusy(false);
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md space-y-4">
        {step === 'ask' && (
          <>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-warn">⚠</span> Dokumentation
              </h2>
              <p className="text-sm text-muted mt-2">
                Hattest du heute einen <strong>Vorfall</strong> oder etwas Besonderes
                zu vermerken? (Streit, Kunde-Beschwerde, technisches Problem,
                Diskrepanz, etc.)
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
              <h2 className="text-lg font-bold">Vorfall dokumentieren</h2>
              <p className="text-sm text-muted mt-1">
                Beschreibe kurz, was passiert ist.
              </p>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Was ist heute vorgefallen?"
              className="field-input"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep('ask')}
                disabled={busy}
                className="btn-ghost"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleJaSubmit}
                disabled={busy || !text.trim()}
                className="btn-primary"
              >
                {busy ? 'Speichere …' : 'Speichern & Abmelden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
