import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import {
  ReminderModal,
  buildReminders,
} from '../components/ShiftReminders';

/**
 * Vorschau aller Reminder-Fenster für Admin/Review.
 * Kein Timer, keine Persistenz — nur Klick-Through.
 */
export function RemindersPreviewPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<number | null>(null);
  const [showNoDetail, setShowNoDetail] = useState(false);
  const reminders = buildReminders('Mitarbeiter');

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold">🔔 Reminder-Fenster Vorschau</h1>
          <p className="text-sm text-muted mt-1">
            Alle Hinweise, die im Wechsel über die Schicht angezeigt werden
            (Intervall 25–75 Minuten, zufällige Reihenfolge).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {reminders.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setShowNoDetail(false);
                setActive(i);
              }}
              className="text-left p-4 rounded-lg border-2 hover:scale-[1.01] transition-transform"
              style={{
                borderColor: r.accent,
                background: `${r.accent}1a`,
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{r.emoji}</span>
                <span
                  className="text-lg font-bold"
                  style={{ color: r.accent }}
                >
                  {r.title}
                </span>
              </div>
              <div className="text-xs text-muted">Anklicken für Vorschau</div>
            </button>
          ))}
        </div>

        <div className="bg-surface-2 border border-border-soft rounded-lg p-4 text-sm text-muted">
          <strong className="text-text">Hinweis:</strong> Reminder erscheinen
          nicht direkt am Schicht-Anfang. Erstes Fenster nach 25–75 Min, danach
          weitere im selben Abstand. Alle 6 werden in zufälliger Reihenfolge
          rotiert. Bei minimierter App: Fenster wird nach vorne geholt + Taskbar
          blinkt.
        </div>
      </div>

      {active !== null && (
        <ReminderModal
          reminder={reminders[active]}
          showNoDetail={showNoDetail}
          onShowNoDetail={() => setShowNoDetail(true)}
          onClose={() => {
            setActive(null);
            setShowNoDetail(false);
          }}
        />
      )}
    </Layout>
  );
}
