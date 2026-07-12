import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PinKeypad } from '../components/PinKeypad';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { hashPin } from '../lib/pin';
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

interface StundenkontoBasis {
  profile_id: string;
  sollstunden_pro_monat: number;
  anfangssaldo: number;
  anfangsstichtag: string;
}

function useStundenkontoBasis() {
  return useQuery({
    queryKey: ['stundenkonto-basis-all'],
    queryFn: async (): Promise<Map<string, StundenkontoBasis>> => {
      const { data, error } = await supabase
        .from('stundenkonto_basis')
        .select('profile_id, sollstunden_pro_monat, anfangssaldo, anfangsstichtag');
      if (error) throw error;
      const map = new Map<string, StundenkontoBasis>();
      for (const r of (data ?? []) as StundenkontoBasis[]) {
        map.set(r.profile_id, {
          profile_id: r.profile_id,
          sollstunden_pro_monat: Number(r.sollstunden_pro_monat),
          anfangssaldo: Number(r.anfangssaldo),
          anfangsstichtag: r.anfangsstichtag,
        });
      }
      return map;
    },
  });
}

function endOfPreviousMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setDate(d.getDate() - 1); // letzter Tag des Vormonats
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AdminMitarbeiterPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profiles, isLoading } = useAllProfiles();
  const { data: sollMap } = useStundenkontoBasis();
  const [newName, setNewName] = useState('');
  const [newRolle, setNewRolle] = useState<Rolle>('mitarbeiter');
  const [newSollstunden, setNewSollstunden] = useState<string>('43');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinForProfile, setPinForProfile] = useState<Profile | null>(null);

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
    qc.invalidateQueries({ queryKey: ['stundenkonto-basis-all'] });
    qc.invalidateQueries({ queryKey: ['stundenkonto'] });
  }

  async function upsertSollstunden(
    profile_id: string,
    sollstunden_pro_monat: number,
    opts?: { anfangssaldo?: number; anfangsstichtag?: string },
  ) {
    const existing = sollMap?.get(profile_id);
    const row = {
      profile_id,
      sollstunden_pro_monat,
      anfangssaldo: opts?.anfangssaldo ?? existing?.anfangssaldo ?? 0,
      anfangsstichtag:
        opts?.anfangsstichtag ??
        existing?.anfangsstichtag ??
        endOfPreviousMonthISO(),
    };
    const { error } = await supabase
      .from('stundenkonto_basis')
      .upsert(row, { onConflict: 'profile_id' });
    if (error) throw error;
    invalidate();
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
      const { data: inserted, error } = await supabase
        .from('profiles')
        .insert({
          name: newName.trim(),
          rolle: newRolle,
          reihenfolge: maxOrder + 1,
          aktiv: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      // Für Mitarbeiter/Bezirksleiter direkt Sollstunden anlegen.
      const soll = parseFloat(newSollstunden.replace(',', '.'));
      if (
        inserted?.id &&
        newRolle !== 'admin' &&
        Number.isFinite(soll) &&
        soll > 0
      ) {
        await upsertSollstunden(inserted.id, soll, {
          anfangssaldo: 0,
          anfangsstichtag: endOfPreviousMonthISO(),
        });
      }
      setNewName('');
      setNewRolle('mitarbeiter');
      setNewSollstunden('43');
      invalidate();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function setPin(p: Profile, pin: string) {
    const hash = await hashPin(pin);
    await supabase.from('profiles').update({ pin_hash: hash }).eq('id', p.id);
    invalidate();
    setPinForProfile(null);
  }

  async function clearPin(p: Profile) {
    if (!window.confirm(`PIN von ${p.name} entfernen?`)) return;
    await supabase.from('profiles').update({ pin_hash: null }).eq('id', p.id);
    invalidate();
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
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_130px_120px] gap-2">
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
            <label className="flex flex-col gap-1">
              <input
                type="number"
                min="0"
                step="0.5"
                value={newSollstunden}
                onChange={(e) => setNewSollstunden(e.target.value)}
                placeholder="Sollstd/Monat"
                className="field-input"
                disabled={newRolle === 'admin'}
                title={
                  newRolle === 'admin'
                    ? 'Für Admin nicht relevant.'
                    : 'Vertraglich vereinbarte Stunden pro Monat.'
                }
              />
              <span className="text-[10px] text-muted uppercase tracking-wider mono px-1">
                Sollstd / Monat
              </span>
            </label>
            <button
              type="button"
              onClick={addMitarbeiter}
              disabled={busy || !newName.trim()}
              className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              + Anlegen
            </button>
          </div>
          <div className="text-[11px] text-muted">
            Sollstunden/Monat werden für Mitarbeiter + Bezirksleiter direkt
            angelegt (Anfangsbestand 0 zum Ende des Vormonats). Später
            bearbeitbar in jeder Zeile.
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
                    sollstunden={sollMap?.get(p.id)?.sollstunden_pro_monat ?? null}
                    isFirst={i === 0}
                    isLast={i === arr.length - 1}
                    onUpdate={(patch) =>
                      update.mutate({ id: p.id, patch })
                    }
                    onSaveSollstunden={
                      p.rolle === 'admin'
                        ? undefined
                        : (h) => {
                            upsertSollstunden(p.id, h).catch((e) =>
                              setErr(String(e instanceof Error ? e.message : e)),
                            );
                          }
                    }
                    onDelete={() => deleteProfile(p)}
                    onMove={(dir) => move(p, dir)}
                    onSetPin={() => setPinForProfile(p)}
                    onClearPin={() => clearPin(p)}
                  />
                ))}
              </div>
            )}
          </Section>
        ))}
      </div>

      {pinForProfile && (
        <PinKeypad
          title={`PIN setzen für ${pinForProfile.name}`}
          subtitle="4-stellige PIN — wird beim Mitarbeiter-Login abgefragt."
          confirm
          onCancel={() => setPinForProfile(null)}
          onSubmit={(pin) => setPin(pinForProfile, pin)}
        />
      )}
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
  sollstunden,
  isFirst,
  isLast,
  onUpdate,
  onSaveSollstunden,
  onDelete,
  onMove,
  onSetPin,
  onClearPin,
}: {
  profile: Profile;
  sollstunden: number | null;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<Profile>) => void;
  onSaveSollstunden?: (h: number) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onSetPin: () => void;
  onClearPin: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [sollEditing, setSollEditing] = useState(false);
  const [sollDraft, setSollDraft] = useState<string>(
    sollstunden !== null ? String(sollstunden) : '',
  );

  function save() {
    if (name.trim() && name !== profile.name) {
      onUpdate({ name: name.trim() });
    }
    setEditing(false);
  }

  function saveSoll() {
    const val = parseFloat(sollDraft.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      setSollDraft(sollstunden !== null ? String(sollstunden) : '');
      setSollEditing(false);
      return;
    }
    if (val !== sollstunden) onSaveSollstunden?.(val);
    setSollEditing(false);
  }

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-2 items-center p-2 rounded border border-border-soft"
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
      {onSaveSollstunden ? (
        sollEditing ? (
          <input
            type="number"
            min="0"
            step="0.5"
            value={sollDraft}
            onChange={(e) => setSollDraft(e.target.value)}
            onBlur={saveSoll}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveSoll();
              if (e.key === 'Escape') {
                setSollDraft(sollstunden !== null ? String(sollstunden) : '');
                setSollEditing(false);
              }
            }}
            autoFocus
            className="field-input text-xs w-20"
            title="Sollstunden pro Monat"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setSollDraft(sollstunden !== null ? String(sollstunden) : '');
              setSollEditing(true);
            }}
            className="text-xs mono hover:text-accent px-1.5 py-1 rounded border border-border-soft"
            title="Sollstunden pro Monat — klicken zum Bearbeiten"
          >
            {sollstunden !== null ? `${sollstunden} h` : '— h'}
          </button>
        )
      ) : (
        <span />
      )}
      {profile.pin_hash ? (
        <button
          type="button"
          onClick={onClearPin}
          className="text-xs text-warn hover:underline"
          title="PIN entfernen"
        >
          🔓 PIN
        </button>
      ) : (
        <button
          type="button"
          onClick={onSetPin}
          className="text-xs text-accent hover:underline"
          title="PIN setzen"
        >
          🔢 PIN
        </button>
      )}
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
