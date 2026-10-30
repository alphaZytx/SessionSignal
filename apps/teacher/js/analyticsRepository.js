import { requireSupabaseConfig } from '../../web/src/lib/supabaseClient.js';

const PAGE_SIZE = 1000;

function toLegacySnapshot(row) {
  const emotion = row.emotion_distribution || {};
  return {
    id: row.id, session_id: row.session_id, student_id: row.participant_id,
    student_name: row.student_display_name, timestamp: Date.parse(row.captured_at),
    signal_state: row.signal_state, attention_score: row.attention_score,
    attention_category: row.attention_category, attention_trend: row.attention_trend,
    interval_attention_score: row.interval_attention_score,
    gaze_on_screen_pct: row.gaze_on_screen_pct, gaze_deviation_mean: row.gaze_deviation_mean,
    gaze_deviation_max: row.gaze_deviation_max, gaze_x: row.gaze_x, gaze_y: row.gaze_y,
    head_pose_pitch_mean: row.head_pose_pitch_mean, head_pose_yaw_mean: row.head_pose_yaw_mean,
    head_pose_roll_mean: row.head_pose_roll_mean, head_pose_pitch_std: row.head_pose_pitch_std,
    head_pose_yaw_std: row.head_pose_yaw_std, head_pose_category: row.head_pose_category,
    eye_openness_left_mean: row.eye_openness_left_mean, eye_openness_left_min: row.eye_openness_left_min,
    eye_openness_right_mean: row.eye_openness_right_mean, eye_openness_right_min: row.eye_openness_right_min,
    eye_openness_mean: ((row.eye_openness_left_mean || 0) + (row.eye_openness_right_mean || 0)) / 2,
    eyes_closed_pct: row.eyes_closed_pct, blink_rate: row.blink_rate,
    mouth_openness_mean: row.mouth_openness_mean, yawn_detected: row.yawn_detected,
    drowsiness_score: row.drowsiness_score, primary_emotion: row.primary_emotion,
    emotion_focused_pct: emotion.focused || 0, emotion_confused_pct: emotion.confused || 0,
    emotion_bored_pct: emotion.bored || 0, emotion_engaged_pct: emotion.engaged || 0,
    emotion_distracted_pct: emotion.distracted || 0, emotion_drowsy_pct: emotion.drowsy || 0,
    emotion_neutral_pct: emotion.neutral || 0, face_detected_pct: row.face_detected_pct,
    alert_flags: (row.alert_flags || []).join(','), alert_count: (row.alert_flags || []).length,
    frame_count: row.frame_count, interval_duration_ms: row.interval_duration_ms,
    payload_version: row.payload_version, source: row.source
  };
}

async function fetchAllSnapshots(client, sessionId) {
  const rows = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client.from('student_snapshots').select('*')
      .eq('session_id', sessionId).order('captured_at', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map(toLegacySnapshot);
}

function summarize(participants, snapshots) {
  const byStudent = new Map();
  const alertsByType = {};
  const emotionDistribution = { focused: 0, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 };
  let classSum = 0;
  let classCount = 0;

  const newStudent = (id, name) => ({ studentId: id, name, scores: [], gaze: [], drowsiness: [], blink: [],
    emotions: {}, alerts: 0, focused: 0, distracted: 0, unavailable: 0, count: 0, attentionTimeline: [] });
  for (const participant of participants) byStudent.set(participant.id, newStudent(participant.id, participant.display_name));

  for (const snapshot of snapshots) {
    if (!byStudent.has(snapshot.student_id)) byStudent.set(snapshot.student_id, newStudent(snapshot.student_id, snapshot.student_name));
    const student = byStudent.get(snapshot.student_id);
    student.count++;
    const unavailable = snapshot.signal_state === 'unavailable' || snapshot.interval_attention_score == null;
    if (unavailable) student.unavailable++;
    else {
      const score = Number(snapshot.interval_attention_score);
      student.scores.push(score); classSum += score; classCount++;
      if (score >= 60) student.focused++;
      if (score < 40) student.distracted++;
      student.attentionTimeline.push({ timestamp: snapshot.timestamp, score });
      if (Number.isFinite(snapshot.gaze_on_screen_pct)) student.gaze.push(snapshot.gaze_on_screen_pct);
      if (Number.isFinite(snapshot.drowsiness_score)) student.drowsiness.push(snapshot.drowsiness_score);
      if (Number.isFinite(snapshot.blink_rate)) student.blink.push(snapshot.blink_rate);
      const emotion = snapshot.primary_emotion || 'neutral';
      student.emotions[emotion] = (student.emotions[emotion] || 0) + 1;
      if (emotion in emotionDistribution) emotionDistribution[emotion]++;
    }
    for (const flag of (snapshot.alert_flags || '').split(',').filter(Boolean)) {
      alertsByType[flag] = (alertsByType[flag] || 0) + 1;
      student.alerts++;
    }
  }

  const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const studentSummaries = [...byStudent.values()].map((student) => {
    const observable = student.scores.length;
    const avgOrZero = (values) => avg(values) ?? 0;
    return {
      studentId: student.studentId, name: student.name,
      avgAttention: observable ? Math.round(avgOrZero(student.scores)) : null,
      avgGaze: student.gaze.length ? Math.round(avgOrZero(student.gaze)) : null,
      avgDrowsiness: student.drowsiness.length ? Number(avgOrZero(student.drowsiness).toFixed(2)) : null,
      avgBlink: student.blink.length ? Math.round(avgOrZero(student.blink)) : null,
      primaryEmotion: Object.entries(student.emotions).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral',
      totalAlerts: student.alerts, focusPct: observable ? Math.round((student.focused / observable) * 100) : null,
      distractedPct: observable ? Math.round((student.distracted / observable) * 100) : null,
      signalUnavailablePct: Math.round((student.unavailable / Math.max(1, student.count)) * 100),
      attentionTimeline: student.attentionTimeline
    };
  });
  const emotionTotal = Object.values(emotionDistribution).reduce((sum, value) => sum + value, 0);
  if (emotionTotal) for (const key of Object.keys(emotionDistribution)) {
    emotionDistribution[key] = Number(((emotionDistribution[key] / emotionTotal) * 100).toFixed(1));
  }
  return { classAvgAttention: classCount ? Math.round(classSum / classCount) : null,
    emotionDistribution, classEmotionDistribution: emotionDistribution, alertsByType, studentSummaries };
}

export async function listTeacherSessions() {
  const client = requireSupabaseConfig();
  const { data, error } = await client.from('sessions')
    .select('id, session_code, status, started_at, ended_at, source, is_demo')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadSessionAnalytics(sessionId) {
  const client = requireSupabaseConfig();
  const [sessionResult, participantResult, snapshots] = await Promise.all([
    client.from('sessions').select('*').eq('id', sessionId).single(),
    client.from('session_participants').select('*').eq('session_id', sessionId).order('joined_at'),
    fetchAllSnapshots(client, sessionId)
  ]);
  if (sessionResult.error || participantResult.error) throw sessionResult.error || participantResult.error;
  const session = sessionResult.data;
  const summary = summarize(participantResult.data || [], snapshots);
  summary.meta = {
    id: session.id, sessionCode: session.session_code, startTime: Date.parse(session.started_at),
    endTime: session.ended_at ? Date.parse(session.ended_at) : null,
    duration: session.ended_at ? Date.parse(session.ended_at) - Date.parse(session.started_at) : null,
    source: session.source, status: session.status
  };
  const snapshotsByStudent = snapshots.reduce((groups, snapshot) => {
    (groups[snapshot.student_id] ||= []).push(snapshot);
    return groups;
  }, {});
  return { session: summary.meta, summary, snapshotsByStudent };
}

export { toLegacySnapshot, summarize };
