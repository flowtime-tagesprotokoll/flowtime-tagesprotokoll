/**
 * Auto-Update-Check via Tauri-Updater-Plugin.
 * Im Browser-Modus (npm run dev) ist `isTauri` false und der Check wird übersprungen.
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function checkForUpdates(): Promise<void> {
  if (!isTauri()) return;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = await check();
    if (!update) return;

    const yes = await ask(
      `Neue Version ${update.version} verfügbar (du hast ${update.currentVersion}).\n\nJetzt herunterladen und installieren?`,
      { title: 'Update verfügbar', kind: 'info' },
    );
    if (!yes) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    console.warn('[updater] Fehler beim Update-Check:', err);
  }
}
