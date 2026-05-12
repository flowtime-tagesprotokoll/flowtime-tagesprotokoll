import { useEffect, useState } from 'react';

/** Live-Uhr mit Sekunden, Berlin-Zeitzone. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Berlin',
    hour12: false,
  }).format(now);
  return <span className="mono">{t}</span>;
}
