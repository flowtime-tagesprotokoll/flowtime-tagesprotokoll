import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { PflichtSchulungGwPep } from './PflichtSchulungGwPep';

/**
 * Entscheidet, ob dem aktuellen Mitarbeiter das Pflicht-Schulungs-Modal
 * gezeigt wird. Regelwerk:
 *   - Pflichtphase: solange weniger als PFLICHT_ANZAHL Bestätigungen vorliegen,
 *     wird das Modal bei jedem Login zwangsweise gezeigt (nicht wegklickbar).
 *   - Danach: alle AUFFRISCH_TAGE Tage als Auffrisch-Modal (mit "später erinnern").
 *   - Admin: nie.
 */

const PFLICHT_ANZAHL = 5;
const AUFFRISCH_TAGE = 15;

interface Props {
  /** True wenn wir uns im Vorführ-Modus (Behörden-Vorzeige) befinden. */
  vorfuehr: boolean;
}

export function PflichtSchulungGate({ vorfuehr }: Props) {
  const session = useAuth((s) => s.session);
  const [spaeter, setSpaeter] = useState(false);

  const { data: bestaetigungen } = useQuery({
    queryKey: ['pflicht-schulung-gw-pep', session?.profile.id ?? null],
    enabled: !!session && session.kind === 'mitarbeiter' && !vorfuehr,
    queryFn: async (): Promise<Array<{ ts: string }>> => {
      if (!session) return [];
      const { data, error } = await supabase
        .from('audit_log')
        .select('ts')
        .eq('profile_id', session.profile.id)
        .eq('action', 'PFLICHT_SCHULUNG_GW_PEP_OK')
        .order('ts', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ ts: string }>;
    },
    staleTime: 60_000,
  });

  // Beim Session-Wechsel die "später"-Markierung zurücksetzen,
  // damit beim nächsten Login erneut gefragt wird.
  useEffect(() => {
    setSpaeter(false);
  }, [session?.profile.id]);

  if (!session || session.kind !== 'mitarbeiter' || vorfuehr) return null;
  if (!bestaetigungen) return null; // noch nicht geladen
  if (spaeter) return null;

  const anzahl = bestaetigungen.length;
  const inPflichtphase = anzahl < PFLICHT_ANZAHL;

  if (inPflichtphase) {
    return (
      <PflichtSchulungGwPep
        pflicht
        anzahl={anzahl}
        pflichtAnzahl={PFLICHT_ANZAHL}
        onBestaetigt={() => {
          // Nach Bestätigung schließt sich das Modal automatisch durch den
          // Query-Invalidate, der die neue Anzahl holt. Wenn immer noch unter
          // PFLICHT_ANZAHL, wird es direkt wieder angezeigt — der MA klickt
          // es also 5× hintereinander. So bleibt es im Kopf.
        }}
      />
    );
  }

  // Auffrisch-Phase: letzte Bestätigung älter als AUFFRISCH_TAGE?
  const letzte = bestaetigungen[0];
  if (!letzte) return null;
  const tageSeitLetzter =
    (Date.now() - new Date(letzte.ts).getTime()) / 86_400_000;
  if (tageSeitLetzter < AUFFRISCH_TAGE) return null;

  return (
    <PflichtSchulungGwPep
      pflicht={false}
      anzahl={anzahl}
      pflichtAnzahl={PFLICHT_ANZAHL}
      onBestaetigt={() => {
        // Query invalidiert sich selbst, Modal verschwindet.
      }}
      onSpaeter={() => setSpaeter(true)}
    />
  );
}
