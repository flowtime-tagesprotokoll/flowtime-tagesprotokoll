import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * True, wenn wir uns im "Vorführ-Modus" befinden — also unter dem
 * /vorfuehrung-URL-Baum. In diesem Modus zeigt die App nur die
 * Doku-Funktionen (Vorfall dokumentieren + Bericht), sodass Behörden
 * bei einer Kontrolle nur den Doku-Prozess sehen. Daten werden 1:1 in
 * dieselbe DB geschrieben wie bei der normalen App.
 */
export function useVorfuehrModus(): boolean {
  const location = useLocation();
  return location.pathname.startsWith('/vorfuehrung');
}

/**
 * Tauscht bei Betreten des Vorführ-Modus:
 *  - das <link rel="manifest"> gegen das Vorführ-Manifest (eigener Name +
 *    eigenes Icon, damit Edge/Chrome beim "Als App installieren" die
 *    Vorfall-Doku als eigenständige App anlegt),
 *  - den <title> auf "Vorfalldokumentation - Flowtime",
 *  - das Favicon auf das Vorfall-Doku-Icon.
 * Beim Verlassen wird alles auf die Standardwerte zurückgestellt.
 */
export function useVorfuehrBranding(active: boolean): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    const linkManifest = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    const linkIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const origManifestHref = linkManifest?.getAttribute('href') ?? null;
    const origIconHref = linkIcon?.getAttribute('href') ?? null;
    const origTitle = document.title;

    if (active) {
      if (linkManifest) {
        linkManifest.setAttribute('href', `${base}/manifest-vorfuehr.webmanifest`);
      }
      if (linkIcon) {
        linkIcon.setAttribute('href', `${base}/icon-vorfall-doku-256.png`);
        linkIcon.setAttribute('type', 'image/png');
      }
      document.title = 'Vorfalldokumentation — Flowtime';
    }

    return () => {
      if (active) {
        if (linkManifest && origManifestHref !== null) {
          linkManifest.setAttribute('href', origManifestHref);
        }
        if (linkIcon && origIconHref !== null) {
          linkIcon.setAttribute('href', origIconHref);
          linkIcon.setAttribute('type', 'image/svg+xml');
        }
        document.title = origTitle;
      }
    };
  }, [active]);
}
