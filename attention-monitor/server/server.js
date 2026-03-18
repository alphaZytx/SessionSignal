const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const db = require('./db/database');
const sessionsRouter = require('./routes/sessions');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serving Student and Teacher clients
app.use('/student', express.static(path.join(__dirname, '..', 'student-client')));
app.use('/teacher', express.static(path.join(__dirname, '..', 'teacher-dashboard')));

// REST Endpoints
app.use('/api/sessions', sessionsRouter);

// Set up Socket.io
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── IN-MEMORY STATE ──────────────────────────────────────────────────────────
const sessionStore = new Map();
// Structure:
// sessionId => {
//     sessionId,
//     sessionCode,
//     teacherSocketId,
//     startTime,
//     students: Map( studentId => { name, socketId, active, lastPayload, history[] } )
// }

// Session Code Generator (6-char alphanumeric uppercase)
function generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ─── NAMESPACES ───────────────────────────────────────────────────────────────

const studentNsp = io.of('/student');
const teacherNsp = io.of('/teacher');

// --- DEMO MODE ENDPOINTS ---
let demoIntervals = [];

app.post('/api/demo/start', (req, res) => {
    // 0. Clear any running demo loops
    demoIntervals.forEach(clearInterval);
    demoIntervals = [];

    // 1. Clean up old Demo Session if it exists
    db.deleteSessionByCode('DEMO01');
    sessionStore.delete('DEMO01');

    // 2. Create New Demo Session
    const sessId = require('uuid').v4();
    db.createSession(sessId, 'teacher-demo', 'DEMO01');

    const sessionData = {
        sessionId: sessId,
        sessionCode: 'DEMO01',
        teacherSocketId: 'demo',
        startTime: Date.now(),
        students: new Map()
    };
    sessionStore.set('DEMO01', sessionData);
    sessionStore.set(sessId, sessionData);

    // Force all teachers to join DEMO01 for simplicity in this scaffold
    teacherNsp.emit('session:created', { sessionId: sessId, sessionCode: 'DEMO01' });
    
    // Connect all current teacher sockets to DEMO01 room
    teacherNsp.sockets.forEach(s => s.join(sessId));

    const simStudents = [
        { id: require('uuid').v4(), name: 'Arjun Sharma' },
        { id: require('uuid').v4(), name: 'Priya Patel' },
        { id: require('uuid').v4(), name: 'Rahul Gupta' },
        { id: require('uuid').v4(), name: 'Sneha Verma' }
    ];

    simStudents.forEach(stu => {
        db.upsertStudent(sessId, stu.id, stu.name);
        
        const demoStudentData = { 
            name: stu.name, 
            socketId: 'demo', 
            active: true, 
            lastPayload: null, 
            history: [] 
        };
        sessionStore.get('DEMO01').students.set(stu.id, demoStudentData);
        
        teacherNsp.to(sessId).emit('teacher:student-joined', {
            studentId: stu.id, name: stu.name, totalStudents: 4
        });

        let att = 70;
        let intv = setInterval(() => {
            // Random walk
            att += (Math.random() * 10 - 5);
            att = Math.max(0, Math.min(100, att));
            
            // Generate correlated fake data
            let emo = 'focused';
            let gaze = 90;
            let drowsy = 0;
            
            if (att < 40) { emo = 'distracted'; gaze = 30 + Math.random()*20; }
            else if (att < 60) { emo = 'neutral'; gaze = 60 + Math.random()*20; }
            else if (att > 85) { emo = 'engaged'; }
            
            if (Math.random() < 0.05) drowsy = 0.8; // random yawn spike

            const payload = {
                studentId: stu.id,
                studentName: stu.name,
                sessionId: sessId,
                timestamp: Date.now(),
                payloadVersion: "1.0",
                faceDetected: true,
                faceConfidence: 0.99,
                attentionScore: Math.round(att),
                engagementScore: Math.round(att),
                emotion: emo,
                gazeOnScreen: true,
                gazeX: 0, gazeY: 0, gazeDeviation: 0.1,
                headPosePitch: 0, headPoseYaw: 0, headPoseRoll: 0,
                eyeOpennessLeft: 0.8, eyeOpennessRight: 0.8, eyesClosed: false,
                mouthOpenness: 0.1, yawnDetected: drowsy > 0.5, yawnCount: 0,
                distractionCount: 0, focusStreakSeconds: 10, awayTimeSeconds: 0,
                
                aggregates: {
                    timing: { frameCount: 150, intervalDurationMs: 5000 },
                    faceConfidence: { mean: 0.99 },
                    attentionScore: { mean: Math.round(att), min: att-2, max: att+2, stdDev: 1, trend: 0 },
                    gazeDeviation: { mean: 0.1, max: 0.2 },
                    gazeX: { mean: 0 }, gazeY: { mean: 0 },
                    headPosePitch: { mean: 0, stdDev: 0 },
                    headPoseYaw: { mean: 0, stdDev: 0 },
                    headPoseRoll: { mean: 0 },
                    eyeOpennessLeft: { mean: 0.8, min: 0.6 },
                    eyeOpennessRight: { mean: 0.8, min: 0.6 },
                    blinkRate: { mean: 12 + Math.random()*8 },
                    mouthOpenness: { mean: 0.1 },
                    drowsinessScore: { mean: drowsy },
                    percentages: { gazeOnScreen: gaze, faceDetected: 100, eyesClosed: 0 },
                    modes: { emotion: emo, headPoseCategory: 'forward', attentionCategory: att > 60 ? 'focused' : 'distracted' },
                    eventFlags: { yawnDetected: drowsy > 0.5 },
                    emotionDistribution: { focused: 100, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 },
                    computed: { intervalAttentionScore: Math.round(att), alertFlags: (att < 30 ? ['LOW_ATTENTION'] : []), attentionTrend: 'stable' }
                }
            };

            db.insertSnapshot(sessId, stu.id, stu.name, payload);
            
            // Keep memory updated so teacher reloads can fetch latest state
            const memStudent = sessionStore.get('DEMO01').students.get(stu.id);
            if (memStudent) {
                memStudent.lastPayload = payload;
                memStudent.history.push(payload);
                if (memStudent.history.length > 100) memStudent.history.shift();
            }

            teacherNsp.to(sessId).emit('session:student-update', { studentId: stu.id, name: stu.name, payload });

            // Trigger summary update using real averages from all demo students
            const demoSession = sessionStore.get('DEMO01');
            if (demoSession) {
                let totalAtt = 0, count = 0, alerts = 0;
                const emotionCounts = {};
                const attDist = { highly_focused: 0, focused: 0, neutral: 0, distracted: 0, disengaged: 0 };
                const lowStudents = [];
                
                for (const [sId, sData] of demoSession.students.entries()) {
                    if (sData.lastPayload) {
                        const score = sData.lastPayload.attentionScore || 0;
                        const emoVal = sData.lastPayload.emotion || 'neutral';
                        totalAtt += score;
                        count++;
                        
                        emotionCounts[emoVal] = (emotionCounts[emoVal] || 0) + 1;
                        
                        if (score >= 80) attDist.highly_focused++;
                        else if (score >= 60) attDist.focused++;
                        else if (score >= 40) attDist.neutral++;
                        else if (score >= 20) attDist.distracted++;
                        else attDist.disengaged++;
                        
                        if (score < 30) alerts++;
                        if (score < 40) lowStudents.push({ studentId: sId, name: sData.name, score });
                    }
                }
                
                const classAvg = count > 0 ? Math.round(totalAtt / count) : 0;
                let dominantEmotion = 'neutral';
                let maxEmoCount = 0;
                for (const [e, c] of Object.entries(emotionCounts)) {
                    if (c > maxEmoCount) { maxEmoCount = c; dominantEmotion = e; }
                }
                
                const summary = {
                    classAvgAttention: classAvg,
                    mostCommonEmotion: dominantEmotion,
                    studentsWithAlerts: alerts,
                    lowAttentionStudents: lowStudents,
                    studentsOnline: count,
                    attentionDistribution: attDist
                };
                teacherNsp.to(sessId).emit('session:class-summary', summary);
            }

        }, 5000);
        
        demoIntervals.push(intv);
    });

    res.json({ success: true, message: 'Demo started', sessionId: sessId });
});

app.post('/api/demo/stop', (req, res) => {
    demoIntervals.forEach(clearInterval);
    demoIntervals = [];
    db.deleteSessionByCode('DEMO01');
    sessionStore.delete('DEMO01');
    res.json({ success: true, message: 'Demo stopped' });
});


// TEACHER NAMESPACE
teacherNsp.on('connection', (socket) => {
    console.log(`[Teacher] Connected: ${socket.id}`);

    socket.on('teacher:start-session', (data, callback) => {
        const sessionId = uuidv4();
        const sessionCode = generateSessionCode();
        
        const sessionData = {
            sessionId,
            sessionCode,
            teacherSocketId: socket.id,
            startTime: Date.now(),
            students: new Map()
        };
        
        sessionStore.set(sessionCode, sessionData); // Index by code for students to join easily
        sessionStore.set(sessionId, sessionData);   // Index by ID for robust internal use
        
        db.createSession(sessionId, socket.id, sessionCode);

        socket.join(sessionId);
        
        if (callback) callback({ success: true, sessionId, sessionCode });
        socket.emit('session:created', { sessionId, sessionCode });
    });

    socket.on('teacher:join-session', ({ sessionId }, callback) => {
        const session = sessionStore.get(sessionId);
        if (!session) {
            if (callback) callback({ success: false, message: 'Session not found' });
            return;
        }

        socket.join(session.sessionId);
        
        const studentList = [];
        for (const [sId, s] of session.students.entries()) {
            studentList.push({
                studentId: sId,
                name: s.name,
                active: s.active,
                lastPayload: s.lastPayload
            });
        }

        const stateInfo = {
            sessionId,
            sessionCode: session.sessionCode,
            startTime: session.startTime,
            students: studentList
        };

        if (callback) callback({ success: true, state: stateInfo });
        socket.emit('session:state', stateInfo);
    });

    socket.on('teacher:end-session', ({ sessionId }) => {
        const session = sessionStore.get(sessionId);
        if (!session) return;

        const actualSessionId = session.sessionId;

        // Notify all students in the session room
        studentNsp.to(actualSessionId).emit('session:ended', {
            message: 'The teacher has ended this session.'
        });

        // End in DB
        db.endSession(actualSessionId);

        // Clean up in-memory state
        sessionStore.delete(session.sessionCode);
        sessionStore.delete(actualSessionId);
        
        console.log(`[Teacher] Ended session: ${actualSessionId}`);
    });
});

// STUDENT NAMESPACE
studentNsp.on('connection', (socket) => {
    console.log(`[Student] Connected: ${socket.id}`);

    socket.on('student:join', (data) => {
        const { studentId, name, sessionId: sessionCode } = data;
        
        // Find session using the 6-char code
        const session = sessionStore.get(sessionCode);
        
        if (!session) {
            socket.emit('session:error', { message: 'Invalid session code.' });
            return;
        }

        const actualSessionId = session.sessionId;

        // Add to map
        let studentData = session.students.get(studentId);
        if (!studentData) {
            studentData = { name, socketId: socket.id, active: true, lastPayload: null, history: [] };
            session.students.set(studentId, studentData);
        } else {
            studentData.socketId = socket.id;
            studentData.active = true;
            studentData.name = name; // Update name in case it changed
        }

        // Add to DB
        db.upsertStudent(actualSessionId, studentId, name);

        socket.join(actualSessionId); // Student joins UUID room
        socket.studentId = studentId;
        socket.actualSessionId = actualSessionId;
        socket.sessionCode = sessionCode;
        
        // Notify teachers in that actualSessionId room);

        // Emit back
        socket.emit('student:joined', { ok: true, studentName: name });
        
        // Tell teacher
        teacherNsp.to(actualSessionId).emit('teacher:student-joined', {
            studentId,
            name,
            totalStudents: session.students.size
        });
    });

    socket.on('student:data', (payload) => {
        let { studentId, actualSessionId, sessionCode } = socket;

        // Recover sessionCode if missing from socket (e.g., reconnect race where queue flushed before join resolved)
        if (!sessionCode && payload && payload.sessionId) {
            sessionCode = payload.sessionId;
            socket.sessionCode = sessionCode;
        }

        if (!studentId || !sessionCode) return;

        const session = sessionStore.get(sessionCode);
        if (!session) return;
        
        if (!actualSessionId) {
            actualSessionId = session.sessionId;
            socket.actualSessionId = actualSessionId;
        }

        const student = session.students.get(studentId);
        if (!student) return;

        // Update memory
        student.lastPayload = payload;
        student.history.push(payload);
        if (student.history.length > 100) student.history.shift();

        // Save DB Snapshot
        db.insertSnapshot(actualSessionId, studentId, student.name, payload);

        // --- Class Summary Aggregation ---
        const activeStudents = Array.from(session.students.values()).filter(s => s.active && s.lastPayload);
        const count = activeStudents.length;

        if (count > 0) {
            let sumAttention = 0;
            const emoCounts = { focused: 0, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 };
            const attDist = { highly_focused: 0, focused: 0, neutral: 0, distracted: 0, disengaged: 0 };
            let studentsWithAlerts = 0;
            const lowAttentionStudents = [];

            activeStudents.forEach(s => {
                const p = s.lastPayload;
                const agg = p.aggregates || {};
                const comp = agg.computed || {};
                const modes = agg.modes || {};

                // Interval Attention
                const score = comp.intervalAttentionScore || 0;
                sumAttention += score;

                if (score < 40) {
                    lowAttentionStudents.push({ studentId: s.socketId, name: s.name, score });
                }

                if (score >= 80) attDist.highly_focused++;
                else if (score >= 60) attDist.focused++;
                else if (score >= 40) attDist.neutral++;
                else if (score >= 20) attDist.distracted++;
                else attDist.disengaged++;

                // Emotion map
                const emo = modes.emotion || 'neutral';
                if (emoCounts[emo] !== undefined) emoCounts[emo]++;

                // Alerts
                if (comp.alertFlags && comp.alertFlags.length > 0) {
                    studentsWithAlerts++;
                }
            });

            const classAvgAttention = Math.round(sumAttention / count);
            
            // Mode Emotion for Class
            let bestEmo = 'neutral';
            let maxCount = 0;
            for (const [emo, c] of Object.entries(emoCounts)) {
                if (c > maxCount) {
                    maxCount = c;
                    bestEmo = emo;
                }
            }

            const classSummary = {
                classAvgAttention,
                classEmotionDistribution: emoCounts,
                attentionDistribution: attDist,
                studentsOnline: count,
                studentsWithAlerts,
                mostCommonEmotion: bestEmo,
                lowAttentionStudents,
                classAttentionTrend: 'stable' // Can be calculated based on previous avg 
            };

            // Emit to teachers
            teacherNsp.to(actualSessionId).emit('session:student-update', {
                studentId,
                name: student.name,
                payload,
                timestamp: Date.now()
            });

            teacherNsp.to(actualSessionId).emit('session:class-summary', {
                ...classSummary,
                sessionId: actualSessionId,
                timestamp: Date.now()
            });
        }
    });

    socket.on('disconnect', () => {
        const { studentId, actualSessionId } = socket;
        console.log(`[Student] Disconnected: ${socket.id}`);
        
        if (studentId && actualSessionId) {
            const session = sessionStore.get(actualSessionId);
            if (session) {
                const student = session.students.get(studentId);
                if (student) {
                    student.active = false;
                    teacherNsp.to(actualSessionId).emit('teacher:student-disconnected', { studentId });
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Attention Monitor backend listening on port ${PORT}`);
});
