import { requireTeacher } from '../../web/src/auth/teacherGuard.js';
import { supabase } from '../../web/src/lib/supabaseClient.js';
import { listTeacherSessions } from './analyticsRepository.js';

document.addEventListener('DOMContentLoaded', async () => {
  const identity = await requireTeacher();
  if (!identity) return;
  const tbody = document.getElementById('sessionRows');
  try {
    const sessions = await listTeacherSessions();
    tbody.innerHTML = sessions.length ? sessions.map((session) => `
      <tr>
        <td><strong>${session.session_code}</strong></td>
        <td>${new Date(session.started_at).toLocaleString()}</td>
        <td>${session.ended_at ? new Date(session.ended_at).toLocaleString() : '—'}</td>
        <td>${session.status}</td>
        <td>${session.source === 'legacy_sqlite' ? 'Migrated legacy' : session.source === 'development_demo' ? 'Development demo' : 'SessionSignal'}</td>
        <td><a class="btn btn-primary" href="/facilitator/analytics?sessionId=${encodeURIComponent(session.id)}">Open report</a></td>
      </tr>`).join('') : '<tr><td colspan="6">No sessions yet.</td></tr>';
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="6"></td></tr>';
    tbody.querySelector('td').textContent = `Unable to load sessions: ${error.message}`;
  }
  document.getElementById('btnSignOut').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace('/facilitators/login');
  });
});
