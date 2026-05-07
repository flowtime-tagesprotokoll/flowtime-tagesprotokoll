import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log('[supabase] init', {
  url,
  keyPrefix: key ? key.substring(0, 20) + '…' : '(missing)',
});

if (!url || !key) {
  throw new Error(
    'Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  );
}

export const supabase = createClient(url, key);
