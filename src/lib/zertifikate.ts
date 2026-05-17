/**
 * Zertifikat-Typen, Gueltigkeits-Berechnung und Status.
 */

export type ZertifikatTyp = 'merlato_js' | 'chevron_gw' | 'fuehrungszeugnis';

export interface ZertifikatTypInfo {
  key: ZertifikatTyp;
  label: string;
  kurz: string;
  /** Standardgueltigkeit in Monaten ab Ausstellung. */
  gueltigMonate: number;
  beschreibung: string;
}

export const ZERTIFIKAT_TYPEN: ZertifikatTypInfo[] = [
  {
    key: 'merlato_js',
    label: 'Merlato — Jugend & Spielerschutz',
    kurz: 'Merlato (J/S)',
    gueltigMonate: 24,
    beschreibung: 'Praesenzschulung, 2 Jahre gueltig',
  },
  {
    key: 'chevron_gw',
    label: 'Chevron — Geldwaesche',
    kurz: 'Chevron (GW)',
    gueltigMonate: 12,
    beschreibung: 'Online-Schulung, jaehrlich erneuern',
  },
  {
    key: 'fuehrungszeugnis',
    label: 'Polizeiliches Führungszeugnis',
    kurz: 'Führungszeugnis',
    gueltigMonate: 12,
    beschreibung: 'darf max. 1 Jahr alt sein',
  },
];

export interface Zertifikat {
  id: string;
  profile_id: string;
  typ: ZertifikatTyp;
  ausgestellt_am: string; // ISO date
  gueltig_bis: string; // ISO date
  datei_storage_path: string | null;
  notiz: string | null;
  hochgeladen_am: string;
  hochgeladen_von: string | null;
}

/** Berechnet 'gueltig_bis' aus Ausstellungsdatum + Standard-Monaten. */
export function berechneGueltigBis(ausgestelltAm: string, typ: ZertifikatTyp): string {
  const info = ZERTIFIKAT_TYPEN.find((t) => t.key === typ);
  const monate = info?.gueltigMonate ?? 12;
  const d = new Date(ausgestelltAm + 'T00:00:00');
  d.setMonth(d.getMonth() + monate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type StatusFarbe = 'gruen' | 'gelb' | 'rot' | 'grau';

export interface ZertifikatStatus {
  status: StatusFarbe;
  tageBisAblauf: number | null;
  zertifikat: Zertifikat | null;
}

/** Bewertet die neueste Karte je Typ. <0 = abgelaufen, <=30 = bald, sonst gueltig. */
export function statusFor(
  zertifikate: Zertifikat[],
  typ: ZertifikatTyp,
  heuteIso: string,
): ZertifikatStatus {
  const liste = zertifikate
    .filter((z) => z.typ === typ)
    .sort((a, b) => (a.gueltig_bis < b.gueltig_bis ? 1 : -1));
  const neuestes = liste[0] ?? null;
  if (!neuestes) {
    return { status: 'grau', tageBisAblauf: null, zertifikat: null };
  }
  const ablauf = new Date(neuestes.gueltig_bis + 'T00:00:00');
  const heute = new Date(heuteIso + 'T00:00:00');
  const diff = Math.round((ablauf.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  let s: StatusFarbe = 'gruen';
  if (diff < 0) s = 'rot';
  else if (diff <= 30) s = 'gelb';
  return { status: s, tageBisAblauf: diff, zertifikat: neuestes };
}

export function statusColor(s: StatusFarbe): { bg: string; border: string; text: string } {
  switch (s) {
    case 'gruen':
      return { bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.45)', text: '#86efac' };
    case 'gelb':
      return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.55)', text: '#fcd34d' };
    case 'rot':
      return { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.55)', text: '#fca5a5' };
    case 'grau':
      return { bg: 'rgba(255,255,255,0.04)', border: '#2a2a2a', text: '#888' };
  }
}
