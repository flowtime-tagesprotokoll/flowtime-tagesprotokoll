import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/authStore';
import { verifyPin } from '../lib/pin';
import { PinKeypad } from './PinKeypad';
import { firstName } from '../lib/types';

/**
 * Sperrt die App nach Inaktivitaet (Default 3 Min). Anwendung bleibt im
 * Speicher (kein Logout, keine Datenverlust), aber ein Vollbild-Overlay
 * verbirgt den Inhalt. Mitarbeiter muss seine PIN erneut eingeben, um
 * wieder Zugriff zu bekommen.
 *
 * Admin-Sessions werden NICHT gesperrt — Admin loggt sich bewusst ein,
 * arbeitet aktiv und der Zugriff ist durch Passwort/Konto geschuetzt.
 * Mitarbeiter ohne PIN bleiben ebenfalls offen (es gaebe kein Mittel zum
 * Entsperren). PINs sind aber inzwischen Standard.
 */
const IDLE_MS = 3 * 60 * 1000; // 3 Minuten
// Bewusst KEIN mousemove — sonst greift der Lock auf Desktop nie.
// Klicks/Tippen/Touch zaehlen als echte Aktivitaet, reine Mausbewegung nicht.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export function IdleLock() {
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastActivity = useRef<number>(Date.now());

  const isMitarbeiter = session?.kind === 'mitarbeiter';
  const hasPin = isMitarbeiter && !!session?.profile.pin_hash;

  useEffect(() => {
    if (!isMitarbeiter) {
      setLocked(false);
      return;
    }
    function markActive() {
      lastActivity.current = Date.now();
    }
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActive, { passive: true });
    }
    const tick = setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_MS) {
        if (hasPin) {
          setLocked(true);
        } else {
          // Mitarbeiter ohne PIN: kein Mittel zum Entsperren -> direkter Logout
          void signOut();
        }
      }
    }, 5_000);
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, markActive);
      }
      clearInterval(tick);
    };
  }, [isMitarbeiter, hasPin, signOut]);

  async function unlock(pin: string) {
    if (!session || session.kind !== 'mitarbeiter') return;
    setBusy(true);
    setErr(null);
    const ok = await verifyPin(pin, session.profile.pin_hash);
    setBusy(false);
    if (!ok) {
      setErr('PIN falsch.');
      return;
    }
    lastActivity.current = Date.now();
    setLocked(false);
    setErr(null);
  }

  function logoutFromLock() {
    void signOut();
    setLocked(false);
    setErr(null);
  }

  if (!hasPin || !locked || !session || session.kind !== 'mitarbeiter') return null;

  // PinKeypad bringt sein eigenes Vollbild-Overlay mit (z-50). Wir setzen
  // unseren z-Index hoeher, damit Reminder/Doku-Modals nicht durchschlagen.
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <PinKeypad
        title={`🔒 ${firstName(session.profile.name)} — App gesperrt`}
        subtitle="3 Min Inaktivitaet. Bitte PIN eingeben um weiterzumachen."
        onCancel={logoutFromLock}
        onSubmit={unlock}
        errorMessage={err}
        busy={busy}
      />
    </div>
  );
}
