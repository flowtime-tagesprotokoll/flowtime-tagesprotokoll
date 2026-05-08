/**
 * Web-Notification-Helper.
 * Ersetzt die Tauri-Fenster-API: zeigt einen OS-Toast (wie Outlook),
 * versucht zusätzlich das Browser-Fenster nach vorn zu holen.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

interface ShowOptions {
  title: string;
  body: string;
  tag?: string;
  /** Wenn true, bleibt der Toast bis zum Klick stehen (sofern OS unterstützt). */
  requireInteraction?: boolean;
}

/**
 * Zeigt einen System-Toast und holt das Fenster nach vorn (best-effort).
 * Klick auf den Toast → fokussiert das App-Fenster.
 */
export function showReminderNotification(opts: ShowOptions): void {
  // Versuch 1: OS-Toast über Notification-API
  if (notificationsSupported() && Notification.permission === 'granted') {
    try {
      const n = new Notification(opts.title, {
        body: opts.body,
        icon: '/icon-256.png',
        badge: '/icon-128.png',
        tag: opts.tag ?? 'flowtime-reminder',
        requireInteraction: opts.requireInteraction ?? true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.warn('[notify] Notification.show fehlgeschlagen:', e);
    }
  }

  // Versuch 2: Tab-Titel blinken lassen, falls Tab im Hintergrund
  blinkTitle(opts.title);

  // Versuch 3: window.focus() — funktioniert in PWA-Fenstern oft
  try {
    window.focus();
  } catch {
    /* ignore */
  }
}

let blinkTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';

function blinkTitle(message: string): void {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') return;
  if (blinkTimer) return;
  originalTitle = document.title;
  let toggle = false;
  blinkTimer = setInterval(() => {
    document.title = toggle ? originalTitle : `🔔 ${message}`;
    toggle = !toggle;
  }, 1000);

  const stop = () => {
    if (blinkTimer) {
      clearInterval(blinkTimer);
      blinkTimer = null;
    }
    document.title = originalTitle;
    document.removeEventListener('visibilitychange', onVis);
  };
  const onVis = () => {
    if (document.visibilityState === 'visible') stop();
  };
  document.addEventListener('visibilitychange', onVis);
}
