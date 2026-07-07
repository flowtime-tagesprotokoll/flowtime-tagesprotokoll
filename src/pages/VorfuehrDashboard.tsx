import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { DokuReminderModal } from '../components/DokuReminder';
import { useAuth } from '../lib/authStore';
import { firstName } from '../lib/types';

/**
 * Vorführ-Dashboard: einzige Startseite unter /vorfuehrung. Zeigt nur
 * den Dokumentations-Button und (fuer Admins) einen Link zum Bericht.
 * Der Rest der App (Kasse, Aufladungen, Stunden, Zertifikate, etc.) ist
 * unter diesem URL-Baum bewusst nicht erreichbar.
 */
export function VorfuehrDashboardPage() {
  const session = useAuth((s) => s.session)!;
  const [showDoku, setShowDoku] = useState(false);
  const isAdmin = session.kind === 'admin';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-10 sm:py-16 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Dokumentations-App
          </h1>
          <p className="text-base text-muted">
            Für Vorfälle im Rahmen des Jugend- und Spielerschutzes sowie
            Geldwäsche-Verdachtsmeldungen gemäß GlüStV / GwG.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDoku(true)}
            className="w-full py-8 sm:py-10 rounded-2xl bg-warn/20 border-2 border-warn text-warn hover:bg-warn/30 hover:border-warn text-lg sm:text-xl font-bold flex items-center justify-center gap-3 transition-colors"
          >
            <span className="text-3xl sm:text-4xl">📋</span>
            Vorfall dokumentieren
          </button>

          {isAdmin && (
            <Link
              to="/vorfuehrung/bericht"
              className="block w-full py-5 sm:py-6 rounded-2xl bg-surface-2 border border-border hover:border-accent hover:text-accent text-base sm:text-lg font-semibold text-center transition-colors"
            >
              📑 Dokumentationsbericht anzeigen
            </Link>
          )}
        </div>

        <div className="text-center text-xs text-muted pt-6 space-y-1">
          <div>
            Angemeldet als{' '}
            <strong className="text-text">{firstName(session.profile.name)}</strong>
            {' '}
            <span className="uppercase tracking-wider">({session.profile.rolle})</span>
          </div>
          <div>
            Alle hier erfassten Vorfälle werden fortlaufend im offiziellen
            Bericht gespeichert.
          </div>
        </div>
      </div>

      {showDoku && (
        <DokuReminderModal
          onCancel={() => setShowDoku(false)}
          onDone={() => setShowDoku(false)}
        />
      )}
    </Layout>
  );
}
