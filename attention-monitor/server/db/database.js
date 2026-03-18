const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const DB_PATH = path.join(dataDir, 'sessions.db');
const db = new Database(DB_PATH);

// Enable WAL for better concurrent write performance
db.pragma('journal_mode = WAL');

// ─── Initialize Schema ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    teacher_id TEXT,
    session_code TEXT UNIQUE,
    start_time INTEGER,
    end_time INTEGER,
    student_count INTEGER DEFAULT 0,
    total_snapshots INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    name TEXT,
    join_time INTEGER,
    last_seen INTEGER,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    student_id TEXT,
    student_name TEXT,
    timestamp INTEGER,
    
    -- Attention
    attention_score REAL,
    attention_category TEXT,
    attention_trend TEXT,
    interval_attention_score REAL,
    
    -- Gaze
    gaze_on_screen_pct REAL,
    gaze_deviation_mean REAL,
    gaze_deviation_max REAL,
    gaze_x REAL,
    gaze_y REAL,
    
    -- Head Pose
    head_pose_pitch_mean REAL,
    head_pose_yaw_mean REAL,
    head_pose_roll_mean REAL,
    head_pose_pitch_std REAL,
    head_pose_yaw_std REAL,
    head_pose_category TEXT,
    
    -- Eyes
    eye_openness_left_mean REAL,
    eye_openness_left_min REAL,
    eye_openness_right_mean REAL,
    eye_openness_right_min REAL,
    eyes_closed_pct REAL,
    blink_rate REAL,
    
    -- Mouth
    mouth_openness_mean REAL,
    yawn_detected INTEGER,
    
    -- Drowsiness
    drowsiness_score REAL,
    
    -- Emotion
    primary_emotion TEXT,
    emotion_focused_pct REAL,
    emotion_confused_pct REAL,
    emotion_bored_pct REAL,
    emotion_engaged_pct REAL,
    emotion_distracted_pct REAL,
    emotion_drowsy_pct REAL,
    emotion_neutral_pct REAL,
    
    -- Face presence
    face_detected_pct REAL,
    face_confidence_mean REAL,
    
    -- Alerts
    alert_flags TEXT,
    alert_count INTEGER,
    
    -- Frame info
    frame_count INTEGER,
    interval_duration_ms INTEGER,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_student ON snapshots(student_id);
`);

// ─── Prepared Statements ──────────────────────────────────────────────────────
const stmts = {
    insertSession: db.prepare(`
        INSERT INTO sessions (id, teacher_id, session_code, start_time) 
        VALUES (?, ?, ?, ?)
    `),
    endSession: db.prepare(`
        UPDATE sessions SET end_time = ? WHERE id = ?
    `),
    upsertStudent: db.prepare(`
        INSERT INTO students (id, session_id, name, join_time, last_seen, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET 
            last_seen = excluded.last_seen,
            is_active = 1
    `),
    insertSnapshot: db.prepare(`
        INSERT INTO snapshots (
            session_id, student_id, student_name, timestamp,
            attention_score, attention_category, attention_trend, interval_attention_score,
            gaze_on_screen_pct, gaze_deviation_mean, gaze_deviation_max, gaze_x, gaze_y,
            head_pose_pitch_mean, head_pose_yaw_mean, head_pose_roll_mean, head_pose_pitch_std, head_pose_yaw_std, head_pose_category,
            eye_openness_left_mean, eye_openness_left_min, eye_openness_right_mean, eye_openness_right_min, eyes_closed_pct, blink_rate,
            mouth_openness_mean, yawn_detected,
            drowsiness_score,
            primary_emotion, emotion_focused_pct, emotion_confused_pct, emotion_bored_pct, emotion_engaged_pct, emotion_distracted_pct, emotion_drowsy_pct, emotion_neutral_pct,
            face_detected_pct, face_confidence_mean,
            alert_flags, alert_count,
            frame_count, interval_duration_ms
        ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?
        )
    `),
    updateSessionCounts: db.prepare(`
        UPDATE sessions SET 
            student_count = (SELECT COUNT(DISTINCT student_id) FROM snapshots WHERE session_id = ?),
            total_snapshots = (SELECT COUNT(*) FROM snapshots WHERE session_id = ?)
        WHERE id = ?
    `),
    getAllSessions: db.prepare(`SELECT * FROM sessions ORDER BY start_time DESC`),
    getSessionStudents: db.prepare(`SELECT * FROM students WHERE session_id = ? ORDER BY join_time ASC`),
    getStudentSnapshots: db.prepare(`SELECT * FROM snapshots WHERE session_id = ? AND student_id = ? ORDER BY timestamp ASC`),
    getSessionAgg: db.prepare(`SELECT * FROM snapshots WHERE session_id = ?`),
    getSessionsByCode: db.prepare(`SELECT id FROM sessions WHERE session_code = ?`),
    deleteSnapshotsBySession: db.prepare(`DELETE FROM snapshots WHERE session_id = ?`),
    deleteStudentsBySession: db.prepare(`DELETE FROM students WHERE session_id = ?`),
    deleteSessionByCode: db.prepare(`DELETE FROM sessions WHERE session_code = ?`)
};

// ─── Exports ──────────────────────────────────────────────────────────────────

function createSession(sessionId, teacherId, sessionCode) {
    stmts.insertSession.run(sessionId, teacherId, sessionCode, Date.now());
}

function endSession(sessionId) {
    stmts.endSession.run(Date.now(), sessionId);
    stmts.updateSessionCounts.run(sessionId, sessionId, sessionId);
}

function upsertStudent(sessionId, studentId, name) {
    stmts.upsertStudent.run(studentId, sessionId, name, Date.now(), Date.now());
}

function insertSnapshot(sessionId, studentId, studentName, payload) {
    const agg = payload.aggregates || {};
    const comp = agg.computed || {};
    const pts = agg.percentages || {};
    const emo = agg.emotionDistribution || {};
    const modes = agg.modes || {};
    const timing = agg.timing || {};

    const alertFlagsStr = comp.alertFlags ? comp.alertFlags.join(',') : '';
    const alertCount = comp.alertFlags ? comp.alertFlags.length : 0;

    stmts.insertSnapshot.run(
        sessionId,
        studentId,
        studentName,
        payload.timestamp || Date.now(),

        // Attention
        agg.attentionScore?.mean || 0,
        modes.attentionCategory || 'neutral',
        comp.attentionTrend || 'stable',
        comp.intervalAttentionScore || 0,

        // Gaze
        pts.gazeOnScreen || 0,
        agg.gazeDeviation?.mean || 0,
        agg.gazeDeviation?.max || 0,
        agg.gazeX?.mean || 0, 
        agg.gazeY?.mean || 0,

        // Head
        agg.headPosePitch?.mean || 0,
        agg.headPoseYaw?.mean || 0,
        agg.headPoseRoll?.mean || 0, 
        agg.headPosePitch?.stdDev || 0,
        agg.headPoseYaw?.stdDev || 0,
        modes.headPoseCategory || 'forward',

        // Eyes
        agg.eyeOpennessLeft?.mean || 0,
        agg.eyeOpennessLeft?.min || 0,
        agg.eyeOpennessRight?.mean || 0,
        agg.eyeOpennessRight?.min || 0,
        pts.eyesClosed || 0,
        agg.blinkRate?.mean || 0,

        // Mouth
        agg.mouthOpenness?.mean || 0,
        agg.eventFlags?.yawnDetected ? 1 : 0,

        // Drowsiness
        agg.drowsinessScore?.mean || 0,

        // Emotion
        modes.emotion || 'neutral',
        emo.focused || 0,
        emo.confused || 0,
        emo.bored || 0,
        emo.engaged || 0,
        emo.distracted || 0,
        emo.drowsy || 0,
        emo.neutral || 0,

        // Face presence
        pts.faceDetected || 0,
        agg.faceConfidence?.mean || 0,

        // Alerts
        alertFlagsStr,
        alertCount,

        // Timing
        timing.frameCount || 0,
        timing.intervalDurationMs || 0
    );
}

function getSessionList() {
    return stmts.getAllSessions.all();
}

function getSessionStudents(sessionId) {
    return stmts.getSessionStudents.all(sessionId);
}

function getStudentSnapshots(sessionId, studentId) {
    return stmts.getStudentSnapshots.all(sessionId, studentId);
}

function getSessionAggregate(sessionId) {
    // In actual production, do this in SQL via GROUP BY. 
    // Here we'll return raw bounds and calculate in REST logic per prompt requirements.
    return stmts.getSessionAgg.all(sessionId);
}

module.exports = {
    db,
    createSession,
    endSession,
    upsertStudent,
    insertSnapshot,
    getSessionList,
    getSessionStudents,
    getStudentSnapshots,
    getSessionAggregate,
    deleteSessionByCode: (code) => {
        const sessions = stmts.getSessionsByCode.all(code);
        for (const s of sessions) {
            stmts.deleteSnapshotsBySession.run(s.id);
            stmts.deleteStudentsBySession.run(s.id);
        }
        stmts.deleteSessionByCode.run(code);
    }
};
