import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log('[supabase] init', {
  url,
  keyPrefix: key ? key.substring(0, 20) + '…' : '(missing)',
});

if (!url || !key) {
  throw new Error(
    'Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  );
}

// Diagnostik: Headers.set wirft unter Tauri WebView2, wenn ein Wert nicht
// in ISO-8859-1 darstellbar ist. Wir wrappen die Methode, damit der konkrete
// Header-Name + Wert (mit hex-codierten Bytes) im Fehler erscheint.
if (typeof window !== 'undefined' && typeof Headers !== 'undefined') {
  const orig = Headers.prototype.set;
  Headers.prototype.set = function (name: string, value: string) {
    try {
      return orig.call(this, name, value);
    } catch (e) {
      const valStr = String(value);
      const bad = [...valStr].find((c) => c.charCodeAt(0) > 0xff);
      const detail = bad
        ? `bad-char "${bad}" (U+${bad.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()})`
        : 'no-char-found';
      const wrapped = new TypeError(
        `Headers.set("${name}", "${valStr}") fehlgeschlagen — ${detail} — Original: ${(e as Error).message}`,
      );
      console.error('[Headers.set]', wrapped);
      throw wrapped;
    }
  };
}

export const supabase = createClient(url, key);
