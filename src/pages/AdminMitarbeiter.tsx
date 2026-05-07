import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import type { Profile, Rolle } from '../lib/types';

function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles-all'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('reihenfolge')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export function AdminMitarbeiterPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profiles, isLoading } = useAllProfiles();
  const [newName, setNewName] = useState('');
  const [newRolle, setNewRolle] = useState<Rolle>('mitarbeiter');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (session.kind !== 'admin') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Mitarbeiter-Verwaltung nur für Admin sichtbar.
          </div>
        </div>
      </Layout>
    );
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['profiles-all'] });
    qc.invalidateQueries({ queryKey: ['profiles'] });
  }

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Profile> }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  async function addMitarbeiter() {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const maxOrder = Math.max(0, ...(profiles ?? []).map((p) => p.reihenfolge));
      const { error } = await supabase.from('profiles').insert({
        name: newName.trim(),
        rolle: newRolle,
        reihenfolge: maxOrder + 1,
        aktiv: true,
      });
      if (error) throw error;
      setNewName('');
      setNewRolle('mitarbeiter');
      invalidate();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(p: Profile) {
    if (
      !window.confirm(
        `Mitarbeiter "${p.name}" wirklich löschen?\n\nVorhandene Schichten und Audit-Einträge bleiben erhalten (Mitarbeiter-Bezug wird auf NULL gesetzt). Tipp: Lieber auf "Inaktiv" stellen statt löschen.`,
      )
    )
      return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', p.id);
      if (error) throw error;
      invalidate();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }

  async function move(p: Profile, dir: -1 | 1) {
    const list = (profiles ?? []).filter((x) => x.rolle === p.rolle);
    const idx = list.findIndex((x) => x.id === p.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    await Promise.all([
      supabase.from('profiles').update({ reihenfolge: b.reihenfolge }).eq('id', a.id),
      supabase.from('profiles').update({ reihenfolge: a.reihenfolge }).eq('id', b.id),
    ]);
    invalidate();
  }

  const grouped = {
    admin: (profiles ?? []).filter((p) => p.rolle === 'admin'),
    bezirksleiter: (profiles ?? []).filter((p) => p.rolle === 'bezirksleiter'),
    mitarbeiter: (profiles ?? []).filter((p) => p.rolle === 'mitarbeiter'),
  };

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
          <h1 className="text-xl font-bold">👥 Mitarbeiter-Verwaltung</h1>
          <div className="text-sm text-muted">
            Mitarbeiter hinzufügen, deaktivieren, Reihenfolge ändern. Inaktive
            erscheinen nicht mehr im Login-Screen.
          </div>
        </div>

        {err && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            {err}
          </div>
        )}

        {/* Hinzufügen */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted">
            ➕ Neuer Eintrag
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_120px] gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Vor- und Nachname"
              className="field-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addMitarbeiter();
              }}
            />
            <select
              value={newRolle}
              onChange={(e) => setNewRolle(e.target.value as Rolle)}
              className="field-input"
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="bezirksleiter">Bezirksleiter</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={addMitarbeiter}
              disabled={busy || !newName.trim()}
              className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              + Anlegen
            </button>
          </div>
        </div>

        {isLoading && <div className="text-muted text-sm">Lade …</div>}

        {/* Listen */}
        {(['admin', 'bezirksleiter', 'mitarbeiter'] as const).map((rolle) => (
          <Section key={rolle} title={rolle.toUpperCase()} count={grouped[rolle].length}>
            {grouped[rolle].length === 0 ? (
              <div className="text-sm text-muted italic">Keine Einträge.</div>
            ) : (
              <div className="space-y-2">
                {grouped[rolle].map((p, i, arr) => (
                  <Row
                    key={p.id}
                    profile={p}
                    isFirst={i === 0}
                    isLast={i === arr.length - 1}
                    onUpdate={(patch) =>
                      update.mutate({ id: p.id, patch })
                    }
                    onDelete={() => deleteProfile(p)}
                    onMove={(dir) => move(p, dir)}
                  />
                ))}
              </div>
            )}
          </Section>
        ))}
      </div>
    </Layout>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-bold text-sm uppercase tracking-wider text-muted">
        {title} ({count})
      </h2>
      {children}
    </div>
  );
}

function Row({
  profile,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
}: {
  profile: Profile;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<Profile>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);

  function save() {
    if (name.trim() && name !== profile.name) {
      onUpdate({ name: name.trim() });
    }
    setEditing(false);
  }

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center p-2 rounded border border-border-soft"
      style={{ opacity: profile.aktiv ? 1 : 0.5 }}
    >
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="text-xs text-muted hover:text-accent disabled:opacity-30 leading-none"
          title="Hoch"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast}
          className="text-xs text-muted hover:text-accent disabled:opacity-30 leading-none"
          title="Runter"
        >
          ▼
        </button>
      </div>
      {editing ? (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setName(profile.name);
              setEditing(false);
            }
          }}
          autoFocus
          className="field-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-left text-sm hover:text-accent"
        >
          {profile.name}
        </button>
      )}
      <label className="flex items-center gap-1 text-xs text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={profile.aktiv}
          onChange={(e) => onUpdate({ aktiv: e.target.checked })}
        />
        aktiv
      </label>
      <span className="text-[10px] text-muted-2 mono">
        {profile.auth_user_id ? 'Auth ✓' : ''}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-minus hover:underline"
      >
        Löschen
      </button>
    </div>
  );
}
