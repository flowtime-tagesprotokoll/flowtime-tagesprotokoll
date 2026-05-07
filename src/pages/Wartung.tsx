import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';

export function WartungPage() {
  const session = useAuth((s) => s.session)!;
  const navigate = useNavigate();
  const [migrating, setMigrating] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  if (session.kind !== 'admin') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            Wartung nur für Admin sichtbar.
          </div>
        </div>
      </Layout>
    );
  }

  function append(line: string) {
    setLog((l) => [...l, line]);
  }

  async function downloadBackup() {
    setMigrating(true);
    setLog([]);
    append('▶ Lade alle Tabellen …');
    try {
      const tables = ['shops', 'profiles', 'shop_mitarbeiter', 'protokolle', 'schichten', 'kassenbewegungen', 'audit_log'];
      const out: Record<string, unknown[]> = {};
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) throw error;
        out[t] = data ?? [];
        append(`  ${t}: ${(data ?? []).length} Zeilen`);
      }
      const payload = {
        backupCreated: new Date().toISOString(),
        version: 1,
        tables: out,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `flowtime-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      append('✅ Backup heruntergeladen.');
    } catch (e) {
      append(`❌ Fehler: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setMigrating(false);
    }
  }

  async function migrateBelege() {
    setMigrating(true);
    setLog([]);
    try {
      append('▶ Suche Schichten mit Base64-Belegfotos …');
      const { data: schichten, error } = await supabase
        .from('schichten')
        .select('id, schicht_nr, protokoll_id, beleg_storage_path, protokolle(shop_id, datum)')
        .like('beleg_storage_path', 'data:image%');
      if (error) throw error;
      const list = (schichten ?? []) as Array<{
        id: string;
        schicht_nr: number;
        protokoll_id: string;
        beleg_storage_path: string;
        protokolle: { shop_id: string; datum: string };
      }>;
      append(`Gefunden: ${list.length} Schichten mit Inline-Foto`);
      if (list.length === 0) {
        append('✅ Nichts zu migrieren.');
        return;
      }
      for (const s of list) {
        const dataUri = s.beleg_storage_path;
        const m = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (!m) {
          append(`⚠ ${s.id}: kein gültiges data:URI, übersprungen`);
          continue;
        }
        const mime = m[1];
        const b64 = m[2];
        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const path = `${s.protokolle.shop_id}/${s.protokolle.datum}/${s.schicht_nr}.${ext}`;
        append(`⏳ Upload ${path} (${(blob.size / 1024).toFixed(1)} KB) …`);
        const { error: upErr } = await supabase.storage
          .from('belege')
          .upload(path, blob, { contentType: mime, upsert: true });
        if (upErr) {
          append(`❌ ${path}: ${upErr.message}`);
          continue;
        }
        const { error: updErr } = await supabase
          .from('schichten')
          .update({ beleg_storage_path: path })
          .eq('id', s.id);
        if (updErr) {
          append(`❌ DB-Update fehlgeschlagen: ${updErr.message}`);
          continue;
        }
        append(`✅ ${path}`);
      }
      append('— fertig —');
    } catch (e) {
      append(`❌ Fehler: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setMigrating(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-accent mb-1 mono"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold">🛠 Wartung</h1>
          <div className="text-sm text-muted">
            Einmalige Admin-Aktionen. Sorgsam verwenden.
          </div>
        </div>

        <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div>
            <h2 className="font-bold">💾 Backup als JSON herunterladen</h2>
            <p className="text-sm text-muted mt-1">
              Lädt alle Tabellen (Shops, Profile, Protokolle, Schichten,
              Bewegungen, Audit-Log) als eine JSON-Datei herunter. Empfehlung:
              regelmäßig (z.B. monatlich) ausführen und sicher ablegen.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={migrating}
            className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {migrating ? '…' : '⤓ Backup herunterladen'}
          </button>
        </section>

        <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div>
            <h2 className="font-bold">Belegfotos in Storage migrieren</h2>
            <p className="text-sm text-muted mt-1">
              Aus der Drive-Migration kommen Belegfotos als Base64 inline in der
              Datenbank an. Dieser Button lädt sie als richtige Storage-Dateien
              hoch und ersetzt das Feld in der Datenbank durch den Storage-Pfad.
              Idempotent — kann mehrfach gestartet werden, schon migrierte Bilder
              werden ignoriert.
            </p>
          </div>
          <button
            type="button"
            onClick={migrateBelege}
            disabled={migrating}
            className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {migrating ? 'Migriere …' : '▶ Belege migrieren'}
          </button>
          {log.length > 0 && (
            <pre className="bg-bg border border-border-soft rounded p-3 text-xs font-mono text-muted whitespace-pre-wrap max-h-72 overflow-auto">
              {log.join('\n')}
            </pre>
          )}
        </section>
      </div>
    </Layout>
  );
}
