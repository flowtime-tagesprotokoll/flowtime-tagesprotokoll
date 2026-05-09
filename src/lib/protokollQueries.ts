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
 * Geht systematisch zurueck, ueberspringt Tage ohne IST (z.B. leere
 * vom Admin angelegte Platzhalter), nimmt aus dem gefundenen Tag die
 * spaeteste Schicht mit IST (Schicht 2 bevorzugt, sonst Schicht 1).
 */
export function useVortagKasse(shopId: string, datum: string) {
  return useQuery({
    queryKey: ['vortag', shopId, datum],
    queryFn: async (): Promise<{ datum: string; ist: number } | null> => {
      // JOIN ueber protokolle holt direkt nur Schichten mit nicht-NULL IST.
      const { data, error } = await supabase
        .from('schichten')
        .select('kassenist, schicht_nr, protokolle!inner(shop_id, datum)')
        .eq('protokolle.shop_id', shopId)
        .lt('protokolle.datum', datum)
        .not('kassenist', 'is', null)
        .order('datum', { ascending: false, foreignTable: 'protokolle' })
        .order('schicht_nr', { ascending: false })
        .limit(1);
      if (error) throw error;
      const raw = (data ?? [])[0] as unknown as
        | {
            kassenist: number;
            schicht_nr: number;
            protokolle: { datum: string } | { datum: string }[];
          }
        | undefined;
      if (!raw || raw.kassenist === null) return null;
      const proto = Array.isArray(raw.protokolle) ? raw.protokolle[0] : raw.protokolle;
      if (!proto) return null;
      return { datum: proto.datum, ist: Number(raw.kassenist) };
    },
  });
}
