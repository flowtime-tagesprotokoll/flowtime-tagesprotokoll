import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useProfiles, useShops } from '../lib/queries';
import { useProtokollListe } from '../lib/protokollQueries';
import { useAuth } from '../lib/authStore';
import { formatEur } from '../lib/calc';
import { firstName } from '../lib/types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function DashboardPage() {
  const session = useAuth((s) => s.session)!;
  const isAdmin = session.kind === 'admin';
  const { data: shops, isLoading: shopsLoading } = useShops();
  const { data: profiles } = useProfiles();
  const { data: protokolle, isLoading: listLoading } = useProtokollListe();
  const navigate = useNavigate();
  const heute = todayISO();

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

  const [filterShop, setFilterShop] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [adminDatum, setAdminDatum] = useState<string>(heute);

  const filtered = useMemo(() => {
    let rows = protokolle ?? [];
    if (filterShop !== 'all') rows = rows.filter((p) => p.shop_id === filterShop);
    if (filterMonth) rows = rows.filter((p) => p.datum.startsWith(filterMonth));
    return rows;
  }, [protokolle, filterShop, filterMonth]);

  /**
   * Vortagsabgleich: vergleicht die End-IST des Vortages (gleicher Shop) mit
   * dem Kassenstart der Frühschicht des aktuellen Tages. Ist eine Differenz
   * grösser 1 Cent vorhanden -> als Diskrepanz markiert.
   */
  const diskrepanzMap = useMemo(() => {
    const all = [...(protokolle ?? [])].sort((a, b) =>
      a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0,
    );
    const lastIstByShop = new Map<string, { datum: string; ist: number }>();
    const map = new Map<string, { vortag: string; vortagIst: number; heutigerStart: number; diff: number }>();
    for (const p of all) {
      const s1 = p.schichten.find((s) => s.schicht_nr === 1);
      const s2 = p.schichten.find((s) => s.schicht_nr === 2);
      const startHeute = s1?.kassenstart;
      const vortag = lastIstByShop.get(p.shop_id);
      if (vortag && startHeute !== null && startHeute !== undefined) {
        const delta = Math.abs(vortag.ist - startHeute);
        if (delta > 0.01) {
          map.set(p.id, {
            vortag: vortag.datum,
            vortagIst: vortag.ist,
            heutigerStart: startHeute,
            diff: startHeute - vortag.ist,
          });
        }
      }
      // End-IST = S2-IST falls vorhanden, sonst S1-IST
      const endIst =
        s2?.kassenist !== null && s2?.kassenist !== undefined
          ? s2.kassenist
          : s1?.kassenist;
      if (endIst !== null && endIst !== undefined) {
        lastIstByShop.set(p.shop_id, { datum: p.datum, ist: endIst });
      }
    }
    return map;
  }, [protokolle]);

  const filteredZBonSumme = useMemo(() => {
    return filtered.reduce((acc, p) => {
      const s1 = p.schichten.find((s) => s.schicht_nr === 1);
      const s2 = p.schichten.find((s) => s.schicht_nr === 2);
      return acc + (s1?.kassenabrechnung ?? 0) + (s2?.kassenabrechnung ?? 0);
    }, 0);
  }, [filtered]);
  const filteredDiskrepanzen = useMemo(
    () => filtered.filter((p) => diskrepanzMap.has(p.id)).length,
    [filtered, diskrepanzMap],
  );

  const heuteCount = (protokolle ?? []).filter((p) => p.datum === heute).length;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="text-[10px] mono uppercase tracking-wider text-muted">
              Schnellstart · Heute · {fmtDate(heute)}
            </div>
            <h2 className="text-lg font-bold">Tagesprotokoll öffnen</h2>
            <div className="flex flex-wrap gap-2">
              {(shops ?? []).map((s) => {
                const heutigesP = (protokolle ?? []).find(
                  (p) => p.shop_id === s.id && p.datum === heute,
                );
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate(`/protokoll/${s.id}/${heute}`)}
                    className="btn-ghost flex items-center gap-2 text-sm px-4 py-2.5"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${heutigesP ? 'bg-plus' : 'bg-accent'}`}
                    />
                    {s.name}
                    {heutigesP && (
                      <span className="text-[11px] mono text-plus">● existiert</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted">
              Pro Tag und Shop kann nur ein Protokoll existieren. Bestehende werden geöffnet.
            </div>

            {isAdmin && (
              <div className="mt-3 pt-3 border-t border-border-soft space-y-2">
                <div className="text-[10px] mono uppercase tracking-wider text-muted">
                  Protokoll für anderes Datum öffnen / nachtragen
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={adminDatum}
                    onChange={(e) => setAdminDatum(e.target.value)}
                    max={heute}
                    className="text-xs px-2 py-1.5 rounded mono"
                  />
                  {(shops ?? []).map((s) => {
                    const exists = (protokolle ?? []).some(
                      (p) => p.shop_id === s.id && p.datum === adminDatum,
                    );
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/protokoll/${s.id}/${adminDatum}`)}
                        className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${exists ? 'bg-plus' : 'bg-warn'}`}
                        />
                        {s.kurz}
                        <span className="text-[10px] text-muted">
                          {exists ? 'öffnen' : 'nachtragen'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-[10px] mono uppercase tracking-wider text-muted mb-1">
              Heute angelegt
            </div>
            <div className="text-3xl font-bold mono">{heuteCount}</div>
            <div className="text-xs text-muted mt-1">
              {isAdmin ? `Insgesamt: ${(protokolle ?? []).length}` : '(nur Admin sieht alle)'}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-semibold text-sm">
                {isAdmin ? 'Alle Protokolle' : 'Heutige Protokolle'}
              </h3>
              {isAdmin && filtered.length > 0 && (
                <>
                  <span
                    className="text-[11px] mono px-2 py-0.5 rounded"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}
                    title="Summe aller Z-Bons in der aktuellen Auswahl"
                  >
                    Z-Bon Σ {formatEur(filteredZBonSumme)}
                  </span>
                  {filteredDiskrepanzen > 0 && (
                    <span
                      className="text-[11px] mono px-2 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(248,113,113,0.18)', color: '#f87171' }}
                      title="Tage mit Differenz zwischen Vortags-IST und heutigem Kassenstart"
                    >
                      ⚠ {filteredDiskrepanzen} Diskrepanz{filteredDiskrepanzen === 1 ? '' : 'en'}
                    </span>
                  )}
                </>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterShop}
                  onChange={(e) => setFilterShop(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded"
                >
                  <option value="all">Alle Shops</option>
                  {(shops ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.kurz} · {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded"
                />
                {(filterShop !== 'all' || filterMonth) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterShop('all');
                      setFilterMonth('');
                    }}
                    className="text-xs text-muted hover:text-accent"
                  >
                    × Filter
                  </button>
                )}
              </div>
            )}
          </div>

          {(shopsLoading || listLoading) && (
            <div className="p-6 text-muted text-sm">Lade …</div>
          )}

          {!listLoading && filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted">
              {isAdmin
                ? 'Keine Protokolle gefunden.'
                : 'Heute wurde noch kein Protokoll angelegt.'}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="divide-y divide-border-soft">
              <div className="grid grid-cols-[110px_70px_1fr_1fr_90px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-2">
                <div>Datum</div>
                <div>Shop</div>
                <div>Schicht 1</div>
                <div>Schicht 2</div>
                <div className="text-right">Z-Bon Σ</div>
              </div>
              {filtered.map((p) => {
                const shop = shopMap.get(p.shop_id);
                const s1 = p.schichten.find((s) => s.schicht_nr === 1);
                const s2 = p.schichten.find((s) => s.schicht_nr === 2);
                const zbonTotal =
                  (s1?.kassenabrechnung ?? 0) + (s2?.kassenabrechnung ?? 0);
                const isToday = p.datum === heute;
                const diskrepanz = diskrepanzMap.get(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/protokoll/${p.shop_id}/${p.datum}`)}
                    className="w-full grid grid-cols-[110px_70px_1fr_1fr_90px] gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface-2 transition-colors items-center"
                    style={
                      diskrepanz
                        ? {
                            background: 'rgba(248,113,113,0.06)',
                            borderLeft: '3px solid #f87171',
                          }
                        : undefined
                    }
                    title={
                      diskrepanz
                        ? `⚠ Vortags-IST (${fmtDate(diskrepanz.vortag)}) = ${formatEur(diskrepanz.vortagIst)}, heute Kassenstart = ${formatEur(diskrepanz.heutigerStart)} (Δ ${formatEur(diskrepanz.diff)})`
                        : undefined
                    }
                  >
                    <div className="mono flex items-center gap-1">
                      {diskrepanz && (
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: '#f87171' }}
                          aria-label="Vortagsdifferenz"
                        >
                          ⚠
                        </span>
                      )}
                      <span>{fmtDate(p.datum)}</span>
                      {isToday && (
                        <span className="ml-1 text-[10px] text-accent">●</span>
                      )}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-muted">
                      {shop?.kurz ?? '—'}
                    </div>
                    <div className="truncate text-xs">
                      {s1?.mitarbeiter_id
                        ? profileMap.get(s1.mitarbeiter_id) ?? '—'
                        : <span className="text-muted-2">leer</span>}
                    </div>
                    <div className="truncate text-xs">
                      {s2?.mitarbeiter_id
                        ? profileMap.get(s2.mitarbeiter_id) ?? '—'
                        : <span className="text-muted-2">leer</span>}
                    </div>
                    <div className="mono text-right text-xs" style={{ color: '#fbbf24' }}>
                      {zbonTotal > 0 ? formatEur(zbonTotal) : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
