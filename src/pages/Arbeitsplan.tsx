import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useProfiles, useShops } from '../lib/queries';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { defaultHours, farbeFuerEintrag, istGeschlossen, shopSchichten } from '../lib/shopConfig';
import { firstName } from '../lib/types';
import type { Profile } from '../lib/types';

interface Eintrag {
  shop_id: string;
  datum: string;
  schicht_nr: number;
  eintrag: string | null;
}

interface TagMeta {
  shop_id: string;
  datum: string;
  wechselzeit: string | null;
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
  const { data: profiles } = useProfiles();
  const mitarbeiterListe = useMemo(
    () => (profiles ?? []).filter((p) => p.aktiv && p.rolle !== 'admin' && !p.nur_verwaltung),
    [profiles],
  );

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

  const { data: tagMetas } = useQuery({
    queryKey: ['arbeitsplan-meta', shopId, year, month],
    enabled: !!shopId,
    queryFn: async (): Promise<TagMeta[]> => {
      const start = `${year}-${pad2(month)}-01`;
      const end = endOfMonth(year, month);
      const endIso = `${year}-${pad2(month)}-${pad2(end.getDate())}`;
      const { data, error } = await supabase
        .from('arbeitsplan_tag_meta')
        .select('shop_id, datum, wechselzeit')
        .eq('shop_id', shopId)
        .gte('datum', start)
        .lte('datum', endIso);
      if (error) throw error;
      return (data ?? []) as TagMeta[];
    },
  });

  const wechselzeitMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tagMetas ?? []) m.set(t.datum, t.wechselzeit ?? '');
    return m;
  }, [tagMetas]);

  const setWechselzeitMut = useMutation({
    mutationFn: async (args: { datum: string; wechselzeit: string }) => {
      const { error } = await supabase.rpc('set_arbeitsplan_wechselzeit', {
        _profile_id: session.profile.id,
        _shop_id: shopId,
        _datum: args.datum,
        _wechselzeit: args.wechselzeit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['arbeitsplan-meta', shopId, year, month] });
    },
  });

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

  // Stunden-Summen pro Mitarbeiter fuer den aktuellen Monat berechnen.
  const stundenSumme = useMemo(() => {
    const shop = shops?.find((s) => s.id === shopId);
    const shopKurz = shop?.kurz ?? '';
    const schichten = shopSchichten(shopKurz);
    const summe = new Map<string, number>(); // Vorname -> Stunden
    const ungenau = new Map<string, number>(); // Eintraege wie 'Soner ab 18:00'

    function addH(name: string, h: number, isFreeText = false) {
      if (!name) return;
      const cleaned = name.trim();
      const first = cleaned.split(/[\s,]+/)[0] ?? cleaned;
      const cap = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      if (isFreeText) {
        ungenau.set(cap, (ungenau.get(cap) ?? 0) + h);
      } else {
        summe.set(cap, (summe.get(cap) ?? 0) + h);
      }
    }
    function parseHHMM(s: string): number | null {
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      return Number(m[1]) + Number(m[2]) / 60;
    }
    function isPureName(s: string): boolean {
      // Nur Buchstaben, keine Zahlen, kein "ab", "von", "bis"
      return /^[A-Za-zäöüÄÖÜß-]+$/.test(s.trim());
    }

    for (const d of monthDays) {
      if (istGeschlossen(d.datum)) continue;
      const hrs = defaultHours(shopKurz, d.wochentag);
      if (!hrs) continue;
      const vonNum = parseHHMM(hrs.von) ?? 0;
      const bisNum = parseHHMM(hrs.bis) ?? 0;
      const tagesDauer = bisNum - vonNum;
      const s1 = eintragMap.get(`${d.datum}|1`)?.trim() ?? '';
      const s2 = eintragMap.get(`${d.datum}|2`)?.trim() ?? '';
      const wz = wechselzeitMap.get(d.datum)?.trim() || DEFAULT_WECHSELZEIT;
      const wzNum = parseHHMM(wz) ?? parseHHMM(DEFAULT_WECHSELZEIT) ?? 17;
      const frueh = Math.max(0, wzNum - vonNum);
      const spaet = Math.max(0, bisNum - wzNum);

      // Shop mit nur 1 Schicht: derjenige Name (egal welche Reihe gefuellt) -> ganzer Tag
      if (schichten === 1) {
        const name = s1 || s2;
        if (name) addH(name, tagesDauer, !isPureName(name));
        continue;
      }

      // 2-Schicht-Shop
      if (!s1 && !s2) continue;

      // Beide gleich -> EINE Person den ganzen Tag
      if (s1 && s2 && s1 === s2) {
        addH(s1, tagesDauer, !isPureName(s1));
        continue;
      }

      // Nur S1 gefuellt -> Person hat nur die Frueh-Haelfte gearbeitet
      if (s1 && !s2) {
        addH(s1, frueh, !isPureName(s1));
        continue;
      }
      // Nur S2 gefuellt -> Person hat nur die Spaet-Haelfte gearbeitet
      if (!s1 && s2) {
        addH(s2, spaet, !isPureName(s2));
        continue;
      }
      // Beide gefuellt, verschiedene Personen -> splitten
      addH(s1, frueh, !isPureName(s1));
      addH(s2, spaet, !isPureName(s2));
    }
    return { summe, ungenau };
  }, [shopId, shops, monthDays, eintragMap, wechselzeitMap]);

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 items-start">
        <div className="bg-surface/40 border border-border-soft rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 text-[11px] font-semibold uppercase tracking-widest">
            {WOCHENTAGE.map((wt, i) => (
              <div
                key={wt}
                className="px-2 py-2.5 text-center"
                style={{
                  color: '#888',
                  borderRight: i < 6 ? '7px solid #0a0a0a' : 'none',
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
              style={{
                borderTop:
                  wi === 0
                    ? '1px solid #1f1f1f'
                    : '14px solid #0a0a0a',
              }}
            >
              {woche.map((d, di) => {
                if (!d) {
                  return (
                    <div
                      key={di}
                      style={{
                        background: '#0a0a0a',
                        borderRight: di < 6 ? '7px solid #0a0a0a' : 'none',
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
                const baseline = defaultHours(shopKurz, 0); // Montag = Referenz
                let specialHoursLabel = '';
                if (hours && baseline) {
                  const vonDiff = hours.von !== baseline.von;
                  const bisDiff = hours.bis !== baseline.bis;
                  if (vonDiff && bisDiff) specialHoursLabel = `${hours.von}–${hours.bis}`;
                  else if (vonDiff) specialHoursLabel = `ab ${hours.von}`;
                  else if (bisDiff) specialHoursLabel = `bis ${hours.bis}`;
                }
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
                    specialHoursLabel={specialHoursLabel}
                    s1={eintragMap.get(`${d.datum}|1`) ?? ''}
                    s2={eintragMap.get(`${d.datum}|2`) ?? ''}
                    wechselzeit={wechselzeitMap.get(d.datum) ?? ''}
                    rightBorder={di < 6}
                    mitarbeiterListe={mitarbeiterListe}
                    onSave={(schicht_nr, eintrag) =>
                      setEintragMut.mutate({ datum: d.datum, schicht_nr, eintrag })
                    }
                    onSaveWechselzeit={(wz) =>
                      setWechselzeitMut.mutate({ datum: d.datum, wechselzeit: wz })
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>

        <StundenSidebar stunden={stundenSumme} mitarbeiterListe={mitarbeiterListe} />
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

interface StundenSidebarProps {
  stunden: { summe: Map<string, number>; ungenau: Map<string, number> };
  mitarbeiterListe: Profile[];
}

function StundenSidebar({ stunden, mitarbeiterListe }: StundenSidebarProps) {
  // Mitarbeiter mit Stunden absteigend sortieren
  const eintraege = useMemo(() => {
    const namen = new Set<string>([
      ...stunden.summe.keys(),
      ...stunden.ungenau.keys(),
      ...mitarbeiterListe.map((p) => firstName(p.name)),
    ]);
    return Array.from(namen)
      .map((n) => ({
        name: n,
        std: stunden.summe.get(n) ?? 0,
        unsicher: stunden.ungenau.get(n) ?? 0,
      }))
      .filter((e) => e.std > 0 || e.unsicher > 0)
      .sort((a, b) => b.std + b.unsicher - (a.std + a.unsicher));
  }, [stunden, mitarbeiterListe]);

  if (eintraege.length === 0) {
    return (
      <div className="bg-surface/40 border border-border-soft rounded-lg p-3 text-[11px] text-muted">
        Noch keine Eintraege fuer diesen Monat.
      </div>
    );
  }
  const total = eintraege.reduce((a, e) => a + e.std + e.unsicher, 0);
  return (
    <div className="bg-surface/40 border border-border-soft rounded-lg p-3 space-y-2 lg:sticky lg:top-2">
      <div className="text-[10px] mono uppercase tracking-wider text-muted">
        Stunden im Monat
      </div>
      <div className="space-y-1">
        {eintraege.map((e) => {
          const f = farbeFuerEintrag(e.name);
          const gesamt = e.std + e.unsicher;
          return (
            <div
              key={e.name}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
              style={{ borderLeft: `3px solid ${f?.text ?? '#888'}` }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: f?.text ?? '#e5e5e5' }}
              >
                {e.name}
              </span>
              <span
                className="mono text-sm tabular-nums"
                style={{ color: f?.text ?? '#e5e5e5' }}
                title={
                  e.unsicher > 0
                    ? `${e.std.toFixed(0)} h sicher + ${e.unsicher.toFixed(0)} h ungenau (Freitext)`
                    : undefined
                }
              >
                {gesamt.toFixed(0)} h
                {e.unsicher > 0 && (
                  <span className="text-[10px] ml-0.5 opacity-70">~</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="text-[10px] mono text-muted text-right pt-1.5"
        style={{ borderTop: '1px solid #232323' }}
      >
        Gesamt {total.toFixed(0)} h
      </div>
    </div>
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
  /** Wird nur angezeigt wenn die Oeffnungszeit von der Montag-Baseline abweicht. */
  specialHoursLabel: string;
  s1: string;
  s2: string;
  wechselzeit: string;
  rightBorder: boolean;
  mitarbeiterListe: Profile[];
  onSave: (schicht_nr: number, eintrag: string) => void;
  onSaveWechselzeit: (wz: string) => void;
}

function DayCell({
  datum,
  tag,
  weekend: _weekend,
  isToday,
  canEdit,
  schichten,
  geschlossen,
  hours: _hours,
  specialHoursLabel,
  s1,
  s2,
  wechselzeit,
  rightBorder,
  mitarbeiterListe,
  onSave,
  onSaveWechselzeit,
}: DayCellProps) {
  // Datum als kurze Form "Mi · 14.05."
  const wtNamen = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const date = new Date(datum + 'T00:00:00');
  const wt = (date.getDay() + 6) % 7;
  const datumKurz = `${wtNamen[wt]} ${tag}.${pad2(Number(datum.slice(5, 7)))}.`;

  // Akzent-Linie links: heute lime, geschlossen rot, sonst nichts
  const akzentLinks = isToday
    ? '#d4ff00'
    : geschlossen
      ? '#a85555'
      : 'transparent';

  return (
    <div
      style={{
        borderRight: rightBorder ? '7px solid #0a0a0a' : 'none',
        borderLeft: `3px solid ${akzentLinks}`,
        background: isToday ? 'rgba(212,255,0,0.025)' : '#131313',
        minHeight: 92,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="px-2 pt-1.5 pb-1 flex items-baseline justify-between gap-1 select-none mono"
        style={{
          color: isToday
            ? '#d4ff00'
            : geschlossen
              ? '#a85555'
              : '#bdbdbd',
        }}
      >
        <span className="text-[14px] font-semibold tracking-tight">{datumKurz}</span>
        {!geschlossen && specialHoursLabel && (
          <span
            className="text-[10px]"
            style={{ color: isToday ? '#88a800' : '#888' }}
            title="Abweichende Öffnungszeit"
          >
            {specialHoursLabel}
          </span>
        )}
      </div>
      {geschlossen ? (
        <div
          className="flex-1 flex items-center justify-center text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: '#a85555' }}
        >
          Geschlossen
        </div>
      ) : (
        <DayBody
          datum={datum}
          schichten={schichten}
          canEdit={canEdit}
          s1={s1}
          s2={s2}
          wechselzeit={wechselzeit}
          mitarbeiterListe={mitarbeiterListe}
          onSave={onSave}
          onSaveWechselzeit={onSaveWechselzeit}
        />
      )}
    </div>
  );
}

interface DayBodyProps {
  datum: string;
  schichten: 1 | 2;
  canEdit: boolean;
  s1: string;
  s2: string;
  wechselzeit: string;
  mitarbeiterListe: Profile[];
  onSave: (schicht_nr: number, eintrag: string) => void;
  onSaveWechselzeit: (wz: string) => void;
}

const DEFAULT_WECHSELZEIT = '17:00';

function DayBody({
  datum,
  schichten,
  canEdit,
  s1,
  s2,
  wechselzeit,
  mitarbeiterListe,
  onSave,
  onSaveWechselzeit,
}: DayBodyProps) {
  // Falls beide Schichten denselben Eintrag haben (oder es nur 1 Schicht gibt),
  // visuell als EIN durchgehender Eintrag rendern. Wenn s1 leer und s2 nicht
  // (oder umgekehrt) auch als ein Eintrag — die andere wird als "der ganze
  // Tag macht eine Person" gezeigt.
  const same =
    schichten === 1 ||
    (s1.trim() && s2.trim() && s1.trim() === s2.trim()) ||
    (!s1.trim() && !s2.trim());

  if (same) {
    const value = s1.trim() || s2.trim();
    return (
      <div className="flex-1 flex flex-col">
        <NamePicker
          value={value}
          onChange={(v) => {
            onSave(1, v);
            if (schichten === 2) onSave(2, v);
          }}
          placeholder="—"
          canEdit={canEdit}
          mitarbeiterListe={mitarbeiterListe}
          datum={datum}
          schichtLabel="Ganztags"
          variant="full"
          onSplit={
            schichten === 2 && value
              ? () => onSave(2, '') // S2 leeren -> Zelle rendert als geteilt
              : undefined
          }
        />
      </div>
    );
  }

  // Geteilte Schicht: zwei Hälften, dazwischen Wechselzeit
  return (
    <div className="flex-1 flex flex-col">
      <NamePicker
        value={s1}
        onChange={(v) => onSave(1, v)}
        placeholder="Früh"
        canEdit={canEdit}
        mitarbeiterListe={mitarbeiterListe}
        datum={datum}
        schichtLabel="Frühschicht"
        variant="half"
      />
      <WechselzeitField
        value={wechselzeit}
        canEdit={canEdit}
        onSave={onSaveWechselzeit}
      />
      <NamePicker
        value={s2}
        onChange={(v) => onSave(2, v)}
        placeholder="Spät"
        canEdit={canEdit}
        mitarbeiterListe={mitarbeiterListe}
        datum={datum}
        schichtLabel="Spätschicht"
        variant="half"
      />
    </div>
  );
}

interface WechselzeitFieldProps {
  value: string;
  canEdit: boolean;
  onSave: (wz: string) => void;
}

// Auswaehlbare Schichtwechsel-Stunden (nur volle Stunden)
const WECHSEL_STUNDEN = Array.from({ length: 17 }, (_, i) => {
  const h = 6 + i; // 06:00 ... 22:00
  return `${h.toString().padStart(2, '0')}:00`;
});

function WechselzeitField({ value, canEdit, onSave }: WechselzeitFieldProps) {
  // Wenn nichts in der DB steht, zeigen wir den Default (17:00) als Anzeige
  // ohne ihn aktiv zu speichern. Erst wenn der User editiert + abweicht,
  // wird gespeichert.
  const display = value.trim() || DEFAULT_WECHSELZEIT;
  if (!canEdit) {
    return (
      <div
        className="text-center text-[10px] mono py-0.5"
        style={{
          color: value ? '#c9a76b' : '#555',
          letterSpacing: '0.05em',
        }}
        title="Schichtwechsel-Uhrzeit"
      >
        {display}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <select
        value={display}
        onChange={(e) => {
          const next = e.target.value;
          const toSave = next === DEFAULT_WECHSELZEIT ? '' : next;
          if (toSave !== value.trim()) onSave(toSave);
        }}
        className="px-1 py-0 text-[10px] mono cursor-pointer text-center bg-transparent border-0 rounded"
        style={{
          color: value ? '#c9a76b' : '#666',
          letterSpacing: '0.05em',
        }}
        title="Schichtwechsel-Uhrzeit (Standard 17:00)"
      >
        {WECHSEL_STUNDEN.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

interface NamePickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  canEdit: boolean;
  mitarbeiterListe: Profile[];
  datum: string;
  schichtLabel: string;
  /** 'full' = ganze Tageszelle fuellen (Ganztags); 'half' = obere/untere Haelfte */
  variant: 'full' | 'half';
  /** Wenn gesetzt, zeigt der Picker einen 'Schicht teilen'-Button. */
  onSplit?: () => void;
}

function NamePicker({
  value,
  onChange,
  placeholder,
  canEdit,
  mitarbeiterListe,
  datum,
  schichtLabel,
  variant,
  onSplit,
}: NamePickerProps) {
  const [open, setOpen] = useState(false);
  const farbe = farbeFuerEintrag(value);

  // Sehr ruhige Darstellung: kein Border, kein Chip — die Hintergrundfarbe ist
  // ein dezenter Tint der Mitarbeiterfarbe; der Name selbst ist im jeweils
  // helleren Akzent geschrieben.
  const bg = value && farbe
    ? hexToRgba(farbe.text, variant === 'full' ? 0.08 : 0.07)
    : 'transparent';
  const textColor = value ? (farbe?.text ?? '#e5e5e5') : '#555';

  const baseCls =
    variant === 'full'
      ? 'flex-1 px-2 flex items-center justify-center text-center text-[15px] font-semibold tracking-wide'
      : 'flex-1 px-2 flex items-center justify-center text-center text-[13px] font-medium';
  const sharedStyle: React.CSSProperties = {
    background: bg,
    color: textColor,
  };

  if (!canEdit) {
    return (
      <div className={baseCls} style={sharedStyle} title={value || ''}>
        <span className="truncate">{value || ''}</span>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${baseCls} w-full transition-colors`}
        style={{
          ...sharedStyle,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = value && farbe
            ? hexToRgba(farbe.text, 0.14)
            : 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = bg;
        }}
        title={value || placeholder}
      >
        <span className="truncate w-full">
          {value || <span style={{ color: '#444' }}>{placeholder}</span>}
        </span>
      </button>
      {open && (
        <NamePickerDropdown
          current={value}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          mitarbeiterListe={mitarbeiterListe}
          datum={datum}
          schichtLabel={schichtLabel}
          onSplit={
            onSplit
              ? () => {
                  onSplit();
                  setOpen(false);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

// Hex (#rrggbb) -> rgba(r,g,b,alpha)
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface NamePickerDropdownProps {
  current: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  mitarbeiterListe: Profile[];
  datum: string;
  schichtLabel: string;
  onSplit?: () => void;
}

function NamePickerDropdown({
  current,
  onSelect,
  onClose,
  mitarbeiterListe,
  datum,
  schichtLabel,
  onSplit,
}: NamePickerDropdownProps) {
  const [custom, setCustom] = useState(current);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-3 w-full max-w-xs space-y-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-[11px] mono text-muted px-1">
          <span>{schichtLabel}</span>
          <span>{datum}</span>
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {mitarbeiterListe.map((p) => {
            const fn = firstName(p.name);
            const f = farbeFuerEintrag(fn);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(fn)}
                className="w-full px-3 py-2 rounded text-sm font-semibold text-left transition-all hover:brightness-125"
                style={{
                  background: f?.bg ?? '#1c1c1c',
                  border: `1px solid ${f?.border ?? '#2a2a2a'}`,
                  color: f?.text ?? '#f5f5f5',
                }}
              >
                {fn}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border-soft pt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Eigener Eintrag
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={40}
              placeholder="z.B. Soner ab 18:00"
              className="field-input text-xs flex-1"
            />
            <button
              type="button"
              onClick={() => onSelect(custom)}
              className="btn-primary text-xs px-3"
            >
              OK
            </button>
          </div>
        </div>

        {onSplit && (
          <button
            type="button"
            onClick={onSplit}
            className="w-full text-[11px] py-1.5 rounded transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #2a2a2a',
              color: '#bdbdbd',
            }}
            title="Aus der Ganztags-Schicht zwei verschiedene Schichten machen"
          >
            ↕ Schicht teilen (Spätschicht separat eintragen)
          </button>
        )}

        <div className="flex justify-between items-center pt-1 border-t border-border-soft">
          <button
            type="button"
            onClick={() => onSelect('')}
            className="text-[11px] text-minus hover:underline px-2 py-1"
          >
            × leeren
          </button>
          <button type="button" onClick={onClose} className="text-[11px] text-muted hover:text-text px-2 py-1">
            abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
