import { getTeacherIdentity, hasSupabaseConfig } from '../lib/supabaseClient.js';

export async function requireTeacher({ redirect = true } = {}) {
  if (!hasSupabaseConfig) {
    document.documentElement.dataset.authState = 'configuration-required';
    return null;
  }

  const identity = await getTeacherIdentity();
  if (!identity && redirect) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/facilitators/login?next=${encodeURIComponent(next)}`);
    return null;
  }

  document.documentElement.dataset.authState = identity ? 'authenticated' : 'unauthenticated';
  return identity;
}

export function safeNextPath(value) {
  if (!value || typeof value !== 'string') return '/facilitator';
  if (value.startsWith('//') || value.includes('://')) return '/facilitator';
  if (value.startsWith('/teacher')) return value.replace('/teacher', '/facilitator');
  return value.startsWith('/facilitator') ? value : '/facilitator';
}
