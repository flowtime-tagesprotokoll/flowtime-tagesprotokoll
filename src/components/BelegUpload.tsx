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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!belegPath) {
      setSignedUrl(null);
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
      await deleteBeleg(belegPath);
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
      ) : (
        <div
          ref={dropRef}
          tabIndex={0}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onPaste={onPaste}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? '#d4ff00' : '#2a2a2a'}`,
            borderRadius: 5,
            padding: '14px 8px',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            background: dragOver ? 'rgba(212,255,0,0.04)' : '#1c1c1c',
            color: dragOver ? '#d4ff00' : '#888',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <div className="text-xl mb-0.5">{busy ? '⏳' : '📷'}</div>
          <div className="text-[11px] mono">
            {busy ? 'lädt hoch …' : 'Foto / Screenshot hierher ziehen'}
          </div>
          <div className="text-[10px] mono mt-0.5" style={{ color: '#555' }}>
            oder klicken · Strg+V einfügen
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
