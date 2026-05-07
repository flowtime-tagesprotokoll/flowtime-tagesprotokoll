import { useEffect, useState } from 'react';

export function OnlineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-minus text-white text-center py-2 px-4 text-sm font-bold">
      ⚠ OFFLINE — Daten werden noch nicht gespeichert. Sobald wieder online,
      lädt die App automatisch.
    </div>
  );
}
