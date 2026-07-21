# Student Attention Monitoring System — Detailed Explanation (Part 3 of 3)

## Teacher Dashboard, Post-Session Analytics, Control Hub, Demo Mode & Styling

---

## 13. Teacher Dashboard (`apps/teacher/`)

```
apps/teacher/
├── index.html           ← Live dashboard (3-column layout)
├── analytics.html       ← Post-session deep-dive report
├── css/dashboard.css    ← Dark-theme design system (12,139 bytes)
└── js/
    ├── dashboard.js      ← Main orchestrator (366 lines)
    ├── socketHandler.js  ← Socket.io wrapper for teacher namespace (71 lines)
    ├── charts.js         ← Chart.js chart manager with 6 live charts (653 lines)
    ├── studentGrid.js    ← Student sidebar cards + data table (315 lines)
    └── analytics.js      ← Post-session analytics engine (785 lines)
```

### 13.1 Dashboard Layout (`index.html`)

A **three-column layout**:

| Left Sidebar | Center Content | Right Sidebar |
|---|---|---|
| Student list (cards with live scores, sparklines, alerts) | 4 overview stat cards + 6 real-time charts + data table | Live alerts feed + AI recommendations |

**Top navigation bar** contains: brand logo, session code display, connection status dot, student count, session timer, Demo Mode button, Start/End Session buttons.

**CDN dependencies:**
- `socket.io` — Real-time server communication
- `chart.js` — All charts (line, bar, radar, doughnut)
- `chartjs-plugin-datalabels` — In-chart value labels
- `chartjs-plugin-annotation` — Threshold lines on charts (focus line at 60, concern line at 40)

### 13.2 `socketHandler.js` — Teacher Socket Wrapper (71 lines)

```javascript
export class SocketHandler {
    constructor(serverUrl, onEvent) {
        this.socket = io(`${serverUrl}/teacher`);
        
        const eventsToForward = [
            'session:created', 'session:state', 'session:student-update',
            'session:class-summary', 'teacher:student-joined', 'teacher:student-disconnected'
        ];
        eventsToForward.forEach(ev => {
            this.socket.on(ev, (data) => this.onEvent(ev, data));
        });
    }
}
```

**Why a wrapper instead of using `io()` directly?**
- **Single callback pattern** — All socket events are funneled through one `onEvent(eventName, data)` callback. The `dashboard.js` orchestrator handles them in a single `switch` statement, keeping logic centralized.
- **Health monitoring** — A 15-second ping interval checks `socket.connected` and warns the teacher if the connection is unstable.
- **Clean API** — `startSession()` returns a Promise with the session ID/code. `joinSession()` and `endSession()` are simple one-liners.

**`startSession()` uses Socket.io acknowledgment callbacks:**
```javascript
startSession() {
    return new Promise((resolve, reject) => {
        this.socket.emit('teacher:start-session', null, (response) => {
            if (response && response.success) resolve(response);
            else reject(new Error(response?.error || 'Failed'));
        });
    });
}
```
The server's `teacher:start-session` handler calls `callback({ success: true, sessionId, sessionCode })`, which resolves this Promise. This is a **request-response pattern** built on top of WebSockets.

### 13.3 `dashboard.js` — The Main Orchestrator (366 lines)

This file wires everything together on `DOMContentLoaded`.

#### Session Lifecycle

1. **Start Session**: Teacher clicks "Start Session" → `socketHandler.startSession()` → server creates a session → returns `{sessionId, sessionCode}` → UI updates (hides start button, shows end button, displays session code, starts timer).

2. **Session Persistence**: `sessionStorage.setItem('currentSessionId', id)` — If the teacher refreshes the page, the socket reconnects and calls `joinSession(savedId)` to restore state.

3. **End Session**: Confirms with the teacher → calls `/api/demo/stop` (safe even for non-demo) → calls `/api/sessions/:id/end` → redirects to `analytics.html?sessionId=...` for the post-session report.

#### Event Handlers

**`handleStudentJoined`**: Assigns a color from the palette, adds the student to both `ChartManager` and `StudentGrid`, updates student count, shows a toast notification.

**`handleStudentUpdate`**: The most frequent event (every 5 seconds per student). Updates charts via `chartManager.updateStudentData()` and sidebar cards via `studentGrid.updateStudent()`. If alert flags are present, adds them to the alerts sidebar.

**`handleClassSummary`**: Updates the 4 overview cards (class attention average, focused count, dominant emotion, active alerts). Calls `chartManager.updateClassAverage()` and `updateRecommendations()`.

**`handleSessionState`**: Called when a teacher reconnects to an existing session. Restores the timer from `startTime`, re-adds all students, and replays their last payloads.

#### AI Recommendations Engine (Lines 328-360)

```javascript
function updateRecommendations(summary) {
    if (summary.classAvgAttention < 40)
        recos.push("⚠️ Consider pausing — class attention is very low.");
    if (summary.mostCommonEmotion === 'confused')
        recos.push("🤔 Many students look confused — ask a check-in question.");
    if (drowsyCount > 1)
        recos.push("🥱 Multiple students appear drowsy — a quick break may help.");
    if (summary.lowAttentionStudents?.length >= 3)
        recos.push("🛑 More than half the class is disengaged. Time for an interactive activity.");
    if (summary.classAttentionTrend === 'improving')
        recos.push("📈 Attention is recovering — keep going!");
    if (recos.length === 0 && summary.studentsOnline > 0)
        recos.push("✅ Class is engaged and focused.");
}
```

**Why rule-based recommendations?** — Simple, interpretable, and immediately actionable. The teacher sees specific suggestions tied to real-time data, not vague AI-generated text.

### 13.4 `charts.js` — ChartManager (653 lines)

Manages **6 live-updating charts**:

| # | Chart | Type | Purpose |
|---|---|---|---|
| 1 | Attention Timeline | Line | Per-student attention scores over time + class average (dashed white line) |
| 2 | Emotion Distribution | Stacked Bar | Per-student emotion breakdown (7 emotions stacked to 100%) |
| 3 | Gaze on Screen | Horizontal Bar | Per-student gaze percentage (color-coded: green/amber/red) |
| 4 | Blink Rate | Bar | Per-student blinks/minute with threshold annotations (8 low, 25 high) |
| 5 | Head Pose | Radar | Per-student head direction distribution (6 axes) |
| 6 | Drowsiness Timeline | Line (inverted Y) | Per-student drowsiness over time (0=alert at top, 1=drowsy at bottom) |

**Key design decisions:**

**Dark theme defaults:**
```javascript
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "'Inter', sans-serif";
```
All charts inherit the dark theme automatically.

**60-point rolling window** (`maxDataPoints = 60`): At 5-second intervals, this shows the last 5 minutes of data. Older points are shifted off the left edge.

**Per-student colors**: 8 colors cycle through students: blue, green, amber, purple, red, light blue, pink, teal. Colors are consistent across all charts.

**Annotation plugin** for threshold lines:
- Attention chart: Green dashed line at 60 ("Focus"), red dashed line at 40 ("Concern")
- Blink chart: Red line at 8 (strain risk), amber line at 25 (stress)
- Drowsiness chart: Amber at 0.5 (moderate), red at 0.75 (high)

**`highlightStudent()` / `clearHighlight()`**: When a teacher clicks a student card in the sidebar, that student's line/radar gets thicker and more opaque while others dim. Clicking the center area clears the highlight.

**Head Pose Radar** accumulates counts over time:
```javascript
student.headPoseCounts[mode]++;
student.totalIntervals++;
// Recalculate percentages for radar axes
newData[idx] = (count / totalIntervals) * 100;
```
This shows the **distribution** of head positions across the session, not just the current pose.

### 13.5 `studentGrid.js` — Student Cards & Data Table (315 lines)

Each student gets two representations:

**Sidebar Card** — A rich card showing:
- Color-coded initials avatar + name + online/offline dot
- Large attention score number (animated transitions via `requestAnimationFrame`)
- Category badge ("Highly Focused", "Focused", "Neutral", "Distracted", "Disengaged")
- Attention progress bar
- Emoji + emotion label
- Gaze % and Blink rate mini-badges
- 10-bar sparkline (last 10 attention values, color-coded)
- Alert count row (hidden when no alerts, red flash animation when new alerts arrive)
- "Updated X ago" timestamp

**Data Table Row** — Compact row with: name, attention score, gaze %, emotion, drowsiness bar, blink rate, head pose, yawn status, alert count, last update time.

**Number animation:**
```javascript
_animateNumber(element, start, end, duration) {
    const step = (timestamp) => {
        const progress = Math.min((timestamp - startTime) / duration, 1);
        element.innerText = Math.floor(progress * (end - start) + start);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
```
Scores don't jump — they animate smoothly from old value to new value over 300ms.

**Alert flash**: When a student triggers alerts, their card border briefly turns red, then fades back based on severity.

---

## 14. Post-Session Analytics (`analytics.html` + `analytics.js`)

### 14.1 Page Structure

After ending a session, the teacher is redirected to `analytics.html?sessionId=UUID`. This page fetches all session data from the REST API and renders a comprehensive report.

**5 Sections:**

1. **Session Overview** — Duration, average attention, total students, total alerts, most/least engaged student
2. **Attention Heatmap** — CSS grid heatmap (60 columns × N students) showing attention scores color-coded over time
3. **Comparative Analysis** — Grouped bar chart, gaze vs attention scatter plot, full session timeline
4. **Per-Student Deep Dive** — Tabbed interface with 6 charts + data table + AI insights per student
5. **Session AI Report** — Generated text summary with suggestions

### 14.2 Data Loading (Lines 62-94)

```javascript
async function loadSessionData() {
    // 1. Fetch class summary (aggregated stats)
    const sumRes = await fetch(`/api/sessions/${SESSION_ID}/summary`);
    
    // 2. Fetch session metadata (duration, code)
    const sessRes = await fetch(`/api/sessions`);
    
    // 3. Fetch per-student snapshots (all raw data)
    const fetches = classSummaryData.studentSummaries.map(s =>
        fetch(`/api/sessions/${SESSION_ID}/snapshots/${s.studentId}`)
    );
    await Promise.all(fetches);
}
```

**Why parallel fetches with `Promise.all`?** — Each student's snapshots are independent. Fetching them in parallel instead of sequentially reduces load time from `N × latency` to `1 × latency`.

### 14.3 Attention Heatmap (Chart 7) — Lines 127-262

Built with **CSS Grid**, not Chart.js:
```javascript
container.style.gridTemplateColumns = `140px repeat(${NUM_COLS}, 20px)`;
```

- 60 columns (5 minutes at 5-second intervals)
- Each cell is a 20×20px colored square
- Color scale: `#ef4444` (0-19) → `#f97316` (20-39) → `#f59e0b` (40-59) → `#86efac` (60-79) → `#22c55e` (80-100)
- Gray (`#374151`) for missing data
- Hover tooltip shows: time, attention score, emotion, gaze %, drowsiness
- Bottom row shows **class average** per column

**Why CSS Grid instead of a canvas chart?** — Each cell needs independent hover tooltips with rich content. Canvas-based heatmaps require complex hit detection; CSS Grid gives this for free.

### 14.4 Per-Student Deep Dive (Charts 8-13)

6 charts per student, created/destroyed when switching tabs:

| # | Chart | Type | Special Feature |
|---|---|---|---|
| 8 | Attention Timeline | Line | Background annotation boxes (green/amber/red zones) |
| 9 | Emotion Donut | Doughnut | Center text plugin showing dominant emotion + percentage |
| 10 | Gaze Timeline | Line (filled) | Target annotation line at 70% |
| 11 | Head Pose Breakdown | Stacked Horizontal Bar | 6 pose categories color-coded |
| 12 | Blink Rate Timeline | Line | Three threshold annotations (low/normal/high) |
| 13 | Drowsiness Timeline | Line (inverted, filled) | Moderate/high threshold annotations |

**Center Text Plugin** (Lines 428-445):
```javascript
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        // Draws text in the center of the doughnut hole
        ctx.fillText(text, textX, textY);
    }
};
Chart.register(centerTextPlugin);
```
This custom Chart.js plugin renders the dominant emotion name and percentage in the center of the donut chart.

### 14.5 AI Insights (Lines 733-748)

Per-student insights generated from snapshot data:
- Peak focus time and score
- Attention dip moments (score < 40)
- Yawn count analysis
- Away time percentage warnings
- Blink rate summary

### 14.6 CSV Export (Lines 767-784)

```javascript
function exportStudentCsv() {
    let csv = "Timestamp,Time,AttentionScore,Emotion,GazePct,...\n";
    snaps.forEach(sn => { csv += `${sn.timestamp},...\n`; });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.setAttribute('download', `${name}_session_export.csv`);
    a.click();
}
```
Creates a downloadable CSV file with all snapshot data for the selected student.

---

## 15. Demo Mode (Server-Side Simulation)

### 15.1 Why Demo Mode Exists

Without real students connected, the teacher dashboard is empty. Demo mode creates **4 simulated students** with realistic, continuously-updating attention data so the system can be demonstrated.

### 15.2 How It Works (`server.js` Lines 104-288)

**`POST /api/demo/start`:**
1. Clears any existing demo intervals and data
2. Creates a session with code `DEMO01`
3. Creates 4 students: Arjun Sharma, Priya Patel, Rahul Gupta, Sneha Verma
4. For each student, starts a `setInterval(5000)` that:
   - Generates a **random-walk attention score** (starts at 70, drifts ±5 per tick, clamped 0-100)
   - Correlates other metrics: low attention → "distracted" emotion + low gaze; high attention → "engaged" + high gaze
   - 5% chance of a drowsiness spike per tick
   - Builds a full payload matching the real student payload format
   - Saves to database via `db.insertSnapshot()`
   - Updates in-memory state
   - Emits `session:student-update` and `session:class-summary` to teacher namespace

**`POST /api/demo/stop`:**
1. Clears all intervals
2. Deletes the DEMO01 session and all its data from the database

**Why random walk instead of truly random?**
```javascript
att += (Math.random() * 10 - 5);  // ±5 per tick
att = Math.max(0, Math.min(100, att));
```
Random walk creates **realistic trends** — attention gradually drifts up and down rather than jumping erratically. This makes the charts look natural and demonstrates the trend detection features.

---

## 16. Control Hub (`apps/hub/`)

```
apps/hub/
├── index.html       ← Marketing landing page
├── admin.html       ← Admin console (placeholder for Supabase Auth)
├── css/styles.css   ← Full design system (21,214 bytes)
└── js/main.js       ← Navigation, counters, status checks (147 lines)
```

### 16.1 Landing Page (`index.html`)

A polished marketing page with 4 sections:
- **Hero** — Headline, CTA buttons, animated statistics counter ("120+ classes monitored", "92% higher engagement", "3400+ students enrolled")
- **Mission** — Three feature cards (Privacy, Coaching, Clarity)
- **Apps** — Three clickable cards linking to Teacher, Student, and Admin
- **Join** — Inline student join form (duplicates the student join page for convenience)
- **Footer** — Navigation links + privacy statement

### 16.2 `main.js` — Hub Logic (147 lines)

**Navigation system** using `data-nav` and `data-scroll` attributes:
```javascript
navElements.forEach((el) => {
    el.addEventListener('click', () => {
        window.location.href = el.dataset.nav;
    });
});

scrollElements.forEach((el) => {
    el.addEventListener('click', () => {
        document.querySelector(el.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
    });
});
```

**Why data attributes instead of `<a>` tags?** — Buttons with `data-nav` attributes can be styled consistently and don't have the default underline/visited-link behavior of anchor tags.

**Animated counters:**
```javascript
function animateCount(el, overrideTarget) {
    const target = Number(el.dataset.count) || 0;
    const duration = 1200;
    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        el.textContent = `${Math.floor(progress * target)}${suffix}`;
        if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
```
Numbers count up from 0 to their target over 1.2 seconds. Respects `prefers-reduced-motion` for accessibility.

**Status checker** for the admin page:
```javascript
const STATUS_ENDPOINTS = {
    api: '/api/health',
    teacher: '/teacher/index.html',
    student: '/student/index.html'
};
```
Pings each endpoint and shows "ready" (green) or "offline" (red) status pills.

### 16.3 Admin Page (`admin.html`)

A placeholder admin console with:
- Status dashboard (API, Teacher, Student online/offline)
- Mock statistics (active sessions, total students, focus score)
- Login form (displays "Demo login only. Connect Supabase Auth to enable real admin access.")

---

## 17. CSS Design Systems

### 17.1 Student CSS (`student.css` — 461 lines)

**Design tokens:**
```css
:root {
    --bg-dark: #0f0f0f;
    --card-bg: #ffffff;
    --accent: #3b82f6;
    --success: #10b981;
    --danger: #ef4444;
}
```

**Two distinct page styles:**
- **Join page**: White card on dark background, centered with flexbox
- **Monitor page**: Full dark theme, split layout (40/60), dark cards with colored accents

**SVG attention ring**: Uses `stroke-dasharray` and `stroke-dashoffset` to create a circular progress indicator. The circumference is `2π × 34 ≈ 213`. Setting `stroke-dashoffset = 213 - (score/100 × 213)` fills the ring proportionally.

**Pulse animation** for transmission indicator:
```css
@keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0.2; transform: scale(1.5); }
}
.pulse-dot.active { animation: pulse 0.5s ease-out; }
```

### 17.2 Dashboard CSS (`dashboard.css` — 12,139 bytes)

Full dark-theme design system with CSS custom properties for consistent theming:
- Background hierarchy: `--bg-base` → `--bg-surface` → `--bg-surface-hover`
- Text hierarchy: `--text-primary` → `--text-secondary`
- Semantic colors: `--color-green`, `--color-amber`, `--color-red`, `--color-blue`, `--color-teal`
- Three-column layout using CSS Grid
- Responsive chart cards with flexbox
- Toast notifications with slide-in animation
- Print styles for PDF export (hides nav, adjusts colors)

### 17.3 Hub CSS (`styles.css` — 21,214 bytes)

The largest CSS file — a complete marketing site design system:
- Gradient backgrounds with mesh-like patterns
- Glassmorphism cards (`backdrop-filter: blur`)
- Animated hover effects on app cards
- Responsive grid layouts
- Mobile hamburger menu
- Counter animation styles
- Status pill indicators
- Form styling with focus states

---

## 18. Server-Side WebSocket Flow (Detailed)

### 18.1 Teacher Creates Session
```
Teacher Browser                    Server                         
     |                               |
     |-- teacher:start-session ----->|
     |                               |-- Creates UUID + 6-char code
     |                               |-- Stores in sessionStore Map
     |                               |-- Saves to SQLite
     |                               |-- Joins socket to room(sessionId)
     |<-- callback({sessionId}) -----|
     |<-- session:created -----------|
```

### 18.2 Student Joins
```
Student Browser                    Server                      Teacher Browser
     |                               |                               |
     |-- student:join {code} ------->|                               |
     |                               |-- Looks up session by code    |
     |                               |-- Adds student to Map         |
     |                               |-- Upserts in SQLite           |
     |                               |-- Joins socket to room        |
     |<-- student:joined ------------|                               |
     |                               |-- teacher:student-joined ---->|
```

### 18.3 Data Flow (Every 5 Seconds)
```
Student Browser                    Server                      Teacher Browser
     |                               |                               |
     |-- student:data {payload} ---->|                               |
     |                               |-- Updates in-memory state     |
     |                               |-- Inserts snapshot in SQLite  |
     |                               |-- Aggregates class summary    |
     |                               |-- session:student-update ---->|
     |                               |-- session:class-summary ----->|
```

### 18.4 Student Disconnects
```
Student Browser                    Server                      Teacher Browser
     |                               |                               |
     |-- [disconnect] -------------->|                               |
     |                               |-- Marks student inactive      |
     |                               |-- teacher:student-disconnected>|
```

---

## 19. Complete Data Flow Summary

```
┌──────────────┐     MediaPipe      ┌───────────────┐    5-sec stats    ┌───────────────┐
│   Webcam     │ ──────────────────>│ FaceAnalyzer  │ ───────────────>  │ DataCollector  │
│  (30 fps)    │   478 landmarks    │ (per-frame    │   addFrame()     │ (buffers       │
│              │   per frame        │  metrics)     │                  │  150 frames)   │
└──────────────┘                    └───────────────┘                  └───────┬───────┘
                                                                              │ flush()
                                                                              ▼
┌──────────────┐    student:data    ┌───────────────┐    INSERT INTO    ┌───────────────┐
│ SocketClient │ ──────────────────>│ Express/SIO   │ ───────────────>  │   SQLite DB   │
│ (WebSocket)  │   full payload     │   Server      │   snapshots      │  (sessions,   │
│              │   + aggregates     │               │                  │   students,   │
└──────────────┘                    └───────┬───────┘                  │   snapshots)  │
                                            │                          └───────────────┘
                              session:student-update                          │
                              session:class-summary                           │
                                            │                          GET /api/sessions
                                            ▼                          /:id/summary
                                    ┌───────────────┐                         │
                                    │   Teacher     │ <───────────────────────┘
                                    │  Dashboard    │    (post-session
                                    │  (6 charts,   │     analytics)
                                    │   alerts,     │
                                    │   grid)       │
                                    └───────────────┘
```

---

## 20. Key Architectural Decisions Summary

| Decision | Rationale |
|---|---|
| Browser-only CV (no server-side processing) | Privacy: video never leaves the device. Scalability: server handles only small JSON payloads. |
| MediaPipe FaceMesh over OpenCV/TensorFlow | Runs in browser via WebAssembly/WebGL. No server GPU needed. Iris tracking built-in. |
| Rule-based emotion/attention scoring | Interpretable, fast, no training data needed. Weights are tunable. |
| 5-second aggregation intervals | Balances real-time responsiveness with server load. 150 frames → 1 payload. |
| Socket.io namespaces (/student, /teacher) | Security isolation. Students can't see other students' data. |
| SQLite (better-sqlite3) | Zero-config, single-file database. Perfect for single-server classroom use. |
| In-memory Map + SQLite | Map for real-time speed, SQLite for persistence and post-session queries. |
| CDN-loaded libraries (no bundler) | Zero build step for frontend. Simplifies deployment. Students open a URL and it works. |
| Monorepo with static copy deploy | All apps in one repo. `build-static.mjs` just copies folders — no Webpack complexity. |
| Demo mode with random walk | Realistic simulated data for demonstrations without needing real students. |

---

*This concludes the 3-part detailed explanation of the Student Attention Monitoring System.*
