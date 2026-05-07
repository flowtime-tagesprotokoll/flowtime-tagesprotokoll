import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/authStore';
import { DokuReminderModal } from './DokuReminder';
import { ShiftReminders } from './ShiftReminders';

interface LayoutProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function Layout({ children, rightSlot }: LayoutProps) {
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const [showReminder, setShowReminder] = useState(false);
  const [showDoku, setShowDoku] = useState(false);

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

        <div className="flex items-center gap-2">
          {rightSlot}
          {session?.kind === 'admin' && <AdminMenu />}
          {session && (
            <>
              <button
                type="button"
                onClick={() => setShowDoku(true)}
                className="rounded-lg bg-warn/20 border-2 border-warn text-warn hover:bg-warn/30 font-bold px-3 py-1.5 text-sm transition-colors flex items-center gap-1.5"
                title="Vorfall dokumentieren / Dokumentationsmeldung"
              >
                <span className="text-base">📋</span>
                <span className="hidden sm:inline">Vorfall dokumentieren</span>
                <span className="sm:hidden">Doku</span>
              </button>
              <div className="text-right text-xs leading-tight ml-2">
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
          logoutMode
          onCancel={() => setShowReminder(false)}
          onDone={doSignOut}
        />
      )}

      {showDoku && (
        <DokuReminderModal
          onCancel={() => setShowDoku(false)}
          onDone={() => setShowDoku(false)}
        />
      )}

      <ShiftReminders />
    </div>
  );
}

function AdminMenu() {
  const [open, setOpen] = useState(false);

  function handleLink() {
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost text-xs px-3 py-1.5"
        title="Admin-Menü"
      >
        ☰ Admin
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-2xl z-40 py-1.5"
          >
            <MenuLink to="/" onClick={handleLink} icon="🏠" label="Dashboard" />
            <MenuLink to="/reports" onClick={handleLink} icon="📊" label="Monatsreport" />
            <MenuLink to="/dokubericht" onClick={handleLink} icon="📑" label="Doku-Bericht (PDF)" />
            <MenuLink to="/audit" onClick={handleLink} icon="📋" label="Audit-Log" />
            <div className="my-1 border-t border-border-soft" />
            <MenuLink to="/admin/mitarbeiter" onClick={handleLink} icon="👥" label="Mitarbeiter" />
            <MenuLink to="/admin/shops" onClick={handleLink} icon="🏪" label="Shops" />
            <div className="my-1 border-t border-border-soft" />
            <MenuLink to="/reminders/preview" onClick={handleLink} icon="🔔" label="Reminder-Vorschau" />
            <MenuLink to="/wartung" onClick={handleLink} icon="🛠" label="Wartung" />
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
    >
      <span className="w-5 text-center">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
