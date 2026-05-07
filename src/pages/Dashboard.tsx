import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useProfiles, useShops } from '../lib/queries';
import { useProtokollListe } from '../lib/protokollQueries';
import { useAuth } from '../lib/authStore';
import { formatEur } from '../lib/calc';

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
    (profiles ?? []).forEach((p) => m.set(p.id, p.name));
    return m;
  }, [profiles]);
  const shopMap = useMemo(() => {
    const m = new Map<string, { name: string; kurz: string }>();
    (shops ?? []).forEach((s) => m.set(s.id, { name: s.name, kurz: s.kurz }));
    return m;
  }, [shops]);

  const [filterShop, setFilterShop] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');

  const filtered = useMemo(() => {
    let rows = protokolle ?? [];
    if (filterShop !== 'all') rows = rows.filter((p) => p.shop_id === filterShop);
    if (filterMonth) rows = rows.filter((p) => p.datum.startsWith(filterMonth));
    return rows;
  }, [protokolle, filterShop, filterMonth]);

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
            <h3 className="font-semibold text-sm">
              {isAdmin ? 'Alle Protokolle' : 'Heutige Protokolle'}
            </h3>
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
              <div className="grid grid-cols-[110px_70px_1fr_1fr_70px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-2">
                <div>Datum</div>
                <div>Shop</div>
                <div>Schicht 1</div>
                <div>Schicht 2</div>
                <div className="text-right">IST gesamt</div>
              </div>
              {filtered.map((p) => {
                const shop = shopMap.get(p.shop_id);
                const s1 = p.schichten.find((s) => s.schicht_nr === 1);
                const s2 = p.schichten.find((s) => s.schicht_nr === 2);
                const istTotal =
                  (s1?.kassenist ?? 0) + (s2?.kassenist ?? 0);
                const isToday = p.datum === heute;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/protokoll/${p.shop_id}/${p.datum}`)}
                    className="w-full grid grid-cols-[110px_70px_1fr_1fr_70px] gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface-2 transition-colors items-center"
                  >
                    <div className="mono">
                      {fmtDate(p.datum)}
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
                    <div className="mono text-right text-xs">
                      {istTotal > 0 ? formatEur(istTotal) : '—'}
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
