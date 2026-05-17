import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { logAudit } from './audit';
import type { Kassenbewegung, Protokoll, Schicht } from './types';

export interface FullProtokoll {
  protokoll: Protokoll;
  schichten: Schicht[];
  bewegungen: Kassenbewegung[];
}

const protokollKey = (shopId: string, datum: string) =>
  ['protokoll', shopId, datum] as const;

/**
 * Lädt das Protokoll für einen Shop + Datum (oder null wenn nicht existiert).
 */
export function useProtokoll(shopId: string, datum: string) {
  return useQuery({
    queryKey: protokollKey(shopId, datum),
    queryFn: async (): Promise<FullProtokoll | null> => {
      // Ein Roundtrip: Protokoll mit verschachtelten Schichten + Bewegungen
      const { data, error } = await supabase
        .from('protokolle')
        .select('*, schichten(*, kassenbewegungen(*))')
        .eq('shop_id', shopId)
        .eq('datum', datum)
        .limit(1);
      if (error) throw error;
      const row = data?.[0] as
        | (Protokoll & {
            schichten: (Schicht & { kassenbewegungen: Kassenbewegung[] })[];
          })
        | undefined;
      if (!row) return null;
      const schichten = row.schichten ?? [];
      const bewegungen = schichten.flatMap((s) => s.kassenbewegungen ?? []);
      return {
        protokoll: {
          id: row.id,
          shop_id: row.shop_id,
          datum: row.datum,
          erstellt_von: row.erstellt_von,
          erstellt_am: row.erstellt_am,
          aktualisiert_am: row.aktualisiert_am,
        },
        schichten: schichten
          .map((s) => {
            const { kassenbewegungen, ...rest } = s;
            void kassenbewegungen;
            return rest as Schicht;
          })
          .sort((a, b) => a.schicht_nr - b.schicht_nr),
        bewegungen,
      };
    },
    staleTime: 10_000,
  });
}

interface EnsureArgs {
  shopId: string;
  datum: string;
  erstelltVon: string;
}

/**
 * Sicherstellen, dass ein Protokoll existiert. Legt auch beide Schichten an.
 * Idempotent: wenn schon da, nichts ändern.
 */
export function useEnsureProtokoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shopId, datum, erstelltVon }: EnsureArgs) => {
      const { data: existing } = await supabase
        .from('protokolle')
        .select('id')
        .eq('shop_id', shopId)
        .eq('datum', datum)
        .maybeSingle();

      let protokollId: string;
      let wirklichNeu = false;
      if (existing) {
        protokollId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from('protokolle')
          .insert({
            shop_id: shopId,
            datum,
            erstellt_von: erstelltVon,
          })
          .select('id')
          .single();
        if (error) {
          // 23505 = unique_violation: ein zweites Geraet hat in der Zwischenzeit
          // dasselbe Protokoll angelegt. Re-Select und weiter, kein Fehler werfen.
          if ((error as { code?: string }).code === '23505') {
            const { data: again } = await supabase
              .from('protokolle')
              .select('id')
              .eq('shop_id', shopId)
              .eq('datum', datum)
              .single();
            if (!again) throw error;
            protokollId = again.id;
          } else {
            throw error;
          }
        } else {
          protokollId = created.id;
          wirklichNeu = true;
        }
      }
      if (wirklichNeu) {
        void logAudit({
          action: 'CREATE_PROTOKOLL',
          protoId: protokollId,
          newVal: `${shopId} ${datum}`,
        });
      }

      // Beide Schichten sicherstellen (idempotent via upsert auf unique key)
      const { error: sErr } = await supabase.from('schichten').upsert(
        [
          { protokoll_id: protokollId, schicht_nr: 1 },
          { protokoll_id: protokollId, schicht_nr: 2 },
        ],
        { onConflict: 'protokoll_id,schicht_nr', ignoreDuplicates: true },
      );
      if (sErr) throw sErr;

      return protokollId;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: protokollKey(vars.shopId, vars.datum) });
      // Auch alle Vortags-Queries dieses Shops invalidieren, damit Folge-Tage
      // den neuen Stand sehen, sobald hier ein IST eingetragen wird.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'vortag' &&
          q.queryKey[1] === vars.shopId,
      });
    },
  });
}

interface UpdateSchichtArgs {
  shopId: string;
  datum: string;
  schichtId: string;
  patch: Partial<Schicht>;
}

export function useUpdateSchicht() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ schichtId, patch }: UpdateSchichtArgs) => {
      const { error } = await supabase
        .from('schichten')
        .update(patch)
        .eq('id', schichtId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: protokollKey(vars.shopId, vars.datum) });
      // Wenn der IST aktualisiert wurde, muessen alle Vortags-Queries des
      // Shops neu auswerten, damit Folgetage die neue Zahl sehen.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'vortag' &&
          q.queryKey[1] === vars.shopId,
      });
    },
  });
}

interface DeleteArgs {
  shopId: string;
  datum: string;
  protokollId: string;
}

export function useDeleteProtokoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ protokollId }: DeleteArgs) => {
      const { error } = await supabase.from('protokolle').delete().eq('id', protokollId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: protokollKey(vars.shopId, vars.datum) });
      qc.invalidateQueries({ queryKey: ['protokoll-liste'] });
    },
  });
}

interface ReplaceBewegungenArgs {
  shopId: string;
  datum: string;
  schichtId: string;
  bewegungen: { typ: 'einlage' | 'entnahme'; beschreibung: string; betrag: number; reihenfolge: number }[];
}

/**
 * Fallback fuer das Ersetzen aller Bewegungen, wenn die RPC-Funktion
 * replace_kassenbewegungen noch nicht in der DB existiert. Insert-first,
 * dann Delete der alten — minimiert Datenverlust, aber nicht race-sicher.
 */
async function replaceBewegungenFallback(
  schichtId: string,
  bewegungen: ReplaceBewegungenArgs['bewegungen'],
): Promise<void> {
  if (bewegungen.length === 0) {
    const { error } = await supabase
      .from('kassenbewegungen')
      .delete()
      .eq('schicht_id', schichtId);
    if (error) throw error;
    return;
  }
  const { data: alteRows, error: selErr } = await supabase
    .from('kassenbewegungen')
    .select('id')
    .eq('schicht_id', schichtId);
  if (selErr) throw selErr;
  const alteIds = (alteRows ?? []).map((r) => r.id);
  const offset = 100000;
  const rows = bewegungen.map((b, i) => ({
    ...b,
    schicht_id: schichtId,
    reihenfolge: offset + i,
  }));
  const { error: insErr } = await supabase.from('kassenbewegungen').insert(rows);
  if (insErr) throw insErr;
  if (alteIds.length > 0) {
    const { error: delErr } = await supabase
      .from('kassenbewegungen')
      .delete()
      .in('id', alteIds);
    if (delErr) throw delErr;
  }
}

export function useReplaceBewegungen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ schichtId, bewegungen }: ReplaceBewegungenArgs) => {
      // Atomar via RPC (Postgres-Transaktion). Vorher wurde delete + insert
      // separat ausgefuehrt und konnte bei Race oder Verbindungsabbruch
      // Duplikate oder Datenverlust verursachen.
      const { error } = await supabase.rpc('replace_kassenbewegungen', {
        _schicht_id: schichtId,
        _bewegungen: bewegungen,
      });
      if (error) {
        // Falls die RPC nicht existiert (42883/PGRST202), kaputt definiert ist
        // (42704 undefined_object, 42703 undefined_column, P0001 raise) oder
        // sonst ein Schema-Fehler vorliegt, faellt der Save auf das alte
        // Insert-then-Delete-Verfahren zurueck, damit Eingaben NIE verloren gehen.
        const code = (error as { code?: string }).code;
        const fallbackCodes = ['42883', 'PGRST202', '42704', '42703', '42P01'];
        if (code && fallbackCodes.includes(code)) {
          console.warn('[replace_kassenbewegungen] RPC failed, falling back:', error);
          await replaceBewegungenFallback(schichtId, bewegungen);
          return;
        }
        throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: protokollKey(vars.shopId, vars.datum) });
      // Aufladungs-Saldo des Shops kann sich geaendert haben.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'aufladungen' &&
          q.queryKey[1] === vars.shopId,
      });
    },
  });
}

/**
 * Holt alle Kassenbewegungen eines Shops der letzten N Tage, fuer die
 * Aufladungs-Saldo-Berechnung.
 */
export function useAufladungBewegungen(shopId: string, dayCount = 180) {
  return useQuery({
    queryKey: ['aufladungen', shopId, dayCount],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dayCount);
      const cutoffIso = cutoff.toISOString().slice(0, 10);
      // Via security-definer-RPC: liefert nur typ/beschreibung/betrag/datum,
      // damit Mitarbeiter keine alten Protokolle einsehen koennen.
      const { data, error } = await supabase.rpc('get_aufladung_bewegungen', {
        _shop_id: shopId,
        _since: cutoffIso,
      });
      if (error) {
        // Fallback fuer den Fall, dass die Migration 0010 noch nicht in
        // der DB ist: alter Pfad via direkter Tabellen-Abfrage.
        const code = (error as { code?: string }).code;
        const fallbackCodes = ['42883', 'PGRST202', '42704', '42703', '42P01'];
        if (!code || !fallbackCodes.includes(code)) throw error;
        const { data: dRaw, error: e2 } = await supabase
          .from('protokolle')
          .select('datum, schichten(kassenbewegungen(typ, beschreibung, betrag))')
          .eq('shop_id', shopId)
          .gte('datum', cutoffIso)
          .order('datum', { ascending: true });
        if (e2) throw e2;
        const out: { typ: 'einlage' | 'entnahme'; beschreibung: string | null; betrag: number; datum: string }[] = [];
        for (const p of dRaw ?? []) {
          const datum = (p as { datum: string }).datum;
          const schichten = ((p as { schichten?: unknown }).schichten ?? []) as Array<{
            kassenbewegungen?: Array<{ typ: 'einlage' | 'entnahme'; beschreibung: string | null; betrag: number }>;
          }>;
          for (const s of schichten) {
            for (const b of s.kassenbewegungen ?? []) {
              out.push({ typ: b.typ, beschreibung: b.beschreibung, betrag: Number(b.betrag), datum });
            }
          }
        }
        return out;
      }
      return ((data ?? []) as Array<{ typ: 'einlage' | 'entnahme'; beschreibung: string | null; betrag: number | string; datum: string }>)
        .map((r) => ({ typ: r.typ, beschreibung: r.beschreibung, betrag: Number(r.betrag), datum: r.datum }));
    },
  });
}

/**
 * Liste aller Protokolle (Admin: alle, sonst nur heute via RLS).
 * Mit Schichten-Aggregat für Status-Anzeige.
 */
export function useProtokollListe() {
  return useQuery({
    queryKey: ['protokoll-liste'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('protokolle')
        .select('id, shop_id, datum, erstellt_am, schichten(schicht_nr, mitarbeiter_id, kassenstart, kassenist, kassenabrechnung, kassenstart_manuell, kassenstart_grund)')
        .order('datum', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        shop_id: string;
        datum: string;
        erstellt_am: string;
        schichten: {
          schicht_nr: number;
          mitarbeiter_id: string | null;
          kassenstart: number | null;
          kassenist: number | null;
          kassenabrechnung: number | null;
          kassenstart_manuell: boolean;
          kassenstart_grund: string | null;
        }[];
      }>;
    },
  });
}

/**
 * Findet IST-Wert der letzten Schicht dieses Shops vor `datum`.
 *
 * Vorgehen (zwei sehr simple Schritte):
 *  1. Hole bis zu 30 Protokolle dieses Shops, die VOR `datum` liegen,
 *     absteigend sortiert. Damit erfassen wir auch leere Platzhalter-Tage.
 *  2. Hole die zugehoerigen Schichten dieser Protokolle (alle auf einmal).
 *  3. Walke durch die Protokolle vom neuesten zum aeltesten:
 *     - innerhalb eines Tages: Schicht 2 vor Schicht 1 (spaetere wins)
 *     - sobald ein non-null kassenist gefunden ist -> return
 *  Damit werden Platzhalter-Tage ohne echte IST automatisch uebersprungen.
 */
export function useVortagKasse(shopId: string, datum: string) {
  return useQuery({
    queryKey: ['vortag', shopId, datum],
    queryFn: async (): Promise<{ datum: string; ist: number } | null> => {
      // Via security-definer-RPC: liefert nur datum + ist, nichts weiter.
      // Mitarbeiter kommen damit nicht an alte Schichten-Details ran.
      const { data, error } = await supabase.rpc('get_vortags_ist', {
        _shop_id: shopId,
        _before_date: datum,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        const fallbackCodes = ['42883', 'PGRST202', '42704', '42703', '42P01'];
        if (!code || !fallbackCodes.includes(code)) throw error;
        // Fallback (Migration noch nicht angewendet): alter Pfad
        const { data: protos, error: pErr } = await supabase
          .from('protokolle')
          .select('id, datum')
          .eq('shop_id', shopId)
          .lt('datum', datum)
          .order('datum', { ascending: false })
          .limit(30);
        if (pErr) throw pErr;
        if (!protos || protos.length === 0) return null;
        const protoIds = protos.map((p) => p.id);
        const { data: schichten, error: sErr } = await supabase
          .from('schichten')
          .select('protokoll_id, schicht_nr, kassenist')
          .in('protokoll_id', protoIds);
        if (sErr) throw sErr;
        const byProto = new Map<string, { schicht_nr: number; kassenist: number | null }[]>();
        for (const s of schichten ?? []) {
          const list = byProto.get(s.protokoll_id) ?? [];
          list.push({ schicht_nr: s.schicht_nr, kassenist: s.kassenist });
          byProto.set(s.protokoll_id, list);
        }
        for (const p of protos) {
          const list = byProto.get(p.id) ?? [];
          const sorted = [...list].sort((a, b) => b.schicht_nr - a.schicht_nr);
          const hit = sorted.find((s) => s.kassenist !== null && s.kassenist !== undefined);
          if (hit) {
            const raw = String(hit.kassenist).trim().replace(',', '.');
            const ist = parseFloat(raw);
            if (!Number.isFinite(ist)) continue;
            return { datum: p.datum, ist };
          }
        }
        return null;
      }
      const rows = (data ?? []) as Array<{ datum: string; ist: number | string }>;
      if (rows.length === 0) return null;
      const raw = String(rows[0].ist).trim().replace(',', '.');
      const ist = parseFloat(raw);
      if (!Number.isFinite(ist)) return null;
      return { datum: rows[0].datum, ist };
    },
  });
}
