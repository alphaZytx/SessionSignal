export class ChartManager {
    constructor() {
        this.students = new Map(); // Map<studentId, { name, color, data: [], headPoseCounts: {} }>
        this.maxDataPoints = 60; // 5 mins at 5s intervals
        this.studentColors = [
            '#3b82f6', // blue
            '#22c55e', // green
            '#f59e0b', // amber
            '#a855f7', // purple
            '#ef4444', // red
            '#0ea5e9', // light blue
            '#ec4899', // pink
            '#14b8a6'  // teal
        ];
        
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        }

        // Global Defaults for Dark Theme
        Chart.defaults.backgroundColor = 'rgba(0,0,0,0)';
        Chart.defaults.color = '#8b949e';
        Chart.defaults.borderColor = '#30363d';
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.maintainAspectRatio = false;
        Chart.defaults.responsive = true;
        Chart.defaults.animation = { duration: 300 };
        if (Chart.defaults.scale) {
            Chart.defaults.scale.grid = Chart.defaults.scale.grid || {};
            Chart.defaults.scale.grid.color = '#30363d';
            Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
            Chart.defaults.scale.ticks.color = '#8b949e';
        }

        this.charts = {};
        this.timeLabels = [];
        
        // Setup initial time labels array
        for (let i = 0; i < this.maxDataPoints; i++) this.timeLabels.push('');
    }

    initCharts() {
        this._initAttentionTimeline();
        this._initEmotionDistribution();
        this._initGazeChart();
        this._initBlinkRateChart();
        this._initHeadPoseChart();
        this._initDrowsinessTimeline();
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // --- CHART 1: ATTENTION TIMELINE ---
    _initAttentionTimeline() {
        const ctx = document.getElementById('attentionTimeline');
        if (!ctx) return;
        
        this.charts.attention = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [...this.timeLabels],
                datasets: [{
                    label: 'Class Average',
                    data: new Array(this.maxDataPoints).fill(null),
                    borderColor: 'white',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.3,
                    z: 10
                }]
            },
            options: {
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { boxWidth: 12, usePointStyle: true } },
                    tooltip: { mode: 'index', intersect: false },
                    datalabels: { display: false },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line', yMin: 60, yMax: 60, borderColor: 'rgba(34, 197, 94, 0.6)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'Focus', position: 'start', backgroundColor: 'rgba(34, 197, 94, 0.8)' }
                            },
                            line2: {
                                type: 'line', yMin: 40, yMax: 40, borderColor: 'rgba(239, 68, 68, 0.6)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'Concern', position: 'start', backgroundColor: 'rgba(239, 68, 68, 0.8)' }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 10 }
                    },
                    y: {
                        min: 0, max: 100,
                        title: { display: true, text: 'Attention Score' }
                    }
                }
            }
        });
        // Spec-friendly handle
        this.attentionTimelineChart = this.charts.attention;
    }

    // --- CHART 2: EMOTION DISTRIBUTION ---
    _initEmotionDistribution() {
        const ctx = document.getElementById('emotionDistribution');
        if (!ctx) return;

        this.charts.emotion = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [], // Student names
                datasets: [
                    { label: 'Focused', data: [], backgroundColor: '#22c55e', stack: 'Stack 0' },
                    { label: 'Engaged', data: [], backgroundColor: '#14b8a6', stack: 'Stack 0' },
                    { label: 'Neutral', data: [], backgroundColor: '#6b7280', stack: 'Stack 0' },
                    { label: 'Confused', data: [], backgroundColor: '#eab308', stack: 'Stack 0' },
                    { label: 'Bored', data: [], backgroundColor: '#f97316', stack: 'Stack 0' },
                    { label: 'Distracted', data: [], backgroundColor: '#ef4444', stack: 'Stack 0' },
                    { label: 'Drowsy', data: [], backgroundColor: '#7f1d1d', stack: 'Stack 0' }
                ]
            },
            options: {
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                        }
                    },
                    datalabels: { display: false },
                    legend: { labels: { boxWidth: 10, font: { size: 10 } } }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Time %' } }
                }
            }
        });
        this.emotionDistributionChart = this.charts.emotion;
    }

    // --- CHART 3: GAZE CHART ---
    _initGazeChart() {
        const ctx = document.getElementById('gazeChart');
        if (!ctx) return;

        this.charts.gaze = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Gaze on Screen %',
                    data: [],
                    backgroundColor: [], // Dynamic per bar
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { 
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => `Gaze: ${c.raw.toFixed(1)}%` } },
                    datalabels: {
                        color: 'white',
                        font: { weight: 'bold' },
                        formatter: (value) => value > 0 ? value.toFixed(0) + '%' : ''
                    }
                },
                scales: {
                    x: { min: 0, max: 100, title: { display: true, text: 'Gaze on Screen %' } },
                    y: { grid: { display: false } }
                }
            }
        });
        this.gazeChart = this.charts.gaze;
    }

    // --- CHART 4: BLINK RATE ---
    _initBlinkRateChart() {
        const ctx = document.getElementById('blinkRateChart');
        if (!ctx) return;

        this.charts.blink = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Blinks/min',
                    data: [],
                    backgroundColor: [], // one color per student
                    borderRadius: 4
                }]
            },
            options: {
                plugins: { 
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            label: c => `${c.raw} blinks/min`,
                            footer: c => {
                                const v = c[0].raw;
                                if (v < 8) return "Very low — possible screen strain or deep focus";
                                if (v > 25) return "Elevated — possible stress or discomfort";
                                return "Normal blink rate";
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line', yMin: 8, yMax: 8, borderColor: 'rgba(239, 68, 68, 0.8)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'Low (strain risk)', position: 'end', backgroundColor: 'rgba(239, 68, 68, 0.8)' }
                            },
                            line2: {
                                type: 'line', yMin: 25, yMax: 25, borderColor: 'rgba(245, 158, 11, 0.8)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'High (stress)', position: 'end', backgroundColor: 'rgba(245, 158, 11, 0.8)' }
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { min: 0, max: 35, title: { display: true, text: 'Blinks per Minute' } }
                }
            }
        });
        this.blinkRateChart = this.charts.blink;
    }

    // --- CHART 5: HEAD POSE ---
    _initHeadPoseChart() {
        const ctx = document.getElementById('headPoseChart');
        if (!ctx) return;

        this.charts.pose = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Forward', 'Looking Down', 'Looking Left', 'Looking Right', 'Tilted', 'Looking Up'],
                datasets: []
            },
            options: {
                plugins: {
                    datalabels: { display: false },
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }
                },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { display: false },
                        grid: { color: '#30363d' },
                        angleLines: { color: '#30363d' },
                        pointLabels: { color: '#8b949e', font: { size: 10 } }
                    }
                }
            }
        });
        this.headPoseChart = this.charts.pose;
    }

    // --- CHART 6: DROWSINESS TIMELINE ---
    _initDrowsinessTimeline() {
        const ctx = document.getElementById('drowsinessTimeline');
        if (!ctx) return;

        this.charts.drowsiness = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [...this.timeLabels],
                datasets: []
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false },
                    datalabels: { display: false },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line', yMin: 0.5, yMax: 0.5, borderColor: 'rgba(245, 158, 11, 0.8)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'Moderate concern', position: 'start', backgroundColor: 'rgba(245, 158, 11, 0.8)' }
                            },
                            line2: {
                                type: 'line', yMin: 0.75, yMax: 0.75, borderColor: 'rgba(239, 68, 68, 0.8)', borderWidth: 2, borderDash: [4, 4],
                                label: { display: true, content: 'High drowsiness', position: 'start', backgroundColor: 'rgba(239, 68, 68, 0.8)' }
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                    y: {
                        min: 0, max: 1,
                        reverse: true, // Inverted: 0=alert(top), 1=drowsy(bottom)
                        title: { display: true, text: 'Drowsiness Score (← Alert | Drowsy →)' }
                    }
                }
            }
        });
        this.drowsinessTimelineChart = this.charts.drowsiness;
    }

    // --- LOGIC METHODS ---

    addStudent(studentId, name) {
        if (this.students.has(studentId)) return;

        const colorIndex = this.students.size % this.studentColors.length;
        const color = this.studentColors[colorIndex];
        const attentionFill = this._hexToRgba(color, 0.1); // spec: ~10% opacity
        const radarFill = this._hexToRgba(color, 0.2); // spec: 20% opacity
        const drowsyFill = this._hexToRgba(color, 0.3); // spec: 30% opacity

        this.students.set(studentId, {
            name,
            color,
            dataIdx: this.students.size,
            headPoseCounts: { forward: 0, looking_down: 0, looking_left: 0, looking_right: 0, tilted: 0, looking_up: 0 },
            totalIntervals: 0
        });

        // 1. Attention
        if (this.charts.attention) {
            this.charts.attention.data.datasets.push({
                sId: studentId,
                label: name,
                data: new Array(this.maxDataPoints).fill(null),
                borderColor: color,
                backgroundColor: attentionFill,
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.3
            });
            this.charts.attention.update('none');
        }

        // 2. Emotion (just add label to x-axis, datasets align by index implicitly)
        if (this.charts.emotion) {
            this.charts.emotion.data.labels.push(name);
            // Push empty zero to maintain lengths across the 7 emotion datasets
            this.charts.emotion.data.datasets.forEach(dst => {
                dst.data.push(0);
            });
            this.charts.emotion.update('none');
        }

        // 3. Gaze
        if (this.charts.gaze) {
            this.charts.gaze.data.labels.push(name);
            this.charts.gaze.data.datasets[0].data.push(0);
            this.charts.gaze.data.datasets[0].backgroundColor.push(color);
            this.charts.gaze.update('none');
        }

        // 4. Blink
        if (this.charts.blink) {
            this.charts.blink.data.labels.push(name);
            this.charts.blink.data.datasets[0].data.push(0);
            this.charts.blink.data.datasets[0].backgroundColor.push(color);
            this.charts.blink.update('none');
        }

        // 5. Pose
        if (this.charts.pose) {
            this.charts.pose.data.datasets.push({
                sId: studentId,
                label: name,
                data: [0,0,0,0,0,0],
                borderColor: color,
                backgroundColor: radarFill,
                borderWidth: 1,
                fill: true,
                pointRadius: 2
            });
            this.charts.pose.update('none');
        }

        // 6. Drowsiness
        if (this.charts.drowsiness) {
            this.charts.drowsiness.data.datasets.push({
                sId: studentId,
                label: name,
                data: new Array(this.maxDataPoints).fill(null),
                borderColor: color,
                backgroundColor: drowsyFill,
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.3
            });
            this.charts.drowsiness.update('none');
        }
    }

    removeStudent(studentId) {
        if (!this.students.has(studentId)) return;
        
        // Find index across labels where needed
        const studentInfo = this.students.get(studentId);
        const name = studentInfo.name;

        // Attention
        if (this.charts.attention) {
            this.charts.attention.data.datasets = this.charts.attention.data.datasets.filter(ds => ds.label === 'Class Average' || ds.sId !== studentId);
            this.charts.attention.update();
        }

        // Bar charts (emotion, gaze, blink) mapping by name label
        const removeByLabel = (chart) => {
            if (!chart) return;
            const idx = chart.data.labels.indexOf(name);
            if (idx > -1) {
                chart.data.labels.splice(idx, 1);
                chart.data.datasets.forEach(ds => {
                    if (ds.backgroundColor && Array.isArray(ds.backgroundColor)) ds.backgroundColor.splice(idx, 1);
                    ds.data.splice(idx, 1);
                });
                chart.update();
            }
        };

        removeByLabel(this.charts.emotion);
        removeByLabel(this.charts.gaze);
        removeByLabel(this.charts.blink);

        // Pose
        if (this.charts.pose) {
            this.charts.pose.data.datasets = this.charts.pose.data.datasets.filter(ds => ds.sId !== studentId);
            this.charts.pose.update();
        }

        // Drowsiness
        if (this.charts.drowsiness) {
            this.charts.drowsiness.data.datasets = this.charts.drowsiness.data.datasets.filter(ds => ds.sId !== studentId);
            this.charts.drowsiness.update();
        }

        this.students.delete(studentId);
    }

    updateStudentData(studentId, payload) {
        if (!this.students.has(studentId)) {
            // Auto add if not present
            this.addStudent(studentId, payload.name || payload.studentName || "Unknown");
        }

        const student = this.students.get(studentId);
        const name = student.name;
        const agg = payload.aggregates || {};
        const comp = agg.computed || {};
        const pts = agg.percentages || {};
        const observable = agg.signalState !== 'unavailable'
            && payload.signalState !== 'unavailable'
            && (comp.intervalAttentionScore ?? payload.attentionScore) != null
            && Number.isFinite(Number(comp.intervalAttentionScore ?? payload.attentionScore));

        // Manage global time labels for lines
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (this.timeLabels[this.timeLabels.length - 1] !== timeStr) {
            this.timeLabels.push(timeStr);
            if (this.timeLabels.length > this.maxDataPoints) {
                this.timeLabels.shift();
            }
        }

        // 1. Attention Timeline
        if (this.charts.attention) {
            const ds = this.charts.attention.data.datasets.find(d => d.sId === studentId);
            if (ds) {
                ds.data.push(observable ? Number(comp.intervalAttentionScore ?? payload.attentionScore) : null);
                if (ds.data.length > this.maxDataPoints) ds.data.shift();
            }
            this.charts.attention.data.labels = [...this.timeLabels];
            this.charts.attention.update('active'); // smoother real-time update
        }

        // 2. Emotion Stacked Bar
        if (this.charts.emotion && agg.emotionDistribution && observable) {
            const idx = this.charts.emotion.data.labels.indexOf(name);
            if (idx > -1) {
                const eDist = agg.emotionDistribution;
                const raw = {
                    focused: eDist.focused || 0,
                    engaged: eDist.engaged || 0,
                    neutral: eDist.neutral || 0,
                    confused: eDist.confused || 0,
                    bored: eDist.bored || 0,
                    distracted: eDist.distracted || 0,
                    drowsy: eDist.drowsy || 0
                };
                const sum = Object.values(raw).reduce((a, b) => a + b, 0);
                const scale = sum > 0 ? (100 / sum) : 1;
                this.charts.emotion.data.datasets[0].data[idx] = raw.focused * scale;
                this.charts.emotion.data.datasets[1].data[idx] = raw.engaged * scale;
                this.charts.emotion.data.datasets[2].data[idx] = raw.neutral * scale;
                this.charts.emotion.data.datasets[3].data[idx] = raw.confused * scale;
                this.charts.emotion.data.datasets[4].data[idx] = raw.bored * scale;
                this.charts.emotion.data.datasets[5].data[idx] = raw.distracted * scale;
                this.charts.emotion.data.datasets[6].data[idx] = raw.drowsy * scale;
                this.charts.emotion.update('active');
            }
        }

        // 3. Gaze Chart
        if (this.charts.gaze) {
            const idx = this.charts.gaze.data.labels.indexOf(name);
            if (idx > -1) {
                const val = observable ? (pts.gazeOnScreen !== undefined ? pts.gazeOnScreen : (payload.gazeOnScreen ? 100 : 0)) : null;
                this.charts.gaze.data.datasets[0].data[idx] = val;
                
                let bColor = '#6b7280';
                if (observable && val >= 70) bColor = '#22c55e'; // green
                else if (val >= 40) bColor = '#f59e0b'; // amber
                else if (observable) bColor = '#ef4444';
                this.charts.gaze.data.datasets[0].backgroundColor[idx] = bColor;
                
                this.charts.gaze.update('active');
            }
        }

        // 4. Blink Chart
        if (this.charts.blink) {
            const idx = this.charts.blink.data.labels.indexOf(name);
            if (idx > -1) {
                const val = observable ? (agg.blinkRate?.mean !== undefined ? agg.blinkRate.mean : (payload.blinkRate || 0)) : null;
                this.charts.blink.data.datasets[0].data[idx] = val;
                this.charts.blink.update('active');
            }
        }

        // 5. Head Pose Radar
        if (this.charts.pose) {
            const ds = this.charts.pose.data.datasets.find(d => d.sId === studentId);
            if (ds && observable) {
                const mode =
                    agg.modes?.headPoseCategory ||
                    agg.headPoseCategory?.mode ||
                    payload.headPoseCategory?.mode ||
                    payload.headPoseCategory ||
                    'forward';
                if (student.headPoseCounts[mode] !== undefined) {
                    student.headPoseCounts[mode]++;
                }
                student.totalIntervals++;
                
                // Recalc percentages
                const mapKeyToIdx = { 'forward':0, 'looking_down':1, 'looking_left':2, 'looking_right':3, 'tilted':4, 'looking_up':5 };
                const newData = [0,0,0,0,0,0];
                for (const [k, v] of Object.entries(student.headPoseCounts)) {
                    newData[mapKeyToIdx[k]] = (v / student.totalIntervals) * 100;
                }
                ds.data = newData;
                this.charts.pose.update('active');
            }
        }

        // 6. Drowsiness Timeline
        if (this.charts.drowsiness) {
            const ds = this.charts.drowsiness.data.datasets.find(d => d.sId === studentId);
            if (ds) {
                ds.data.push(observable ? (agg.drowsinessScore?.mean !== undefined ? agg.drowsinessScore.mean : (payload.drowsinessScore || 0)) : null);
                if (ds.data.length > this.maxDataPoints) ds.data.shift();
            }
            this.charts.drowsiness.data.labels = [...this.timeLabels];
            this.charts.drowsiness.update('active');
        }
    }

    updateClassAverage(classSummary) {
        if (!this.charts.attention) return;
        
        const ds = this.charts.attention.data.datasets.find(d => d.label === 'Class Average');
        if (ds) {
            ds.data.push(classSummary.classAvgAttention || 0);
            if (ds.data.length > this.maxDataPoints) ds.data.shift();
            this.charts.attention.update('active');
        }
        
        // Optional hook to flash stat card could be bound via external event,
        // or manipulate DOM here directly if we accept tight coupling.
        const avgElem = document.getElementById('avgAttScore');
        if (avgElem) {
            const prev = parseFloat(avgElem.innerText) || 0;
            const current = classSummary.classAvgAttention || 0;
            if (Math.abs(current - prev) >= 5) {
                // Flash effect
                avgElem.style.transform = 'scale(1.2)';
                avgElem.style.color = 'white';
                setTimeout(() => {
                    avgElem.style.transform = 'scale(1)';
                    avgElem.style.color = current >= 60 ? 'var(--color-green)' : (current >= 40 ? 'var(--color-amber)' : 'var(--color-red)');
                }, 300);
            }
            avgElem.innerText = current;
            avgElem.style.color = current >= 60 ? 'var(--color-green)' : (current >= 40 ? 'var(--color-amber)' : 'var(--color-red)');
        }
    }

    highlightStudent(studentId) {
        // Dim others, highlight this one across line/radar charts
        const setOpacity = (chart, isSelectedFn) => {
            if (!chart) return;
            chart.data.datasets.forEach(ds => {
                if (ds.label === 'Class Average') return;
                
                const isSelected = isSelectedFn(ds);
                if (isSelected) {
                    ds.borderWidth = 3;
                    if (ds.backgroundColor) ds.backgroundColor = ds.backgroundColor.replace(/[\d.]+\)$/, '0.4)'); // increase opacity
                } else {
                    ds.borderWidth = 1;
                    if (ds.backgroundColor) ds.backgroundColor = ds.backgroundColor.replace(/[\d.]+\)$/, '0.05)'); // decrease opacity
                }
            });
            chart.update();
        };

        setOpacity(this.charts.attention, ds => ds.sId === studentId);
        setOpacity(this.charts.pose, ds => ds.sId === studentId);
        setOpacity(this.charts.drowsiness, ds => ds.sId === studentId);
    }

    clearHighlight() {
        const resetOpacity = (chart) => {
            if (!chart) return;
            chart.data.datasets.forEach(ds => {
                if (ds.label === 'Class Average') return;
                ds.borderWidth = ds.sId ? 2 : 1; // 2 for lines, 1 for radar usually, simple fallback
                if (ds.backgroundColor) ds.backgroundColor = ds.backgroundColor.replace(/[\d.]+\)$/, '0.1)'); 
            });
            chart.update();
        };

        resetOpacity(this.charts.attention);
        resetOpacity(this.charts.pose);
        resetOpacity(this.charts.drowsiness);
    }

    getChartSnapshot() {
        // Collect current state of data for potential download/report
        const snapshot = {};
        if (this.charts.attention) snapshot.attention = this.charts.attention.data;
        // ... gather rest as needed
        return JSON.stringify(snapshot, null, 2);
    }
}
