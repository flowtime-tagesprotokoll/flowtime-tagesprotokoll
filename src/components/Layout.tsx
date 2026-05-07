import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/authStore';
import { DokuReminderModal } from './DokuReminder';

interface LayoutProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function Layout({ children, rightSlot }: LayoutProps) {
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const [showReminder, setShowReminder] = useState(false);

  function startSignOut() {
    if (!session) return;
    // Mitarbeiter & Bezirksleiter müssen erst durch den Doku-Reminder
    if (session.kind === 'mitarbeiter') {
      setShowReminder(true);
    } else {
      doSignOut();
    }
  }

  async function doSignOut() {
    await signOut();
    setShowReminder(false);
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-soft px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-bg border border-border flex items-center justify-center">
            <span className="text-accent font-mono font-bold text-sm">F</span>
          </div>
          <div>
            <div className="font-semibold text-[15px] leading-tight">Flowtime</div>
            <div className="text-xs text-muted leading-tight">Tagesprotokoll</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {rightSlot}
          {session && (
            <>
              <div className="text-right text-xs leading-tight">
                <div className="text-text">{session.profile.name}</div>
                <div className="text-muted uppercase tracking-wider">
                  {session.profile.rolle}
                </div>
              </div>
              <button
                type="button"
                onClick={startSignOut}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Abmelden
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border-soft px-6 py-3 text-xs text-muted-2 text-center">
        Flowtime GmbH · Hannover
      </footer>

      {showReminder && (
        <DokuReminderModal
          onCancel={() => setShowReminder(false)}
          onDone={doSignOut}
        />
      )}
    </div>
  );
}
