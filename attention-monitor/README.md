# ClassPulse - Student Attention Monitoring System

A real-time, browser-based computer vision system that allows teachers to monitor student engagement, attention, and emotions during online or physical classes. 

This system uses privacy-first, client-side AI processing via MediaPipe Face Mesh so that raw video never leaves the student's browser. Only lightweight analytical data payloads are transmitted to the server.

---

## 🏗️ Technology Stack

| Component | Technology | Use Case |
| :--- | :--- | :--- |
| **Frontend Clients** | HTML5, Vanilla JS, CSS3 | No heavy UI frameworks; pristine performant code |
| **Backend Server** | Node.js, Express | API endpoints and static file serving |
| **Realtime Engine** | Socket.io | Bidirectional data streaming & aggregations |
| **Database** | SQLite (better-sqlite3) | Lightning-fast local persistent storage |
| **Computer Vision** | MediaPipe Face Mesh | 468-point facial landmark processing |
| **Data Visualization** | Chart.js 4+ | High performance dashboard charts |

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v16.0 or higher recommended)
- A webcam for testing the student client

### Steps

1. **Clone & Navigate**
   ```bash
   cd attention-monitor/server
   ```
2. **Install Dependencies**
   ```bash
   npm install
   ```
   *Note: This strictly requires native build tools for SQLite bindings.*
3. **Run the Server**
   ```bash
   npm start
   ```
4. **Access Applications**
   - **Teacher Dashboard:** [http://localhost:3000/teacher](http://localhost:3000/teacher)
   - **Student Portal:** [http://localhost:3000/student](http://localhost:3000/student)

---

## 🎭 Demo Mode

Want to test the dashboard without physically connecting 4 different cameras? 
1. Open the Teacher Dashboard ([http://localhost:3000/teacher](http://localhost:3000/teacher)).
2. Click the **Demo Mode** button next to start session.
3. The server will immediately spin up a simulated session `DEMO01` with 4 virtual students exhibiting realistic human behaviors (talking, yawning, getting distracted, blinking). 

---

## 📊 Analytics Tracked (15+ Data Points)

The `FaceAnalyzer` module computes real-time biometric indicators securely in the browser:

- **Attentiveness Score (0-100)**: A proprietary composite score weighing gaze, head pose, and active presence.
- **Emotion Recognition**: Classification into 7 categories (Focused, Engaged, Neutral, Confused, Bored, Distracted, Drowsy).
- **Gaze Deviation**: Accurate iris tracking to determine if the student is physically looking at the screen.
- **Head Pose (Pitch/Yaw)**: Detects looking down at phones, looking away, or tilted heads.
- **Eye Aspect Ratio (EAR)**: Computes blink rates per minute and predicts drowsiness.
- **Mouth Aspect Ratio (MAR)**: Detects yawns or talking behavior.
- **Session Focus Trends**: Statistical derivatives like regression slope (is attention improving or declining?).

---

## 🌟 Dashboard Features

### Live Teacher View
- **Summary Cards:** Live updating class average, emotion distribution, and alert counts.
- **Alert Flags Sidebar:** Auto-detects and alerts the teacher when anomalous behaviors occur (e.g. `LOW_ATTENTION`, `YAWNING`, `OFF_SCREEN`).
- **Realtime Charts:** 6 synchronized Chart.js views mapping class timelines, gaze distribution, radar poses, and blink counts.
- **Smart Recommendations:** The AI controller intelligently issues coaching suggestions to the teacher (e.g. *“Multiple students appear drowsy — a quick break may help.”*).

### Post-Session Analytics (`analytics.html`)
- **Visual Attention Heatmap**: A custom CSS Grid representing the whole class over the complete timeline.
- **Tabbed Deep Dives**: Per-student full breakdown with area charts and historical snapshots. 
- **Comparative Analysis**: Scatter plots indicating Gaze % vs Attentiveness.
- **Export capabilities**: Auto-download CSV reports or print high-res PDF summaries.

---

## 🧩 Architecture Flow

```text
[ WebCams ]
     ↓
[ Student Browser ] (Local CV Processing via MediaPipe)
     |
     | (Emits 5-second lightweight JSON socket payloads)
     ↓
[ Node.js Server ] ← (Aggregates Class Data) → [ SQLite DB ]
     |
     | (Broadcasts processed realtime summary)
     ↓
[ Teacher Dashboard ]
```

---

## 📝 API Reference

**REST API Endpoints:**
- `GET /api/sessions/` — List all archived sessions
- `GET /api/sessions/:id/summary` — Full aggregate summary
- `GET /api/sessions/:id/snapshots/:studentId` — Time-series sequence of data
- `POST /api/sessions/:id/end` — Safely concludes session
- `POST /api/demo/start` & `stop` — Triggers simulation loops

**Socket.IO Events:**
- `teacher:start-session` / `session:created`
- `student:join` / `teacher:student-joined`
- `student:data` / `session:student-update` / `session:class-summary`

---

## ⚠️ Known Limitations
- The Face Mesh requires a visible face. Complete occlusion or incredibly poor lighting will throw detection errors.
- Chrome or Edge browsers are highly recommended for optimal WebGL performance during ML tasks.
- Background blur or virtual avatar overrides on OS level bypass the analyzer.

---
*Built with modern Vanilla JS and robust Socket streaming logic.*
