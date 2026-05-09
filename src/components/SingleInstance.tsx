import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Stellt sicher, dass die App pro Browser nur in einem Fenster/Tab gleichzeitig
 * laeuft. Nutzt die Web-Locks-API: das erste Fenster haelt den exklusiven Lock,
 * jedes weitere bekommt ihn nicht und zeigt stattdessen den Duplikat-Bildschirm.
 *
 * Faellt auf "alles erlauben" zurueck, wenn der Browser Web-Locks nicht
 * unterstuetzt (sehr alte Browser).
 */
export function SingleInstanceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'primary' | 'duplicate'>(
    'checking',
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) {
      setState('primary');
      return;
    }

    let cancelled = false;

    navigator.locks.request(
      'flowtime-tagesprotokoll-singleton',
      { ifAvailable: true },
      async (lock) => {
        if (cancelled) return;
        if (!lock) {
          // Anderes Fenster haelt den Lock bereits.
          setState('duplicate');
          return;
        }
        setState('primary');
        // Lock so lange halten, wie das Tab/Fenster lebt.
        await new Promise(() => {
          /* never resolves */
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'duplicate') {
    return <DuplicateScreen />;
  }
  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        Lade …
      </div>
    );
  }
  return <>{children}</>;
}

function DuplicateScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div
        className="bg-surface border-2 rounded-xl p-7 max-w-md w-full space-y-5 shadow-2xl text-center"
        style={{ borderColor: '#fbbf24' }}
      >
        <div className="text-6xl">⚠️</div>
        <h1 className="text-xl font-bold" style={{ color: '#fbbf24' }}>
          Flowtime läuft bereits
        </h1>
        <p className="text-base text-muted leading-relaxed">
          Auf diesem Computer ist die App bereits in einem anderen Fenster
          oder Tab geöffnet. Bitte dort weiterarbeiten.
        </p>
        <p className="text-sm text-muted">
          Wenn du das andere Fenster geschlossen hast und es trotzdem nicht
          klappt, klick auf <strong>„Erneut versuchen"</strong>.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary w-full py-3 font-bold"
        >
          ↺ Erneut versuchen
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="text-xs text-muted hover:text-accent w-full pt-1"
        >
          Dieses Fenster schließen
        </button>
      </div>
    </div>
  );
}
