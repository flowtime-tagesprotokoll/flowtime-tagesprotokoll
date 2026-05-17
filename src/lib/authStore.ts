import { create } from 'zustand';
import type { Profile, Session } from './types';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  setMitarbeiter: (profile: Profile) => void;
  setAdmin: (profile: Profile, authUserId: string) => void;
  signOut: () => Promise<void>;
}

/**
 * Login-State läuft NUR im Memory: Beim Schließen der App wird automatisch
 * ausgeloggt. Beim Neustart muss der Mitarbeiter seinen Namen neu auswählen
 * und der Admin sein Passwort eingeben.
 */
export const useAuth = create<AuthState>()((set, get) => ({
  session: null,
  setMitarbeiter: (profile) => {
    set({ session: { kind: 'mitarbeiter', profile } });
    void writeAudit('LOGIN', null, profile.name, profile.id, 'mitarbeiter');
  },
  setAdmin: (profile, authUserId) => {
    set({ session: { kind: 'admin', profile, authUserId } });
    void writeAudit('LOGIN', null, profile.name, profile.id, 'admin');
  },
  signOut: async () => {
    const sess = get().session;
    if (sess) {
      await writeAudit('LOGOUT', sess.profile.name, null, sess.profile.id, sess.profile.rolle);
    }
    await supabase.auth.signOut();
    set({ session: null });
  },
}));

// Direkter Audit-Insert um Zyklus mit lib/audit.ts zu vermeiden.
async function writeAudit(
  action: string,
  oldVal: unknown,
  newVal: unknown,
  profileId: string,
  rolle: string,
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      profile_id: profileId,
      user_name: newVal ?? oldVal,
      rolle,
      action,
      old_val: oldVal,
      new_val: newVal,
    });
  } catch (e) {
    console.warn('[audit] login/logout log failed:', e);
  }
}
