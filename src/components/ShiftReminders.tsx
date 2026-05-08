import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/authStore';
import { showReminderNotification } from '../lib/notify';
import { firstName } from '../lib/types';

interface Reminder {
  emoji: string;
  title: string;
  body: ReactNode;
  /** Wenn gesetzt: zwei Antwort-Buttons. */
  yesNo?: { yesLabel: string; noLabel: string; noBody: ReactNode };
  /** Akzentfarbe. */
  accent: string;
}

export function buildReminders(name: string): Reminder[] {
  return [
    {
      emoji: '⚖️',
      accent: '#fbbf24',
      title: 'Jugend- und Spielerschutz',
      body: (
        <>
          <p className="text-lg leading-relaxed">
            Hallo <strong>{name}</strong>! Bitte denk dran:{' '}
            <strong>Jeder Vorfall</strong> in Sachen Jugend- und Spielerschutz muss{' '}
            <strong>dokumentiert</strong> werden — wir sind gesetzlich dazu
            verpflichtet, und die Berichte gehen ans Ministerium.
          </p>
          <p className="text-base text-muted mt-3">
            Nutze oben rechts den Button{' '}
            <span className="bg-warn/20 border-2 border-warn text-warn font-bold px-2 py-0.5 rounded">
              📋 Vorfall dokumentieren
            </span>{' '}
            sobald etwas passiert.
          </p>
        </>
      ),
    },
    {
      emoji: '🧹',
      accent: '#4ade80',
      title: 'Ordnung & Sauberkeit',
      body: (
        <p className="text-lg leading-relaxed">
          Hi <strong>{name}</strong>! Achte bitte stets auf{' '}
          <strong>Ordnung und Sauberkeit</strong> im gesamten Laden — das gehört
          genauso zur Schicht wie die Kasse.
        </p>
      ),
    },
    {
      emoji: '🪪',
      accent: '#60a5fa',
      title: 'Ausweiskontrolle',
      body: (
        <p className="text-lg leading-relaxed">
          <strong>{name}</strong> — bei jedem Ausweis bitte{' '}
          <strong>auf das Foto</strong> schauen (passt es zur Person?) und auf die{' '}
          <strong>Gültigkeit</strong> (abgelaufen = nicht gültig). Im Zweifel
          lieber einmal mehr prüfen als zu wenig.
        </p>
      ),
    },
    {
      emoji: '🕴️',
      accent: '#a78bfa',
      title: 'PEP — Politisch Exponierte Person',
      body: (
        <>
          <p className="text-lg leading-relaxed">
            Weißt du noch, was ein <strong>PEP</strong> ist?
          </p>
          <p className="text-base text-muted mt-2">
            Politiker, Behördenleiter, Richter, Familie / enge Vertraute solcher
            Personen.
          </p>
          <p className="text-lg mt-3">
            Verdacht auf einen PEP? <strong>Sofort dem Chef melden.</strong>
          </p>
        </>
      ),
    },
    {
      emoji: '💰',
      accent: '#f87171',
      title: 'Geldwäsche-Verdachtsmeldung',
      body: (
        <p className="text-lg leading-relaxed">
          <strong>{name}</strong> — bei Behördenkontrollen wirst du gefragt,
          wie man eine <strong>Geldwäsche-Verdachtsmeldung</strong> abgibt. Du
          musst das wissen.
          <br />
          <span className="text-base text-muted">Weißt du, wie das geht?</span>
        </p>
      ),
      yesNo: {
        yesLabel: 'Ja, ich weiß es',
        noLabel: 'Nein, kurze Auffrischung',
        noBody: (
          <div className="space-y-2 text-base">
            <p>Bei Verdacht auf Geldwäsche:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                <strong>Ruhig bleiben</strong>, Kunden ganz normal weiter
                behandeln — keine direkte Konfrontation.
              </li>
              <li>
                Beobachtungen <strong>sofort dokumentieren</strong> über den
                Doku-Button. Möglichst viele Details: Betrag, Uhrzeit,
                Verhalten, andere Personen.
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
                Den Kunden gegenüber <strong>niemals erwähnen</strong>, dass
                eine Meldung erfolgt ("Tipping-Off"-Verbot).
              </li>
            </ol>
          </div>
        ),
      },
    },
    {
      emoji: '☀️',
      accent: '#d4ff00',
      title: 'Du schaffst das!',
      body: (
        <p className="text-lg leading-relaxed">
          Bleib immer <strong>aufmerksam</strong>, <strong>freundlich</strong>{' '}
          und <strong>sachlich</strong>. Auch wenn's mal stressig wird — ruhig
          bleiben, Probleme höflich lösen.{' '}
          <strong>Du schaffst das!</strong> 💪
        </p>
      ),
    },
    {
      emoji: '👕',
      accent: '#fb923c',
      title: 'Style-Check',
      body: (
        <>
          <p className="text-lg leading-relaxed">
            Kurzer Blick in den Spiegel, <strong>{name}</strong> 👀 — sitzt
            das <strong>Tipwin-Outfit</strong>?
          </p>
          <p className="text-base text-muted mt-2">
            Mit Uniform sehen wir aus wie ein Team. Ohne Uniform sehen wir aus
            wie der Kunde, der sich aus Versehen hinter den Tresen verirrt
            hat. 🙂
          </p>
          <p className="text-sm text-muted mt-2">
            Falls grad nicht — kurz wechseln, alles gut.
          </p>
        </>
      ),
    },
  ];
}

/** Schicht-Reminder-Steuerung: zeigt einen Reminder, plant den nächsten. */
export function ShiftReminders() {
  const session = useAuth((s) => s.session);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showNoDetail, setShowNoDetail] = useState(false);
  const orderRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Random-Intervall in Minuten zwischen min und max (inkl.)
  function nextDelayMs(): number {
    const minMin = 25;
    const maxMin = 75;
    const min = Math.floor(Math.random() * (maxMin - minMin + 1)) + minMin;
    return min * 60 * 1000;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  useEffect(() => {
    if (!session) return;
    if (session.kind !== 'mitarbeiter') return;

    const reminders = buildReminders(firstName(session.profile.name));
    orderRef.current = shuffle([...reminders.keys()]);
    cursorRef.current = 0;

    function showAt(idx: number) {
      const r = reminders[idx];
      showReminderNotification({
        title: `${r.emoji} ${r.title}`,
        body: typeof r.body === 'string' ? r.body : r.title,
        tag: `flowtime-reminder-${idx}`,
      });
      setActiveIndex(idx);
    }

    function pickNextIdx(): number {
      const idx = orderRef.current[cursorRef.current % orderRef.current.length];
      cursorRef.current++;
      // Wenn die ganze Liste durch ist, neu mischen
      if (cursorRef.current >= orderRef.current.length) {
        orderRef.current = shuffle([...reminders.keys()]);
        cursorRef.current = 0;
      }
      return idx;
    }

    function scheduleNext(delayMs: number) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        showAt(pickNextIdx());
      }, delayMs);
    }

    // Erster Reminder direkt nach Login (nach kurzer Verzoegerung,
    // damit das UI eingerichtet ist und Notification-Permission
    // ggf. schon erteilt wurde).
    scheduleNext(1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session]);

  if (!session || session.kind !== 'mitarbeiter' || activeIndex === null) {
    return null;
  }

  const reminders = buildReminders(firstName(session.profile.name));
  const r = reminders[activeIndex];

  function dismiss() {
    setShowNoDetail(false);
    setActiveIndex(null);
    // nächsten Reminder einplanen
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const reminders = buildReminders(firstName(session!.profile.name));
      const idx = orderRef.current[cursorRef.current % orderRef.current.length];
      cursorRef.current++;
      if (cursorRef.current >= orderRef.current.length) {
        orderRef.current = shuffle([...reminders.keys()]);
        cursorRef.current = 0;
      }
      const rNext = reminders[idx];
      showReminderNotification({
        title: `${rNext.emoji} ${rNext.title}`,
        body: rNext.title,
        tag: `flowtime-reminder-${idx}`,
      });
      setActiveIndex(idx);
    }, nextDelayMs());
  }

  return <ReminderModal reminder={r} showNoDetail={showNoDetail} onShowNoDetail={() => setShowNoDetail(true)} onClose={dismiss} />;
}

interface ReminderModalProps {
  reminder: Reminder;
  showNoDetail: boolean;
  onShowNoDetail: () => void;
  onClose: () => void;
}

export function ReminderModal({ reminder, showNoDetail, onShowNoDetail, onClose }: ReminderModalProps) {
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-auto">
      <div
        className="bg-surface border-4 rounded-xl p-6 w-full max-w-xl space-y-5 shadow-2xl"
        style={{ borderColor: reminder.accent }}
      >
        <div className="flex items-center gap-4">
          <div className="text-6xl">{reminder.emoji}</div>
          <div>
            <h2
              className="text-2xl font-bold"
              style={{ color: reminder.accent }}
            >
              {reminder.title}
            </h2>
          </div>
        </div>

        <div className="text-text">{reminder.body}</div>

        {showNoDetail && reminder.yesNo?.noBody && (
          <div
            className="rounded-lg border-2 p-4"
            style={{
              borderColor: reminder.accent,
              background: `${reminder.accent}1a`,
            }}
          >
            {reminder.yesNo.noBody}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {reminder.yesNo && !showNoDetail ? (
            <>
              <button
                type="button"
                onClick={onShowNoDetail}
                className="btn-ghost flex-1 py-3 text-base"
              >
                {reminder.yesNo.noLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-lg font-bold text-base text-bg"
                style={{ background: reminder.accent }}
              >
                {reminder.yesNo.yesLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-lg font-bold text-base text-bg"
              style={{ background: reminder.accent }}
            >
              Verstanden ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
