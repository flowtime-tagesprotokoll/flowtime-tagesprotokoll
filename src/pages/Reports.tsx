import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';
import { useProfiles, useShops } from '../lib/queries';
import {
  calcShift,
  calcStunden,
  formatEur,
  formatStunden,
} from '../lib/calc';
import { firstName } from '../lib/types';
import type { AuditEntry, Kassenbewegung, Schicht } from '../lib/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = new Date(y, m, 1); // m ist 1-basiert; Date m ist 0-basiert → Folgemonat
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to };
}

interface ProtokollMitDetails {
  id: string;
  shop_id: string;
  datum: string;
  schichten: (Schicht & { kassenbewegungen: Kassenbewegung[] })[];
}

function useMonatsProtokolle(month: string) {
  return useQuery({
    queryKey: ['protokoll-monat', month],
    queryFn: async (): Promise<ProtokollMitDetails[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('protokolle')
        .select('id, shop_id, datum, schichten(*, kassenbewegungen(*))')
        .gte('datum', from)
        .lt('datum', to)
        .order('datum');
      if (error) throw error;
      return (data ?? []) as ProtokollMitDetails[];
    },
  });
}

function useMonatsVorfaelle(month: string) {
  return useQuery({
    queryKey: ['vorfaelle-monat', month],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('action', 'VORFALL')
        .gte('ts', from)
        .lt('ts', to)
        .order('ts', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });
}

interface MitarbeiterStats {
  id: string;
  name: string;
  stunden: number;
  schichten: number;
  shops: Set<string>;
  diffSumme: number;
  diffAbsSumme: number; // Σ |diff|
  diffSchichten: number; // Anzahl Schichten mit ermitteltem Diff
  maxDiff: number; // grösster Einzel-Diff (signed)
}

interface ShopStats {
  id: string;
  kurz: string;
  name: string;
  protokolle: number;
  umsatz: number; // Σ Kassenabrechnung
  diff: number; // Σ Differenzen
}

export function ReportsPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const { data: shops } = useShops();
  const { data: profiles } = useProfiles();
  const { data: protokolle, isLoading } = useMonatsProtokolle(month);
  const { data: vorfaelle } = useMonatsVorfaelle(month);

  if (session.kind !== 'admin' && session.profile.rolle !== 'bezirksleiter') {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Reports nur für Admin/Bezirksleiter sichtbar.
          </div>
        </div>
      </Layout>
    );
  }

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p) => m.set(p.id, firstName(p.name)));
    return m;
  }, [profiles]);
  const shopMap = useMemo(() => {
    const m = new Map<string, { name: string; kurz: string }>();
    (shops ?? []).forEach((s) => m.set(s.id, { name: s.name, kurz: s.kurz }));
    return m;
  }, [shops]);

  const { mitarbeiterStats, shopStats, totalStunden, totalSchichten } =
    useMemo(() => {
      const mitarbeiterMap = new Map<string, MitarbeiterStats>();
      const shopStatsMap = new Map<string, ShopStats>();

      (shops ?? []).forEach((s) => {
        shopStatsMap.set(s.id, {
          id: s.id,
          kurz: s.kurz,
          name: s.name,
          protokolle: 0,
          umsatz: 0,
          diff: 0,
        });
      });

      (protokolle ?? []).forEach((p) => {
        const shopStat = shopStatsMap.get(p.shop_id);
        if (shopStat) shopStat.protokolle += 1;
        (p.schichten ?? []).forEach((s) => {
          const sums = calcShift(s, s.kassenbewegungen ?? []);
          if (shopStat) {
            shopStat.umsatz += sums.kassenabrechnung;
            if (sums.diff !== null) shopStat.diff += sums.diff;
          }
          if (s.mitarbeiter_id && s.zeit_von && s.zeit_bis) {
            const h = calcStunden(s.zeit_von, s.zeit_bis);
            if (h > 0) {
              const name = profileMap.get(s.mitarbeiter_id) ?? '?';
              const m = mitarbeiterMap.get(s.mitarbeiter_id) ?? {
                id: s.mitarbeiter_id,
                name,
                stunden: 0,
                schichten: 0,
                shops: new Set<string>(),
                diffSumme: 0,
                diffAbsSumme: 0,
                diffSchichten: 0,
                maxDiff: 0,
              };
              m.stunden += h;
              m.schichten += 1;
              m.shops.add(p.shop_id);
              if (sums.diff !== null) {
                m.diffSumme += sums.diff;
                m.diffAbsSumme += Math.abs(sums.diff);
                m.diffSchichten += 1;
                if (Math.abs(sums.diff) > Math.abs(m.maxDiff)) m.maxDiff = sums.diff;
              }
              mitarbeiterMap.set(s.mitarbeiter_id, m);
            }
          }
        });
      });

      const sortedMitarbeiter = [...mitarbeiterMap.values()].sort(
        (a, b) => b.stunden - a.stunden,
      );
      const totalStundenLocal = sortedMitarbeiter.reduce(
        (acc, m) => acc + m.stunden,
        0,
      );
      const totalSchichtenLocal = sortedMitarbeiter.reduce(
        (acc, m) => acc + m.schichten,
        0,
      );
      return {
        mitarbeiterStats: sortedMitarbeiter,
        shopStats: [...shopStatsMap.values()],
        totalStunden: totalStundenLocal,
        totalSchichten: totalSchichtenLocal,
      };
    }, [protokolle, profileMap, shops]);

  function exportCsv() {
    const lines: string[] = [];
    lines.push(
      'Datum;Shop;Schicht;Mitarbeiter;Stunden;Kassenstart;Kassenabrechnung;Einlagen;Entnahmen;Soll;Ist;Diff',
    );
    (protokolle ?? []).forEach((p) => {
      const shopKurz = shopMap.get(p.shop_id)?.kurz ?? p.shop_id;
      (p.schichten ?? []).forEach((s) => {
        const sums = calcShift(s, s.kassenbewegungen ?? []);
        const name = s.mitarbeiter_id
          ? profileMap.get(s.mitarbeiter_id) ?? '?'
          : '';
        const fmt = (n: number | null) =>
          n === null ? '' : n.toFixed(2).replace('.', ',');
        lines.push(
          [
            p.datum,
            shopKurz,
            String(s.schicht_nr),
            name,
            sums.stunden.toFixed(2).replace('.', ','),
            fmt(sums.start),
            fmt(sums.kassenabrechnung),
            fmt(sums.einlagenSumme),
            fmt(sums.entnahmenSumme),
            fmt(sums.soll),
            fmt(sums.ist),
            fmt(sums.diff),
          ].join(';'),
        );
      });
    });
    const csv = '﻿' + lines.join('\r\n'); // BOM für Excel-UTF8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowtime-report-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-muted hover:text-accent mb-1 mono"
            >
              ← Dashboard
            </button>
            <h1 className="text-xl font-bold">📊 Monatsreport</h1>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 rounded text-sm"
            />
            <button
              type="button"
              onClick={() => window.print()}
              disabled={isLoading || (protokolle ?? []).length === 0}
              className="btn-ghost px-3 py-2 text-sm disabled:opacity-50"
              title="Druck-Dialog öffnen (PDF speichern möglich)"
            >
              🖨 Drucken / PDF
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={isLoading || (protokolle ?? []).length === 0}
              className="btn-ghost px-3 py-2 text-sm disabled:opacity-50"
            >
              ⤓ CSV-Export
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Stunden gesamt" value={formatStunden(totalStunden)} />
          <Kpi label="Schichten" value={String(totalSchichten)} />
          <Kpi label="Protokolle" value={String((protokolle ?? []).length)} />
          <Kpi
            label="Umsatz (Z-Bons)"
            value={formatEur(shopStats.reduce((a, s) => a + s.umsatz, 0))}
          />
        </div>

        {/* Shops */}
        <Section title="Shops">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shopStats.map((s) => (
              <div
                key={s.id}
                className="bg-surface-2 border border-border-soft rounded p-3 space-y-1"
              >
                <div className="flex justify-between items-baseline">
                  <div>
                    <div className="text-xs text-muted uppercase tracking-wider">
                      {s.kurz}
                    </div>
                    <div className="font-semibold">{s.name}</div>
                  </div>
                  <div className="text-xs text-muted">
                    {s.protokolle} Protokolle
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>
                    <div className="text-[10px] uppercase text-muted">Umsatz Z-Bons</div>
                    <div className="mono font-semibold">{formatEur(s.umsatz)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted">Σ Diff</div>
                    <div
                      className={`mono font-semibold ${
                        s.diff < 0 ? 'text-minus' : s.diff > 0 ? 'text-plus' : ''
                      }`}
                    >
                      {formatEur(s.diff)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Mitarbeiter */}
        <Section title="Stunden pro Mitarbeiter">
          {mitarbeiterStats.length === 0 ? (
            <div className="text-sm text-muted">
              Keine Schichten in diesem Monat.
            </div>
          ) : (
            <div className="bg-surface-2 border border-border-soft rounded overflow-hidden">
              <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-3">
                <div>Mitarbeiter</div>
                <div className="text-right">Schichten</div>
                <div className="text-right">Shops</div>
                <div className="text-right">Stunden</div>
              </div>
              <div className="divide-y divide-border-soft">
                {mitarbeiterStats.map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-3 py-2 text-sm"
                  >
                    <div>{m.name}</div>
                    <div className="mono text-right">{m.schichten}</div>
                    <div className="mono text-right">{m.shops.size}</div>
                    <div className="mono text-right font-semibold">
                      {formatStunden(m.stunden)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Differenzen-Statistik */}
        <Section title="Differenzen pro Mitarbeiter">
          {mitarbeiterStats.filter((m) => m.diffSchichten > 0).length === 0 ? (
            <div className="text-sm text-muted">
              Keine Diff-Daten in diesem Monat.
            </div>
          ) : (
            <div className="bg-surface-2 border border-border-soft rounded overflow-hidden">
              <div className="grid grid-cols-[1fr_70px_90px_90px_90px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-3">
                <div>Mitarbeiter</div>
                <div className="text-right">Schichten</div>
                <div className="text-right">Σ |Diff|</div>
                <div className="text-right">Σ Diff</div>
                <div className="text-right">Max</div>
              </div>
              <div className="divide-y divide-border-soft">
                {[...mitarbeiterStats]
                  .filter((m) => m.diffSchichten > 0)
                  .sort((a, b) => b.diffAbsSumme - a.diffAbsSumme)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="grid grid-cols-[1fr_70px_90px_90px_90px] gap-2 px-3 py-2 text-sm items-center"
                    >
                      <div>{m.name}</div>
                      <div className="mono text-right">{m.diffSchichten}</div>
                      <div className="mono text-right font-semibold">
                        {formatEur(m.diffAbsSumme)}
                      </div>
                      <div
                        className={`mono text-right font-semibold ${
                          m.diffSumme < 0
                            ? 'text-minus'
                            : m.diffSumme > 0
                              ? 'text-plus'
                              : ''
                        }`}
                      >
                        {formatEur(m.diffSumme)}
                      </div>
                      <div
                        className={`mono text-right ${
                          Math.abs(m.maxDiff) >= 5
                            ? m.maxDiff < 0
                              ? 'text-minus'
                              : 'text-warn'
                            : ''
                        }`}
                      >
                        {formatEur(m.maxDiff)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Section>

        {/* Tages-Heatmap */}
        <Section title="Tages-Übersicht (Heatmap)">
          <DiffHeatmap
            month={month}
            protokolle={protokolle ?? []}
            shopMap={shopMap}
            onDayClick={(shopId, datum) =>
              navigate(`/protokoll/${shopId}/${datum}`)
            }
          />
        </Section>

        {/* Vorfälle */}
        <Section title={`Vorfälle (${(vorfaelle ?? []).length})`}>
          {!vorfaelle || vorfaelle.length === 0 ? (
            <div className="text-sm text-muted">Keine Vorfälle in diesem Monat.</div>
          ) : (
            <div className="space-y-2">
              {vorfaelle.map((v) => {
                const data = (v.new_val ?? {}) as {
                  text?: string | null;
                  labels?: string[];
                };
                const labels = Array.isArray(data.labels) ? data.labels : [];
                const text = typeof data.text === 'string' ? data.text : '';
                return (
                  <div
                    key={v.id}
                    className="bg-warn/10 border border-warn/30 rounded p-3 text-sm space-y-2"
                  >
                    <div className="text-xs text-muted mono">
                      {new Date(v.ts).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      <span className="text-text">{v.user_name ?? '?'}</span>
                    </div>
                    {labels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {labels.map((l, i) => (
                          <span
                            key={i}
                            className="bg-warn/20 border border-warn/40 text-warn rounded px-2 py-0.5 text-xs"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    {text && (
                      <div className="whitespace-pre-wrap text-text">{text}</div>
                    )}
                    {labels.length === 0 && !text && (
                      <div className="text-muted italic">
                        Kein Detail eingetragen
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </Layout>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded p-3">
      <div className="text-[10px] mono uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div className="text-xl font-bold mono">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface HeatmapProps {
  month: string;
  protokolle: ProtokollMitDetails[];
  shopMap: Map<string, { name: string; kurz: string }>;
  onDayClick: (shopId: string, datum: string) => void;
}

function DiffHeatmap({ month, protokolle, shopMap, onDayClick }: HeatmapProps) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const shops = [...shopMap.entries()].map(([id, s]) => ({ id, ...s }));

  const protoMap = new Map<string, ProtokollMitDetails>();
  protokolle.forEach((p) => protoMap.set(p.shop_id + '|' + p.datum, p));

  function classifyDiff(absDiff: number): { bg: string; label: string } {
    if (absDiff === 0) return { bg: '#1c1c1c', label: '–' };
    if (absDiff < 5) return { bg: 'rgba(74,222,128,0.4)', label: 'ok' };
    if (absDiff < 20) return { bg: 'rgba(251,191,36,0.5)', label: 'gelb' };
    return { bg: 'rgba(248,113,113,0.6)', label: 'rot' };
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        Klick auf ein Feld öffnet das Protokoll.{' '}
        <span className="inline-block w-2 h-2 bg-plus/40 align-middle ml-2" /> ok &nbsp;
        <span className="inline-block w-2 h-2 bg-warn/50 align-middle ml-2" /> 5–20€ &nbsp;
        <span className="inline-block w-2 h-2 bg-minus/60 align-middle ml-2" /> &gt;20€
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left pr-2 pb-1 text-muted font-normal">Shop</th>
              {days.map((d) => (
                <th
                  key={d}
                  className="text-center w-6 pb-1 text-[10px] mono text-muted font-normal"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.map((shop) => (
              <tr key={shop.id}>
                <td className="pr-2 py-0.5 text-muted mono whitespace-nowrap">
                  {shop.kurz}
                </td>
                {days.map((d) => {
                  const datum = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const p = protoMap.get(shop.id + '|' + datum);
                  let totalAbs = 0;
                  let totalSigned = 0;
                  let hasAny = false;
                  if (p) {
                    p.schichten.forEach((s) => {
                      const sums = calcShift(s, s.kassenbewegungen ?? []);
                      if (sums.diff !== null) {
                        totalAbs += Math.abs(sums.diff);
                        totalSigned += sums.diff;
                        hasAny = true;
                      }
                    });
                  }
                  const cls = hasAny
                    ? classifyDiff(totalAbs)
                    : p
                      ? { bg: 'rgba(212,255,0,0.1)', label: 'leer' }
                      : { bg: 'transparent', label: '' };
                  const tooltip = p
                    ? hasAny
                      ? `${datum} ${shop.kurz}: ${formatEur(totalSigned)}`
                      : `${datum} ${shop.kurz}: kein IST eingetragen`
                    : `${datum} ${shop.kurz}: kein Protokoll`;
                  return (
                    <td key={d} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => p && onDayClick(shop.id, datum)}
                        disabled={!p}
                        className="block w-5 h-5 rounded transition-transform hover:scale-150 cursor-pointer disabled:cursor-default"
                        style={{
                          background: cls.bg,
                          border:
                            cls.bg === 'transparent'
                              ? '1px dashed #2a2a2a'
                              : '1px solid #2a2a2a',
                        }}
                        title={tooltip}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
