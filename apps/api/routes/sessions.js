const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
    try {
        const sessions = db.getSessionList();
        // Map keys to API expectations if needed
        const formatted = sessions.map(s => ({
            id: s.id,
            sessionCode: s.session_code,
            startTime: s.start_time,
            endTime: s.end_time,
            studentCount: s.student_count,
            duration: s.end_time ? (s.end_time - s.start_time) : null
        }));
        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:sessionId/students', (req, res) => {
    try {
        const students = db.getSessionStudents(req.params.sessionId);
        // Map fields
        const formatted = students.map(s => ({
            id: s.id,
            name: s.name,
            joinTime: s.join_time,
            snapshotCount: 0 // In a real scenario, run a count query per student or join
        }));
        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:sessionId/snapshots/:studentId', (req, res) => {
    try {
        const snaps = db.getStudentSnapshots(req.params.sessionId, req.params.studentId);
        res.json({ success: true, count: snaps.length, data: snaps });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:sessionId/summary', (req, res) => {
    try {
        const allSnaps = db.getSessionAggregate(req.params.sessionId);
        if (!allSnaps || allSnaps.length === 0) {
            return res.status(404).json({ success: false, error: "No data found for session" });
        }

        // Calculate aggregates dynamically
        const students = {};
        let classAttSum = 0;
        let classAttCount = 0;
        const totalAlerts = {};
        const emoDist = { focused: 0, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 };

        allSnaps.forEach(snap => {
            if (!students[snap.student_id]) {
                students[snap.student_id] = {
                    name: snap.student_name,
                    sumAtt: 0, sumGazePct: 0, sumDrowsy: 0,
                    count: 0,
                    alerts: 0,
                    att60plus: 0, att40minus: 0, missing: 0,
                    emos: {},
                    timeline: []
                };
            }
            
            const s = students[snap.student_id];
            s.count++;
            
            s.sumAtt += (snap.interval_attention_score || snap.attention_score || 0);
            s.sumGazePct += (snap.gaze_on_screen_pct || 0);
            s.sumDrowsy += (snap.drowsiness_score || 0);
            
            const score = snap.interval_attention_score || 0;
            if (snap.face_detected_pct < 10) s.missing++;
            else if (score >= 60) s.att60plus++;
            else if (score < 40) s.att40minus++;
            
            const emo = snap.primary_emotion || 'neutral';
            s.emos[emo] = (s.emos[emo] || 0) + 1;
            emoDist[emo]++;
            
            if (snap.alert_count > 0) s.alerts += snap.alert_count;
            if (snap.alert_flags) {
                snap.alert_flags.split(',').forEach(flag => {
                    if (flag) totalAlerts[flag] = (totalAlerts[flag] || 0) + 1;
                });
            }
            
            classAttSum += score;
            classAttCount++;
            
            s.timeline.push({
                timestamp: snap.timestamp,
                score: score
            });
        });

        // Finalize student stats
        const studentSummaries = Object.keys(students).map(id => {
            const s = students[id];
            const c = s.count || 1;
            
            // mode emotion
            let bestEmo = 'neutral', maxEmo = 0;
            for (const [k, v] of Object.entries(s.emos)) {
                if (v > maxEmo) { maxEmo = v; bestEmo = k; }
            }
            
            return {
                studentId: id,
                name: s.name,
                avgAttention: Math.round(s.sumAtt / c),
                avgGaze: Math.round(s.sumGazePct / c),
                avgDrowsiness: parseFloat((s.sumDrowsy / c).toFixed(2)),
                primaryEmotion: bestEmo,
                totalAlerts: s.alerts,
                focusPct: Math.round((s.att60plus / c) * 100),
                distractedPct: Math.round((s.att40minus / c) * 100),
                awayPct: Math.round((s.missing / c) * 100),
                attentionTimeline: s.timeline
            };
        });

        // Normalize class emotion distribution
        const emoKeys = Object.keys(emoDist);
        let emoTotal = 0;
        emoKeys.forEach(k => emoTotal += emoDist[k]);
        if (emoTotal > 0) {
            emoKeys.forEach(k => {
                emoDist[k] = parseFloat(((emoDist[k] / emoTotal) * 100).toFixed(1));
            });
        }

        const classSummary = {
            classAvgAttention: classAttCount > 0 ? Math.round(classAttSum / classAttCount) : 0,
            emotionDistribution: emoDist,
            alertsByType: totalAlerts,
            studentSummaries
        };

        res.json({ success: true, data: classSummary });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:sessionId/end', (req, res) => {
    try {
        db.endSession(req.params.sessionId);
        // Could return summary here by calling the aggregate logic
        res.json({ success: true, message: "Session ended successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
