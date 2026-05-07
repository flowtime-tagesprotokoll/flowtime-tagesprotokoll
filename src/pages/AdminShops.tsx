import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import type { Shop } from '../lib/types';

function useAllShops() {
  return useQuery({
    queryKey: ['shops-all'],
    queryFn: async (): Promise<Shop[]> => {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .order('reihenfolge');
      if (error) throw error;
      return (data ?? []) as Shop[];
    },
  });
}

export function AdminShopsPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: shops, isLoading } = useAllShops();
  const [newName, setNewName] = useState('');
  const [newKurz, setNewKurz] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (session.kind !== 'admin') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Shop-Verwaltung nur für Admin sichtbar.
          </div>
        </div>
      </Layout>
    );
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['shops-all'] });
    qc.invalidateQueries({ queryKey: ['shops'] });
  }

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Shop> }) => {
      const { error } = await supabase.from('shops').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  async function addShop() {
    if (!newName.trim() || !newKurz.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const maxOrder = Math.max(0, ...(shops ?? []).map((s) => s.reihenfolge));
      const { error } = await supabase.from('shops').insert({
        name: newName.trim(),
        kurz: newKurz.trim().toUpperCase(),
        reihenfolge: maxOrder + 1,
        aktiv: true,
      });
      if (error) throw error;
      setNewName('');
      setNewKurz('');
      invalidate();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteShop(s: Shop) {
    if (
      !window.confirm(
        `Shop "${s.name}" wirklich löschen?\n\nGeht nur, wenn KEINE Protokolle existieren. Sonst auf "Inaktiv" stellen.`,
      )
    )
      return;
    try {
      const { error } = await supabase.from('shops').delete().eq('id', s.id);
      if (error) throw error;
      invalidate();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold">🏪 Shop-Verwaltung</h1>
        </div>

        {err && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            {err}
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted">
            ➕ Neuer Shop
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Shop-Name (z.B. Lange Str. 12)"
              className="field-input"
            />
            <input
              type="text"
              value={newKurz}
              onChange={(e) => setNewKurz(e.target.value.toUpperCase())}
              placeholder="Kürzel (LST)"
              maxLength={6}
              className="field-input mono"
            />
            <button
              type="button"
              onClick={addShop}
              disabled={busy || !newName.trim() || !newKurz.trim()}
              className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              + Anlegen
            </button>
          </div>
        </div>

        {isLoading && <div className="text-muted text-sm">Lade …</div>}

        <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
          {(shops ?? []).map((shop) => (
            <ShopRow
              key={shop.id}
              shop={shop}
              onUpdate={(patch) => update.mutate({ id: shop.id, patch })}
              onDelete={() => deleteShop(shop)}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}

function ShopRow({
  shop,
  onUpdate,
  onDelete,
}: {
  shop: Shop;
  onUpdate: (patch: Partial<Shop>) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(shop.name);

  return (
    <div
      className="grid grid-cols-[80px_1fr_auto_auto] gap-2 items-center p-2 rounded border border-border-soft"
      style={{ opacity: shop.aktiv ? 1 : 0.5 }}
    >
      <div className="text-xs uppercase tracking-wider mono text-muted">
        {shop.kurz}
      </div>
      {editingName ? (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== shop.name)
              onUpdate({ name: name.trim() });
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(shop.name);
              setEditingName(false);
            }
          }}
          autoFocus
          className="field-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="text-left text-sm hover:text-accent font-semibold"
        >
          {shop.name}
        </button>
      )}
      <label className="flex items-center gap-1 text-xs text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={shop.aktiv}
          onChange={(e) => onUpdate({ aktiv: e.target.checked })}
        />
        aktiv
      </label>
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
