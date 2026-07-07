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
