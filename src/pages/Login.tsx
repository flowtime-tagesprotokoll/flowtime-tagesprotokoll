import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PinKeypad } from '../components/PinKeypad';
import { useProfiles } from '../lib/queries';
import { useAuth } from '../lib/authStore';
import { supabase } from '../lib/supabase';
import { verifyPin } from '../lib/pin';
import { ensureNotificationPermission } from '../lib/notify';
import { firstName } from '../lib/types';
import type { Profile } from '../lib/types';

export function LoginPage() {
  const { data: profiles, isLoading, error } = useProfiles();
  const setMitarbeiter = useAuth((s) => s.setMitarbeiter);
  const navigate = useNavigate();
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  function handleSelectProfile(p: Profile) {
    if (p.rolle === 'admin') {
      setAdminProfile(p);
      return;
    }
    // Mitarbeiter / Bezirksleiter: wenn PIN gesetzt → Keypad, sonst direkt rein
    if (p.pin_hash) {
      setPinProfile(p);
      setPinErr(null);
    } else {
      ensureNotificationPermission().catch(() => {});
      setMitarbeiter(p);
      navigate('/');
    }
  }

  async function handlePinSubmit(pin: string) {
    if (!pinProfile) return;
    setPinBusy(true);
    setPinErr(null);
    const ok = await verifyPin(pin, pinProfile.pin_hash);
    setPinBusy(false);
    if (!ok) {
      setPinErr('PIN falsch.');
      return;
    }
    ensureNotificationPermission().catch(() => {});
    setMitarbeiter(pinProfile);
    setPinProfile(null);
    navigate('/');
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Wer arbeitet heute?</h1>
          <p className="text-sm text-muted">Wähle deinen Namen aus der Liste.</p>
        </div>

        {isLoading && <div className="text-center text-muted">Lade …</div>}

        {error && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm space-y-1">
            <div className="font-semibold">Fehler beim Laden:</div>
            <div className="font-mono text-xs whitespace-pre-wrap break-all">
              {error instanceof Error ? error.message : JSON.stringify(error, null, 2)}
            </div>
          </div>
        )}

        {profiles && (
          <div className="grid grid-cols-2 gap-3">
            {profiles.filter((p) => !p.nur_verwaltung).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProfile(p)}
                className="bg-surface border border-border rounded-lg p-4 text-left hover:border-accent hover:bg-surface-2 transition-colors"
              >
                <div className="text-base font-semibold">
                  {p.name.split(' ')[0]}
                </div>
                <div className="text-xs text-muted uppercase tracking-wider mt-1">
                  {p.rolle}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {adminProfile && (
        <AdminLoginModal
          profile={adminProfile}
          onClose={() => setAdminProfile(null)}
          onSuccess={(authUserId, profile) => {
            useAuth.getState().setAdmin(profile, authUserId);
            navigate('/');
          }}
        />
      )}

      {pinProfile && (
        <PinKeypad
          title={firstName(pinProfile.name)}
          subtitle="PIN eingeben"
          onCancel={() => {
            setPinProfile(null);
            setPinErr(null);
          }}
          onSubmit={handlePinSubmit}
          errorMessage={pinErr}
          busy={pinBusy}
        />
      )}
    </Layout>
  );
}

interface AdminLoginModalProps {
  profile: Profile;
  onClose: () => void;
  onSuccess: (authUserId: string, profile: Profile) => void;
}

function AdminLoginModal({ profile, onClose, onSuccess }: AdminLoginModalProps) {
  const [email, setEmail] = useState('flowtimegmbh@gmail.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (!data.user) {
      setErr('Login fehlgeschlagen.');
      return;
    }
    ensureNotificationPermission().catch(() => {});
    onSuccess(data.user.id, profile);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-lg p-6 w-full max-w-sm space-y-4"
      >
        <div>
          <h2 className="text-lg font-bold">Admin-Login</h2>
          <p className="text-sm text-muted mt-1">{firstName(profile.name)}</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-muted uppercase tracking-wider">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="field-input"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted uppercase tracking-wider">
            Passwort
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="field-input"
          />
        </label>

        {err && (
          <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1"
            disabled={busy}
          >
            Abbrechen
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? 'Anmelden …' : 'Anmelden'}
          </button>
        </div>
      </form>
    </div>
  );
}
