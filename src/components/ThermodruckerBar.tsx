import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';

interface TerminalStatus {
  terminal_nr: number;
  letzter_tausch: string | null;
  letzter_von_profile_id: string | null;
  letzter_von_name: string | null;
  anzahl_letzte_30_tage: number;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'gestern';
  if (diffD < 14) return `vor ${diffD} T`;
  const diffW = Math.round(diffD / 7);
  if (diffW < 8) return `vor ${diffW} Wo`;
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function ThermodruckerBar() {
  const session = useAuth((s) => s.session);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['thermodrucker-status'],
    enabled: !!session,
    queryFn: async (): Promise<TerminalStatus[]> => {
      const { data, error } = await supabase.rpc('get_thermodrucker_status');
      if (error) throw error;
      return (data ?? []) as TerminalStatus[];
    },
    // alle 2 Min aktualisieren, falls jemand anders gerade was eintraegt
    refetchInterval: 2 * 60 * 1000,
  });

  const mut = useMutation({
    mutationFn: async (terminal_nr: number) => {
      if (!session) return;
      const { error } = await supabase.rpc('log_thermodrucker_tausch', {
        _profile_id: session.profile.id,
        _terminal_nr: terminal_nr,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thermodrucker-status'] });
    },
  });

  if (!session) return null;

  const list = data ?? [];

  return (
    <div
      className="border-b border-border-soft px-4 py-2 flex items-center gap-2 overflow-x-auto"
      style={{ background: '#0f0f0f' }}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap mr-2">
        🖨 Thermorollen
      </div>
      {isLoading && (
        <div className="text-xs text-muted">Lade …</div>
      )}
      <div className="flex gap-1.5">
        {list.map((t) => {
          const wann = t.letzter_tausch ? relTime(t.letzter_tausch) : '—';
          // Farbe je Alter: < 2 T grün, 2-5 T gelb, > 5 T rot, nie = grau
          let bg = '#1c1c1c';
          let border = '#2a2a2a';
          let text = '#888';
          if (t.letzter_tausch) {
            const diffD = (Date.now() - new Date(t.letzter_tausch).getTime()) / 86400000;
            if (diffD < 2) {
              bg = 'rgba(74,222,128,0.10)';
              border = 'rgba(74,222,128,0.35)';
              text = '#4ade80';
            } else if (diffD < 5) {
              bg = 'rgba(251,191,36,0.10)';
              border = 'rgba(251,191,36,0.35)';
              text = '#fbbf24';
            } else {
              bg = 'rgba(248,113,113,0.10)';
              border = 'rgba(248,113,113,0.35)';
              text = '#f87171';
            }
          }
          const tooltip = t.letzter_tausch
            ? `Zuletzt: ${new Date(t.letzter_tausch).toLocaleString('de-DE')} durch ${t.letzter_von_name ?? '?'}\n${t.anzahl_letzte_30_tage}× in den letzten 30 Tagen\n\nKlick = neue Rolle eingelegt`
            : 'Noch nie protokolliert.\nKlick = neue Rolle eingelegt';
          return (
            <button
              key={t.terminal_nr}
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Terminal ${t.terminal_nr}: neue Thermorolle eingelegt?`,
                  )
                ) {
                  mut.mutate(t.terminal_nr);
                }
              }}
              disabled={mut.isPending}
              title={tooltip}
              className="rounded-lg px-2.5 py-1 flex flex-col items-center transition-all hover:brightness-125 disabled:opacity-50 min-w-[64px]"
              style={{
                background: bg,
                border: `1px solid ${border}`,
                color: text,
              }}
            >
              <div className="text-sm font-bold leading-none">
                T{t.terminal_nr}
              </div>
              <div className="text-[10px] mono leading-tight mt-0.5">
                {wann}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
