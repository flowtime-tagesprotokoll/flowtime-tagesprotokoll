/**
 * Offene Kundenkarten-Aufladungen erkennen und saldieren.
 *
 * Logik:
 *  - Mitarbeiter traegt in Entnahmen eine Aufladung als z.B. "Nezir 50" ein
 *    (Kunde laedt seine Karte aus der Ferne auf, Geld kommt spaeter).
 *  - Wenn der Kunde das Geld bringt, traegt der Mitarbeiter in Einlagen
 *    "Nezir 50" (oder Teilbetrag) ein.
 *  - Aus der Differenz pro Kunde ueber alle Tage hinweg ergibt sich der
 *    aktuelle offene Saldo. >0 = der Kunde schuldet uns noch Geld.
 *
 * Mitarbeiter-Namen (Tamer, Soner, ...) und systemische Bezeichnungen
 * (Schublade, Wechselgeld, ...) gehoeren NICHT in diese Liste; sie sind
 * interne Bewegungen und werden ignoriert.
 */

interface CustomerDef {
  canonical: string;
  /** Zusaetzliche Schreibweisen / haeufige Tippfehler */
  aliases: string[];
}

/**
 * Altbestand-Saldo PRO SHOP mit Stichtag:
 *  - `saldo`: Aktuelle offene Stände am Stichtag (vom Inhaber gepflegt)
 *  - `stichtag`: Datum ab dem digitale Bewegungen verrechnet werden
 *
 * Die Idee: am Stichtag definiert der Inhaber von Hand den aktuellen
 * offenen Stand jedes Kunden. Alle Bewegungen VOR dem Stichtag fliessen
 * bereits in diese Zahl ein und werden NICHT extra gezaehlt. Ab dem
 * Stichtag zaehlen Entnahmen (neue Aufladungen) und Einlagen (Tilgungen)
 * normal als +/- vom Altbestand.
 */
export interface ShopStartsaldo {
  stichtag: string; // ISO-Datum 'YYYY-MM-DD'
  saldo: Record<string, number>;
}

export const STARTSALDO_PER_SHOP: Record<string, ShopStartsaldo> = {
  MGR: {
    stichtag: '2026-05-12',
    saldo: {
      Baha: 50,
      Recai: 100,
      Volkan: 40,
      Cemal: 100,
      Uwe: 7,
    },
  },
  STÖ: {
    stichtag: '2026-05-12',
    saldo: {},
  },
};

/**
 * Liste aller Kunden, die Aufladungen tätigen duerfen.
 * Pflegt Tamer/Admin direkt hier im Code. Aliases helfen bei haeufigen
 * Tipp-Varianten (Umlaut, fehlende Buchstaben).
 */
export const KUNDEN: CustomerDef[] = [
  { canonical: 'Fabian', aliases: ['fabi'] },
  { canonical: 'Uwe', aliases: [] },
  { canonical: 'Baha', aliases: [] },
  { canonical: 'Petro', aliases: [] },
  { canonical: 'Keko', aliases: [] },
  { canonical: 'Nezir', aliases: [] },
  { canonical: 'Murat', aliases: [] },
  { canonical: 'Orhan', aliases: [] },
  { canonical: 'Melik', aliases: [] },
  { canonical: 'Besim', aliases: [] },
  { canonical: 'Vanessa', aliases: ['vanesa'] },
  { canonical: 'Volkan', aliases: [] },
  { canonical: 'Recai', aliases: [] },
  { canonical: 'Tansel', aliases: ['tanzel'] },
  { canonical: 'Cemal', aliases: [] },
  { canonical: 'Sevket', aliases: ['şevket'] },
  { canonical: 'Özden', aliases: ['oezden', 'ozden'] },
];

/** Normalisiert einen String fuer den Vergleich: lowercase, Umlaute zu ASCII. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .trim();
}

/** Levenshtein-Distanz fuer Tippfehler-Toleranz (klein wegen kurzer Namen). */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/** Maximale Tippfehler-Toleranz je nach Wortlaenge. */
function maxLev(len: number): number {
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 2;
}

/**
 * Versucht aus einer Bewegungs-Beschreibung den dahinterstehenden Kunden
 * zu finden. Gibt den kanonischen Namen zurueck oder null.
 */
export function matchKunde(beschreibung: string | null | undefined): string | null {
  if (!beschreibung) return null;
  const norm = normalize(beschreibung);
  // Worte extrahieren (einfach: alles was nicht alphanumerisch ist ignorieren)
  const tokens = norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;

  for (const tok of tokens) {
    for (const kunde of KUNDEN) {
      const candidates = [kunde.canonical, ...kunde.aliases].map(normalize);
      for (const cand of candidates) {
        // Exakt enthalten ODER kurze Levenshtein-Distanz
        if (tok === cand) return kunde.canonical;
        if (tok.includes(cand) || cand.includes(tok)) return kunde.canonical;
        if (lev(tok, cand) <= maxLev(Math.max(tok.length, cand.length))) {
          return kunde.canonical;
        }
      }
    }
  }
  return null;
}

interface BewegungLite {
  typ: 'einlage' | 'entnahme';
  beschreibung: string | null;
  betrag: number;
  datum: string;
}

export interface OffeneAufladung {
  kunde: string;
  offen: number;
  /** ISO-Datum der aeltesten Aufladung, oder null wenn nur Altbestand. */
  seit: string | null;
  /** Zaehlt, wie viele Aufladungs-Eintraege diesen Saldo ergeben (ohne Altbestand). */
  anzahlAufladungen: number;
}

/**
 * Saldiert alle Bewegungen ueber alle Tage hinweg pro Kunde.
 * Entnahme = Aufladung (Kunde schuldet) | Einlage = Tilgung.
 *
 * `startsaldo` (optional): Altbestand-Schulden zum Stichtag. Wenn `stichtag`
 * gesetzt ist, werden alle Bewegungen VOR diesem Datum ignoriert — sie
 * stecken bereits im Altbestand. Bewegungen am Stichtag selbst und spaeter
 * zaehlen wie ueblich.
 *
 * Rueckgabe: nur Kunden mit offen > 0, sortiert nach aeltestem Datum
 * (Altbestand zuerst).
 */
export function berechneOffeneAufladungen(
  bewegungen: BewegungLite[],
  startsaldo: Record<string, number> = {},
  stichtag?: string,
): OffeneAufladung[] {
  interface Acc {
    soll: number;     // Summe Entnahmen + Altbestand
    gezahlt: number;  // Summe Einlagen mit diesem Kunden
    seit: string | null;
    anzahl: number;
  }
  const map = new Map<string, Acc>();
  // Startsaldo erst einlesen — Kunden mit Altbestand haben dann "seit: null"
  for (const [kunde, betrag] of Object.entries(startsaldo)) {
    if (!Number.isFinite(betrag) || betrag <= 0) continue;
    map.set(kunde, { soll: betrag, gezahlt: 0, seit: null, anzahl: 0 });
  }
  for (const b of bewegungen) {
    if (stichtag && b.datum < stichtag) continue;
    const kunde = matchKunde(b.beschreibung);
    if (!kunde) continue;
    const entry = map.get(kunde) ?? { soll: 0, gezahlt: 0, seit: null, anzahl: 0 };
    if (b.typ === 'entnahme') {
      entry.soll += b.betrag;
      entry.anzahl += 1;
      if (entry.seit === null || b.datum < entry.seit) entry.seit = b.datum;
    } else {
      entry.gezahlt += b.betrag;
    }
    map.set(kunde, entry);
  }
  const out: OffeneAufladung[] = [];
  for (const [kunde, acc] of map.entries()) {
    const offen = acc.soll - acc.gezahlt;
    if (offen > 0.005) {
      out.push({ kunde, offen, seit: acc.seit, anzahlAufladungen: acc.anzahl });
    }
  }
  // Altbestand zuerst (seit=null), dann aelteste Datums-Aufladungen
  out.sort((a, b) => {
    if (a.seit === null && b.seit === null) return 0;
    if (a.seit === null) return -1;
    if (b.seit === null) return 1;
    return a.seit < b.seit ? -1 : a.seit > b.seit ? 1 : 0;
  });
  return out;
}
