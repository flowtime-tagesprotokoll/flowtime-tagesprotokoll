import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';
import { useProfiles, useShops } from '../lib/queries';
import type { AuditEntry, Schicht } from '../lib/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = new Date(y, m, 1);
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to };
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

interface ProtokollMitSchichten {
  id: string;
  shop_id: string;
  datum: string;
  schichten: Schicht[];
}

function useProtokolleMitSchichten(month: string) {
  return useQuery({
    queryKey: ['protokoll-monat-doku', month],
    queryFn: async (): Promise<ProtokollMitSchichten[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('protokolle')
        .select('id, shop_id, datum, schichten(*)')
        .gte('datum', from)
        .lt('datum', to)
        .order('datum');
      if (error) throw error;
      return (data ?? []) as ProtokollMitSchichten[];
    },
  });
}

function useAuditMonat(month: string) {
  return useQuery({
    queryKey: ['audit-monat-doku', month],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .in('action', ['VORFALL', 'DOKU_REMINDER_OK'])
        .gte('ts', from)
        .lt('ts', to)
        .order('ts');
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });
}

export function DokuberichtPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const { data: shops } = useShops();
  const { data: profiles } = useProfiles();
  const { data: protokolle, isLoading: protoLoading } =
    useProtokolleMitSchichten(month);
  const { data: audit, isLoading: auditLoading } = useAuditMonat(month);

  if (session.kind !== 'admin') {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Dokumentationsbericht nur für Admin sichtbar.
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

  // Group days
  const days = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        shopId: string;
        shopName: string;
        schichten: Schicht[];
      }>
    >();
    (protokolle ?? []).forEach((p) => {
      const list = map.get(p.datum) ?? [];
      list.push({
        shopId: p.shop_id,
        shopName: shopMap.get(p.shop_id)?.name ?? p.shop_id,
        schichten: [...p.schichten].sort((a, b) => a.schicht_nr - b.schicht_nr),
      });
      map.set(p.datum, list);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [protokolle, shopMap]);

  // Audit nach Tag und nach Mitarbeiter gruppieren
  const auditByDayAndUser = useMemo(() => {
    const m = new Map<
      string,
      Map<string, { vorfaelle: AuditEntry[]; bestaetigt: AuditEntry[] }>
    >();
    (audit ?? []).forEach((a) => {
      const day = a.ts.slice(0, 10);
      const user = a.profile_id ?? 'unbekannt';
      if (!m.has(day)) m.set(day, new Map());
      const dm = m.get(day)!;
      if (!dm.has(user))
        dm.set(user, { vorfaelle: [], bestaetigt: [] });
      const ent = dm.get(user)!;
      if (a.action === 'VORFALL') ent.vorfaelle.push(a);
      else if (a.action === 'DOKU_REMINDER_OK') ent.bestaetigt.push(a);
    });
    return m;
  }, [audit]);

  const totalVorfaelle = (audit ?? []).filter((a) => a.action === 'VORFALL').length;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-muted hover:text-accent mb-1 mono"
            >
              ← Dashboard
            </button>
            <h1 className="text-xl font-bold">📑 Dokumentationsbericht</h1>
            <div className="text-sm text-muted">
              Vollständige Übersicht aller Vorfälle + Bestätigungen pro Tag und
              Mitarbeiter.
            </div>
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
              onClick={() => window.print()}
              disabled={protoLoading || auditLoading}
              className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              🖨 Als PDF speichern / drucken
            </button>
          </div>
        </div>

        {/* Druckbare Inhalte */}
        <div id="bericht-print" className="space-y-5 bg-surface print:bg-white print:text-black">
          <div className="border-b-2 border-border print:border-black pb-3">
            <h1 className="text-2xl font-bold print:text-black">
              Dokumentationsbericht — Flowtime GmbH
            </h1>
            <div className="text-sm text-muted print:text-black mt-1">
              Berichtszeitraum:{' '}
              <strong>
                {new Date(month + '-01').toLocaleDateString('de-DE', {
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
              {' · '}
              {(protokolle ?? []).length} Tage erfasst
              {' · '}
              {totalVorfaelle} Vorfälle
            </div>
            <div className="text-xs text-muted print:text-black mt-1">
              Erstellt am{' '}
              {new Date().toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              durch {session.profile.name}
            </div>
          </div>

          {(protoLoading || auditLoading) && (
            <div className="text-sm text-muted">Lade …</div>
          )}

          {!protoLoading && days.length === 0 && (
            <div className="text-sm text-muted">
              Keine Protokolle in diesem Zeitraum.
            </div>
          )}

          {days.map(([datum, shopsAmTag]) => {
            const dayAudit = auditByDayAndUser.get(datum) ?? new Map();
            return (
              <section
                key={datum}
                className="border border-border-soft print:border-gray-300 rounded-lg p-4 break-inside-avoid"
              >
                <h2 className="text-lg font-bold mb-3 print:text-black">
                  {fmtDateLong(datum)}
                </h2>
                {shopsAmTag.map((s) => (
                  <div key={s.shopId} className="mb-3 last:mb-0">
                    <div className="text-sm font-semibold uppercase tracking-wider text-muted print:text-black mb-2">
                      📍 {s.shopName}
                    </div>
                    <div className="space-y-2">
                      {s.schichten.map((schicht) => {
                        const name = schicht.mitarbeiter_id
                          ? profileMap.get(schicht.mitarbeiter_id) ?? '(unbekannt)'
                          : null;
                        const userAudit = schicht.mitarbeiter_id
                          ? dayAudit.get(schicht.mitarbeiter_id)
                          : undefined;
                        const vorfaelle = userAudit?.vorfaelle ?? [];
                        const bestaetigt = (userAudit?.bestaetigt.length ?? 0) > 0;

                        return (
                          <div
                            key={schicht.id}
                            className="border-l-4 pl-3 py-1"
                            style={{
                              borderColor:
                                vorfaelle.length > 0
                                  ? '#fbbf24'
                                  : bestaetigt
                                    ? '#4ade80'
                                    : '#888',
                            }}
                          >
                            <div className="text-sm">
                              <strong>Schicht {schicht.schicht_nr}</strong>
                              {schicht.zeit_von && schicht.zeit_bis && (
                                <span className="text-muted print:text-black ml-2">
                                  {schicht.zeit_von.slice(0, 5)}–
                                  {schicht.zeit_bis.slice(0, 5)}
                                </span>
                              )}
                              {' · '}
                              {name ? (
                                <strong>{name}</strong>
                              ) : (
                                <span className="text-muted print:text-black">
                                  (kein Mitarbeiter)
                                </span>
                              )}
                            </div>

                            {vorfaelle.length === 0 && bestaetigt && (
                              <div className="text-sm text-plus print:text-green-700 mt-0.5">
                                ✓ Keine Vorfälle — bestätigt durch <strong>{name}</strong>
                              </div>
                            )}

                            {vorfaelle.length === 0 && !bestaetigt && name && (
                              <div className="text-sm text-muted print:text-gray-700 mt-0.5 italic">
                                Keine Bestätigung erfolgt (Mitarbeiter wurde
                                ggf. nicht regulär abgemeldet)
                              </div>
                            )}

                            {vorfaelle.map((v) => {
                              const data = (v.new_val ?? {}) as {
                                text?: string | null;
                                labels?: string[];
                              };
                              const labels = Array.isArray(data.labels)
                                ? data.labels
                                : [];
                              return (
                                <div
                                  key={v.id}
                                  className="mt-1 text-sm bg-warn/10 print:bg-yellow-50 border border-warn/30 print:border-yellow-400 rounded p-2"
                                >
                                  <div className="text-xs text-muted print:text-black mono mb-1">
                                    {new Date(v.ts).toLocaleString('de-DE', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}{' '}
                                    Uhr · dokumentiert von{' '}
                                    {v.user_name ?? '?'}
                                  </div>
                                  {labels.length > 0 && (
                                    <ul className="list-disc pl-5 mb-1">
                                      {labels.map((l, i) => (
                                        <li key={i}>{l}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {data.text && (
                                    <div className="whitespace-pre-wrap">
                                      {data.text}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

          <div className="text-xs text-muted print:text-black pt-3 border-t border-border-soft print:border-gray-300">
            Dieser Bericht wurde automatisch aus dem Audit-Log generiert (Action
            "VORFALL" + "DOKU_REMINDER_OK"). Erfasst werden Vorfälle des
            Jugend- und Spielerschutzes sowie Geldwäsche-Verdachtsmeldungen
            gemäß GlüStV / GwG.
          </div>
        </div>
      </div>
    </Layout>
  );
}
