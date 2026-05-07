import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, Session } from './types';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  setMitarbeiter: (profile: Profile) => void;
  setAdmin: (profile: Profile, authUserId: string) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setMitarbeiter: (profile) =>
        set({ session: { kind: 'mitarbeiter', profile } }),
      setAdmin: (profile, authUserId) =>
        set({ session: { kind: 'admin', profile, authUserId } }),
      signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null });
      },
    }),
    { name: 'flowtime-session' },
  ),
);
