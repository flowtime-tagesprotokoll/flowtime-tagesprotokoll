import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';
import { useNavigate } from 'react-router-dom';
import type { AuditEntry } from '../lib/types';

function useAudit(limit: number) {
  return useQuery({
    queryKey: ['audit', limit],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('ts', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const [limit, setLimit] = useState(200);
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const { data: entries, isLoading, error } = useAudit(limit);

  if (session.kind !== 'admin') {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Audit-Log nur für Admin sichtbar.
          </div>
        </div>
      </Layout>
    );
  }

  const filtered = useMemo(() => {
    let rows = entries ?? [];
    if (filterAction)
      rows = rows.filter((e) => e.action.toLowerCase().includes(filterAction.toLowerCase()));
    if (filterUser)
      rows = rows.filter((e) =>
        (e.user_name ?? '').toLowerCase().includes(filterUser.toLowerCase()),
      );
    return rows;
  }, [entries, filterAction, filterUser]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-muted hover:text-accent mb-1 mono"
            >
              ← Dashboard
            </button>
            <h1 className="text-xl font-bold">Audit-Log</h1>
            <div className="text-sm text-muted">Alle Änderungen, Logins, Vorfälle.</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Aktion filtern…"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs px-2 py-1.5 rounded w-32"
            />
            <input
              type="text"
              placeholder="Nutzer filtern…"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="text-xs px-2 py-1.5 rounded w-32"
            />
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="text-xs px-2 py-1.5 rounded"
            >
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}

        {isLoading && <div className="text-muted text-sm">Lade …</div>}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-surface border border-border-soft rounded-lg p-6 text-center text-sm text-muted">
            Keine Einträge.
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[150px_140px_70px_120px_1fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-2">
              <div>Zeitpunkt</div>
              <div>Nutzer</div>
              <div>Rolle</div>
              <div>Aktion</div>
              <div>Details</div>
            </div>
            <div className="divide-y divide-border-soft">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[150px_140px_70px_120px_1fr] gap-2 px-3 py-2 text-xs items-start"
                >
                  <div className="mono text-muted">{fmtTs(e.ts)}</div>
                  <div className="truncate">{e.user_name ?? '—'}</div>
                  <div className="text-muted uppercase tracking-wider text-[10px]">
                    {e.rolle ?? '—'}
                  </div>
                  <div className="mono text-accent">{e.action}</div>
                  <div className="font-mono text-[11px] whitespace-pre-wrap break-all text-muted">
                    {e.field ? `${e.field}: ` : ''}
                    {e.new_val !== null && e.new_val !== undefined
                      ? typeof e.new_val === 'object'
                        ? JSON.stringify(e.new_val)
                        : String(e.new_val)
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
