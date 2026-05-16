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
    schichten: 1,
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
