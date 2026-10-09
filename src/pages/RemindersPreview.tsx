import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import {
  ReminderModal,
  buildReminders,
} from '../components/ShiftReminders';
import { PflichtSchulungGwPep } from '../components/PflichtSchulungGwPep';

/**
 * Vorschau aller Reminder-Fenster für Admin/Review.
 * Kein Timer, keine Persistenz — nur Klick-Through.
 */
export function RemindersPreviewPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<number | null>(null);
  const [showNoDetail, setShowNoDetail] = useState(false);
  const [pflichtMode, setPflichtMode] = useState<'pflicht' | 'auffrisch' | null>(null);
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

        {/* Pflicht-Schulung Vorschau */}
        <div className="border-t border-border-soft pt-5">
          <h2 className="text-lg font-bold mb-1">⚠️ Pflicht-Schulung Vorschau</h2>
          <p className="text-sm text-muted mb-3">
            So sieht das Pflicht-Modal für Mitarbeiter aus (Geldwäsche-
            Verdachtsmeldung + PEP-Prüfung). In der Vorschau wird{' '}
            <strong>nichts</strong> ins Audit-Log geschrieben — nur Anzeige.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPflichtMode('pflicht')}
              className="text-left p-4 rounded-lg border-2 hover:scale-[1.01] transition-transform"
              style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.08)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">⚠️</span>
                <span className="text-lg font-bold" style={{ color: '#f87171' }}>
                  Pflichtphase
                </span>
              </div>
              <div className="text-xs text-muted">
                Erste 5 Logins: nicht wegklickbar
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPflichtMode('auffrisch')}
              className="text-left p-4 rounded-lg border-2 hover:scale-[1.01] transition-transform"
              style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.08)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🔁</span>
                <span className="text-lg font-bold" style={{ color: '#f87171' }}>
                  Auffrischung
                </span>
              </div>
              <div className="text-xs text-muted">
                Danach alle 15 Tage, mit „Später erinnern"
              </div>
            </button>
          </div>
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

      {pflichtMode && (
        <PflichtSchulungGwPep
          preview
          pflicht={pflichtMode === 'pflicht'}
          anzahl={pflichtMode === 'pflicht' ? 0 : 5}
          pflichtAnzahl={5}
          onBestaetigt={() => setPflichtMode(null)}
          onSpaeter={
            pflichtMode === 'auffrisch' ? () => setPflichtMode(null) : undefined
          }
        />
      )}
    </Layout>
  );
}
