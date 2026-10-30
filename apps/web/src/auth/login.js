import { hasSupabaseConfig, supabase } from '../lib/supabaseClient.js';
import { getTeacherIdentity } from '../lib/supabaseClient.js';
import { safeNextPath } from './teacherGuard.js';

const form = document.getElementById('teacherLoginForm');
const notice = document.getElementById('loginNotice');
const submitButton = form?.querySelector('button[type="submit"]');
const nextPath = safeNextPath(new URLSearchParams(location.search).get('next'));

function showNotice(message, type = 'error') {
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.type = type;
  notice.hidden = false;
}

async function init() {
  if (!hasSupabaseConfig) {
    showNotice('Facilitator sign-in needs Supabase configuration. Follow the repository setup guide first.', 'warning');
    if (submitButton) submitButton.disabled = true;
    return;
  }

  const identity = await getTeacherIdentity();
  if (identity) location.replace(nextPath);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  submitButton.disabled = true;
  showNotice('Signing in…', 'progress');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showNotice(error.message);
    submitButton.disabled = false;
    return;
  }

  const identity = await getTeacherIdentity();
  if (!identity) {
    await supabase.auth.signOut();
    showNotice('This account is not provisioned as a SessionSignal facilitator. Ask the project owner to approve it.');
    submitButton.disabled = false;
    return;
  }

  location.replace(nextPath);
});

init();
