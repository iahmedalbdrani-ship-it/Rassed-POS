import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnvironmentConfig } from './environment';

const { supabase: cfg } = getEnvironmentConfig();

export const supabase: SupabaseClient = createClient(cfg.url, cfg.anonKey, {
  auth: {
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

export function getSupabaseConfig() {
  return cfg;
}

export default supabase;
