import '../../web/src/lib/chartSetup.js';
import { ChartManager } from './charts.js';
import { StudentGrid } from './studentGrid.js';
import { SupabaseHandler as SocketHandler } from './supabaseHandler.js';
import { requireTeacher } from '../../web/src/auth/teacherGuard.js';
import { supabase } from '../../web/src/lib/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1';
    const identity = isPreview ? { profile: { display_name: 'Preview facilitator' } } : await requireTeacher();
    if (!identity) return;
    
    // 1. Instantiations
    const chartManager = new ChartManager();
    chartManager.initCharts();
    
    const studentGrid = new StudentGrid('studentListContainer', 'detailsTable');
    
    // Interactive highlighting
    studentGrid.onStudentClick((studentId) => {
        chartManager.highlightStudent(studentId);
    });

    document.querySelector('.center-content').addEventListener('click', () => {
        chartManager.clearHighlight();
        document.querySelectorAll('.student-card').forEach(c => c.classList.remove('selected'));
    });

    // 2. DOM Elements
    const btnStart = document.getElementById('btnStartSession');
    const btnEnd = document.getElementById('btnEndSession');
    const btnDemo = document.getElementById('btnDemoMode');
    const btnSignOut = document.getElementById('btnSignOut');
    const btnCopyCode = document.getElementById('btnCopyCode');
    const connectionLabel = document.getElementById('connectionLabel');
    const sessionDisplay = document.getElementById('navSessionCode');
    const statusDot = document.getElementById('socketStatusDot');
    const studentCount = document.getElementById('navStudentCount');
    const sessionTimer = document.getElementById('sessionTimer');
    const alertsContainer = document.getElementById('alertsContainer');
    const recoContainer = document.getElementById('recoContainer');
    const latencyDisplay = document.createElement('span'); // Inject latency next to dot
    statusDot.parentElement.appendChild(latencyDisplay);
    latencyDisplay.style.marginLeft = '8px';

    // Cards
    const avgAttScore = document.getElementById('avgAttScore');
    const focusedCountText = document.getElementById('focusedCountText');
    const dominantEmo = document.getElementById('dominantEmo');
    const dominantEmoLabel = document.getElementById('dominantEmoLabel');
    const activeAlertsCount = document.getElementById('activeAlertsCount');

    // State
    let currentSessionId = null;
    let timerInterval = null;
    let startTime = 0;
    let numActiveStudents = 0;
    let isLocalDemo = false;
    let demoTimer = null;

    // Toast Utility
    function showToast(msg, type='info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 3. Socket Setup using SocketHandler
    const handleSocketEvent = (event, data) => {
        switch (event) {
            case 'connect':
                statusDot.className = 'conn-dot online';
                connectionLabel.innerText = 'Connected';
                showToast('Connected securely to SessionSignal', 'success');
                break;
            case 'disconnect':
                statusDot.className = 'conn-dot';
                connectionLabel.innerText = 'Reconnecting';
                showToast('Server connection lost.', 'error');
                break;
            case 'latency':
                latencyDisplay.innerText = `<${data.latency}ms`;
                break;
            case 'health_warning':
                showToast(data.message, 'warning');
                break;
            case 'session:created':
                // Capture the real session UUID (important for demo mode)
                if (data.sessionId) currentSessionId = data.sessionId;
                break;
            case 'session:state':
                handleSessionState(data);
                break;
            case 'teacher:student-joined':
                handleStudentJoined(data);
                break;
            case 'session:student-update':
                handleStudentUpdate(data);
                break;
            case 'session:class-summary':
                handleClassSummary(data);
                break;
            case 'teacher:student-disconnected':
                handleStudentDisconnected(data);
                break;
            case 'session:ended':
                showToast('Session ended.', 'info');
                break;
        }
    };
    const socketHandler = isPreview
        ? { disconnect: async () => {}, startSession: async () => { throw new Error('Start is unavailable in preview mode.'); } }
        : new SocketHandler(null, handleSocketEvent);

    btnCopyCode?.addEventListener('click', async () => {
        const code = sessionDisplay.innerText.replace('Session:', '').trim();
        if (!code || code === 'Not started' || code === '------') return;
        try {
            await navigator.clipboard.writeText(code);
            showToast(`Joining code ${code} copied`, 'success');
        } catch {
            showToast(`Joining code: ${code}`, 'info');
        }
    });

    // 4. Session Controls
    btnStart.addEventListener('click', async () => {
        try {
            const response = await socketHandler.startSession();
            currentSessionId = response.sessionId;
            const code = response.sessionCode;
            // UI Updates
            btnStart.classList.add('hidden');
            if (btnDemo) btnDemo.classList.add('hidden');
            btnEnd.classList.remove('hidden');
            sessionDisplay.innerText = `Session: ${code}`;
            btnCopyCode.classList.remove('hidden');
            
            alertsContainer.innerHTML = '';
            recoContainer.innerHTML = '';
            
            showToast(`Session Started! Code: ${code}`, 'success');

            startTime = Date.now();
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                const diff = Math.floor((Date.now() - startTime) / 1000);
                const h = String(Math.floor(diff / 3600)).padStart(2, '0');
                const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                const s = String(diff % 60).padStart(2, '0');
                sessionTimer.innerText = `${h}:${m}:${s}`;
                studentGrid.updateAllTimers();
            }, 1000);
        } catch (e) {
            showToast('Failed to start: ' + e.message, 'error');
        }
    });

    if (btnDemo) btnDemo.hidden = !import.meta.env.DEV;
    if (btnDemo && import.meta.env.DEV) {
        btnDemo.addEventListener('click', () => {
            isLocalDemo = true;
            currentSessionId = 'development-demo';
            const demoStudents = [
                ['demo-arjun', 'Arjun Sharma'], ['demo-priya', 'Priya Patel'],
                ['demo-rahul', 'Rahul Gupta'], ['demo-sneha', 'Sneha Verma']
            ];
            btnStart.classList.add('hidden'); btnDemo.classList.add('hidden'); btnEnd.classList.remove('hidden');
            sessionDisplay.innerText = 'Session: DEV-DEMO';
            btnCopyCode.classList.remove('hidden');
            connectionLabel.innerText = 'Local preview';
            statusDot.className = 'conn-dot online';
            startTime = Date.now();
            demoStudents.forEach(([studentId, name]) => handleStudentJoined({ studentId, name, totalStudents: demoStudents.length }));
            const emitDemo = () => {
                demoStudents.forEach(([studentId, name], index) => {
                    const score = Math.max(15, Math.min(98, Math.round(68 + Math.sin(Date.now() / 12000 + index) * 25)));
                    const emotion = score >= 75 ? 'engaged' : score >= 45 ? 'neutral' : 'distracted';
                    const payload = { timestamp: Date.now(), attentionScore: score, emotion, aggregates: {
                        timing: { frameCount: 120, intervalDurationMs: 5000 }, attentionScore: { mean: score, min: score - 3, max: score + 3, stdDev: 2, trend: 0 },
                        percentages: { faceDetected: 100, gazeOnScreen: Math.max(25, score), eyesClosed: 0 },
                        gazeDeviation: { mean: .12, max: .25 }, gazeX: { mean: 0 }, gazeY: { mean: 0 },
                        headPosePitch: { mean: 0, stdDev: 1 }, headPoseYaw: { mean: 0, stdDev: 1 }, headPoseRoll: { mean: 0 },
                        eyeOpennessLeft: { mean: .8, min: .6 }, eyeOpennessRight: { mean: .8, min: .6 },
                        blinkRate: { mean: 14 + index }, mouthOpenness: { mean: .1 }, drowsinessScore: { mean: 0 },
                        modes: { emotion, headPoseCategory: 'forward', attentionCategory: score >= 60 ? 'focused' : score >= 40 ? 'neutral' : 'distracted' },
                        eventFlags: { yawnDetected: false }, emotionDistribution: { focused: score >= 60 ? 100 : 0, engaged: 0, neutral: score >= 40 && score < 60 ? 100 : 0, confused: 0, bored: 0, distracted: score < 40 ? 100 : 0, drowsy: 0 },
                        computed: { intervalAttentionScore: score, attentionTrend: 'stable', alertFlags: score < 35 ? ['HIGH_DISTRACTION'] : [] }
                    }};
                    handleStudentUpdate({ studentId, name, payload });
                });
                const values = demoStudents.map((_, index) => Math.max(15, Math.min(98, Math.round(68 + Math.sin(Date.now() / 12000 + index) * 25))));
                handleClassSummary({ classAvgAttention: Math.round(values.reduce((a,b)=>a+b,0)/values.length), studentsOnline: 4,
                    attentionDistribution: { highly_focused: values.filter(v=>v>=80).length, focused: values.filter(v=>v>=60&&v<80).length, neutral: values.filter(v=>v>=40&&v<60).length, distracted: values.filter(v=>v>=20&&v<40).length, disengaged: values.filter(v=>v<20).length },
                    mostCommonEmotion: 'neutral', studentsWithAlerts: values.filter(v=>v<35).length, classEmotionDistribution: {}, lowAttentionStudents: [] });
            };
            emitDemo(); demoTimer = setInterval(emitDemo, 5000);
            showToast('Local development demo started. No records are written.', 'success');
        });
    }

    if (isPreview && btnDemo) {
        btnStart.classList.add('hidden');
        btnSignOut.classList.add('hidden');
        btnDemo.click();
    }

    btnEnd.addEventListener('click', async () => {
        if (!confirm('End session? This will save all data and summarize.')) return;
        
        try {
            if (isLocalDemo) {
                clearInterval(demoTimer);
                location.reload();
                return;
            }
            if (currentSessionId) {
                await socketHandler.endSession(currentSessionId);
                await socketHandler.disconnect();
                window.location.href = `/facilitator/analytics?sessionId=${currentSessionId}`;
                return; // Exit here, let the browser navigate away
            }

            currentSessionId = null;
            clearInterval(timerInterval);
            socketHandler.disconnect(); // Added to disconnect from the room
            
            // Reset UI
            btnEnd.classList.add('hidden');
            btnStart.classList.remove('hidden');
            if (btnDemo) btnDemo.classList.remove('hidden');
            sessionDisplay.innerText = 'Session: ------';
            sessionTimer.innerText = '00:00:00';
            studentCount.innerText = '0 online';
            
            showToast('Session ended successfully', 'success');
        } catch (e) {
            showToast('Failed to end session: ' + e.message, 'error');
        }
    });

    btnSignOut?.addEventListener('click', async () => {
        await socketHandler.disconnect();
        await supabase.auth.signOut();
        window.location.replace('/facilitators/login');
    });

    // 5. Socket Events Handlers
    function handleStudentJoined({ studentId, name, totalStudents }) {
        const c = chartManager.studentColors[(chartManager.students.size) % chartManager.studentColors.length];
        chartManager.addStudent(studentId, name);
        studentGrid.addStudent(studentId, name, c);
        numActiveStudents++;
        studentCount.innerText = `${numActiveStudents} online`;
        const empty = document.querySelector('.student-list .empty-state');
        if (empty) empty.remove();
        showToast(`${name} joined`, 'info');
    }

    function handleSessionState(stateInfo) {
        currentSessionId = stateInfo.sessionId;
        sessionDisplay.innerText = `Session: ${stateInfo.sessionCode || currentSessionId}`;
        btnCopyCode.classList.remove('hidden');
        btnStart.classList.add('hidden');
        if (btnDemo) btnDemo.classList.add('hidden');
        btnEnd.classList.remove('hidden');

        // Restore timer
        startTime = stateInfo.startTime;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            sessionTimer.innerText = `${h}:${m}:${s}`;
            studentGrid.updateAllTimers();
        }, 1000);

        // Restore students
        numActiveStudents = 0;
        stateInfo.students.forEach(s => {
            const c = chartManager.studentColors[(chartManager.students.size) % chartManager.studentColors.length];
            chartManager.addStudent(s.studentId, s.name);
            studentGrid.addStudent(s.studentId, s.name, c);
            if (s.active) numActiveStudents++;
            else studentGrid.setStudentOffline(s.studentId);
            
            if (s.lastPayload) {
                handleStudentUpdate({ studentId: s.studentId, name: s.name, payload: s.lastPayload });
            }
        });
        studentCount.innerText = `${numActiveStudents} online`;
        const empty = document.querySelector('.student-list .empty-state');
        if (empty) empty.remove();
        showToast('Restored active session', 'success');
    }

    function handleStudentUpdate({ studentId, name, payload }) {
        chartManager.updateStudentData(studentId, payload);
        studentGrid.updateStudent(studentId, payload);
        const flags = payload.aggregates?.computed?.alertFlags || [];
        if (flags.length > 0) addAlertToSidebar(studentId, name, flags, payload.timestamp);
    }

    function handleClassSummary(classSummary) {
        numActiveStudents = classSummary.studentsOnline || 0;
        studentCount.innerText = `${numActiveStudents} online`;
        const avg = Number.isFinite(classSummary.classAvgAttention) ? classSummary.classAvgAttention : null;
        if (avg === null) {
            avgAttScore.innerText = '—';
            avgAttScore.title = 'No observable camera signal received yet';
            focusedCountText.innerText = `0/${classSummary.studentsOnline || 0}`;
            dominantEmo.innerText = '—';
            dominantEmoLabel.innerText = 'Unavailable';
            activeAlertsCount.innerText = classSummary.studentsWithAlerts || 0;
            updateRecommendations(classSummary);
            return;
        }
        const prevAvg = parseInt(avgAttScore.innerText) || 0;
        studentGrid._animateNumber(avgAttScore, prevAvg, avg, 300);
        avgAttScore.style.color = avg >= 60 ? 'var(--color-green)' : (avg >= 40 ? 'var(--color-amber)' : 'var(--color-red)');
        
        const focused = (classSummary.attentionDistribution?.highly_focused || 0) + (classSummary.attentionDistribution?.focused || 0);
        focusedCountText.innerText = `${focused}/${classSummary.studentsOnline}`;
        dominantEmo.innerText = studentGrid._getEmotionEmoji(classSummary.mostCommonEmotion);
        dominantEmoLabel.innerText = String(classSummary.mostCommonEmotion).charAt(0).toUpperCase() + String(classSummary.mostCommonEmotion).slice(1);
        activeAlertsCount.innerText = classSummary.studentsWithAlerts || 0;
        
        chartManager.updateClassAverage(classSummary);
        updateRecommendations(classSummary);
    }

    function handleStudentDisconnected({ studentId }) {
        studentGrid.setStudentOffline(studentId);
        if (numActiveStudents > 0) numActiveStudents--;
        studentCount.innerText = `${numActiveStudents} online`;
        addAlertToSidebar(studentId, "Unknown", ["DISCONNECTED"], Date.now());
        showToast('A participant disconnected', 'warning');
    }

    // 6. Sidebar Logic
    let alertList = [];
    function addAlertToSidebar(studentId, name, flags, timestamp) {
        flags.forEach(flag => {
            const timeStr = new Date(timestamp).toLocaleTimeString();
            const safeName = studentGrid._escapeHtml(name);
            const safeFlag = studentGrid._escapeHtml(String(flag).replaceAll('_', ' '));
            let style = 'border-left: 3px solid var(--color-red);';
            let bg = 'rgba(239, 68, 68, 0.1);';
            
            if (flag === 'LOW_BLINK' || flag === 'YAWNING' || flag === 'HEAD_TURNED') {
                style = 'border-left: 3px solid var(--color-amber);';
                bg = 'rgba(245, 158, 11, 0.1);';
            }

            const html = `
                <div style="background: ${bg}; ${style} padding: 10px; margin-bottom: 8px; border-radius: 4px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <strong style="color: var(--text-primary);">${safeName}</strong>
                        <span style="color: var(--text-secondary);">${timeStr}</span>
                    </div>
                    <div style="color: var(--text-secondary); opacity: 0.9;">${safeFlag}</div>
                </div>
            `;
            
            alertList.unshift(html);
        });
        
        if (alertList.length > 50) alertList = alertList.slice(0, 50);
        
        // Remove empty state if present
        const empty = document.querySelector('.alerts-feed .empty-state');
        if (empty) empty.remove();
        
        alertsContainer.innerHTML = alertList.join('');
    }

    function updateRecommendations(summary) {
        const recos = [];

        if ((summary.observableStudents || 0) === 0 && summary.studentsOnline > 0) {
            recos.push("ℹ️ Participants are connected, but no observable camera signal is available yet.");
        } else if (Number.isFinite(summary.classAvgAttention) && summary.classAvgAttention < 40) {
            recos.push("⚠️ The observable estimate is lower right now. Consider a voluntary check-in or pause.");
        }
        
        if (summary.mostCommonEmotion === 'confused') {
            recos.push("🤔 The rule-based label is often ‘confused’. A check-in question may add useful context.");
        }
        
        const dist = summary.classEmotionDistribution || {};
        const drowsyCount = dist.drowsy || 0;
        if (drowsyCount > 1) {
            recos.push("🥱 Multiple drowsiness heuristics were flagged. A quick break may help.");
        }
        
        if (summary.lowAttentionStudents && summary.lowAttentionStudents.length >= 3) {
            recos.push("💬 Several estimates are below 40. Consider an interactive prompt and ask participants what they need.");
        }
        
        if (summary.classAttentionTrend === 'improving') {
            recos.push("📈 The observable estimate is rising.");
        }

        if (recos.length === 0 && summary.studentsOnline > 0 && (summary.observableStudents || 0) > 0) {
            recos.push("✅ Current observable estimates are steady. Keep using your own context and judgement.");
        }
        
        recoContainer.innerHTML = recos.slice(0, 3).map(text => `
            <div class="tip-card" style="animation: slideIn 0.3s ease-out;">${text}</div>
        `).join('');
    }

});

// Add keyframe locally for the UI inserts if needed
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>');
