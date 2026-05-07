/**
 * Berechnungs-Logik für Tagesprotokolle.
 * 1:1 portiert aus der alten HTML-App (Zeilen 645–736).
 */

import type { Schicht, Kassenbewegung } from './types';

export const DIFF_WARN_THRESHOLD = 5.0;

/** Akzeptiert "12,34" oder "12.34" oder Number; leer/ungültig → 0. */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = v.replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Stunden zwischen Von/Bis-Zeit, mit Mitternachts-Wrap. */
export function calcStunden(
  von: string | null | undefined,
  bis: string | null | undefined,
): number {
  const v = parseTime(von);
  const b = parseTime(bis);
  if (v === null || b === null) return 0;
  let diff = b - v;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

export function formatStunden(h: number): string {
  return h.toFixed(2).replace('.', ',') + ' h';
}

export function formatEur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toFixed(2).replace('.', ',') + ' €';
}

export interface ShiftSums {
  start: number;
  kassenabrechnung: number;
  einlagenSumme: number;
  entnahmenSumme: number;
  soll: number;
  ist: number | null;
  diff: number | null;
  stunden: number;
}

/** Berechnet SOLL/IST/DIFF einer Schicht.
 *  SOLL = Kassenstart + Kassenabrechnung + Σ Einlagen − Σ Entnahmen
 *  DIFF = IST − SOLL
 */
export function calcShift(
  schicht: Pick<
    Schicht,
    'kassenstart' | 'kassenabrechnung' | 'kassenist' | 'zeit_von' | 'zeit_bis'
  >,
  bewegungen: Pick<Kassenbewegung, 'typ' | 'betrag'>[],
): ShiftSums {
  const start = num(schicht.kassenstart);
  const kassenabrechnung = num(schicht.kassenabrechnung);
  const einlagenSumme = bewegungen
    .filter((b) => b.typ === 'einlage')
    .reduce((sum, b) => sum + num(b.betrag), 0);
  const entnahmenSumme = bewegungen
    .filter((b) => b.typ === 'entnahme')
    .reduce((sum, b) => sum + num(b.betrag), 0);
  const soll = start + kassenabrechnung + einlagenSumme - entnahmenSumme;
  const istRaw = schicht.kassenist;
  const ist = istRaw === null || istRaw === undefined ? null : num(istRaw);
  const diff = ist === null ? null : ist - soll;
  const stunden = calcStunden(schicht.zeit_von, schicht.zeit_bis);
  return { start, kassenabrechnung, einlagenSumme, entnahmenSumme, soll, ist, diff, stunden };
}

export function isShiftComplete(s: Schicht): boolean {
  return !!(
    s.mitarbeiter_id &&
    s.zeit_von &&
    s.zeit_bis &&
    s.kassenstart !== null &&
    s.kassenabrechnung !== null &&
    s.kassenist !== null
  );
}

export function diffIsWarn(diff: number | null): boolean {
  return diff !== null && Math.abs(diff) >= DIFF_WARN_THRESHOLD;
}
