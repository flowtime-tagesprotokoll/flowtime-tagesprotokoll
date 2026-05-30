import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { firstName } from '../lib/types';

interface TerminalStatus {
  terminal_nr: number;
  letzter_tausch: string | null;
  letzter_von_profile_id: string | null;
  letzter_von_name: string | null;
  anzahl_letzte_30_tage: number;
}

// localStorage-Key fuer die Shop-Zuordnung dieses Kassen-PCs.
// Werte: 'MGR' (Markgrafstr., zeigt Bar) | 'STÖ' (versteckt Bar).
// Default: 'MGR' -- die Mehrheit der PCs steht in MGR.
const STORAGE_KEY = 'flowtime_pc_shop';

function readPcShop(): 'MGR' | 'STÖ' {
  if (typeof window === 'undefined') return 'MGR';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'STÖ' ? 'STÖ' : 'MGR';
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

interface Farbe {
  bg: string;
  border: string;
  text: string;
  emoji: string;
  label: string;
}

function farbeFuer(iso: string | null): Farbe {
  if (!iso) {
    return {
      bg: '#1c1c1c',
      border: '#2a2a2a',
      text: '#888',
      emoji: '⚪',
      label: 'noch nie',
    };
  }
  const diffD = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (diffD < 2) {
    return {
      bg: 'rgba(74,222,128,0.10)',
      border: 'rgba(74,222,128,0.40)',
      text: '#4ade80',
      emoji: '🟢',
      label: 'frisch (<2 T)',
    };
  }
  if (diffD < 5) {
    return {
      bg: 'rgba(251,191,36,0.10)',
      border: 'rgba(251,191,36,0.40)',
      text: '#fbbf24',
      emoji: '🟡',
      label: 'noch ok (2–5 T)',
    };
  }
  return {
    bg: 'rgba(248,113,113,0.10)',
    border: 'rgba(248,113,113,0.40)',
    text: '#f87171',
    emoji: '🔴',
    label: 'bald fällig (>5 T)',
  };
}

export function ThermodruckerBar() {
  const session = useAuth((s) => s.session);
  const qc = useQueryClient();
  const [pcShop, setPcShop] = useState<'MGR' | 'STÖ'>(readPcShop);
  const [zeigeHilfe, setZeigeHilfe] = useState(false);
  const [zeigeSettings, setZeigeSettings] = useState(false);
  const [letzterClick, setLetzterClick] = useState<{
    log_id: number;
    nr: number;
    bis: number;
  } | null>(null);

  // Bei Aenderung der PC-Shop-Einstellung speichern.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, pcShop);
    }
  }, [pcShop]);

  const { data, isLoading } = useQuery({
    queryKey: ['thermodrucker-status'],
    enabled: !!session && pcShop === 'MGR',
    queryFn: async (): Promise<TerminalStatus[]> => {
      const { data, error } = await supabase.rpc('get_thermodrucker_status');
      if (error) throw error;
      return (data ?? []) as TerminalStatus[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const mut = useMutation({
    mutationFn: async (terminal_nr: number) => {
      if (!session) return null;
      const { data, error } = await supabase.rpc('log_thermodrucker_tausch', {
        _profile_id: session.profile.id,
        _terminal_nr: terminal_nr,
      });
      if (error) throw error;
      return { log_id: data as number, nr: terminal_nr };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['thermodrucker-status'] });
      if (res) {
        // Undo-Fenster: 30 Sek "Versehentlich? Zurueck"
        setLetzterClick({
          log_id: res.log_id,
          nr: res.nr,
          bis: Date.now() + 30_000,
        });
      }
    },
  });

  const undoMut = useMutation({
    mutationFn: async (log_id: number) => {
      const { error } = await supabase
        .from('thermodrucker_log')
        .delete()
        .eq('id', log_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thermodrucker-status'] });
      setLetzterClick(null);
    },
  });

  // Undo-Fenster nach 30 s zumachen
  useEffect(() => {
    if (!letzterClick) return;
    const t = setTimeout(() => setLetzterClick(null), letzterClick.bis - Date.now());
    return () => clearTimeout(t);
  }, [letzterClick]);

  const heuteCount = useMemo(() => {
    if (!data) return 0;
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    return data.filter(
      (t) => t.letzter_tausch && new Date(t.letzter_tausch).getTime() >= heute.getTime(),
    ).length;
  }, [data]);

  if (!session) return null;

  // Wenn der PC als STÖ konfiguriert ist: nur ein Mini-Indikator, ueber den
  // man im Notfall die Einstellung zurueckholen kann.
  if (pcShop === 'STÖ') {
    if (!zeigeSettings) {
      return (
        <div
          className="border-b border-border-soft px-4 py-1 text-[10px] text-muted text-right"
          style={{ background: '#0a0a0a' }}
        >
          <button
            type="button"
            onClick={() => setZeigeSettings(true)}
            className="hover:text-accent"
            title="PC-Shop-Einstellung ändern"
          >
            ⚙ Dieser PC: Stöckener Str. (kein Thermodrucker-Tracking)
          </button>
        </div>
      );
    }
    return (
      <SettingsBar pcShop={pcShop} setPcShop={setPcShop} onClose={() => setZeigeSettings(false)} />
    );
  }

  const list = data ?? [];

  return (
    <div
      className="border-b border-border-soft"
      style={{ background: '#0f0f0f' }}
    >
      <div className="px-3 py-2 flex items-start gap-3 overflow-x-auto">
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
            🖨 Thermorollen<br />
            <span className="text-[9px] normal-case tracking-normal">Markgrafstr.</span>
          </div>
          <button
            type="button"
            onClick={() => setZeigeHilfe((b) => !b)}
            className="text-muted hover:text-accent text-xs ml-1"
            title="Erklärung anzeigen"
          >
            ⓘ
          </button>
          <button
            type="button"
            onClick={() => setZeigeSettings(true)}
            className="text-muted hover:text-accent text-xs"
            title="PC-Shop-Einstellung"
          >
            ⚙
          </button>
        </div>

        {isLoading && <div className="text-xs text-muted">Lade …</div>}

        <div className="flex gap-1.5 flex-wrap">
          {list.map((t) => {
            const wann = t.letzter_tausch ? relTime(t.letzter_tausch) : '—';
            const f = farbeFuer(t.letzter_tausch);
            const wer = t.letzter_von_name ? firstName(t.letzter_von_name) : null;
            const tooltip = t.letzter_tausch
              ? `Terminal ${t.terminal_nr}\nZuletzt: ${new Date(t.letzter_tausch).toLocaleString('de-DE')}` +
                (wer ? ` durch ${wer}` : '') +
                `\n${t.anzahl_letzte_30_tage}× in den letzten 30 Tagen\n\nKlick = ich habe gerade eine neue Rolle eingelegt`
              : `Terminal ${t.terminal_nr}\nNoch nie protokolliert.\n\nKlick = ich habe gerade eine neue Rolle eingelegt`;
            return (
              <button
                key={t.terminal_nr}
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Terminal ${t.terminal_nr}: Hast du gerade eine neue Thermorolle eingelegt?`,
                    )
                  ) {
                    mut.mutate(t.terminal_nr);
                  }
                }}
                disabled={mut.isPending}
                title={tooltip}
                className="rounded px-1.5 py-0.5 flex flex-col items-center transition-all hover:brightness-125 disabled:opacity-50 min-w-[52px]"
                style={{
                  background: f.bg,
                  border: `1px solid ${f.border}`,
                  color: f.text,
                }}
              >
                <div className="text-[12px] font-bold leading-none">
                  T{t.terminal_nr}
                </div>
                <div className="text-[9px] mono leading-tight mt-0.5">{wann}</div>
                {t.anzahl_letzte_30_tage > 0 && (
                  <div className="text-[8px] mono opacity-70 leading-none">
                    {t.anzahl_letzte_30_tage}× / 30 T
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-shrink-0 text-[10px] text-muted ml-auto self-center text-right hidden md:block">
          {heuteCount > 0 && (
            <div className="text-accent font-semibold">
              Heute schon {heuteCount}× getauscht
            </div>
          )}
          {letzterClick && (
            <button
              type="button"
              onClick={() => undoMut.mutate(letzterClick.log_id)}
              disabled={undoMut.isPending}
              className="underline hover:text-minus mt-0.5"
              title="Versehentlich geklickt? Eintrag innerhalb 30 Sekunden zurücknehmen."
            >
              ↩ T{letzterClick.nr}-Eintrag zurücknehmen
            </button>
          )}
        </div>
      </div>

      {zeigeHilfe && (
        <div
          className="px-3 pb-2.5 text-[11px] text-muted space-y-1"
          style={{ background: '#0f0f0f', borderTop: '1px dashed #1f1f1f' }}
        >
          <div>
            <strong className="text-text">Was tun?</strong> Sobald du eine neue
            Thermorolle in einen der Terminals (T1–T8) eingelegt hast, klick
            einmal auf den passenden Button. So weiß jeder, wann zuletzt
            gewechselt wurde — und du musst nicht raten, ob bald wieder eine
            fällig ist.
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <FarbLegende emoji="🟢" text="Grün · &lt;2 Tage her" />
            <FarbLegende emoji="🟡" text="Gelb · 2–5 Tage her" />
            <FarbLegende emoji="🔴" text="Rot · &gt;5 Tage — bald fällig" />
            <FarbLegende emoji="⚪" text="Grau · noch nie geklickt" />
          </div>
          <div className="text-[10px] opacity-80 pt-1">
            Versehentlich geklickt? Innerhalb von 30 Sekunden gibt's rechts oben
            den Link „Eintrag zurücknehmen". Die Zahl „X× / 30 T" zeigt, wie
            oft die Rolle dieses Terminals in den letzten 30 Tagen gewechselt
            wurde — gut zum Nachbestellen abschätzen.
          </div>
        </div>
      )}

      {zeigeSettings && (
        <SettingsBar pcShop={pcShop} setPcShop={setPcShop} onClose={() => setZeigeSettings(false)} />
      )}
    </div>
  );
}

function FarbLegende({ emoji, text }: { emoji: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{emoji}</span>
      <span dangerouslySetInnerHTML={{ __html: text }} />
    </span>
  );
}

function SettingsBar({
  pcShop,
  setPcShop,
  onClose,
}: {
  pcShop: 'MGR' | 'STÖ';
  setPcShop: (v: 'MGR' | 'STÖ') => void;
  onClose: () => void;
}) {
  return (
    <div
      className="px-3 py-2 text-xs flex items-center gap-3 flex-wrap border-t border-border-soft"
      style={{ background: '#0f0f0f' }}
    >
      <span className="text-muted">⚙ Auf welchem Kassen-PC läuft die App?</span>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          checked={pcShop === 'MGR'}
          onChange={() => setPcShop('MGR')}
        />
        Markgrafstr. (mit Thermorollen-Buttons)
      </label>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          checked={pcShop === 'STÖ'}
          onChange={() => setPcShop('STÖ')}
        />
        Stöckener Str. (Buttons ausblenden)
      </label>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-muted hover:text-text"
      >
        ✕ schließen
      </button>
    </div>
  );
}
