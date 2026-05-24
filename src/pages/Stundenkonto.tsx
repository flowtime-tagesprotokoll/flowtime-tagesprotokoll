import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/authStore';
import { useProfiles } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { firstName } from '../lib/types';

interface StundenkontoRow {
  monat: string;          // 'YYYY-MM'
  ist_stunden: number;
  soll_stunden: number;
  diff: number;
  kum_saldo: number;
  ist_laufend: boolean;
}

const MONATSNAMEN_LANG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function monatLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  return `${MONATSNAMEN_LANG[m - 1]} ${y}`;
}

function fmtDateLong(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function anfangsstichtagLabel(iso: string): string {
  if (!iso || iso.length < 10) return 'Vormonat';
  const [y, m] = iso.split('-').map(Number);
  return `${MONATSNAMEN_LANG[m - 1]} ${y}`;
}

function fmtH(n: number): string {
  // Mit Komma als Dezimaltrennzeichen, 2 Nachkommastellen.
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSigned(n: number): string {
  const sign = n > 0 ? '+' : '';
  return sign + fmtH(n);
}

export function StundenkontoPage() {
  const session = useAuth((s) => s.session)!;
  const isAdmin = session.kind === 'admin';
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();

  // MA sieht nur sich selbst, Admin kann zwischen MAs umschalten.
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    session.profile.id,
  );

  const mitarbeiterListe = useMemo(() => {
    return (profiles ?? [])
      .filter((p) => p.aktiv && p.rolle !== 'admin' && !p.nur_verwaltung)
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
  }, [profiles]);

  const targetProfileId = isAdmin ? selectedProfileId : session.profile.id;
  const targetProfile = useMemo(() => {
    if (targetProfileId === session.profile.id) return session.profile;
    return (profiles ?? []).find((p) => p.id === targetProfileId) ?? session.profile;
  }, [targetProfileId, profiles, session.profile]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stundenkonto', targetProfileId],
    enabled: !!targetProfileId,
    queryFn: async (): Promise<{
      rows: StundenkontoRow[];
      anfangssaldo: number;
      anfangsstichtag: string;
    } | null> => {
      const [rpcRes, basisRes] = await Promise.all([
        supabase.rpc('get_stundenkonto', { _profile_id: targetProfileId }),
        supabase
          .from('stundenkonto_basis')
          .select('anfangssaldo, anfangsstichtag')
          .eq('profile_id', targetProfileId)
          .maybeSingle(),
      ]);
      if (rpcRes.error) throw rpcRes.error;
      if (basisRes.error) throw basisRes.error;
      if (!basisRes.data) return null;
      return {
        rows: (rpcRes.data ?? []).map((r: Record<string, unknown>) => ({
          monat: String(r.monat),
          ist_stunden: Number(r.ist_stunden),
          soll_stunden: Number(r.soll_stunden),
          diff: Number(r.diff),
          kum_saldo: Number(r.kum_saldo),
          ist_laufend: Boolean(r.ist_laufend),
        })),
        anfangssaldo: Number(basisRes.data.anfangssaldo),
        anfangsstichtag: String(basisRes.data.anfangsstichtag),
      };
    },
  });

  const rows = data?.rows ?? [];
  const anfangssaldo = data?.anfangssaldo ?? 0;
  const anfangsstichtag = data?.anfangsstichtag ?? '';
  const lastRow = rows[rows.length - 1];
  // Live-Saldo = letzter kum_saldo (im laufenden Monat ohne Soll-Abzug).
  const liveSaldo = lastRow ? lastRow.kum_saldo : 0;
  // Vollstaendiger Saldo "wenn der Monat gerade zu Ende waere" =
  // Live-Saldo minus (Soll - 0) im laufenden Monat = liveSaldo - lastRow.soll
  const projizierterMonatsendsaldo = lastRow
    ? lastRow.ist_laufend
      ? lastRow.kum_saldo - lastRow.soll_stunden
      : lastRow.kum_saldo
    : 0;

  const saldoColor = (n: number) => (n >= 0 ? '#4ade80' : '#f87171');

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">⏱ Mein Stundenkonto</h1>
          <p className="text-sm text-muted mt-1">
            Aus den Protokoll-Schichten berechnet. Soll-Stunden werden erst{' '}
            <strong>am Monatsende</strong> verrechnet — der laufende Monat
            zeigt nur die bisher geleisteten Stunden.
          </p>
        </div>

        {isAdmin && (
          <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Mitarbeiter (Admin-Ansicht)
            </div>
            <div className="flex flex-wrap gap-2">
              {mitarbeiterListe.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProfileId(p.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
                  style={
                    selectedProfileId === p.id
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
                  {firstName(p.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-sm text-muted">Lade Stundenkonto …</div>
        )}

        {error && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            Fehler: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && !data && (
          <div className="bg-surface border border-border rounded-lg p-6 text-center text-muted">
            Für {firstName(targetProfile.name)} ist noch kein Stundenkonto
            angelegt.
            {isAdmin && (
              <div className="text-xs mt-2">
                (Admin: Eintrag in Tabelle <code>stundenkonto_basis</code>
                {' '}anlegen.)
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && lastRow && (
          <>
            {/* Live-Saldo gross oben */}
            <div className="bg-surface border-2 border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    Stunden-Saldo {isAdmin ? `von ${firstName(targetProfile.name)}` : ''}
                  </div>
                  <div
                    className="text-4xl sm:text-5xl font-bold tabular-nums mt-1"
                    style={{ color: saldoColor(liveSaldo) }}
                  >
                    {fmtSigned(liveSaldo)} h
                  </div>
                </div>
                {lastRow.ist_laufend && (
                  <div className="text-xs text-muted text-right max-w-[200px]">
                    <div className="font-semibold text-text mb-0.5">
                      Hochrechnung Ende {MONATSNAMEN_LANG[Number(lastRow.monat.slice(5, 7)) - 1]}
                    </div>
                    <div
                      className="tabular-nums text-base font-bold"
                      style={{ color: saldoColor(projizierterMonatsendsaldo) }}
                    >
                      {fmtSigned(projizierterMonatsendsaldo)} h
                    </div>
                    <div className="text-[10px] mt-0.5 leading-tight">
                      wenn bis Monatsende keine weiteren Schichten
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted">
                Plus = Guthaben · Minus = noch zu leistende Stunden.
              </div>
            </div>

            {/* Monatsverlauf */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div
                className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-2"
                style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr' }}
              >
                <div>Monat</div>
                <div className="text-right">Ist</div>
                <div className="text-right">Soll</div>
                <div className="text-right">Diff</div>
                <div className="text-right">Saldo</div>
              </div>
              <div className="divide-y divide-border-soft">
                {/* Übertrag aus Vormonat als eigene Startzeile */}
                <div
                  className="grid gap-2 px-3 py-2.5 items-center text-sm tabular-nums"
                  style={{
                    gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
                    background: 'rgba(212,255,0,0.04)',
                  }}
                  title={`Stunden-Stand zum Ende ${anfangsstichtagLabel(anfangsstichtag)}`}
                >
                  <div className="font-semibold text-accent">
                    ↪ Übertrag
                    <div className="text-[10px] mono text-muted uppercase tracking-wider font-normal mt-0.5">
                      Stand {fmtDateLong(anfangsstichtag)}
                    </div>
                  </div>
                  <div className="text-right text-muted">—</div>
                  <div className="text-right text-muted">—</div>
                  <div className="text-right text-muted">—</div>
                  <div
                    className="text-right font-bold"
                    style={{ color: saldoColor(anfangssaldo) }}
                  >
                    {fmtSigned(anfangssaldo)} h
                  </div>
                </div>

                {rows.map((r) => (
                  <div
                    key={r.monat}
                    className="grid gap-2 px-3 py-2 items-center text-sm tabular-nums"
                    style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr' }}
                  >
                    <div className="font-semibold text-text">
                      {monatLabel(r.monat)}
                      {r.ist_laufend && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-accent mono">
                          läuft
                        </span>
                      )}
                    </div>
                    <div className="text-right">{fmtH(r.ist_stunden)} h</div>
                    <div className="text-right text-muted">{fmtH(r.soll_stunden)} h</div>
                    <div
                      className="text-right font-semibold"
                      style={{
                        color: r.ist_laufend ? '#888' : saldoColor(r.diff),
                      }}
                      title={
                        r.ist_laufend
                          ? 'Diff wird erst am Monatsende fix.'
                          : undefined
                      }
                    >
                      {r.ist_laufend ? '—' : fmtSigned(r.diff)} h
                    </div>
                    <div
                      className="text-right font-bold"
                      style={{ color: saldoColor(r.kum_saldo) }}
                    >
                      {fmtSigned(r.kum_saldo)} h
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 text-[11px] text-muted bg-surface-2 border-t border-border-soft">
                <strong>Übertrag</strong> = Saldo aus dem Vormonats-Abschluss,
                der in den ersten Monat einfließt. Jeder Folgemonat baut auf
                dem Saldo des Vormonats auf.
              </div>
            </div>

            <div className="text-[11px] text-muted space-y-1">
              <div>
                <strong>Wie wird gerechnet?</strong> Pro Monat: Ist-Stunden aus
                den Protokoll-Schichten (zeit_von bis zeit_bis) minus die
                vereinbarten Soll-Stunden ergibt die Monats-Differenz. Diese
                wird auf den kumulierten Saldo aufaddiert und in den
                Folgemonat übertragen.
              </div>
              <div>
                Im <strong>laufenden Monat</strong> werden die Soll-Stunden{' '}
                <strong>noch nicht</strong> abgezogen — der Saldo wäre sonst
                solange künstlich rot, bis der Monat voll ist.
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
