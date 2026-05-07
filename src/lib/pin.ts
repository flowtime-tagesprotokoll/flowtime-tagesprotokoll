/** SHA-256 Hash mit App-Salt — kein Hochsicherheits-Schutz, aber ausreichend
 *  fürs lokale Shop-Setting (4-stellige PIN, RLS schränkt Zugriff ein). */
const SALT = 'flowtime-pin-salt-2026';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin + SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPin(
  pin: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) return false;
  const h = await hashPin(pin);
  return h === hash;
}
