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
export const useAuth = create<AuthState>()((set) => ({
  session: null,
  setMitarbeiter: (profile) => set({ session: { kind: 'mitarbeiter', profile } }),
  setAdmin: (profile, authUserId) =>
    set({ session: { kind: 'admin', profile, authUserId } }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
