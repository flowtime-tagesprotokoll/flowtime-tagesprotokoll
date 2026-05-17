import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import {
  ZERTIFIKAT_TYPEN,
  statusFor,
  type Zertifikat,
} from '../lib/zertifikate';
import { heuteBerlinISO } from '../lib/calc';

/**
 * Zeigt einen Banner, falls dem aktuell eingeloggten Mitarbeiter ein
 * Zertifikat bald ablaeuft, abgelaufen ist oder noch gar nicht hinterlegt
 * wurde. Wird in Layout direkt unter dem Header gerendert.
 */
export function ZertifikateBanner() {
  const session = useAuth((s) => s.session);
  const profileId = session?.profile.id;

  const { data: zertifikate } = useQuery({
    queryKey: ['zertifikate-me', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Zertifikat[]> => {
      const { data, error } = await supabase
        .from('zertifikate')
        .select('*')
        .eq('profile_id', profileId);
      if (error) throw error;
      return (data ?? []) as Zertifikat[];
    },
  });

  if (!session) return null;
  const heute = heuteBerlinISO();
  const probleme = ZERTIFIKAT_TYPEN.map((t) => {
    const st = statusFor(zertifikate ?? [], t.key, heute);
    return { typInfo: t, st };
  }).filter(
    (x) => x.st.status === 'rot' || x.st.status === 'gelb' || x.st.status === 'grau',
  );
  if (probleme.length === 0) return null;

  const rot = probleme.filter((p) => p.st.status === 'rot');
  const gelb = probleme.filter((p) => p.st.status === 'gelb');
  const grau = probleme.filter((p) => p.st.status === 'grau');

  const farbe = rot.length > 0 ? 'rot' : gelb.length > 0 ? 'gelb' : 'grau';
  const style =
    farbe === 'rot'
      ? { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.45)', text: '#fca5a5' }
      : farbe === 'gelb'
        ? { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.45)', text: '#fcd34d' }
        : { bg: 'rgba(255,255,255,0.04)', border: '#2a2a2a', text: '#bdbdbd' };

  const teile: string[] = [];
  for (const p of rot) {
    teile.push(`${p.typInfo.kurz} ist seit ${-p.st.tageBisAblauf!} Tagen abgelaufen`);
  }
  for (const p of gelb) {
    teile.push(`${p.typInfo.kurz} läuft in ${p.st.tageBisAblauf} Tagen ab`);
  }
  for (const p of grau) {
    teile.push(`${p.typInfo.kurz} noch nicht hinterlegt`);
  }
  const text = teile.join(' · ');

  return (
    <div
      className="px-4 py-2 text-xs flex items-center justify-center gap-3 flex-wrap"
      style={{
        background: style.bg,
        borderBottom: `1px solid ${style.border}`,
        color: style.text,
      }}
    >
      <span className="font-semibold">📜</span>
      <span>{text}</span>
      <Link
        to="/zertifikate"
        className="underline font-semibold hover:opacity-80"
      >
        Übersicht
      </Link>
    </div>
  );
}
