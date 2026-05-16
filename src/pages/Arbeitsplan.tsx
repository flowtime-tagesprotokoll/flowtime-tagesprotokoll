import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useShops } from '../lib/queries';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { defaultHours, istGeschlossen, shopSchichten } from '../lib/shopConfig';

interface Eintrag {
  shop_id: string;
  datum: string;
  schicht_nr: number;
  eintrag: string | null;
}

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

function buildMonthDays(year: number, month: number): { datum: string; tag: number; wochentag: number }[] {
  const end = endOfMonth(year, month);
  const out: { datum: string; tag: number; wochentag: number }[] = [];
  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    const wt = (date.getDay() + 6) % 7; // 0=Montag, 6=Sonntag
    out.push({
      datum: `${year}-${pad2(month)}-${pad2(d)}`,
      tag: d,
      wochentag: wt,
    });
  }
  return out;
}

export function ArbeitsplanPage() {
  const session = useAuth((s) => s.session)!;
  const canEdit =
    session.kind === 'admin' || session.profile.darf_arbeitsplan === true;
  const { data: shops } = useShops();
  const [shopId, setShopId] = useState<string>('');
  const qc = useQueryClient();

  useEffect(() => {
    if (!shopId && shops && shops.length > 0) setShopId(shops[0].id);
  }, [shops, shopId]);

  const heute = todayISO();
  const [year, setYear] = useState(() => Number(heute.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(heute.slice(5, 7)));

  const monthDays = useMemo(() => buildMonthDays(year, month), [year, month]);
  const firstDayWeekday = monthDays[0]?.wochentag ?? 0;

  const { data: eintraege } = useQuery({
    queryKey: ['arbeitsplan', shopId, year, month],
    enabled: !!shopId,
    queryFn: async (): Promise<Eintrag[]> => {
      const start = `${year}-${pad2(month)}-01`;
      const end = endOfMonth(year, month);
      const endIso = `${year}-${pad2(month)}-${pad2(end.getDate())}`;
      const { data, error } = await supabase
        .from('arbeitsplaene')
        .select('shop_id, datum, schicht_nr, eintrag')
        .eq('shop_id', shopId)
        .gte('datum', start)
        .lte('datum', endIso);
      if (error) throw error;
      return (data ?? []) as Eintrag[];
    },
  });

  const eintragMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of eintraege ?? []) {
      m.set(`${e.datum}|${e.schicht_nr}`, e.eintrag ?? '');
    }
    return m;
  }, [eintraege]);

  const setEintragMut = useMutation({
    mutationFn: async (args: { datum: string; schicht_nr: number; eintrag: string }) => {
      const { error } = await supabase.rpc('set_arbeitsplan_eintrag', {
        _profile_id: session.profile.id,
        _shop_id: shopId,
        _datum: args.datum,
        _schicht_nr: args.schicht_nr,
        _eintrag: args.eintrag,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['arbeitsplan', shopId, year, month] });
    },
  });

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  // Tage in Wochen-Zeilen (jeweils 7 Spalten) gruppieren
  const wochen = useMemo(() => {
    const all: ({ datum: string; tag: number; wochentag: number } | null)[] = [];
    // Leading nulls fuer Wochentage vor dem 1.
    for (let i = 0; i < firstDayWeekday; i++) all.push(null);
    for (const d of monthDays) all.push(d);
    // Trailing nulls bis Wochenende
    while (all.length % 7 !== 0) all.push(null);
    const w: (typeof all)[] = [];
    for (let i = 0; i < all.length; i += 7) w.push(all.slice(i, i + 7));
    return w;
  }, [monthDays, firstDayWeekday]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">📅 Arbeitsplan</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {(shops ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setShopId(s.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
                style={
                  shopId === s.id
                    ? {
                        background: 'rgba(212,255,0,0.12)',
                        border: '1px solid rgba(212,255,0,0.5)',
                        color: '#d4ff00',
                      }
                    : {
                        background: '#1c1c1c',
                        border: '1px solid #2a2a2a',
                        color: '#888',
                      }
                }
              >
                {s.kurz} · {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevMonth} className="btn-ghost px-3 py-1.5 text-sm">
              ← Vor. Monat
            </button>
            <div className="text-base font-bold mono px-3">
              {MONATSNAMEN[month - 1]} {year}
            </div>
            <button type="button" onClick={nextMonth} className="btn-ghost px-3 py-1.5 text-sm">
              Nächster Monat →
            </button>
            <button
              type="button"
              onClick={() => {
                setYear(Number(heute.slice(0, 4)));
                setMonth(Number(heute.slice(5, 7)));
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Heute
            </button>
          </div>
          {!canEdit && (
            <div className="text-xs text-muted">
              👁 Nur-Lese-Modus — Bearbeitung über Admin oder Schichtleiter.
            </div>
          )}
        </div>

        {setEintragMut.isError && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            Speichern fehlgeschlagen:{' '}
            {(setEintragMut.error as Error)?.message ?? 'unbekannter Fehler'}
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
            {WOCHENTAGE.map((wt, i) => (
              <div
                key={wt}
                className="px-2 py-2 text-center"
                style={{
                  borderRight: i < 6 ? '1px solid #1f1f1f' : 'none',
                  color: i >= 5 ? '#fbbf24' : undefined,
                }}
              >
                {wt}
              </div>
            ))}
          </div>

          {wochen.map((woche, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7"
              style={{ borderTop: '1px solid #1f1f1f' }}
            >
              {woche.map((d, di) => {
                if (!d) {
                  return (
                    <div
                      key={di}
                      style={{
                        background: '#0a0a0a',
                        borderRight: di < 6 ? '1px solid #1f1f1f' : 'none',
                      }}
                    />
                  );
                }
                const isToday = d.datum === heute;
                const istWeekend = d.wochentag >= 5;
                const shop = shops?.find((s) => s.id === shopId);
                const shopKurz = shop?.kurz ?? '';
                const schichten = shopSchichten(shopKurz);
                const hours = defaultHours(shopKurz, d.wochentag);
                const geschlossen = istGeschlossen(d.datum);
                return (
                  <DayCell
                    key={di}
                    datum={d.datum}
                    tag={d.tag}
                    weekend={istWeekend}
                    isToday={isToday}
                    canEdit={canEdit}
                    schichten={schichten}
                    geschlossen={geschlossen}
                    hours={hours}
                    s1={eintragMap.get(`${d.datum}|1`) ?? ''}
                    s2={eintragMap.get(`${d.datum}|2`) ?? ''}
                    rightBorder={di < 6}
                    onSave={(schicht_nr, eintrag) =>
                      setEintragMut.mutate({ datum: d.datum, schicht_nr, eintrag })
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-[11px] text-muted">
          Frühschicht oben, Spätschicht unten. Anfangsbuchstabe reicht (z.B. „E" für Erdem).
          {canEdit ? (
            <> Eintragung wird automatisch beim Verlassen des Felds gespeichert.</>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}

interface DayCellProps {
  datum: string;
  tag: number;
  weekend: boolean;
  isToday: boolean;
  canEdit: boolean;
  schichten: 1 | 2;
  geschlossen: boolean;
  hours: { von: string; bis: string } | null;
  s1: string;
  s2: string;
  rightBorder: boolean;
  onSave: (schicht_nr: number, eintrag: string) => void;
}

function DayCell({
  datum: _datum,
  tag,
  weekend,
  isToday,
  canEdit,
  schichten,
  geschlossen,
  hours,
  s1,
  s2,
  rightBorder,
  onSave,
}: DayCellProps) {
  const [val1, setVal1] = useState(s1);
  const [val2, setVal2] = useState(s2);

  useEffect(() => {
    setVal1(s1);
  }, [s1]);
  useEffect(() => {
    setVal2(s2);
  }, [s2]);

  function commit(schicht_nr: number, current: string, original: string) {
    if (current === original) return;
    onSave(schicht_nr, current);
  }

  return (
    <div
      style={{
        borderRight: rightBorder ? '1px solid #1f1f1f' : 'none',
        background: geschlossen
          ? 'rgba(248,113,113,0.04)'
          : isToday
            ? 'rgba(212,255,0,0.05)'
            : weekend
              ? 'rgba(251,191,36,0.04)'
              : '#141414',
        minHeight: 84,
      }}
    >
      <div
        className="px-2 py-1 text-[11px] font-bold mono flex items-center justify-between gap-1"
        style={{
          color: geschlossen ? '#f87171' : isToday ? '#d4ff00' : weekend ? '#fbbf24' : '#888',
          borderBottom: '1px solid #1f1f1f',
        }}
      >
        <span>{tag}.</span>
        {!geschlossen && hours && (
          <span
            className="text-[10px] font-normal mono"
            style={{ color: '#555' }}
            title={`Oeffnungszeit ${hours.von}–${hours.bis}`}
          >
            {hours.von}–{hours.bis}
          </span>
        )}
      </div>
      {geschlossen ? (
        <div
          className="px-2 py-3 text-center text-[12px] font-bold uppercase tracking-wider"
          style={{ color: '#f87171' }}
        >
          Geschlossen
        </div>
      ) : (
        <div className="px-1.5 py-1 space-y-1">
          {canEdit ? (
            <>
              <input
                type="text"
                value={val1}
                onChange={(e) => setVal1(e.target.value)}
                onBlur={() => commit(1, val1, s1)}
                placeholder={schichten === 1 ? 'Schicht' : 'Früh'}
                maxLength={40}
                className="w-full px-2 py-1 text-[13px] mono rounded"
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  color: '#f5f5f5',
                }}
              />
              {schichten === 2 && (
                <input
                  type="text"
                  value={val2}
                  onChange={(e) => setVal2(e.target.value)}
                  onBlur={() => commit(2, val2, s2)}
                  placeholder="Spät"
                  maxLength={40}
                  className="w-full px-2 py-1 text-[13px] mono rounded"
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    color: '#f5f5f5',
                  }}
                />
              )}
            </>
          ) : (
            <>
              <div
                className="px-2 py-1 text-[13px] mono rounded min-h-[26px]"
                style={{ background: '#0a0a0a', color: '#f5f5f5' }}
              >
                {s1 || <span style={{ color: '#444' }}>—</span>}
              </div>
              {schichten === 2 && (
                <div
                  className="px-2 py-1 text-[13px] mono rounded min-h-[26px]"
                  style={{ background: '#0a0a0a', color: '#f5f5f5' }}
                >
                  {s2 || <span style={{ color: '#444' }}>—</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
