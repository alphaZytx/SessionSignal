import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

async function loadEnv() {
  const result = { ...process.env };
  for (const filename of ['.env.local', '.env']) {
    try {
      for (const line of (await readFile(resolve(root, filename), 'utf8')).split(/\r?\n/)) {
        if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
        const at = line.indexOf('=');
        if (!(line.slice(0, at).trim() in result)) result[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
  return result;
}

function deterministicUuid(namespace, value) {
  const bytes = createHash('sha256').update(`${namespace}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const iso = (milliseconds) => milliseconds ? new Date(milliseconds).toISOString() : null;

function snapshotMetrics(row) {
  return {
    timing: { frameCount: row.frame_count || 0, intervalDurationMs: row.interval_duration_ms || 0,
      intervalStartTime: row.timestamp - (row.interval_duration_ms || 0), intervalEndTime: row.timestamp },
    faceConfidence: { mean: row.face_confidence_mean || null },
    attentionScore: { mean: row.attention_score, min: row.attention_score, max: row.attention_score, stdDev: 0, trend: 0 },
    gazeDeviation: { mean: row.gaze_deviation_mean || 0, max: row.gaze_deviation_max || 0 },
    gazeX: { mean: row.gaze_x || 0 }, gazeY: { mean: row.gaze_y || 0 },
    headPosePitch: { mean: row.head_pose_pitch_mean || 0, stdDev: row.head_pose_pitch_std || 0 },
    headPoseYaw: { mean: row.head_pose_yaw_mean || 0, stdDev: row.head_pose_yaw_std || 0 },
    headPoseRoll: { mean: row.head_pose_roll_mean || 0 },
    eyeOpennessLeft: { mean: row.eye_openness_left_mean || 0, min: row.eye_openness_left_min || 0 },
    eyeOpennessRight: { mean: row.eye_openness_right_mean || 0, min: row.eye_openness_right_min || 0 },
    blinkRate: { mean: row.blink_rate || 0 }, mouthOpenness: { mean: row.mouth_openness_mean || 0 },
    drowsinessScore: { mean: row.drowsiness_score || 0 },
    percentages: { gazeOnScreen: row.gaze_on_screen_pct || 0, faceDetected: row.face_detected_pct || 0, eyesClosed: row.eyes_closed_pct || 0 },
    modes: { headPoseCategory: row.head_pose_category || 'forward', attentionCategory: row.attention_category || 'neutral', emotion: row.primary_emotion || 'neutral' },
    eventFlags: { yawnDetected: Boolean(row.yawn_detected) },
    emotionDistribution: {
      focused: row.emotion_focused_pct || 0, confused: row.emotion_confused_pct || 0,
      bored: row.emotion_bored_pct || 0, engaged: row.emotion_engaged_pct || 0,
      distracted: row.emotion_distracted_pct || 0, drowsy: row.emotion_drowsy_pct || 0,
      neutral: row.emotion_neutral_pct || 0
    },
    computed: { intervalAttentionScore: row.interval_attention_score, attentionTrend: row.attention_trend || 'stable',
      alertFlags: (row.alert_flags || '').split(',').filter(Boolean) },
    // Historical reports must retain the exact score semantics that were used when
    // they were recorded. New extension packets use the stricter unavailable state.
    signalState: 'observable',
    legacySignalClassification: row.face_detected_pct < 10 ? 'would_be_unavailable' : 'observable'
  };
}

const env = await loadEnv();
const dbPath = resolve(root, env.SQLITE_DATABASE_PATH || 'apps/api/data/sessions.db');
await access(dbPath);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const sourceSessions = db.prepare('select * from sessions order by start_time').all();
const sourceStudents = db.prepare('select * from students order by join_time').all();
const sourceSnapshots = db.prepare('select * from snapshots order by id').all();

const lastSnapshotBySession = new Map();
for (const row of sourceSnapshots) {
  lastSnapshotBySession.set(row.session_id, Math.max(lastSnapshotBySession.get(row.session_id) || 0, row.timestamp || 0));
}

const participantIds = new Map(sourceStudents.map((row) => [`${row.session_id}:${row.id}`, deterministicUuid('legacy-participant', `${row.session_id}:${row.id}`)]));
for (const row of sourceSnapshots) {
  const key = `${row.session_id}:${row.student_id}`;
  if (!participantIds.has(key)) participantIds.set(key, deterministicUuid('legacy-participant', key));
}

const teacherId = env.LEGACY_TEACHER_ID;
const report = {
  mode: apply ? 'apply' : 'dry-run', database: dbPath,
  sourceCounts: { sessions: sourceSessions.length, students: sourceStudents.length, snapshots: sourceSnapshots.length },
  legacyTeacherId: teacherId || null,
  notes: ['Deterministic destination IDs make reruns idempotent.', 'Original SQLite database is opened read-only and is never modified.']
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  console.log('Dry run complete. Set LEGACY_TEACHER_ID, SUPABASE_URL, and SUPABASE_SECRET_KEY, then rerun with --apply.');
  process.exit(0);
}
if (!teacherId || !/^[0-9a-f-]{36}$/i.test(teacherId)) throw new Error('LEGACY_TEACHER_ID must be the explicit UUID of a provisioned teacher profile.');
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
  throw new Error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required for --apply.');
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: owner, error: ownerError } = await client.from('profiles').select('id, role').eq('id', teacherId).single();
if (ownerError || owner?.role !== 'teacher') throw new Error('LEGACY_TEACHER_ID is not a provisioned teacher profile in the target project.');

const sessions = sourceSessions.map((row) => ({
  id: row.id, teacher_id: teacherId, session_code: row.session_code, status: row.end_time ? 'ended' : 'ended',
  created_at: iso(row.start_time), started_at: iso(row.start_time),
  ended_at: iso(row.end_time || lastSnapshotBySession.get(row.id) || row.start_time),
  is_demo: row.session_code === 'DEMO01', source: row.session_code === 'DEMO01' ? 'development_demo' : 'legacy_sqlite',
  legacy_source_id: `sqlite:session:${row.id}`, retention_until: null,
  metadata: { legacyTeacherId: row.teacher_id || null, legacyStudentCount: row.student_count || 0, legacySnapshotCount: row.total_snapshots || 0 }
}));

const studentByKey = new Map(sourceStudents.map((row) => [`${row.session_id}:${row.id}`, row]));
const participantRows = [...participantIds.entries()].map(([key, id]) => {
  const [sessionId, ...studentParts] = key.split(':');
  const studentId = studentParts.join(':');
  const row = studentByKey.get(key);
  const firstSnapshot = sourceSnapshots.find((snapshot) => snapshot.session_id === sessionId && snapshot.student_id === studentId);
  return { id, session_id: sessionId, auth_user_id: null, display_name: row?.name || firstSnapshot?.student_name || 'Legacy student',
    status: 'session_ended', joined_at: iso(row?.join_time || firstSnapshot?.timestamp),
    last_seen_at: iso(row?.last_seen || firstSnapshot?.timestamp), stopped_at: iso(row?.last_seen || firstSnapshot?.timestamp),
    source: 'legacy_sqlite', legacy_source_id: `sqlite:participant:${key}`, metadata: { legacyStudentId: studentId } };
});

const snapshots = sourceSnapshots.map((row) => {
  const metrics = snapshotMetrics(row);
  return { id: deterministicUuid('legacy-snapshot', row.id), session_id: row.session_id,
    participant_id: participantIds.get(`${row.session_id}:${row.student_id}`), student_auth_user_id: null,
    student_display_name: row.student_name, captured_at: iso(row.timestamp),
    interval_started_at: iso(row.timestamp - (row.interval_duration_ms || 0)), interval_ended_at: iso(row.timestamp),
    interval_duration_ms: row.interval_duration_ms || 0, payload_version: '1.0', signal_state: metrics.signalState,
    attention_score: row.attention_score, attention_category: row.attention_category,
    attention_trend: row.attention_trend, interval_attention_score: row.interval_attention_score,
    gaze_on_screen_pct: row.gaze_on_screen_pct, gaze_deviation_mean: row.gaze_deviation_mean,
    gaze_deviation_max: row.gaze_deviation_max, gaze_x: row.gaze_x, gaze_y: row.gaze_y,
    head_pose_pitch_mean: row.head_pose_pitch_mean, head_pose_yaw_mean: row.head_pose_yaw_mean,
    head_pose_roll_mean: row.head_pose_roll_mean, head_pose_pitch_std: row.head_pose_pitch_std,
    head_pose_yaw_std: row.head_pose_yaw_std, head_pose_category: row.head_pose_category,
    eye_openness_left_mean: row.eye_openness_left_mean, eye_openness_left_min: row.eye_openness_left_min,
    eye_openness_right_mean: row.eye_openness_right_mean, eye_openness_right_min: row.eye_openness_right_min,
    eyes_closed_pct: row.eyes_closed_pct, blink_rate: row.blink_rate, mouth_openness_mean: row.mouth_openness_mean,
    yawn_detected: Boolean(row.yawn_detected), drowsiness_score: row.drowsiness_score,
    primary_emotion: row.primary_emotion, emotion_distribution: metrics.emotionDistribution,
    face_detected_pct: row.face_detected_pct, alert_flags: metrics.computed.alertFlags,
    frame_count: row.frame_count || 0, metrics, source: 'legacy_sqlite', legacy_source_id: `sqlite:snapshot:${row.id}` };
});

async function upsertBatches(table, rows, size = 200) {
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + size), { onConflict: 'id' });
    if (error) throw new Error(`${table} batch ${index / size + 1}: ${error.message}`);
  }
}
await upsertBatches('sessions', sessions);
await upsertBatches('session_participants', participantRows);
await upsertBatches('student_snapshots', snapshots);

const [sessionCount, participantCount, snapshotCount] = await Promise.all([
  client.from('sessions').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId).in('source', ['legacy_sqlite','development_demo']),
  client.from('session_participants').select('*', { count: 'exact', head: true }).eq('source', 'legacy_sqlite'),
  client.from('student_snapshots').select('*', { count: 'exact', head: true }).eq('source', 'legacy_sqlite')
]);
report.destinationCounts = { sessions: sessionCount.count, participants: participantCount.count, snapshots: snapshotCount.count };
report.verification = {
  sessionsMatch: sessionCount.count >= sourceSessions.length,
  participantsMatch: participantCount.count >= participantRows.length,
  snapshotsMatch: snapshotCount.count >= sourceSnapshots.length
};
console.log(JSON.stringify(report, null, 2));
if (!Object.values(report.verification).every(Boolean)) process.exitCode = 2;
