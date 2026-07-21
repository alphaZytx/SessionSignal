<p align="center">
  <h1 align="center">🎓 ClassPulse — Student Attention Monitoring System</h1>
  <p align="center">
    <strong>Real-time AI-powered attention tracking for modern classrooms</strong>
  </p>
  <p align="center">
    <a href="#-features">Features</a> •
    <a href="#-screenshots">Screenshots</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-deployment">Deployment</a>
  </p>
</p>

---

## 📖 About

**ClassPulse** is a comprehensive student attention monitoring system that uses computer vision and AI to track student engagement in real-time during live classes. Teachers get a rich analytics dashboard while students simply join with a name and session code — their webcam feed is analyzed locally for attention score, emotion, gaze direction, blink rate, head pose, and drowsiness.

The system is designed as a monorepo containing four deployable applications: a **Control Hub** (landing page), a **Student Client** (capture & monitoring), a **Teacher Dashboard** (analytics & alerts), and a **REST + WebSocket API** that ties everything together.

---

## ✨ Features

| Category | Highlights |
|---|---|
| 🧠 **AI-Powered Analysis** | Real-time face detection, gaze tracking, emotion recognition, blink rate monitoring, head pose estimation, and drowsiness detection |
| 📊 **Teacher Dashboard** | Live attention timeline, emotion distribution charts, gaze & blink analytics, head pose visualization, drowsiness tracking, and smart alerts |
| 🎥 **Student Client** | Webcam-based face mesh tracking, live attention score, engagement level, focus streaks, and attention-over-time graphs |
| 🔔 **Live Alerts** | Instant notifications for head turns, low blinks, drowsiness, and other attention events |
| 💡 **Smart Recommendations** | AI-generated class-level engagement recommendations for teachers |
| 🌐 **Real-time Sync** | Socket.IO-powered live data transmission between students and teacher |
| 🏠 **Control Hub** | Beautiful landing page with system readiness checks, live pulse stats, and role-based navigation |

---

## 📸 Screenshots

### 🏠 Control Hub — Landing Page
The central entry point with live system stats, role-based navigation for Teachers, Students, and Admins, and a modern dark-themed UI.

<p align="center">
  <img src="docs/screenshots/landing-page.png" alt="ClassPulse Landing Page" width="100%"/>
</p>

---

### 📊 Teacher Dashboard — Live Session Monitoring
A comprehensive real-time analytics dashboard showing class attention scores, attention timeline, emotion distribution, gaze tracking, blink rate analysis, head pose distribution, drowsiness monitoring, live alerts feed, and AI-powered recommendations.

<p align="center">
  <img src="docs/screenshots/teacher-dashboard.png" alt="Teacher Dashboard" width="100%"/>
</p>

---

### 🎥 Student Client — Real-time Attention Tracking
The student-facing interface with live webcam face mesh overlay, attention score, engagement level, emotion detection, gaze status, blink rate, eye openness, head pose tracking, focus streak counter, and an attention-over-time graph.

<p align="center">
  <img src="docs/screenshots/student-monitoring.png" alt="Student Monitoring Interface" width="100%"/>
</p>

---

### 🚪 Student Join — Session Entry
A clean, minimal interface for students to join a live class session by entering their name and the teacher-provided 6-character session code.

<p align="center">
  <img src="docs/screenshots/student-join.png" alt="Student Join Session" width="100%"/>
</p>

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v20+ 
- **npm** v9+

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/alphaZytx/Student-Attention-Monitoring-System.git
cd Student-Attention-Monitoring-System

# 2. Set up environment variables
cp .env.example .env        # Add your secrets (Supabase, etc.)

# 3. Install dependencies
npm run setup               # Installs API dependencies

# 4. Start the development server
npm run dev                 # API + Socket server on http://localhost:3000
```

### Access the Application

| Application | URL | Description |
|---|---|---|
| 🏠 **Control Hub** | http://localhost:3000/ | Landing page & navigation |
| 🎥 **Student Client** | http://localhost:3000/student | Join a session & start monitoring |
| 📊 **Teacher Dashboard** | http://localhost:3000/teacher | Create sessions & view analytics |

> **Tip:** Use `npm run start` for a production-style boot without the Node file watcher.

---

## 🏗 Architecture

### Directory Structure

```
Student-Attention-Monitoring-System/
├── apps/
│   ├── api/          → Node/Express real-time + REST API (SQLite, Supabase-ready)
│   ├── student/      → Lightweight webcam capture client
│   ├── teacher/      → Analytics dashboard with rich visualizations
│   └── hub/          → Central landing/login surface
├── docs/
│   ├── screenshots/  → Application screenshots
│   └── DEPLOYMENT.md → Deployment & migration guide
├── netlify/          → Per-site Netlify configuration helpers
├── tools/            → Build helpers (copy static apps into dist/* for Netlify)
├── .env.example      → Shared runtime + Supabase secrets template
├── netlify.toml      → Root Netlify config (targets the Hub)
└── package.json      → Monorepo scripts & metadata
```

### How It Works

```
┌─────────────────┐         WebSocket          ┌─────────────────────┐
│  Student Client  │ ◄──────────────────────► │    API Server        │
│  (Browser + AI)  │    attention data stream   │  (Express + Socket) │
│                  │                            │                     │
│ • Face Detection │                            │ • Session mgmt      │
│ • Gaze Tracking  │                            │ • Data aggregation   │
│ • Emotion AI     │                            │ • SQLite persistence │
│ • Blink Rate     │                            │ • REST endpoints     │
│ • Head Pose      │                            │                     │
└─────────────────┘                            └──────────┬──────────┘
                                                          │
                                                   WebSocket + REST
                                                          │
                                               ┌──────────▼──────────┐
                                               │  Teacher Dashboard   │
                                               │                     │
                                               │ • Attention Timeline │
                                               │ • Emotion Charts     │
                                               │ • Gaze & Blink Stats │
                                               │ • Drowsiness Monitor │
                                               │ • Live Alerts        │
                                               │ • Recommendations    │
                                               └─────────────────────┘
```

---

## ⚙️ Environment Variables

| Variable | Description |
|---|---|
| `PORT` | API port (default `3000`) |
| `CORS_ALLOWED_ORIGINS` | Comma-delimited list for Netlify/Supabase domains |
| `SESSION_DATABASE_PATH` | Optional override for SQLite DB; defaults to `apps/api/data/sessions.db` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification |
| `SUPABASE_PROJECT_ID` | Supabase project identifier |
| `HUB_TITLE` | Optional Control Hub branding title |
| `HUB_SUPPORT_EMAIL` | Optional support email for the Hub |

Fill them in `.env` for local dev and mirror them in Netlify + Supabase dashboards.

---

## 🌐 Deployment

### Netlify

1. **Control Hub (default)** — Connect the repo, keep `netlify.toml` as-is (build `hub`, publish `dist/hub`).
2. **Teacher Dashboard / Student Client** — Either:
   - Create dedicated branches (`teacher`, `student`) so their contexts in `netlify.toml` kick in, or
   - Create two more Netlify sites and copy the commands from `netlify/teacher.toml` and `netlify/student.toml`.
3. Inject `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `VITE_API_URL` (or similar) per site so the browsers can call the hosted API.

Run `npm run build:web` locally to inspect the generated `dist/` artifacts before uploading.

### Supabase Readiness

- `.env.example` already contains every Supabase credential required by the API and Hub.
- `apps/api/db/database.js` respects `SESSION_DATABASE_PATH`, so you can swap SQLite for Supabase by pointing the API to a cloud-hosted file or by gradually migrating tables.
- Future Supabase Auth wiring for the Control Hub can live inside `apps/hub/js/main.js` once keys are issued.

---

## 🔍 Health Check & Monitoring

- **`/api/health`** — Lightweight endpoint used by the Hub to verify uptime.
- The Hub status widget pings `/api/health`, `/teacher`, and `/student` so you can quickly verify deployments after each push.

---

## 🗺 Roadmap

- [ ] Hook Supabase Auth and storage into `apps/hub`
- [ ] Gradually migrate SQLite persistence to Supabase tables
- [ ] Add CI (GitHub Actions) for linting and automated Netlify builds
- [ ] Multi-class support with concurrent session management
- [ ] Historical analytics and session replay

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **AI/ML** | MediaPipe Face Mesh, TensorFlow.js |
| **Charts** | Chart.js, Plotly.js |
| **Backend** | Node.js, Express.js |
| **Real-time** | Socket.IO |
| **Database** | SQLite (better-sqlite3), Supabase-ready |
| **Deployment** | Netlify, Supabase |

---

## 📄 License

This project is open source and available for educational and research purposes.

---

<p align="center">
  Made with ❤️ for better classrooms
</p>
