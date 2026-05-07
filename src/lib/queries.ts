import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile, Shop } from './types';

export function useShops() {
  return useQuery({
    queryKey: ['shops'],
    queryFn: async (): Promise<Shop[]> => {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('aktiv', true)
        .order('reihenfolge');
      if (error) throw error;
      return data as Shop[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('aktiv', true)
        .order('reihenfolge');
      if (error) throw error;
      return data as Profile[];
    },
  });
}
