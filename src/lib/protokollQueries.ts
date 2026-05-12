import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
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
        if (error) throw error;
        protokollId = created.id;
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

export function useReplaceBewegungen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ schichtId, bewegungen }: ReplaceBewegungenArgs) => {
      const { error: delErr } = await supabase
        .from('kassenbewegungen')
        .delete()
        .eq('schicht_id', schichtId);
      if (delErr) throw delErr;
      if (bewegungen.length === 0) return;
      const rows = bewegungen.map((b) => ({ ...b, schicht_id: schichtId }));
      const { error: insErr } = await supabase.from('kassenbewegungen').insert(rows);
      if (insErr) throw insErr;
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
      const { data, error } = await supabase
        .from('protokolle')
        .select('datum, schichten(kassenbewegungen(typ, beschreibung, betrag))')
        .eq('shop_id', shopId)
        .gte('datum', cutoffIso)
        .order('datum', { ascending: true });
      if (error) throw error;
      const out: { typ: 'einlage' | 'entnahme'; beschreibung: string | null; betrag: number; datum: string }[] = [];
      for (const p of data ?? []) {
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

      // Schichten pro Protokoll gruppieren
      const byProto = new Map<string, { schicht_nr: number; kassenist: number | null }[]>();
      for (const s of schichten ?? []) {
        const list = byProto.get(s.protokoll_id) ?? [];
        list.push({ schicht_nr: s.schicht_nr, kassenist: s.kassenist });
        byProto.set(s.protokoll_id, list);
      }

      // Vom neuesten Protokoll abwaerts: spaeteste Schicht mit IST nehmen
      for (const p of protos) {
        const list = byProto.get(p.id) ?? [];
        const sorted = [...list].sort((a, b) => b.schicht_nr - a.schicht_nr);
        const hit = sorted.find((s) => s.kassenist !== null && s.kassenist !== undefined);
        if (hit) {
          return { datum: p.datum, ist: Number(hit.kassenist) };
        }
      }
      return null;
    },
  });
}
