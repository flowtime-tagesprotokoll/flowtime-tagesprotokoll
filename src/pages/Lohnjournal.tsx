import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { firstName } from '../lib/types';

interface JournalRow {
  profile_id: string;
  profile_name: string;
  reihenfolge: number;
  monat: string;
  ist_stunden: number;
  soll_stunden: number;
  ausgezahlt: number;
  zusatz_stunden: number;
  diff: number;
  kum_saldo: number;
  ist_laufend: boolean;
  notiz: string | null;
}

const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function fmtMonat(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  return `${MONATSNAMEN[m - 1]} ${y}`;
}

function fmtH(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSigned(n: number): string {
  return (n > 0 ? '+' : '') + fmtH(n);
}

function vonMonatFallback(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function LohnjournalPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = session.kind === 'admin';
  const canView = isAdmin || session.profile.darf_lohnjournal === true;
  const canEdit = isAdmin;
  const [vonMonat, setVonMonat] = useState<string>(vonMonatFallback);
  const [editing, setEditing] = useState<{
    profile_id: string;
    profile_name: string;
    monat: string;
    ausgezahlt: number;
    zusatz_stunden: number;
    notiz: string | null;
    soll_stunden: number;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['lohnjournal', vonMonat],
    enabled: canView,
    queryFn: async (): Promise<JournalRow[]> => {
      const { data, error } = await supabase.rpc('get_lohnjournal', {
        _von_monat: vonMonat,
      });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        profile_id: String(r.profile_id),
        profile_name: String(r.profile_name),
        reihenfolge: Number(r.reihenfolge),
        monat: String(r.monat),
        ist_stunden: Number(r.ist_stunden),
        soll_stunden: Number(r.soll_stunden),
        ausgezahlt: Number(r.ausgezahlt),
        zusatz_stunden: Number(r.zusatz_stunden),
        diff: Number(r.diff),
        kum_saldo: Number(r.kum_saldo),
        ist_laufend: Boolean(r.ist_laufend),
        notiz: r.notiz ? String(r.notiz) : null,
      }));
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, { profile_name: string; reihenfolge: number; rows: JournalRow[] }>();
    for (const r of data ?? []) {
      const g = m.get(r.profile_id) ?? {
        profile_name: r.profile_name,
        reihenfolge: r.reihenfolge,
        rows: [],
      };
      g.rows.push(r);
      m.set(r.profile_id, g);
    }
    return [...m.entries()]
      .map(([id, g]) => ({
        profile_id: id,
        profile_name: g.profile_name,
        reihenfolge: g.reihenfolge,
        rows: g.rows.sort((a, b) => b.monat.localeCompare(a.monat)),
      }))
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async (args: {
      profile_id: string;
      monat: string;
      ausgezahlt_override: number | null;
      zusatz_stunden: number;
      notiz: string | null;
    }) => {
      const row = {
        profile_id: args.profile_id,
        monat: args.monat,
        ausgezahlt_override: args.ausgezahlt_override,
        zusatz_stunden: args.zusatz_stunden,
        notiz: args.notiz,
        updated_by: session.profile.id,
      };
      const { error } = await supabase
        .from('stundenkonto_monat')
        .upsert(row, { onConflict: 'profile_id,monat' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lohnjournal'] });
      qc.invalidateQueries({ queryKey: ['stundenkonto'] });
      setEditing(null);
    },
  });

  if (!canView) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Kein Zugriff auf das Lohnjournal.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">💶 Lohnjournal</h1>
          <p className="text-sm text-muted mt-1">
            Übersicht Ist- / Soll- / ausgezahlte Stunden pro Mitarbeiter und
            Monat. Standard-Auszahlung = Soll. Klick auf eine Monatszeile, um
            Override oder Schulungs-Stunden einzutragen.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted">Ab Monat:</label>
          <input
            type="month"
            value={vonMonat}
            onChange={(e) => setVonMonat(e.target.value)}
            className="px-3 py-1.5 rounded text-sm"
          />
        </div>

        {isLoading && <div className="text-sm text-muted">Lade …</div>}
        {error && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            Fehler: {(error as Error).message}
          </div>
        )}

        <div className="space-y-4">
          {grouped.map((g) => {
            const aktuellsteKum = g.rows[0]?.kum_saldo ?? 0;
            const saldoFarbe = aktuellsteKum >= 0 ? '#4ade80' : '#f87171';
            return (
              <div
                key={g.profile_id}
                className="bg-surface border border-border rounded-lg overflow-hidden"
              >
                <div className="px-3 py-2 bg-surface-2 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate('/stunden?ma=' + g.profile_id)}
                    className="font-bold hover:text-accent"
                  >
                    {g.profile_name} →
                  </button>
                  <div className="text-sm">
                    <span className="text-muted mr-2 text-xs uppercase tracking-wider">
                      Aktueller Saldo
                    </span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: saldoFarbe }}
                    >
                      {fmtSigned(aktuellsteKum)} h
                    </span>
                  </div>
                </div>
                <div
                  className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted border-b border-border-soft"
                  style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1fr 0.9fr 1fr 1fr' }}
                >
                  <div>Monat</div>
                  <div className="text-right">Ist</div>
                  <div className="text-right">Soll</div>
                  <div className="text-right">Ausgezahlt</div>
                  <div className="text-right">Zusatz</div>
                  <div className="text-right">Delta</div>
                  <div className="text-right">Saldo</div>
                </div>
                <div className="divide-y divide-border-soft">
                  {g.rows.map((r) => {
                    const hasOverride =
                      !r.ist_laufend && r.ausgezahlt !== r.soll_stunden;
                    return (
                      <button
                        type="button"
                        key={r.monat}
                        onClick={() =>
                          setEditing({
                            profile_id: g.profile_id,
                            profile_name: g.profile_name,
                            monat: r.monat,
                            ausgezahlt: r.ausgezahlt,
                            zusatz_stunden: r.zusatz_stunden,
                            notiz: r.notiz,
                            soll_stunden: r.soll_stunden,
                          })
                        }
                        className={
                          'w-full grid gap-2 px-3 py-2 items-center text-sm tabular-nums text-left transition-colors ' +
                          (canEdit ? 'hover:bg-surface-2 cursor-pointer' : 'cursor-default')
                        }
                        title={
                          canEdit
                            ? undefined
                            : 'Nur Ansicht — Bearbeiten ist Admin vorbehalten.'
                        }
                        style={{
                          gridTemplateColumns:
                            '1.4fr 1fr 0.9fr 1fr 0.9fr 1fr 1fr',
                        }}
                      >
                        <div className="font-semibold">
                          {fmtMonat(r.monat)}
                          {r.ist_laufend && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-accent mono">
                              läuft
                            </span>
                          )}
                          {r.notiz && (
                            <span
                              className="ml-2 text-[10px] text-muted"
                              title={r.notiz}
                            >
                              📝
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          {fmtH(r.ist_stunden)} h
                        </div>
                        <div className="text-right text-muted">
                          {fmtH(r.soll_stunden)} h
                        </div>
                        <div
                          className="text-right"
                          style={{ color: hasOverride ? '#fbbf24' : undefined }}
                          title={
                            hasOverride
                              ? `Override — Standard wäre ${fmtH(r.soll_stunden)} h`
                              : undefined
                          }
                        >
                          {fmtH(r.ausgezahlt)} h
                          {hasOverride && <span className="ml-1">⚠</span>}
                        </div>
                        <div className="text-right text-muted">
                          {r.zusatz_stunden !== 0
                            ? fmtSigned(r.zusatz_stunden) + ' h'
                            : '—'}
                        </div>
                        <div
                          className="text-right font-semibold"
                          style={{
                            color: r.ist_laufend
                              ? '#888'
                              : r.diff >= 0
                                ? '#4ade80'
                                : '#f87171',
                          }}
                        >
                          {fmtSigned(r.diff)} h
                        </div>
                        <div
                          className="text-right font-bold"
                          style={{
                            color: r.kum_saldo >= 0 ? '#4ade80' : '#f87171',
                          }}
                        >
                          {fmtSigned(r.kum_saldo)} h
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <EditMonatModal
          editing={editing}
          canEdit={canEdit}
          busy={saveMut.isPending}
          err={saveMut.error instanceof Error ? saveMut.error.message : null}
          onCancel={() => setEditing(null)}
          onSave={(v) =>
            saveMut.mutate({
              profile_id: editing.profile_id,
              monat: editing.monat,
              ausgezahlt_override:
                v.useOverride && Number.isFinite(v.ausgezahlt)
                  ? v.ausgezahlt
                  : null,
              zusatz_stunden: Number.isFinite(v.zusatz) ? v.zusatz : 0,
              notiz: v.notiz.trim() || null,
            })
          }
          onReset={() =>
            saveMut.mutate({
              profile_id: editing.profile_id,
              monat: editing.monat,
              ausgezahlt_override: null,
              zusatz_stunden: 0,
              notiz: null,
            })
          }
        />
      )}
    </Layout>
  );
}

interface EditProps {
  editing: {
    profile_id: string;
    profile_name: string;
    monat: string;
    ausgezahlt: number;
    zusatz_stunden: number;
    notiz: string | null;
    soll_stunden: number;
  };
  canEdit: boolean;
  busy: boolean;
  err: string | null;
  onCancel: () => void;
  onSave: (v: {
    useOverride: boolean;
    ausgezahlt: number;
    zusatz: number;
    notiz: string;
  }) => void;
  onReset: () => void;
}

interface SchichtDetail {
  datum: string;
  shop_kurz: string;
  shop_name: string;
  schicht_nr: number;
  zeit_von: string;
  zeit_bis: string;
  stunden: number;
}

function useSchichten(profile_id: string, monat: string) {
  return useQuery({
    queryKey: ['schichten-monat', profile_id, monat],
    queryFn: async (): Promise<SchichtDetail[]> => {
      const [y, m] = monat.split('-').map(Number);
      const from = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
      const { data, error } = await supabase
        .from('schichten')
        .select(
          'schicht_nr, zeit_von, zeit_bis, protokolle!inner(datum, shops!inner(kurz, name))',
        )
        .eq('mitarbeiter_id', profile_id)
        .gte('protokolle.datum', from)
        .lt('protokolle.datum', to);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        schicht_nr: number;
        zeit_von: string | null;
        zeit_bis: string | null;
        protokolle: { datum: string; shops: { kurz: string; name: string } };
      }>;
      return rows
        .filter((r) => r.zeit_von && r.zeit_bis)
        .map((r) => {
          const von = r.zeit_von!;
          const bis = r.zeit_bis!;
          const [vh, vm] = von.split(':').map(Number);
          const [bh, bm] = bis.split(':').map(Number);
          let stunden = bh + bm / 60 - (vh + vm / 60);
          if (stunden < 0) stunden += 24; // ueber Mitternacht
          return {
            datum: r.protokolle.datum,
            shop_kurz: r.protokolle.shops.kurz,
            shop_name: r.protokolle.shops.name,
            schicht_nr: r.schicht_nr,
            zeit_von: von.slice(0, 5),
            zeit_bis: bis.slice(0, 5),
            stunden,
          };
        })
        .sort((a, b) =>
          a.datum === b.datum
            ? a.schicht_nr - b.schicht_nr
            : a.datum.localeCompare(b.datum),
        );
    },
  });
}

function fmtDatumKurz(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
  return `${wt} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

function EditMonatModal({ editing, canEdit, busy, err, onCancel, onSave, onReset }: EditProps) {
  const [useOverride, setUseOverride] = useState(
    editing.ausgezahlt !== editing.soll_stunden,
  );
  const [ausgezahlt, setAusgezahlt] = useState(String(editing.ausgezahlt));
  const [zusatz, setZusatz] = useState(String(editing.zusatz_stunden));
  const [notiz, setNotiz] = useState(editing.notiz ?? '');

  const { data: schichten, isLoading: schichtenLoading } = useSchichten(
    editing.profile_id,
    editing.monat,
  );
  const schichtenSumme = (schichten ?? []).reduce((a, s) => a + s.stunden, 0);

  function parse(s: string): number {
    return parseFloat(s.replace(',', '.'));
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-border rounded-xl p-6 w-full max-w-2xl space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">
            {firstName(editing.profile_name)} · {fmtMonat(editing.monat)}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Standard: {fmtH(editing.soll_stunden)} h Sollstunden werden ausgezahlt.
          </p>
        </div>

        {/* Schichten des Monats */}
        <div className="space-y-2 border-t border-border-soft pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold">
              📋 Schichten aus den Protokollen
            </div>
            {(schichten ?? []).length > 0 && (
              <div className="text-xs mono tabular-nums">
                Σ <strong className="text-accent">{fmtH(schichtenSumme)} h</strong>
                <span className="text-muted"> · {schichten!.length} Schichten</span>
              </div>
            )}
          </div>
          {schichtenLoading ? (
            <div className="text-xs text-muted">Lade …</div>
          ) : (schichten ?? []).length === 0 ? (
            <div className="text-xs text-muted italic">
              Keine Schichten im Protokoll für diesen Monat.
            </div>
          ) : (
            <div className="bg-surface-2 border border-border-soft rounded overflow-hidden">
              <div
                className="grid gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted bg-surface-3"
                style={{ gridTemplateColumns: '90px 60px 60px 1fr 70px' }}
              >
                <div>Datum</div>
                <div>Shop</div>
                <div className="text-center">Sch.</div>
                <div>Von – Bis</div>
                <div className="text-right">Stunden</div>
              </div>
              <div className="divide-y divide-border-soft max-h-64 overflow-y-auto">
                {schichten!.map((s, i) => (
                  <div
                    key={i}
                    className="grid gap-2 px-3 py-1 text-xs items-center tabular-nums"
                    style={{ gridTemplateColumns: '90px 60px 60px 1fr 70px' }}
                  >
                    <div className="font-semibold">{fmtDatumKurz(s.datum)}</div>
                    <div className="text-muted" title={s.shop_name}>
                      {s.shop_kurz}
                    </div>
                    <div className="text-center text-muted">{s.schicht_nr}</div>
                    <div className="mono">
                      {s.zeit_von} – {s.zeit_bis}
                    </div>
                    <div className="text-right font-semibold">
                      {fmtH(s.stunden)} h
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {canEdit ? (
          <>
            <div className="space-y-2 border-t border-border-soft pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useOverride}
                  onChange={(e) => setUseOverride(e.target.checked)}
                />
                Abweichende Auszahlung eintragen
              </label>
              {useOverride && (
                <label className="block">
                  <span className="text-xs text-muted">Ausgezahlte Stunden</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={ausgezahlt}
                    onChange={(e) => setAusgezahlt(e.target.value)}
                    className="field-input text-sm"
                  />
                </label>
              )}
            </div>

            <div className="space-y-2 border-t border-border-soft pt-3">
              <label className="block">
                <span className="text-xs text-muted">
                  Zusatz-Stunden (Schulung, Krankheit etc.) — kann negativ sein
                </span>
                <input
                  type="number"
                  step="0.25"
                  value={zusatz}
                  onChange={(e) => setZusatz(e.target.value)}
                  placeholder="0"
                  className="field-input text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Notiz (optional)</span>
                <input
                  type="text"
                  value={notiz}
                  onChange={(e) => setNotiz(e.target.value)}
                  placeholder="z.B. Schulung Geldwäsche 8h"
                  className="field-input text-sm"
                />
              </label>
            </div>
          </>
        ) : (
          <div className="space-y-1 border-t border-border-soft pt-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-1">
              Auszahlung / Zusätze (Nur-Ansicht)
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] text-muted uppercase">Ausgezahlt</div>
                <div className="tabular-nums font-semibold">
                  {fmtH(editing.ausgezahlt)} h
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase">Zusatz</div>
                <div className="tabular-nums font-semibold">
                  {editing.zusatz_stunden !== 0
                    ? (editing.zusatz_stunden > 0 ? '+' : '') + fmtH(editing.zusatz_stunden) + ' h'
                    : '—'}
                </div>
              </div>
            </div>
            {editing.notiz && (
              <div>
                <div className="text-[10px] text-muted uppercase mt-1">Notiz</div>
                <div className="text-xs italic text-muted">{editing.notiz}</div>
              </div>
            )}
            <div className="text-[10px] text-muted italic pt-1">
              Änderungen sind Admin vorbehalten.
            </div>
          </div>
        )}

        {err && (
          <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border-soft">
          {canEdit && (
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              className="text-xs text-muted hover:text-minus"
              title="Alle Overrides und Zusatz-Stunden zurücksetzen"
            >
              ↺ Zurücksetzen
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost text-sm px-3 py-1.5"
          >
            {canEdit ? 'Abbrechen' : 'Schließen'}
          </button>
          {canEdit && (
          <button
            type="button"
            onClick={() =>
              onSave({
                useOverride,
                ausgezahlt: parse(ausgezahlt),
                zusatz: parse(zusatz) || 0,
                notiz,
              })
            }
            disabled={busy}
            className="btn-primary text-sm px-4 py-1.5 font-bold"
          >
            {busy ? 'Speichere …' : '💾 Speichern'}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
