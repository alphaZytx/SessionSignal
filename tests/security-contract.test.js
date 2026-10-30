import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('extension permissions are minimal and do not inspect meeting pages', async () => {
  const manifest = JSON.parse(await read('apps/extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['sidePanel', 'storage'].sort());
  assert.ok(!manifest.permissions.includes('tabs'));
  assert.ok(!manifest.permissions.includes('scripting'));
  assert.ok(!manifest.permissions.includes('activeTab'));
  assert.deepEqual(manifest.host_permissions, ['https://*.supabase.co/*']);
});

test('telemetry transport submits aggregate metrics and no raw-media fields', async () => {
  const transport = await read('apps/extension/src/telemetryClient.js');
  assert.match(transport, /p_metrics: packet\.metrics/);
  for (const forbidden of ['videoBlob', 'canvasData', 'imageData', 'screenshot', 'audioBlob', 'faceCrop']) {
    assert.ok(!transport.includes(forbidden), `transport must not contain ${forbidden}`);
  }
});

test('database migration enables RLS and validates ownership through RPCs', async () => {
  const sql = await read('supabase/migrations/202610300001_sessionsignal_foundation.sql');
  for (const table of ['profiles', 'sessions', 'session_participants', 'student_snapshots', 'session_join_attempts']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /p\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /s\.teacher_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /session_row\.status <> 'active'/);
  assert.match(sql, /Telemetry submitted too frequently/);
  assert.match(sql, /get_session_latest_snapshots/);
  assert.match(sql, /realtime\.messages\.extension = 'broadcast'/);
  assert.doesNotMatch(sql, /service_role/i);
});

test('student join migration uses an unambiguous participant conflict target', async () => {
  const sql = await read('supabase/migrations/202610310003_fix_join_conflict_target.sql');
  assert.match(sql, /on conflict on constraint session_participants_session_id_auth_user_id_key/i);
  assert.doesNotMatch(sql, /on conflict \(session_id, auth_user_id\)/i);
});

test('production client source does not contain a Supabase secret key', async () => {
  const files = ['apps/web/src/lib/supabaseClient.js', 'apps/extension/src/telemetryClient.js', 'apps/extension/manifest.json'];
  for (const file of files) assert.doesNotMatch(await read(file), /sb_secret_[A-Za-z0-9_-]+/);
});
