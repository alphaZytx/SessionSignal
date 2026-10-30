import { createClient } from '@supabase/supabase-js';

const publicEnvironment = import.meta.env || {};
const supabaseUrl = publicEnvironment.VITE_SUPABASE_URL;
const supabasePublishableKey = publicEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.includes('YOUR_PROJECT') &&
  !supabasePublishableKey.includes('REPLACE_ME')
);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sessionsignal.teacher.auth'
      },
      realtime: {
        params: { eventsPerSecond: 20 }
      }
    })
  : null;

export function requireSupabaseConfig() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set the public project URL and publishable key.'
    );
  }
  return supabase;
}

export async function getTeacherIdentity() {
  const client = requireSupabaseConfig();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user || authData.user.is_anonymous) return null;

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== 'teacher') return null;
  return { user: authData.user, profile };
}
