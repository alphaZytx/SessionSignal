import { ChartManager } from './charts.js';
import { StudentGrid } from './studentGrid.js';
import { SocketHandler } from './socketHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    
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
    const btnDemo = document.getElementById('btnDemoMode'); // NEW Add this in HTML
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

    // Toast Utility
    function showToast(msg, type='info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 3. Socket Setup using SocketHandler
    const socketHandler = new SocketHandler('http://localhost:3000', (event, data) => {
        switch (event) {
            case 'connect':
                statusDot.className = 'conn-dot online';
                showToast('Connected to Server', 'success');
                
                // Auto-resume session if page was reloaded
                const savedSession = sessionStorage.getItem('currentSessionId');
                if (savedSession) {
                    currentSessionId = savedSession;
                    socketHandler.joinSession(savedSession);
                }
                break;
            case 'disconnect':
                statusDot.className = 'conn-dot';
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
        }
    });

    // 4. Session Controls
    btnStart.addEventListener('click', async () => {
        try {
            const response = await socketHandler.startSession();
            currentSessionId = response.sessionId;
            const code = response.sessionCode;
            sessionStorage.setItem('currentSessionId', currentSessionId);
            
            
            // UI Updates
            btnStart.classList.add('hidden');
            if (btnDemo) btnDemo.classList.add('hidden');
            btnEnd.classList.remove('hidden');
            sessionDisplay.innerText = `Session: ${code}`;
            
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

    if (btnDemo) {
        btnDemo.addEventListener('click', async () => {
            try {
                const res = await fetch('http://localhost:3000/api/demo/start', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    showToast('Demo Mode Initialized', 'success');
                    
                    // The server already created session DEMO01 and will emit events.
                    // Just update the UI to reflect the demo session.
                    currentSessionId = 'DEMO01';
                    sessionStorage.setItem('currentSessionId', 'DEMO01');
                    socketHandler.joinSession(data.sessionId || 'DEMO01'); // Join the socket room
                    btnStart.classList.add('hidden');
                    btnDemo.classList.add('hidden');
                    btnEnd.classList.remove('hidden');
                    sessionDisplay.innerText = 'Session: DEMO01';
                    alertsContainer.innerHTML = '';
                    recoContainer.innerHTML = '';
                    
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
                }
            } catch (e) {
                showToast('Failed to start demo', 'error');
            }
        });
    }

    btnEnd.addEventListener('click', async () => {
        if (!confirm('End session? This will save all data and summarize.')) return;
        
        try {
            // Stop demo mode intervals (safe to call even if not demo)
            await fetch('http://localhost:3000/api/demo/stop', { method: 'POST' });
            
            // End the real session in the database and redirect to report
            if (currentSessionId && currentSessionId !== 'DEMO01') {
                socketHandler.endSession(currentSessionId);
                await fetch(`http://localhost:3000/api/sessions/${currentSessionId}/end`, { method: 'POST' });
                sessionStorage.removeItem('currentSessionId');
                socketHandler.disconnect();
                window.location.href = `analytics.html?sessionId=${currentSessionId}`;
                return; // Exit here, let the browser navigate away
            }
            
            // If it's a DEMO session, just clean up state and reset UI 
            sessionStorage.removeItem('currentSessionId');
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
        stateInfo.students.forEach(s => {
            const c = chartManager.studentColors[(chartManager.students.size) % chartManager.studentColors.length];
            chartManager.addStudent(s.studentId, s.name);
            studentGrid.addStudent(s.studentId, s.name, c);
            numActiveStudents++;
            
            if (s.lastPayload) {
                handleStudentUpdate({ studentId: s.studentId, name: s.name, payload: s.lastPayload });
            }
        });
        studentCount.innerText = `${numActiveStudents} online`;
        const empty = document.querySelector('.student-list .empty-state');
        if (empty) empty.remove();
        showToast(`Rejoined Active Session`, 'success');
    }

    function handleStudentUpdate({ studentId, name, payload }) {
        chartManager.updateStudentData(studentId, payload);
        studentGrid.updateStudent(studentId, payload);
        const flags = payload.aggregates?.computed?.alertFlags || [];
        if (flags.length > 0) addAlertToSidebar(studentId, name, flags, payload.timestamp);
    }

    function handleClassSummary(classSummary) {
        const avg = classSummary.classAvgAttention || 0;
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
        showToast('Student disconnected', 'warning');
    }

    // 6. Sidebar Logic
    let alertList = [];
    function addAlertToSidebar(studentId, name, flags, timestamp) {
        flags.forEach(flag => {
            const timeStr = new Date(timestamp).toLocaleTimeString();
            let style = 'border-left: 3px solid var(--color-red);';
            let bg = 'rgba(239, 68, 68, 0.1);';
            
            if (flag === 'LOW_BLINK' || flag === 'YAWNING' || flag === 'HEAD_TURNED') {
                style = 'border-left: 3px solid var(--color-amber);';
                bg = 'rgba(245, 158, 11, 0.1);';
            }

            const html = `
                <div style="background: ${bg}; ${style} padding: 10px; margin-bottom: 8px; border-radius: 4px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <strong style="color: var(--text-primary);">${name}</strong>
                        <span style="color: var(--text-secondary);">${timeStr}</span>
                    </div>
                    <div style="color: var(--text-secondary); opacity: 0.9;">${flag.replace('_', ' ')}</div>
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
        
        if (summary.classAvgAttention < 40) {
            recos.push("⚠️ Consider pausing — class attention is very low.");
        }
        
        if (summary.mostCommonEmotion === 'confused') {
            recos.push("🤔 Many students look confused — ask a check-in question.");
        }
        
        const dist = summary.classEmotionDistribution || {};
        const drowsyCount = dist.drowsy || 0;
        if (drowsyCount > 1) {
            recos.push("🥱 Multiple students appear drowsy — a quick break may help.");
        }
        
        if (summary.lowAttentionStudents && summary.lowAttentionStudents.length >= 3) {
            recos.push("🛑 More than half the class is disengaged. Time for an interactive activity.");
        }
        
        if (summary.classAttentionTrend === 'improving') {
            recos.push("📈 Attention is recovering — keep going!");
        }

        if (recos.length === 0 && summary.studentsOnline > 0) {
            recos.push("✅ Class is engaged and focused.");
        }
        
        recoContainer.innerHTML = recos.slice(0, 3).map(text => `
            <div class="tip-card" style="animation: slideIn 0.3s ease-out;">${text}</div>
        `).join('');
    }

});

// Add keyframe locally for the UI inserts if needed
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>');
