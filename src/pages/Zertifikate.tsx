import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useProfiles } from '../lib/queries';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { firstName } from '../lib/types';
import type { Profile } from '../lib/types';
import {
  ZERTIFIKAT_TYPEN,
  berechneGueltigBis,
  statusColor,
  statusFor,
  type Zertifikat,
  type ZertifikatTyp,
} from '../lib/zertifikate';
import { heuteBerlinISO } from '../lib/calc';

export function ZertifikatePage() {
  const session = useAuth((s) => s.session)!;
  const canEdit =
    session.kind === 'admin' || session.profile.darf_zertifikate === true;
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();
  const heute = heuteBerlinISO();

  const { data: zertifikate } = useQuery({
    queryKey: ['zertifikate'],
    queryFn: async (): Promise<Zertifikat[]> => {
      const { data, error } = await supabase
        .from('zertifikate')
        .select('*')
        .order('gueltig_bis', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Zertifikat[];
    },
  });

  const zertByProfile = useMemo(() => {
    const m = new Map<string, Zertifikat[]>();
    for (const z of zertifikate ?? []) {
      const list = m.get(z.profile_id) ?? [];
      list.push(z);
      m.set(z.profile_id, list);
    }
    return m;
  }, [zertifikate]);

  const mitarbeiterListe = useMemo(
    () => (profiles ?? []).filter((p) => p.aktiv).sort((a, b) => a.reihenfolge - b.reihenfolge),
    [profiles],
  );

  const [editing, setEditing] = useState<{
    profile: Profile;
    typ: ZertifikatTyp;
    initialFile?: File;
  } | null>(null);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">📜 Zertifikate</h1>
          <p className="text-sm text-muted mt-1">
            Übersicht aller Mitarbeiter-Schulungen und Führungszeugnisse.
            {!canEdit && ' Nur Lese-Zugriff.'}
          </p>
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div
            className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-2"
            style={{ gridTemplateColumns: '160px repeat(3, 1fr)' }}
          >
            <div>Mitarbeiter</div>
            {ZERTIFIKAT_TYPEN.map((t) => (
              <div key={t.key} title={t.beschreibung}>
                {t.kurz}
              </div>
            ))}
          </div>
          <div className="divide-y divide-border-soft">
            {mitarbeiterListe.map((p) => {
              const zs = zertByProfile.get(p.id) ?? [];
              return (
                <div
                  key={p.id}
                  className="grid gap-2 px-3 py-2.5 items-center"
                  style={{ gridTemplateColumns: '160px repeat(3, 1fr)' }}
                >
                  <div className="text-sm">
                    <div className="font-semibold">{firstName(p.name)}</div>
                    <div className="text-[10px] text-muted-2 uppercase tracking-wider">
                      {p.rolle}
                    </div>
                  </div>
                  {ZERTIFIKAT_TYPEN.map((t) => {
                    const st = statusFor(zs, t.key, heute);
                    const c = statusColor(st.status);
                    let label = 'Kein Eintrag';
                    if (st.zertifikat && st.tageBisAblauf !== null) {
                      const datum = st.zertifikat.gueltig_bis;
                      const dd = datum.slice(8, 10) + '.' + datum.slice(5, 7) + '.' + datum.slice(0, 4);
                      if (st.tageBisAblauf < 0) {
                        label = `abgelaufen seit ${-st.tageBisAblauf} T (${dd})`;
                      } else if (st.tageBisAblauf <= 30) {
                        label = `läuft ab in ${st.tageBisAblauf} T (${dd})`;
                      } else {
                        label = `gültig bis ${dd}`;
                      }
                    }
                    return (
                      <ZertCell
                        key={t.key}
                        canEdit={canEdit}
                        label={label}
                        color={c}
                        onClick={() => setEditing({ profile: p, typ: t.key })}
                        onDrop={(file) => setEditing({ profile: p, typ: t.key, initialFile: file })}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-muted">
          Grün = gültig · Gelb = läuft in ≤30 Tagen ab · Rot = abgelaufen · Grau = noch nichts hinterlegt.
          {canEdit && ' Klick auf eine Zelle, um Datum & Datei zu hinterlegen.'}
        </div>
      </div>

      {editing && (
        <ZertifikatModal
          profile={editing.profile}
          typ={editing.typ}
          initialFile={editing.initialFile}
          zertifikate={(zertByProfile.get(editing.profile.id) ?? []).filter((z) => z.typ === editing.typ)}
          onClose={() => setEditing(null)}
          canEdit={canEdit}
        />
      )}
    </Layout>
  );
}

interface ZertCellProps {
  canEdit: boolean;
  label: string;
  color: { bg: string; border: string; text: string };
  onClick: () => void;
  onDrop: (file: File) => void;
}

function ZertCell({ canEdit, label, color, onClick, onDrop }: ZertCellProps) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={() => canEdit && onClick()}
      disabled={!canEdit}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onDrop(file);
      }}
      className={`rounded px-2 py-1.5 text-xs text-left transition-all ${
        canEdit ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'
      }`}
      style={{
        background: over ? 'rgba(212,255,0,0.10)' : color.bg,
        border: over ? '1px dashed #d4ff00' : `1px solid ${color.border}`,
        color: over ? '#d4ff00' : color.text,
        transform: over ? 'scale(0.98)' : undefined,
      }}
      title={canEdit ? 'Klicken oder Datei drauf ziehen' : undefined}
    >
      {over ? '📎 Datei ablegen …' : label}
    </button>
  );
}

interface ModalProps {
  profile: Profile;
  typ: ZertifikatTyp;
  initialFile?: File;
  zertifikate: Zertifikat[];
  onClose: () => void;
  canEdit: boolean;
}

function ZertifikatModal({ profile, typ, initialFile, zertifikate, onClose, canEdit }: ModalProps) {
  const session = useAuth((s) => s.session)!;
  const qc = useQueryClient();
  const typInfo = ZERTIFIKAT_TYPEN.find((t) => t.key === typ)!;
  const [ausgestellt, setAusgestellt] = useState(heuteBerlinISO());
  const [notiz, setNotiz] = useState('');
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [err, setErr] = useState<string | null>(null);

  const gueltigBis = berechneGueltigBis(ausgestellt, typ);

  const addMut = useMutation({
    mutationFn: async () => {
      let storagePath: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const path = `${profile.id}/${typ}/${stamp}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('zertifikate')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        storagePath = path;
      }
      const { error } = await supabase.rpc('add_zertifikat', {
        _profile_id: session.profile.id,
        _target_profile_id: profile.id,
        _typ: typ,
        _ausgestellt_am: ausgestellt,
        _gueltig_bis: gueltigBis,
        _datei_storage_path: storagePath ?? '',
        _notiz: notiz,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zertifikate'] });
      setFile(null);
      setNotiz('');
      setAusgestellt(heuteBerlinISO());
    },
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_zertifikat', {
        _profile_id: session.profile.id,
        _zertifikat_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zertifikate'] });
    },
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  });

  async function openDatei(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from('zertifikate')
      .createSignedUrl(path, 300);
    if (error || !data) {
      setErr(error?.message ?? 'Konnte URL nicht erzeugen');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl p-5 w-full max-w-lg space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-bold">
            {typInfo.label} — {firstName(profile.name)}
          </h2>
          <p className="text-xs text-muted mt-0.5">{typInfo.beschreibung}</p>
        </div>

        {zertifikate.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted">Bestehende Einträge</div>
            {zertifikate.map((z) => (
              <div
                key={z.id}
                className="flex items-center justify-between gap-2 bg-surface-2 border border-border-soft rounded px-3 py-2 text-sm"
              >
                <div>
                  <div className="mono">
                    {z.ausgestellt_am} → {z.gueltig_bis}
                  </div>
                  {z.notiz && <div className="text-xs text-muted mt-0.5">{z.notiz}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {z.datei_storage_path && (
                    <button
                      type="button"
                      onClick={() => openDatei(z.datei_storage_path)}
                      className="text-xs underline text-accent hover:text-text"
                    >
                      📄 Datei
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Eintrag wirklich löschen?')) {
                          delMut.mutate(z.id);
                        }
                      }}
                      className="text-xs text-minus hover:underline"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-2 border-t border-border-soft pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">Neuer Eintrag</div>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Ausgestellt am</span>
              <input
                type="date"
                value={ausgestellt}
                onChange={(e) => setAusgestellt(e.target.value)}
                className="field-input text-sm"
              />
            </label>
            <div className="text-xs text-muted">
              → Gültig bis <strong className="mono">{gueltigBis}</strong>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Datei (PDF / Foto, optional)</span>
              {file ? (
                <div className="flex items-center justify-between gap-2 bg-surface-2 border border-border-soft rounded px-3 py-2 text-sm">
                  <span className="truncate">📎 {file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-minus hover:underline"
                  >
                    × entfernen
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="field-input text-sm"
                />
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Notiz (optional)</span>
              <textarea
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                rows={2}
                className="field-input text-sm"
              />
            </label>
            {err && (
              <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2">
                {err}
              </div>
            )}
            <button
              type="button"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || !ausgestellt}
              className="btn-primary px-4 py-2 text-sm font-bold w-full disabled:opacity-50"
            >
              {addMut.isPending ? 'Speichere …' : '💾 Speichern'}
            </button>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border-soft">
          <button type="button" onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
