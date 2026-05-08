/**
 * In der Web/PWA-Variante übernimmt der Service Worker das Update.
 * Diese Funktion bleibt als No-Op, damit bestehende Aufrufer nichts ändern müssen.
 */
export function isTauri(): boolean {
  return false;
}

export async function checkForUpdates(): Promise<void> {
  // PWA-Updates laufen über vite-plugin-pwa (registerType: 'autoUpdate').
}
