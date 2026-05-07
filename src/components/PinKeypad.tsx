import { useEffect, useState } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<void> | void;
  errorMessage?: string | null;
  busy?: boolean;
  /** Wenn true → Bestätigungs-Modus mit zweitem Eingabefeld (für PIN setzen). */
  confirm?: boolean;
}

export function PinKeypad({
  title,
  subtitle,
  onCancel,
  onSubmit,
  errorMessage,
  busy,
  confirm,
}: Props) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [step, setStep] = useState<'first' | 'second'>('first');
  const [localErr, setLocalErr] = useState<string | null>(null);

  function press(d: string) {
    setLocalErr(null);
    if (step === 'first') {
      if (pin.length < 4) setPin(pin + d);
    } else {
      if (pin2.length < 4) setPin2(pin2 + d);
    }
  }
  function backspace() {
    setLocalErr(null);
    if (step === 'first') setPin(pin.slice(0, -1));
    else setPin2(pin2.slice(0, -1));
  }
  function clear() {
    setLocalErr(null);
    setPin('');
    setPin2('');
    setStep('first');
  }

  // auto-submit when 4 digits entered
  useEffect(() => {
    if (!confirm && pin.length === 4) {
      onSubmit(pin).catch(() => {});
    }
    if (confirm && step === 'first' && pin.length === 4) {
      setStep('second');
    }
    if (confirm && step === 'second' && pin2.length === 4) {
      if (pin === pin2) {
        onSubmit(pin).catch(() => {});
      } else {
        setLocalErr('PINs stimmen nicht überein. Bitte neu.');
        setPin('');
        setPin2('');
        setStep('first');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pin2, step]);

  const currentPin = step === 'first' ? pin : pin2;
  const display = currentPin.padEnd(4, '○').split('').map((c, i) => (
    <span
      key={i}
      className="w-10 h-10 flex items-center justify-center text-2xl font-bold rounded border-2 border-border bg-surface-2 mono"
      style={{
        color: c === '○' ? '#555' : '#d4ff00',
        borderColor: c === '○' ? '#2a2a2a' : '#d4ff00',
      }}
    >
      {c === '○' ? '·' : '●'}
    </span>
  ));

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border-2 border-accent rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted mt-1">{subtitle}</p>
          )}
          {confirm && (
            <p className="text-xs text-accent mt-1 mono">
              {step === 'first' ? '1/2 — neue PIN eingeben' : '2/2 — zur Bestätigung wiederholen'}
            </p>
          )}
        </div>

        <div className="flex justify-center gap-2 my-2">{display}</div>

        {(errorMessage || localErr) && (
          <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2 text-center">
            {errorMessage || localErr}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              disabled={busy}
              className="py-4 rounded-lg bg-surface-2 hover:bg-surface-3 text-2xl font-bold mono active:scale-95 transition-transform disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="py-4 rounded-lg bg-surface-2 hover:bg-minus/20 text-base mono text-muted disabled:opacity-50"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => press('0')}
            disabled={busy}
            className="py-4 rounded-lg bg-surface-2 hover:bg-surface-3 text-2xl font-bold mono active:scale-95 transition-transform disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            disabled={busy}
            className="py-4 rounded-lg bg-surface-2 hover:bg-surface-3 text-base mono text-muted disabled:opacity-50"
          >
            ⌫
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-muted hover:text-accent w-full text-center pt-1"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
