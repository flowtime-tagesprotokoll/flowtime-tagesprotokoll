/**
 * Stammdaten pro Shop: Anzahl der Schichten pro Tag und Standard-
 * Oeffnungszeiten je Wochentag. Wird vom Arbeitsplan benutzt.
 *
 * shopKurz entspricht dem 'kurz'-Feld der Shop-Tabelle.
 */

export interface ShopHours {
  von: string; // 'HH:MM'
  bis: string;
}

export interface ShopConfig {
  /** 1 = nur Frueh-Schicht, 2 = Frueh + Spaet */
  schichten: 1 | 2;
  /** Index 0=Montag, 1=Dienstag, ..., 6=Sonntag */
  defaultProTag: [ShopHours, ShopHours, ShopHours, ShopHours, ShopHours, ShopHours, ShopHours];
}

export const SHOP_CONFIG: Record<string, ShopConfig> = {
  MGR: {
    schichten: 2,
    defaultProTag: [
      { von: '10:00', bis: '23:00' }, // Mo
      { von: '10:00', bis: '23:00' }, // Di
      { von: '10:00', bis: '23:00' }, // Mi
      { von: '10:00', bis: '23:00' }, // Do
      { von: '10:00', bis: '23:00' }, // Fr
      { von: '10:00', bis: '23:00' }, // Sa
      { von: '11:00', bis: '23:00' }, // So
    ],
  },
  STÖ: {
    schichten: 2,
    defaultProTag: [
      { von: '12:00', bis: '19:00' }, // Mo
      { von: '12:00', bis: '19:00' }, // Di
      { von: '12:00', bis: '19:00' }, // Mi
      { von: '12:00', bis: '19:00' }, // Do
      { von: '12:00', bis: '19:00' }, // Fr
      { von: '12:00', bis: '21:00' }, // Sa
      { von: '12:00', bis: '21:00' }, // So
    ],
  },
};

/**
 * Feiertage an denen BEIDE Shops geschlossen sind.
 * Pflege bei Bedarf hier erweitern.
 */
export const FEIERTAGE_GESCHLOSSEN = new Set<string>([
  // 2026
  '2026-04-03', // Karfreitag
  '2026-11-15', // Volkstrauertag
  '2026-11-22', // Totensonntag
  // 2027
  '2027-03-26', // Karfreitag
  '2027-11-14', // Volkstrauertag
  '2027-11-21', // Totensonntag
  // 2028
  '2028-04-14', // Karfreitag
  '2028-11-19', // Volkstrauertag
  '2028-11-26', // Totensonntag
]);

export function defaultHours(shopKurz: string, wochentag: number): ShopHours | null {
  const cfg = SHOP_CONFIG[shopKurz];
  if (!cfg) return null;
  return cfg.defaultProTag[wochentag] ?? null;
}

export function shopSchichten(shopKurz: string): 1 | 2 {
  return SHOP_CONFIG[shopKurz]?.schichten ?? 2;
}

export function istGeschlossen(datum: string): boolean {
  return FEIERTAGE_GESCHLOSSEN.has(datum);
}

/**
 * Gedeckte Mitarbeiter-Farben fuer den Arbeitsplan.
 * Key = Vorname (case-insensitive), passt zu dem Text der im Eintrag steht.
 * Werte sind mid-dark-Mittelpalette, gut auf dem dunklen UI-Hintergrund lesbar.
 * Bei unbekanntem Namen wird FARBE_FALLBACK genutzt.
 */
export interface NameFarbe {
  bg: string;
  border: string;
  text: string;
}

const RAW_FARBEN: Record<string, NameFarbe> = {
  Soner:   { bg: '#1f3a55', border: '#3b5e80', text: '#8eb5d4' }, // klares dunkles Blau
  Mehdi:   { bg: '#2a4827', border: '#48693f', text: '#a8c896' }, // dunkles Waldgruen
  Vedat:   { bg: '#52273a', border: '#7c4458', text: '#d1909e' }, // gedaempftes Burgund
  Oskar:   { bg: '#4d3a1f', border: '#735a3a', text: '#cca97a' }, // tiefer Bernstein
  Erdem:   { bg: '#3b2849', border: '#5c426d', text: '#b69bd1' }, // dunkles Lila
  Riadh:   { bg: '#1d4847', border: '#386b6a', text: '#86bab8' }, // dunkles Teal
  Elhadji: { bg: '#54331f', border: '#7a5238', text: '#d6a075' }, // Terracotta
  Mamadou: { bg: '#54331f', border: '#7a5238', text: '#d6a075' }, // alias zu Elhadji
  Tamer:   { bg: '#2a2a4f', border: '#454573', text: '#9a9ad0' }, // Indigo
};

export const FARBE_FALLBACK: NameFarbe = {
  bg: '#262626',
  border: '#3a3a3a',
  text: '#a8a8a8',
};

export function farbeFuerEintrag(eintrag: string | null | undefined): NameFarbe | null {
  if (!eintrag) return null;
  const erstesWort = eintrag.trim().split(/[\s,]+/)[0] ?? '';
  const cap = erstesWort.charAt(0).toUpperCase() + erstesWort.slice(1).toLowerCase();
  return RAW_FARBEN[cap] ?? FARBE_FALLBACK;
}

/** Reine Lookup-Funktion fuer den NamePicker (Profile-First-Name). */
export function farbeFuerName(name: string): NameFarbe {
  const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return RAW_FARBEN[cap] ?? FARBE_FALLBACK;
}
