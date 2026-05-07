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
import type { Kassenbewegung, Schicht } from '../lib/types';

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

interface MitarbeiterStats {
  id: string;
  name: string;
  stunden: number;
  schichten: number;
  shops: Set<string>;
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
    (profiles ?? []).forEach((p) => m.set(p.id, p.name));
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
              };
              m.stunden += h;
              m.schichten += 1;
              m.shops.add(p.shop_id);
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
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 rounded text-sm"
            />
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
            label="Umsatz"
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
                    <div className="text-[10px] uppercase text-muted">Umsatz</div>
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
