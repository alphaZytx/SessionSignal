export class StudentGrid {
    constructor(sidebarContainerId, tableBodyId) {
        this.sidebar = document.getElementById(sidebarContainerId);
        this.tbody = document.getElementById(tableBodyId);
        this.students = new Map();
        
        // Clear empty states
        if (this.sidebar) this.sidebar.innerHTML = '';
        if (this.tbody) this.tbody.innerHTML = '';

        this.onClickCallbacks = [];
    }

    _getInitials(name) {
        if (!name) return '??';
        const parts = name.split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    _getEmotionEmoji(emo) {
        const map = {
            focused: '🎯', engaged: '💡', neutral: '😐',
            confused: '🤔', bored: '🥱', distracted: '👀', drowsy: '😴'
        };
        return map[emo] || '😐';
    }

    _escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    addStudent(studentId, name, color) {
        if (this.students.has(studentId)) return;

        const initials = this._escapeHtml(this._getInitials(name));
        const safeName = this._escapeHtml(name);
        
        // 1. Create Sidebar Card HTML
        const cardHTML = `
            <div class="student-card" data-student-id="${studentId}" style="border-left: 4px solid ${color}">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${initials}</div>
                    <div style="flex: 1; font-weight: 600;">${safeName}</div>
                    <div class="status-dot" id="dot-${studentId}" style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-green);"></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div style="font-size: 28px; font-weight: 700; line-height: 1;" id="score-${studentId}">--</div>
                    <div id="badge-${studentId}" style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(139, 148, 158, 0.2);">Waiting</div>
                </div>
                
                <div style="height: 4px; background: var(--border-color); border-radius: 2px; margin-bottom: 12px; overflow: hidden;">
                    <div id="bar-${studentId}" style="height: 100%; width: 0%; background: var(--color-green); transition: width 0.3s ease;"></div>
                </div>
                
                <div style="display: flex; gap: 6px; margin-bottom: 12px; font-size: 12px; color: var(--text-secondary);">
                    <span id="emo-ico-${studentId}">😐</span>
                    <span id="emo-lbl-${studentId}">State unavailable</span>
                </div>
                
                <div style="display: flex; gap: 6px; margin-bottom: 12px;">
                    <div style="background: var(--bg-surface-hover); padding: 4px 6px; border-radius: 4px; font-size: 10px;" id="gaze-${studentId}">Gaze --%</div>
                    <div style="background: var(--bg-surface-hover); padding: 4px 6px; border-radius: 4px; font-size: 10px;" id="blink-${studentId}">Blink --</div>
                </div>
                
                <div style="display: flex; gap: 2px; height: 16px; align-items: flex-end; margin-bottom: 12px;" id="spark-${studentId}">
                    <!-- Spark bars generated here -->
                </div>
                
                <div id="alert-row-${studentId}" style="display: none; background: rgba(239, 68, 68, 0.1); color: var(--color-red); padding: 6px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
                    <span style="font-weight: bold;">! <span id="alert-count-${studentId}">0</span> flags</span>
                </div>
                
                <div style="font-size: 10px; color: var(--text-secondary); text-align: right;" id="time-${studentId}">
                    Updated just now
                </div>
            </div>
        `;
        
        // 2. Create Table Row HTML
        const rowHTML = `
            <tr data-student-id="${studentId}">
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${color};"></div>
                        <span>${safeName}</span>
                    </div>
                </td>
                <td id="tbl-score-${studentId}" style="font-weight: 600;">--</td>
                <td id="tbl-gaze-${studentId}">--%</td>
                <td id="tbl-emo-${studentId}">--</td>
                <td id="tbl-drowsy-${studentId}">--</td>
                <td id="tbl-blink-${studentId}">--</td>
                <td id="tbl-pose-${studentId}">--</td>
                <td id="tbl-yawn-${studentId}">0</td>
                <td id="tbl-alert-${studentId}">0</td>
                <td id="tbl-time-${studentId}" style="font-size: 12px; color: var(--text-secondary);">Just now</td>
            </tr>
        `;

        if (this.sidebar) this.sidebar.insertAdjacentHTML('beforeend', cardHTML);
        if (this.tbody) this.tbody.insertAdjacentHTML('beforeend', rowHTML);

        this.students.set(studentId, { 
            name, color,
            lastUpdate: Date.now(),
            sparkQueue: new Array(10).fill(null),
            offline: false
        });

        // Attach click listener
        const card = document.querySelector(`.student-card[data-student-id="${studentId}"]`);
        if (card) {
            card.addEventListener('click', () => {
                this.onClickCallbacks.forEach(cb => cb(studentId));
                document.querySelectorAll('.student-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
        }
    }

    getInitials(name) { return this._getInitials(name); }

    updateStudent(studentId, payload) {
        if (!this.students.has(studentId)) return;
        const student = this.students.get(studentId);
        student.lastUpdate = Date.now();
        if (student.offline) this.setStudentOnline(studentId);

        const agg = payload.aggregates || {};
        const comp = agg.computed || {};
        const pts = agg.percentages || {};

        const scoreValue = comp.intervalAttentionScore !== undefined ? comp.intervalAttentionScore : payload.attentionScore;
        const signalUnavailable = agg.signalState === 'unavailable' || payload.signalState === 'unavailable'
            || scoreValue == null || !Number.isFinite(Number(scoreValue));
        const score = signalUnavailable ? null : Math.max(0, Math.min(100, Number(scoreValue)));
        const emo = agg.modes?.emotion || payload.emotion || 'neutral';
        const blink = agg.blinkRate?.mean || payload.blinkRate || 0;
        const gaze = pts.gazeOnScreen !== undefined ? pts.gazeOnScreen : (payload.gazeOnScreen ? 100 : 0);
        const pose = agg.modes?.headPoseCategory || payload.headPoseCategory || 'forward';
        const drowsy = agg.drowsinessScore?.mean || payload.drowsinessScore || 0;
        const alerts = comp.alertFlags || [];

        // Color coding
        let sColor = 'var(--text-primary)';
        let bgBadge = 'rgba(139, 148, 158, 0.2)';
        let catText = 'Mixed estimate';

        if (signalUnavailable) { catText = 'Signal unavailable'; }
        else if (score >= 60) { sColor = 'var(--color-green)'; bgBadge = 'rgba(34, 197, 94, 0.2)'; catText = score >= 80 ? 'Higher estimate' : 'Steady estimate'; }
        else if (score >= 40) { sColor = 'var(--color-amber)'; bgBadge = 'rgba(245, 158, 11, 0.2)'; catText = 'Mixed estimate'; }
        else { sColor = 'var(--color-red)'; bgBadge = 'rgba(239, 68, 68, 0.2)'; catText = score >= 20 ? 'Lower estimate' : 'Very low estimate'; }

        // --- UPDATE CARD ---
        const elScore = document.getElementById(`score-${studentId}`);
        const elBadge = document.getElementById(`badge-${studentId}`);
        const elBar = document.getElementById(`bar-${studentId}`);
        const elEmoIco = document.getElementById(`emo-ico-${studentId}`);
        const elEmoLbl = document.getElementById(`emo-lbl-${studentId}`);
        const elGaze = document.getElementById(`gaze-${studentId}`);
        const elBlink = document.getElementById(`blink-${studentId}`);
        const elAlertRow = document.getElementById(`alert-row-${studentId}`);
        const elAlertCount = document.getElementById(`alert-count-${studentId}`);
        const elSpark = document.getElementById(`spark-${studentId}`);
        
        if (elScore) {
            if (signalUnavailable) elScore.innerText = '—';
            else this._animateNumber(elScore, parseInt(elScore.innerText) || 0, score, 300);
            elScore.style.color = sColor;
        }
        if (elBadge) {
            elBadge.innerText = catText;
            elBadge.style.background = bgBadge;
            elBadge.style.color = sColor;
        }
        if (elBar) {
            elBar.style.width = signalUnavailable ? '0%' : `${score}%`;
            elBar.style.background = sColor;
        }
        if (elGaze) elGaze.innerText = `Gaze ${Math.round(gaze)}%`;
        if (elBlink) elBlink.innerText = `Blink ${Math.round(blink)}/m`;
        if (elEmoIco) elEmoIco.innerText = this._getEmotionEmoji(emo);
        if (elEmoLbl) elEmoLbl.innerText = `State: ${emo.charAt(0).toUpperCase() + emo.slice(1)}`;

        // Sparkline queue logic
        student.sparkQueue.push(signalUnavailable ? null : score);
        student.sparkQueue.shift();
        
        if (elSpark) {
            elSpark.innerHTML = student.sparkQueue.map(v => {
                if (v === null) return `<div style="flex:1; background: transparent;"></div>`;
                let sc = 'var(--color-red)';
                if (v >= 60) sc = 'var(--color-green)';
                else if (v >= 40) sc = 'var(--color-amber)';
                const h = Math.max(10, v); // min 10% height
                return `<div style="flex:1; height: ${h}%; background: ${sc}; border-radius: 1px;"></div>`;
            }).join('');
        }

        // Alert Flash & Row
        const card = document.querySelector(`.student-card[data-student-id="${studentId}"]`);
        if (alerts.length > 0) {
            if (elAlertRow) {
                elAlertRow.style.display = 'block';
                elAlertCount.innerText = alerts.length;
            }
            if (card) {
                // Flash animation
                card.style.transition = 'none';
                card.style.borderColor = 'var(--color-red)';
                setTimeout(() => {
                    card.style.transition = 'border-color 0.3s ease';
                    card.style.borderColor = signalUnavailable ? 'var(--border-color)' : ((score <= 30) ? 'var(--color-red)' : ((score <= 50) ? 'var(--color-amber)' : 'var(--border-color)'));
                }, 400);
            }
        } else {
            if (elAlertRow) elAlertRow.style.display = 'none';
            if (card) card.style.borderColor = 'var(--border-color)';
        }

        // --- UPDATE TABLE ---
        const tScore = document.getElementById(`tbl-score-${studentId}`);
        const tGaze = document.getElementById(`tbl-gaze-${studentId}`);
        const tEmo = document.getElementById(`tbl-emo-${studentId}`);
        const tDrowsy = document.getElementById(`tbl-drowsy-${studentId}`);
        const tBlink = document.getElementById(`tbl-blink-${studentId}`);
        const tPose = document.getElementById(`tbl-pose-${studentId}`);
        const tYawn = document.getElementById(`tbl-yawn-${studentId}`);
        const tAlert = document.getElementById(`tbl-alert-${studentId}`);
        const tTime = document.getElementById(`tbl-time-${studentId}`);

        if (tScore) {
            tScore.innerText = signalUnavailable ? '—' : Math.round(score);
            tScore.style.color = sColor;
        }
        if (tGaze) tGaze.innerText = `${Math.round(gaze)}%`;
        if (tEmo) tEmo.innerText = `${this._getEmotionEmoji(emo)} ${emo}`;
        if (tDrowsy) {
            let drColor = drowsy > 0.5 ? 'red' : 'gray';
            tDrowsy.innerHTML = `<div style="width: 100%; height: 6px; background: var(--border-color); border-radius: 3px;"><div style="width: ${drowsy*100}%; height: 100%; background: ${drColor}; border-radius: 3px;"></div></div>`;
        }
        if (tBlink) tBlink.innerText = Math.round(blink);
        if (tPose) tPose.innerText = pose.replace('_', ' ');
        if (tYawn) tYawn.innerText = agg.eventFlags?.yawnDetected ? 'Yes' : 'No';
        if (tAlert) {
            if (alerts.length > 0) tAlert.innerHTML = `<span style="color:var(--color-red); font-weight:bold;">${alerts.length}</span>`;
            else tAlert.innerText = '0';
        }
        if (tTime) {
            tTime.innerText = new Date().toLocaleTimeString();
        }

        // Timestamp updater
        this._updateTimeAgo(studentId);
    }

    setStudentOffline(studentId) {
        if (!this.students.has(studentId)) return;
        this.students.get(studentId).offline = true;
        
        const dot = document.getElementById(`dot-${studentId}`);
        const card = document.querySelector(`.student-card[data-student-id="${studentId}"]`);
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        
        if (dot) dot.style.background = 'var(--color-red)';
        if (card) {
            card.style.opacity = '0.5';
            const badge = document.getElementById(`badge-${studentId}`);
            if (badge) {
                badge.innerText = 'Disconnected';
                badge.style.background = 'rgba(239, 68, 68, 0.2)';
                badge.style.color = 'var(--color-red)';
            }
        }
        if (row) row.style.opacity = '0.5';
    }

    setStudentOnline(studentId) {
        if (!this.students.has(studentId)) return;
        this.students.get(studentId).offline = false;

        const dot = document.getElementById(`dot-${studentId}`);
        const card = document.querySelector(`.student-card[data-student-id="${studentId}"]`);
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        
        if (dot) dot.style.background = 'var(--color-green)';
        if (card) card.style.opacity = '1';
        if (row) row.style.opacity = '1';
    }

    onStudentClick(callback) {
        this.onClickCallbacks.push(callback);
    }

    _animateNumber(element, start, end, duration) {
        if (start === end) { element.innerText = end; return; }
        let startTime = null;
        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            element.innerText = Math.floor(progress * (end - start) + start);
            if (progress < 1) window.requestAnimationFrame(step);
            else element.innerText = end;
        };
        window.requestAnimationFrame(step);
    }

    _updateTimeAgo(studentId) {
        const student = this.students.get(studentId);
        const elTime = document.getElementById(`time-${studentId}`);
        if (!elTime || !student) return;
        
        const diff = Math.floor((Date.now() - student.lastUpdate) / 1000);
        if (diff < 5) elTime.innerText = 'Updated just now';
        else if (diff < 60) elTime.innerText = `Updated ${diff}s ago`;
        else elTime.innerText = `Updated ${Math.floor(diff/60)}m ago`;
    }

    updateAllTimers() {
        this.students.forEach((val, id) => this._updateTimeAgo(id));
    }
}
