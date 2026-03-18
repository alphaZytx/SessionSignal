// Analytics logic for the post-session deep dive page

// Chart.js global defaults for Dark Theme
Chart.defaults.backgroundColor = 'rgba(0,0,0,0)';
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.responsive = true;
Chart.defaults.animation = { duration: 300 };
// Grid/ticks defaults (Chart.js v3+)
if (Chart.defaults.scale) {
    Chart.defaults.scale.grid = Chart.defaults.scale.grid || {};
    Chart.defaults.scale.grid.color = '#30363d';
    Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
    Chart.defaults.scale.ticks.color = '#8b949e';
}

const URL_PARAMS = new URLSearchParams(window.location.search);
const SESSION_ID = URL_PARAMS.get('sessionId');

const PALETTE = [
    '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', 
    '#0ea5e9', '#ec4899', '#14b8a6', '#facc15', '#6366f1'
];
const EMO_COLORS = {
    focused: '#22c55e', engaged: '#14b8a6', neutral: '#6b7280',
    confused: '#eab308', bored: '#f97316', distracted: '#ef4444', drowsy: '#7f1d1d'
};

// Global Data
let classSummaryData = null;
let allStudentSnaps = {}; // Map<studentId, snapshotArray>
let activeStudentId = null;

// Chart Instances
let cBar = null, cScatter = null, cTimeline = null;
let sTimeline = null, sPie = null, sGaze = null, sPose = null, sBlink = null, sDrowsy = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!SESSION_ID) {
        document.body.innerHTML = "<h2 style='padding:40px;text-align:center;'>No Session ID provided in URL.</h2>";
        return;
    }

    document.getElementById('btnExportPdf').addEventListener('click', () => window.print());
    document.getElementById('btnExportCsv').addEventListener('click', exportStudentCsv);

    try {
        await loadSessionData();
        renderOverview();
        buildHeatmap();
        buildComparativeCharts();
        buildTabs();
        generateClassReport();
    } catch (e) {
        console.error("Initialization error:", e);
        document.getElementById('headerDetail').innerText = "Error loading session data.";
    }
});

async function loadSessionData() {
    // 1. Fetch Class Summary
    const sumRes = await fetch(`http://localhost:3000/api/sessions/${SESSION_ID}/summary`);
    const sumJson = await sumRes.json();
    if (!sumJson.success) throw new Error(sumJson.error);
    classSummaryData = sumJson.data;

    // Fetch session metadata from another API to get duration/dates if needed
    const sessRes = await fetch(`http://localhost:3000/api/sessions`);
    const sessJson = await sessRes.json();
    const sessionMeta = (sessJson.data || []).find(s => s.id === SESSION_ID);
    
    if (sessionMeta) {
        classSummaryData.meta = sessionMeta;
        const sd = new Date(sessionMeta.startTime);
        const code = sessionMeta.sessionCode;
        const dur = sessionMeta.duration ? formatDuration(sessionMeta.duration) : 'Ongoing';
        document.getElementById('headerDetail').innerText = `Session ${code} — ${sd.toLocaleDateString()} ${sd.toLocaleTimeString()} (${dur})`;
        document.getElementById('valDuration').innerText = dur;
    }

    // 2. Fetch Snapshots for all students
    classSummaryData.studentSummaries.forEach((s, idx) => {
        s.color = PALETTE[idx % PALETTE.length];
    });

    const fetches = classSummaryData.studentSummaries.map(s => 
        fetch(`http://localhost:3000/api/sessions/${SESSION_ID}/snapshots/${s.studentId}`)
            .then(r => r.json())
            .then(j => allStudentSnaps[s.studentId] = j.data)
    );
    await Promise.all(fetches);
}

// FORMATTERS
function formatDuration(ms) {
    if (!ms) return "00:00:00";
    const totalSecs = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const s = String(totalSecs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// --- SECTION 1 ---
function renderOverview() {
    const s = classSummaryData;
    document.getElementById('valAvgAtt').innerText = `${s.classAvgAttention}%`;
    document.getElementById('valTotalStudents').innerText = s.studentSummaries.length;
    
    let totalAlerts = 0;
    Object.values(s.alertsByType || {}).forEach(v => totalAlerts += v);
    document.getElementById('valTotalAlerts').innerText = totalAlerts;

    let maxA = -1, minA = 101, maxS = null, minS = null;
    s.studentSummaries.forEach(stu => {
        if (stu.avgAttention > maxA) { maxA = stu.avgAttention; maxS = stu; }
        if (stu.avgAttention < minA) { minA = stu.avgAttention; minS = stu; }
    });
    
    if (maxS) document.getElementById('valMostEngaged').innerText = `${maxS.name} (${maxA}%)`;
    if (minS) document.getElementById('valLeastEngaged').innerText = `${minS.name} (${minA}%)`;
}

// --- CHART 7: ATTENTION HEATMAP (Vanilla HTML/CSS grid) ---
function buildHeatmap() {
    const container = document.getElementById('attentionHeatmap');
    const tooltip = document.getElementById('heatmapTooltip');
    const legend = document.getElementById('attentionHeatmapLegend');
    
    if (classSummaryData.studentSummaries.length === 0) {
        container.innerHTML = "No student data."; return;
    }

    // Spec: 60 columns (5 minutes at 5s intervals) using the last 5 minutes available
    const INTERVAL = 5000;
    const NUM_COLS = 60;

    // Determine global max timestamp across snapshots
    let maxTime = -Infinity;
    Object.values(allStudentSnaps).forEach(snaps => {
        if (snaps.length > 0) maxTime = Math.max(maxTime, snaps[snaps.length - 1].timestamp);
    });
    
    if (maxTime === -Infinity) { container.innerHTML = "No snapshots available."; return; }
    const minTime = maxTime - (NUM_COLS - 1) * INTERVAL;
    
    // CSS Grid setup
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `140px repeat(${NUM_COLS}, 20px)`; // Label col + interval cols
    container.style.gap = '2px';
    
    const getColor = (score) => {
        if (score === null || score === undefined) return '#374151'; // no data (spec exact)
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#86efac';
        if (score >= 40) return '#f59e0b';
        if (score >= 20) return '#f97316';
        return '#ef4444';
    };

    // Calculate class average tracking array mapped to column indices
    const classAvgMap = new Array(NUM_COLS).fill(0).map(() => ({ sum: 0, count: 0 }));

    // Header Row (empty corner + time ticks)
    container.insertAdjacentHTML('beforeend', `<div style="font-size:10px; color:var(--text-secondary); text-align:right; padding-right:8px; align-self:end;">Time &rarr;</div>`);
    for (let c = 0; c < NUM_COLS; c++) {
        // Spec: label every 10 intervals (~50 seconds)
        const show = (c % 10 === 0);
        const t = new Date(minTime + c * INTERVAL);
        const label = show ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        container.insertAdjacentHTML('beforeend', `<div style="font-size:9px; color:var(--text-secondary); border-left:1px solid #30363d;">${label}</div>`);
    }

    // Rows for each student
    classSummaryData.studentSummaries.forEach(stu => {
        // Label
        container.insertAdjacentHTML('beforeend', `<div style="font-size:12px; font-weight:500; text-align:right; padding-right:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${stu.name}">${stu.name}</div>`);
        
        // Map snaps to columns
        const snaps = allStudentSnaps[stu.studentId];
        const colMap = new Array(NUM_COLS).fill(null);
        
        snaps.forEach(snap => {
            const idx = Math.floor((snap.timestamp - minTime) / INTERVAL);
            if (idx >= 0 && idx < NUM_COLS) {
                colMap[idx] = snap;
                const score = (snap.attention_score ?? snap.interval_attention_score) ?? 0;
                classAvgMap[idx].sum += score;
                classAvgMap[idx].count++;
            }
        });

        // Cells
        for (let c = 0; c < NUM_COLS; c++) {
            const snap = colMap[c];
            const div = document.createElement('div');
            div.style.width = '100%'; div.style.height = '20px';
            div.style.borderRadius = '2px';
            
            if (snap) {
                const score = (snap.attention_score ?? snap.interval_attention_score) ?? 0;
                div.style.backgroundColor = getColor(score);
                
                div.onmouseenter = (e) => {
                    const t = new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const emo = snap.primary_emotion || 'neutral';
                    const gaze = Math.round(snap.gaze_on_screen_pct || 0);
                    const drowsy = (snap.drowsiness_score || 0).toFixed(2);
                    tooltip.innerHTML = `Time: ${t} | Attention: ${score} | Emotion: ${emo} | Gaze: ${gaze}% | Drowsy: ${drowsy}`;
                    tooltip.style.display = 'block';
                    tooltip.style.left = e.pageX + 10 + 'px';
                    tooltip.style.top = e.pageY + 10 + 'px';
                };
                div.onmouseleave = () => tooltip.style.display = 'none';
            } else {
                div.style.backgroundColor = '#374151'; // No data
            }
            container.appendChild(div);
        }
    });

    // Class Average Row
    container.insertAdjacentHTML('beforeend', `<div style="font-size:12px; font-weight:600; color:var(--text-primary); text-align:right; padding-right:8px; margin-top:4px;">Class Average</div>`);
    for (let c = 0; c < NUM_COLS; c++) {
        const div = document.createElement('div');
        div.style.width = '100%'; div.style.height = '20px';
        div.style.borderRadius = '2px';
        div.style.marginTop = '4px';
        
        if (classAvgMap[c].count > 0) {
            const avg = Math.round(classAvgMap[c].sum / classAvgMap[c].count);
            div.style.backgroundColor = getColor(avg);
        } else {
            div.style.backgroundColor = '#374151'; // spec: no data
        }
        container.appendChild(div);
    }

    // Legend (spec exact)
    if (legend) {
        legend.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-top: 12px;">
                <div style="flex:1; height:12px; border-radius:6px; border:1px solid var(--border-color);
                    background: linear-gradient(90deg,
                        #ef4444 0%,
                        #f97316 25%,
                        #f59e0b 50%,
                        #86efac 75%,
                        #22c55e 100%);"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary); margin-top:6px;">
                <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:6px;">
                No data: <span style="display:inline-block; width:10px; height:10px; background:#374151; border-radius:2px; vertical-align:middle; margin:0 6px;"></span>
            </div>
        `;
    }
}

// --- CHART 14: Comparative Analysis — grouped bar ---
function buildComparativeCharts() {
    const students = classSummaryData.studentSummaries;
    
    const METRICS = ['Avg Attention', 'Gaze %', 'Focus Time %', 'Drowsiness', 'Blink Rate', 'Yawn Count'];
    const ctxBar = document.getElementById('comparativeChart');
    const compDatasets = students.map(s => {
        // Compute actual (un-normalized) values from snapshots (spec data source + rules)
        let totalYawns = 0, totalBlinks = 0, totalDrowsy = 0, totalAtt = 0, totalGaze = 0, count = 0;
        let focusedIntervals = 0;
        const snaps = allStudentSnaps[s.studentId] || [];
        snaps.forEach(sn => {
            if (sn.yawn_detected) totalYawns++;
            totalBlinks += (sn.blink_rate || 0);
            totalDrowsy += (sn.drowsiness_score || 0);
            totalAtt += ((sn.attention_score ?? sn.interval_attention_score) ?? 0);
            totalGaze += (sn.gaze_on_screen_pct || 0);
            const attNow = ((sn.attention_score ?? sn.interval_attention_score) ?? 0);
            if (attNow >= 60) focusedIntervals++;
            count++;
        });
        
        const totalSessionSeconds = Math.max(1, count * 5);
        const focusedTimeSeconds = focusedIntervals * 5;

        const actAvgAtt = count > 0 ? (totalAtt / count) : 0;
        const actGaze = count > 0 ? (totalGaze / count) : 0;
        const actFocusPct = (focusedTimeSeconds / totalSessionSeconds) * 100;
        const actDrowsy = count > 0 ? (totalDrowsy / count) : 0;
        const actBlink = count > 0 ? (totalBlinks / count) : 0;
        const actYawn = totalYawns; // count

        // Normalizations to 0-100 scales
        const nAtt = actAvgAtt;
        const nGaze = actGaze;
        const nFocus = actFocusPct;
        const nDrowsy = actDrowsy * 100;
        const nBlink = Math.min(100, (actBlink / 35) * 100);
        const nYawn = Math.min(100, (actYawn / 10) * 100);

        return {
            label: s.name,
            backgroundColor: s.color,
            data: [nAtt, nGaze, nFocus, nDrowsy, nBlink, nYawn],
            // Store actuals in custom object for tooltip
            customActuals: [
                `${actAvgAtt.toFixed(0)}`, 
                `${actGaze.toFixed(0)}`, 
                `${actFocusPct.toFixed(0)}`, 
                `${actDrowsy.toFixed(2)}`, 
                `${actBlink.toFixed(0)}/min`, 
                `${actYawn}`
            ]
        };
    });

    cBar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: METRICS,
            datasets: compDatasets
        },
        options: {
            plugins: {
                datalabels: { display: false },
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        title: (items) => items?.[0] ? METRICS[items[0].dataIndex] : '',
                        label: (ctx) => {
                            const metric = METRICS[ctx.dataIndex];
                            const actualVal = ctx.dataset.customActuals[ctx.dataIndex];
                            const normVal = ctx.raw.toFixed(0);
                            if (metric === 'Avg Attention') return `Avg Attention: ${actualVal}% (normalized: ${normVal})`;
                            if (metric === 'Gaze %') return `Gaze %: ${actualVal}% (normalized: ${normVal})`;
                            if (metric === 'Focus Time %') return `Focus Time %: ${actualVal}% (normalized: ${normVal})`;
                            if (metric === 'Drowsiness') return `Drowsiness: ${actualVal} (normalized: ${normVal})`;
                            if (metric === 'Blink Rate') return `Blink Rate: ${actualVal} (normalized: ${normVal})`;
                            return `Yawn Count: ${actualVal} (normalized: ${normVal})`;
                        },
                        afterLabel: (ctx) => `Student: ${ctx.dataset.label}`
                    }
                }
            },
            scales: {
                y: { min: 0, max: 100, title: { display: true, text: 'Normalized Score (0-100)' } }
            }
        }
    });

    // Scatter
    const ctxScatter = document.getElementById('compScatterChart');
    const scatterData = students.map((s, i) => ({
        x: s.avgGaze, y: s.avgAttention,
        name: s.name, color: s.color, r: 8
    }));
    cScatter = new Chart(ctxScatter, {
        type: 'bubble', // 'bubble' acts like scatter but allows dynamic radii and colors well
        data: {
            datasets: scatterData.map(pt => ({
                label: pt.name, data: [{x: pt.x, y: pt.y, r: pt.r}], backgroundColor: pt.color
            }))
        },
        options: {
            plugins: {
                tooltip: { callbacks: { label: c => `${c.dataset.label}: Gaze ${c.raw.x}%, Att ${c.raw.y}` } },
                legend: { display: false }
            },
            scales: {
                x: { min: 0, max: 100, title: { display: true, text: 'Gaze on Screen %' } },
                y: { min: 0, max: 100, title: { display: true, text: 'Avg Attention Score' } }
            }
        }
    });

    // Timeline Full
    const ctxTimeline = document.getElementById('compTimelineChart');
    const tDatasets = students.map(s => {
        const snaps = allStudentSnaps[s.studentId];
        return {
            label: s.name,
            borderColor: s.color, borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0,
            data: snaps.map(sn => ({ x: sn.timestamp, y: sn.interval_attention_score || 0 }))
        };
    });
    
    cTimeline = new Chart(ctxTimeline, {
        type: 'line',
        data: { datasets: tDatasets },
        options: {
            scales: {
                x: {
                    type: 'linear', ticks: { callback: v => new Date(v).toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'}) }
                },
                y: { min: 0, max: 100 }
            },
            plugins: { legend: { position: 'right' } }
        }
    });
}

// --- SECTION 3: TABS & DEEP DIVE ---
function buildTabs() {
    const tabContainer = document.getElementById('studentTabs');
    tabContainer.innerHTML = '';
    
    classSummaryData.studentSummaries.forEach((s, idx) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
        btn.innerHTML = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${s.color}; margin-right:6px;"></span>${s.name}`;
        
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            populateStudentTab(s.studentId);
        };
        tabContainer.appendChild(btn);
    });

    if (classSummaryData.studentSummaries.length > 0) {
        document.getElementById('studentTabContent').style.display = 'block';
        populateStudentTab(classSummaryData.studentSummaries[0].studentId);
    }
}
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        if (chart.config.options.plugins.centerText && chart.config.options.plugins.centerText.display) {
            var width = chart.width, height = chart.height, ctx = chart.ctx;
            ctx.restore();
            var fontSize = (height / 114).toFixed(2);
            ctx.font = fontSize + "em Inter";
            ctx.textBaseline = "middle";
            var text = chart.config.options.plugins.centerText.text || "",
                textX = Math.round((width - ctx.measureText(text).width) / 2),
                textY = height / 2;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, textX, textY);
            ctx.save();
        }
    }
};

if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
Chart.register(centerTextPlugin);

function buildStudentCharts(studentId) {
    // Destroy existing to prevent re-render ghosting
    [sTimeline, sPie, sGaze, sPose, sBlink, sDrowsy].forEach(c => { if(c) c.destroy(); });
    
    // CHART 8: Attention Timeline Background Zones
    sTimeline = new Chart(document.getElementById('studentAttentionFull'), {
        type: 'line',
        options: {
            scales: { y: { min: 0, max: 100 } },
            plugins: {
                datalabels: { display: false },
                legend: { display: false },
                annotation: {
                    annotations: {
                        boxFocus: { type: 'box', yMin: 60, yMax: 100, backgroundColor: 'rgba(34, 197, 94, 0.15)', borderWidth: 0, label: { display: true, content: 'Focused', position: 'end' } },
                        boxNeut: { type: 'box', yMin: 40, yMax: 60, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 0, label: { display: true, content: 'Neutral', position: 'end' } },
                        boxDist: { type: 'box', yMin: 0, yMax: 40, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 0, label: { display: true, content: 'Distracted', position: 'end' } }
                    }
                }
            }
        }
    });
    
    // CHART 9: Emotion Donut
    sPie = new Chart(document.getElementById('studentEmotionDonut'), {
        type: 'doughnut',
        options: {
            cutout: '70%',
            plugins: {
                datalabels: { display: false },
                legend: { position: 'right' },
                centerText: { display: true, text: 'Emotion' },
                tooltip: {
                    callbacks: {
                        label: c => {
                            const pct = c.raw || 0;
                            const totalMins = (c.chart?.options?.plugins?.centerText?.totalSessionMinutes) || 0;
                            const mins = (pct / 100) * totalMins;
                            return `${pct.toFixed(1)}% of session (${mins.toFixed(1)} minutes)`;
                        }
                    }
                }
            }
        }
    });
    
    // CHART 10: Gaze Timeline
    sGaze = new Chart(document.getElementById('studentGazeFull'), {
        type: 'line',
        options: {
            scales: { y: { min: 0, max: 100, title: { display: true, text: 'Gaze on Screen %' } } },
            plugins: {
                datalabels: { display: false },
                legend: { display: false },
                annotation: {
                    annotations: {
                        target: { type: 'line', yMin: 70, yMax: 70, borderColor: 'rgba(34, 197, 94, 0.8)', borderWidth: 2, borderDash: [4, 4], label: { display: true, content: 'Target', position: 'end', backgroundColor: 'rgba(34, 197, 94, 0.8)' } }
                    }
                }
            }
        }
    });
    
    // CHART 11: Head Pose Stacked Bar
    sPose = new Chart(document.getElementById('studentHeadPose'), {
        type: 'bar',
        options: {
            indexAxis: 'y',
            scales: {
                x: { stacked: true, min: 0, max: 100 },
                y: { stacked: true }
            },
            plugins: {
                datalabels: { display: false },
                legend: { position: 'bottom' }
            }
        }
    });
    
    // CHART 12: Blink Rate Timeline
    sBlink = new Chart(document.getElementById('studentBlinkTimeline'), {
        type: 'line',
        options: {
            scales: { y: { min: 0, max: 35, title: { display: true, text: 'Blinks per Minute' } } },
            plugins: {
                datalabels: { display: false },
                legend: { display: false },
                annotation: {
                    annotations: {
                        low: { type: 'line', yMin: 8, yMax: 8, borderColor: 'rgba(239, 68, 68, 0.8)', borderDash: [4, 4], label: { display: true, content: 'Low threshold' } },
                        normal: { type: 'line', yMin: 20, yMax: 20, borderColor: 'rgba(34, 197, 94, 0.8)', borderDash: [4, 4], label: { display: true, content: 'Normal upper' } },
                        high: { type: 'line', yMin: 25, yMax: 25, borderColor: 'rgba(245, 158, 11, 0.8)', borderDash: [4, 4], label: { display: true, content: 'High threshold' } }
                    }
                }
            }
        }
    });
    
    // CHART 13: Drowsiness Timeline
    sDrowsy = new Chart(document.getElementById('studentDrowsinessFull'), {
        type: 'line',
        options: {
            scales: { y: { min: 0, max: 1, reverse: true, title: { display: true, text: 'Drowsiness Score' } } },
            plugins: {
                datalabels: { display: false },
                legend: { display: false },
                annotation: {
                    annotations: {
                        mod: { type: 'line', yMin: 0.5, yMax: 0.5, borderColor: 'rgba(245, 158, 11, 0.8)', borderDash: [4, 4], label: { display: true, content: 'Moderate' } },
                        high: { type: 'line', yMin: 0.75, yMax: 0.75, borderColor: 'rgba(239, 68, 68, 0.8)', borderDash: [4, 4], label: { display: true, content: 'High' } }
                    }
                }
            }
        }
    });
}

function populateStudentTab(studentId) {
    activeStudentId = studentId;
    const s = classSummaryData.studentSummaries.find(x => x.studentId === studentId);
    if (!s) return;
    const snaps = allStudentSnaps[studentId] || [];

    document.getElementById('printStudentName').innerText = `Report for ${s.name}`;

    // CARDS
    document.getElementById('sdScore').innerText = s.avgAttention;
    
    // Quick calc stats from snaps
    let maxStreak = 0, curStreak = 0;
    let totalYawns = 0;
    snaps.forEach(sn => {
        if ((sn.interval_attention_score||0) >= 60) { curStreak += (sn.interval_duration_ms||5000); if(curStreak > maxStreak) maxStreak = curStreak; } 
        else curStreak = 0;
        if (sn.yawn_detected) totalYawns++;
    });
    
    const fmtMins = ms => (ms/60000).toFixed(1) + 'm';
    
    // Focus calculation: focusPct * duration, roughly estimated by snaps
    const durMs = snaps.length * 5000;
    document.getElementById('sdFocusTime').innerText = fmtMins(durMs * (s.focusPct/100));
    document.getElementById('sdDistTime').innerText = fmtMins(durMs * (s.distractedPct/100));
    document.getElementById('sdStreak').innerText = fmtMins(maxStreak);
    document.getElementById('sdYawns').innerText = totalYawns;

    buildStudentCharts(studentId);
    
    const labels = snaps.map(sn => new Date(sn.timestamp).toLocaleTimeString());
    
    // Timeline
    sTimeline.data = {
        labels,
        datasets: [{
            data: snaps.map(sn => (sn.attention_score ?? sn.interval_attention_score) ?? 0),
            borderColor: s.color,
            backgroundColor: s.color + '33',
            fill: false,
            tension: 0.3,
            pointRadius: 0
        }]
    };
    sTimeline.update();

    // Pie
    const EMO_KEYS = ['focused', 'engaged', 'neutral', 'confused', 'bored', 'distracted', 'drowsy'];
    const emoAvg = Object.fromEntries(EMO_KEYS.map(k => [k, 0]));
    snaps.forEach(sn => {
        emoAvg.focused += (sn.emotion_focused_pct || 0);
        emoAvg.engaged += (sn.emotion_engaged_pct || 0);
        emoAvg.neutral += (sn.emotion_neutral_pct || 0);
        emoAvg.confused += (sn.emotion_confused_pct || 0);
        emoAvg.bored += (sn.emotion_bored_pct || 0);
        emoAvg.distracted += (sn.emotion_distracted_pct || 0);
        emoAvg.drowsy += (sn.emotion_drowsy_pct || 0);
    });
    const denom = Math.max(1, snaps.length);
    EMO_KEYS.forEach(k => emoAvg[k] = emoAvg[k] / denom);
    // Normalize to sum 100 in case backend stores partial/rounded values
    const emoSum = EMO_KEYS.reduce((a, k) => a + emoAvg[k], 0);
    const emoScale = emoSum > 0 ? (100 / emoSum) : 1;
    EMO_KEYS.forEach(k => emoAvg[k] = emoAvg[k] * emoScale);

    let domEmo = 'neutral', domPct = -1;
    EMO_KEYS.forEach(k => { if (emoAvg[k] > domPct) { domPct = emoAvg[k]; domEmo = k; } });
    const totalSessionMinutes = (snaps.length * 5) / 60;
    sPie.options.plugins.centerText.totalSessionMinutes = totalSessionMinutes;
    sPie.options.plugins.centerText.text = `${domEmo.charAt(0).toUpperCase() + domEmo.slice(1)} ${domPct.toFixed(0)}%`;
    sPie.data = {
        labels: ['Focused', 'Engaged', 'Neutral', 'Confused', 'Bored', 'Distracted', 'Drowsy'],
        datasets: [{
            data: EMO_KEYS.map(k => emoAvg[k]),
            backgroundColor: EMO_KEYS.map(k => EMO_COLORS[k] || '#ccc'),
            borderWidth: 0
        }]
    };
    sPie.update();

    // Gaze
    sGaze.data = {
        labels,
        datasets: [{
            data: snaps.map(sn => sn.gaze_on_screen_pct || 0),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20,184,166,0.2)',
            fill: true,
            tension: 0.2,
            pointRadius: 0
        }]
    };
    sGaze.update();

    // Pose 
    // Aggregate poses first
    const pCounts = { forward: 0, looking_down: 0, looking_left: 0, looking_right: 0, tilted: 0, looking_up: 0 };
    snaps.forEach(sn => { pCounts[sn.head_pose_category || 'forward'] = (pCounts[sn.head_pose_category || 'forward'] || 0) + 1; });
    const tot = Math.max(1, snaps.length);
    const HEAD_POSE_LABELS = ['Forward', 'Looking Down', 'Looking Left', 'Looking Right', 'Tilted', 'Looking Up'];
    const HEAD_KEYS = ['forward', 'looking_down', 'looking_left', 'looking_right', 'tilted', 'looking_up'];
    const HEAD_COLORS = { forward: '#22c55e', looking_down: '#f97316', looking_left: '#3b82f6', looking_right: '#a855f7', tilted: '#eab308', looking_up: '#6b7280' };
    const pcts = HEAD_KEYS.map(k => (pCounts[k] / tot) * 100);
    const pSum = pcts.reduce((a, b) => a + b, 0);
    const pScale = pSum > 0 ? (100 / pSum) : 1;
    sPose.data = {
        labels: ['Head Pose'],
        datasets: HEAD_KEYS.map((k, i) => ({
            label: HEAD_POSE_LABELS[i],
            data: [pcts[i] * pScale],
            backgroundColor: HEAD_COLORS[k] || '#ccc'
        }))
    };
    sPose.update();

    // Blink
    sBlink.data = {
        labels,
        datasets: [{
            data: snaps.map(sn => sn.blink_rate || 0),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.12)',
            tension: 0.3,
            fill: false,
            pointRadius: 0
        }]
    };
    sBlink.update();

    // Drowsy
    sDrowsy.data = {
        labels,
        datasets: [{
            data: snaps.map(sn => sn.drowsiness_score || 0),
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.2)',
            fill: true,
            tension: 0.3,
            pointRadius: 0
        }]
    };
    sDrowsy.update();

    // TABLE
    const tb = document.querySelector('#sdTable tbody');
    tb.innerHTML = '';
    [...snaps].reverse().forEach(sn => {
        const sc = sn.interval_attention_score||0;
        let cClass = sc >= 60 ? 'color-green' : (sc >= 40 ? 'color-amber' : 'color-red');
        const tr = `
            <tr>
                <td>${new Date(sn.timestamp).toLocaleTimeString()}</td>
                <td class="${cClass}" style="font-weight:bold">${sc}</td>
                <td>${sn.primary_emotion}</td>
                <td>${Math.round(sn.gaze_on_screen_pct||0)}%</td>
                <td>${(sn.head_pose_category||'').replace('_',' ')}</td>
                <td>${Math.round(sn.blink_rate||0)}</td>
                <td>${(sn.drowsiness_score||0).toFixed(2)}</td>
                <td>${Math.round(sn.eye_openness_mean||0 * 100)}%</td>
                <td style="color:var(--color-red)">${sn.alert_flags ? sn.alert_flags.split(',').length : 0}</td>
            </tr>
        `;
        tb.insertAdjacentHTML('beforeend', tr);
    });

    // INSIGHTS
    const ul = document.getElementById('sdInsights');
    ul.innerHTML = '';
    let peakSc = -1, peakTm = null, dipSc = 101, dipTm = null;
    snaps.forEach(sn => {
        const t = sn.interval_attention_score||0;
        if(t > peakSc) { peakSc = t; peakTm = sn.timestamp; }
        if(t < dipSc && t < 40) { dipSc = t; dipTm = sn.timestamp; }
    });
    
    ul.innerHTML += `<li>Peak focus reached at ${new Date(peakTm).toLocaleTimeString()} with a score of ${peakSc}.</li>`;
    if (dipTm) ul.innerHTML += `<li>Attention dropped significantly around ${new Date(dipTm).toLocaleTimeString()} (score ${dipSc}) — consider reviewing that segment.</li>`;
    if (totalYawns > 0) ul.innerHTML += `<li>${s.name} had ${totalYawns} yawns detected — may benefit from a break reminder and checking engagement methods.</li>`;
    if (s.awayPct > 10) ul.innerHTML += `<li>Face was not detected for ${s.awayPct}% of the session — follow up to ensure they are remaining at their station.</li>`;
    ul.innerHTML += `<li>Blink rate averaged ${s.avgBlink || 'normal range'} over the session.</li>`;
}


function generateClassReport() {
    const box = document.getElementById('aiReportBox');
    const s = classSummaryData;
    
    let report = `
        <p><strong>Session Quality:</strong> The session experienced an overall average class attention of <strong>${s.classAvgAttention}%</strong>. 
        There were a total of ${s.studentSummaries.length} participating students and ${Object.keys(s.alertsByType||{}).length > 0 ? 'several alert events recorded' : 'no critical alerts triggered'}.</p>
        
        <p><strong>Engagement Patterns:</strong> The dominant emotion displayed across the session was <strong>${(s.classEmotionDistribution && Object.keys(s.classEmotionDistribution).length > 0) ? Object.keys(s.classEmotionDistribution).reduce((a,b)=>s.classEmotionDistribution[a] > s.classEmotionDistribution[b] ? a : b) : 'neutral'}</strong>.
        Analysis of the attention timeline indicates that engagement fluctuated over the total duration.</p>
        
        <p><strong>Suggestions:</strong> Consider incorporating structured breaks if drowsiness spikes were observed towards the mid-point of the class. For students consistently dropping below the 40% focus threshold, consider deploying direct check-in mechanisms or interactive polls during the lesson.</p>
    `;
    box.innerHTML = report;
}

function exportStudentCsv() {
    if (!activeStudentId || !allStudentSnaps[activeStudentId]) { alert("No student selected."); return; }
    
    const snaps = allStudentSnaps[activeStudentId];
    const s = classSummaryData.studentSummaries.find(x => x.studentId === activeStudentId);
    
    let csv = "Timestamp,Time,AttentionScore,Emotion,GazePct,HeadPose,BlinkRate,DrowsyScore,Alerts\n";
    snaps.forEach(sn => {
        csv += `${sn.timestamp},${new Date(sn.timestamp).toLocaleTimeString()},${sn.interval_attention_score||0},${sn.primary_emotion},${Math.round(sn.gaze_on_screen_pct||0)},${sn.head_pose_category||''},${Math.round(sn.blink_rate||0)},${(sn.drowsiness_score||0).toFixed(2)},"${sn.alert_flags||''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `${s.name.replace(/\s/g,'_')}_session_export.csv`);
    a.click();
}
