import { useEffect, useRef, useState } from 'react';
import { deleteBeleg, getBelegUrl, uploadBeleg } from '../lib/beleg';

interface Props {
  shopId: string;
  datum: string;
  schichtNr: 1 | 2;
  belegPath: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}

export function BelegUpload({
  shopId,
  datum,
  schichtNr,
  belegPath,
  onChange,
  disabled,
}: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!belegPath) {
      setSignedUrl(null);
      return;
    }
    // Migrierte Daten aus alter App enthalten data:URIs direkt im Feld.
    // Neue Uploads sind Storage-Pfade.
    if (belegPath.startsWith('data:')) {
      setSignedUrl(belegPath);
      return;
    }
    getBelegUrl(belegPath)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e instanceof Error ? e.message : e));
      });
    return () => {
      cancelled = true;
    };
  }, [belegPath]);

  async function handleFile(file: File | Blob) {
    setBusy(true);
    setErr(null);
    try {
      const path = await uploadBeleg(file, shopId, datum, schichtNr);
      onChange(path);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!belegPath) return;
    setBusy(true);
    setErr(null);
    try {
      // Storage-Datei nur löschen wenn echter Storage-Pfad (nicht data:URI aus Migration)
      if (!belegPath.startsWith('data:')) {
        await deleteBeleg(belegPath);
      }
      onChange(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const items = Array.from(e.clipboardData.items);
    const img = items.find((i) => i.type.startsWith('image/'));
    if (!img) return;
    const blob = img.getAsFile();
    if (blob) {
      e.preventDefault();
      handleFile(blob);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  }

  return (
    <div className="space-y-2">
      {err && (
        <div className="text-[11px] text-minus bg-minus/10 border border-minus/30 rounded px-2 py-1">
          {err}
        </div>
      )}

      {belegPath && signedUrl ? (
        <div className="relative">
          <img
            src={signedUrl}
            alt="Beleg"
            onClick={() => setZoom(true)}
            style={{
              width: '100%',
              maxHeight: 140,
              objectFit: 'contain',
              background: '#fff',
              borderRadius: 4,
              cursor: 'zoom-in',
              border: '1px solid #2a2a2a',
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || busy}
            aria-label="Foto entfernen"
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-minus text-white text-xs flex items-center justify-center shadow-lg disabled:opacity-50"
            title="Foto entfernen"
          >
            ×
          </button>
        </div>
      ) : belegPath ? (
        // belegPath gesetzt, signedUrl wird noch geladen — sanftes Loading,
        // KEIN faelschlicher 'Beleg fehlt'-Hinweis.
        <div
          className="text-[11px] mono text-muted text-center py-3"
          style={{ border: '1px dashed #2a2a2a', borderRadius: 5 }}
        >
          Lade Beleg …
        </div>
      ) : (
        <div
          ref={dropRef}
          tabIndex={0}
          className={dragOver || isFocused ? '' : 'beleg-empty-glow'}
          onClick={() => !disabled && dropRef.current?.focus()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onPaste={onPaste}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${
              dragOver || isFocused ? '#d4ff00' : 'rgba(251,191,36,0.55)'
            }`,
            borderRadius: 5,
            padding: '14px 8px',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            background: dragOver || isFocused
              ? 'rgba(212,255,0,0.04)'
              : 'rgba(251,191,36,0.04)',
            color: dragOver || isFocused ? '#d4ff00' : '#fbbf24',
            opacity: disabled ? 0.5 : 1,
            outline: 'none',
          }}
        >
          <div className="text-xl mb-0.5">{busy ? '⏳' : '📷'}</div>
          <div className="text-[12px] mono font-bold" style={{ letterSpacing: '0.05em' }}>
            ⚠ BELEGFOTO FEHLT
          </div>
          <div className="text-[11px] mono mt-0.5" style={{ opacity: 0.85 }}>
            {busy
              ? 'lädt hoch …'
              : isFocused
                ? 'Strg+V drücken zum Einfügen'
                : 'Klick zum Aktivieren · Drag&Drop'}
          </div>
          <div className="text-[10px] mono mt-1" style={{ color: '#555' }}>
            oder{' '}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={disabled || busy}
              className="underline hover:text-accent"
              style={{ color: '#888' }}
            >
              Datei wählen
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {zoom && signedUrl && (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', cursor: 'zoom-out' }}
        >
          <img
            src={signedUrl}
            alt="Beleg vergrößert"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
}
