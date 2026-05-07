import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/authStore';

interface Reminder {
  emoji: string;
  title: string;
  body: ReactNode;
  /** Wenn gesetzt: zwei Antwort-Buttons. */
  yesNo?: { yesLabel: string; noLabel: string; noBody: ReactNode };
}

function buildReminders(name: string): Reminder[] {
  return [
    {
      emoji: '⚖️',
      title: 'Jugend- und Spielerschutz',
      body: (
        <>
          <p>
            Hallo <strong>{name}</strong>! Bitte denk dran: <strong>Jeder Vorfall</strong>{' '}
            in Sachen Jugend- und Spielerschutz muss <strong>dokumentiert</strong>{' '}
            werden — wir sind gesetzlich dazu verpflichtet, und die Berichte gehen
            ans Ministerium.
          </p>
          <p className="text-sm text-muted mt-2">
            Nutze oben rechts den Button{' '}
            <span className="bg-surface-2 border border-border px-2 py-0.5 rounded mono">
              📋 + Doku
            </span>{' '}
            sobald etwas passiert.
          </p>
        </>
      ),
    },
    {
      emoji: '🧹',
      title: 'Ordnung & Sauberkeit',
      body: (
        <p>
          Hi <strong>{name}</strong>! Achte bitte stets auf{' '}
          <strong>Ordnung und Sauberkeit</strong> im gesamten Laden — das gehört
          genauso zur Schicht wie die Kasse.
        </p>
      ),
    },
    {
      emoji: '💰',
      title: 'Geldwäsche-Verdachtsmeldung',
      body: (
        <p>
          Hallo <strong>{name}</strong>! Bei Behördenkontrollen wirst du gefragt,
          wie man eine <strong>Geldwäsche-Verdachtsmeldung</strong> abgibt. Du musst
          das wissen.
          <br />
          <span className="text-sm text-muted">Weißt du, wie das geht?</span>
        </p>
      ),
      yesNo: {
        yesLabel: 'Ja, ich weiß es',
        noLabel: 'Nein, kurze Auffrischung',
        noBody: (
          <div className="space-y-2 text-sm">
            <p>
              Bei verdächtigem Verhalten (siehe Doku-Modal "Verdacht auf Geldwäsche")
              sofort das interne Verfahren auslösen:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                <strong>Ruhig bleiben</strong>, Kunden ganz normal weiter behandeln —
                keine direkte Konfrontation.
              </li>
              <li>
                Beobachtungen <strong>sofort dokumentieren</strong> (Doku-Button
                oben). Möglichst viele Details: Betrag, Uhrzeit, Verhalten,
                Aussehen, andere Personen.
              </li>
              <li>
                <strong>Tamer / Verantwortlichen sofort informieren</strong>{' '}
                (Telefon).
              </li>
              <li>
                Tamer reicht dann die offizielle Verdachtsmeldung über{' '}
                <strong>goAML</strong> bei der FIU (Zoll) ein.
              </li>
              <li>
                Den Kunden gegenüber niemals erwähnen, dass eine Meldung erfolgt
                ("Tipping-Off"-Verbot).
              </li>
            </ol>
          </div>
        ),
      },
    },
  ];
}

const STORAGE_KEY = 'flowtime_reminders_shown_session';

export function ShiftReminders() {
  const session = useAuth((s) => s.session);
  const [step, setStep] = useState<number>(-1); // -1 = nicht aktiv
  const [showNoDetail, setShowNoDetail] = useState(false);

  // Zeigen, sobald ein Mitarbeiter eingeloggt ist und noch nicht in dieser Session gesehen
  useEffect(() => {
    if (!session) return;
    if (session.kind !== 'mitarbeiter') return;
    const flag = sessionStorage.getItem(STORAGE_KEY);
    if (flag === session.profile.id) return;
    setStep(0);
  }, [session]);

  if (!session || session.kind !== 'mitarbeiter' || step < 0) return null;

  const reminders = buildReminders(session.profile.name);
  const r = reminders[step];
  if (!r) return null;
  const isLast = step === reminders.length - 1;

  function next() {
    setShowNoDetail(false);
    if (isLast) {
      sessionStorage.setItem(STORAGE_KEY, session!.profile.id);
      setStep(-1);
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-auto">
      <div className="bg-surface border border-accent rounded-lg p-5 w-full max-w-lg space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{r.emoji}</div>
          <div>
            <h2 className="text-lg font-bold">{r.title}</h2>
            <div className="text-[11px] text-muted mono">
              Hinweis {step + 1} von {reminders.length}
            </div>
          </div>
        </div>

        <div className="text-base leading-relaxed">{r.body}</div>

        {showNoDetail && r.yesNo?.noBody && (
          <div className="bg-surface-2 border border-border-soft rounded p-3">
            {r.yesNo.noBody}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {r.yesNo && !showNoDetail ? (
            <>
              <button
                type="button"
                onClick={() => setShowNoDetail(true)}
                className="btn-ghost flex-1"
              >
                {r.yesNo.noLabel}
              </button>
              <button type="button" onClick={next} className="btn-primary flex-1">
                {r.yesNo.yesLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={next} className="btn-primary w-full">
              {isLast ? 'Verstanden — Schicht starten' : 'Weiter'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
