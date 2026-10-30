# Student Attention Monitoring System — Detailed Explanation (Part 1 of 3)

## Architecture Overview, Monorepo Structure & Backend (API + Database)

---

## 1. What Is This Project?

This is **SessionSignal** — a **Student Attention Monitoring System** that uses the student's own webcam combined with **Google MediaPipe FaceMesh** (a computer-vision AI model) to detect whether students are paying attention during a live class. It runs **entirely in the browser** — no video is ever uploaded to any server. Only numerical attention metrics (scores, gaze percentages, emotion labels) are transmitted in real-time to the teacher's dashboard via **WebSockets (Socket.io)**.

### Core Design Philosophy

| Principle | Implementation |
|---|---|
| **Privacy-first** | Video never leaves the student's browser. Only summary numbers are sent. |
| **Zero-install for students** | Students open a URL, enter name + 6-character code, and they're in. No app downloads. |
| **Real-time feedback** | Teachers see live attention scores, emotions, and alerts update every 5 seconds. |
| **Post-session analytics** | After a session ends, the teacher gets a full analytical report with heatmaps, charts, and per-student deep dives. |

---

## 2. Monorepo Structure — Why This Layout?

```
Student-Attention-Monitoring-System/
├── .env                          ← Environment variables (Supabase keys, port, CORS)
├── .gitignore                    ← Ignoring node_modules, .env, dist/, database files
├── package.json                  ← Root-level monorepo orchestration scripts
├── netlify.toml                  ← Default Netlify deployment config (hub as default)
├── netlify/                      ← Per-app Netlify configs for student & teacher sites
│   ├── README.md
│   ├── student.toml
│   └── teacher.toml
├── tools/
│   └── build-static.mjs          ← Build script that copies apps into dist/ for deployment
├── docs/
│   └── DEPLOYMENT.md              ← Deployment playbook (Netlify, Supabase, GitHub)
└── apps/
    ├── api/                       ← Node.js/Express backend (server + database + REST routes)
    ├── student/                   ← Student-facing web client (CV pipeline + live monitoring)
    ├── teacher/                   ← Teacher dashboard (live charts + post-session analytics)
    └── hub/                       ← Control Hub landing page (marketing site + admin panel)
```

### Why a Monorepo?

1. **Single Git repository** — All four apps (API, Student, Teacher, Hub) live together, so changes that span multiple apps (e.g., changing the WebSocket payload format) are tracked in a single commit.
2. **Shared `.env`** — One environment file configures the API port, Supabase credentials, and CORS origins. The API reads it with `dotenv` using a path relative to the repo root (`../../.env`).
3. **Independent deployability** — Each app under `apps/` is self-contained. The `tools/build-static.mjs` script simply copies an app folder to `dist/<app-name>` for Netlify deployment, filtering out `node_modules`.
4. **Clear separation of concerns** — `apps/api` has its own `package.json` and `node_modules`. The three frontend apps (`student`, `teacher`, `hub`) are plain HTML/CSS/JS — no build step needed for development.

---

## 3. Root-Level Configuration Files

### 3.1 `package.json` (Root)

```json
{
  "name": "sessionsignal-monorepo",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "dev:api": "npm run dev --prefix apps/api",
    "start:api": "npm run start --prefix apps/api",
    "install:api": "npm install --prefix apps/api",
    "build:student": "node tools/build-static.mjs student",
    "build:teacher": "node tools/build-static.mjs teacher",
    "build:hub": "node tools/build-static.mjs hub",
    "build:web": "npm run build:student && npm run build:teacher && npm run build:hub",
    "setup": "npm run install:api",
    "dev": "npm run dev:api",
    "start": "npm run start:api"
  },
  "engines": { "node": ">=18.0.0" }
}
```

**Why these scripts exist:**
- `npm run setup` → Installs only the API's dependencies (the frontend apps use CDNs, no npm packages needed).
- `npm run dev` → Starts the API server, which also serves all three frontend apps as static files.
- `npm run build:web` → Copies all three frontend apps into `dist/` for deployment to Netlify.
- `--prefix apps/api` → Tells npm to run the command inside the `apps/api` directory without needing `cd`.

**Why `private: true`?** — Prevents accidental publishing to npm. This is a monorepo, not a library.

**Why `engines.node >= 18`?** — The build script (`build-static.mjs`) uses `fs.cpSync()` which was introduced in Node 16.7 and stabilized in Node 18. The `?.` optional chaining in `database.js` also requires modern Node.

### 3.2 `.env` — Environment Configuration

```
PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8888,http://localhost:3000
SESSION_DATABASE_PATH=data/sessions.db
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=REPLACE_WITH_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SERVER_ONLY_KEY
SUPABASE_JWT_SECRET=REPLACE_WITH_SERVER_ONLY_SECRET
SUPABASE_PROJECT_ID=YOUR_PROJECT
HUB_TITLE=SessionSignal Control Hub
HUB_SUPPORT_EMAIL=ops@sessionsignal.local
```

**Why each variable exists:**
| Variable | Reason |
|---|---|
| `PORT` | The Express server listens on this port. Default is 3000. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of origins that are allowed to connect. When student/teacher pages are hosted on different Netlify domains, their origins must be listed here. |
| `SESSION_DATABASE_PATH` | Where the SQLite database file is stored. Defaults to `apps/api/data/sessions.db`. This is relative to the API directory if not absolute. |
| `SUPABASE_*` | Credentials for future Supabase integration (auth, cloud database). Currently unused by the running code but configured for migration readiness. |
| `HUB_TITLE`, `HUB_SUPPORT_EMAIL` | Branding variables for the Control Hub. Can be injected into the admin page. |

### 3.3 `.gitignore`

Key entries and why:
- `.env` / `.env.*` → **Never commit secrets** (Supabase keys, JWT secrets).
- `node_modules/` / `apps/*/node_modules/` → Dependencies are installed from `package-lock.json`, never committed.
- `dist/` → Build output folder, regenerated by `build-static.mjs`.
- `apps/api/data/` → The SQLite database file. Each developer creates their own locally.
- `notes.txt` → Personal development notes excluded from the repo.

### 3.4 `netlify.toml` — Deployment Configuration

```toml
[build]
  command = "npm run build:hub"
  publish = "dist/hub"
[build.environment]
  NODE_VERSION = "20"
[context.student]
  command = "npm run build:student"
  publish = "dist/student"
[context.teacher]
  command = "npm run build:teacher"
  publish = "dist/teacher"
```

**How this works:**
- **Default build** (main branch) → Netlify runs `npm run build:hub`, publishes `dist/hub`. This deploys the Control Hub landing page.
- **Branch-based deploys** → If you push to a `student` branch, Netlify automatically uses the `[context.student]` block, building and publishing only the student app. Same for `teacher`.
- **`NODE_VERSION = "20"`** → Ensures Netlify uses Node 20, which is required for `fs.cpSync()`.

The `netlify/` directory contains **standalone `.toml` files** (`student.toml`, `teacher.toml`) for when you want to create **separate Netlify sites** instead of using branch-based deploys.

### 3.5 `tools/build-static.mjs` — The Build Script

```javascript
import fs from 'node:fs';
import path from 'node:path';

const appName = process.argv[2];
const source = path.join(ROOT, 'apps', appName);
const target = path.join(ROOT, 'dist', appName);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

const skip = new Set(['node_modules', '.DS_Store']);

fs.cpSync(source, target, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(source, src);
    if (!rel) return true;
    return rel.split(path.sep).every((segment) => !skip.has(segment));
  }
});
```

**What it does:**
1. Takes an app name as a CLI argument (e.g., `student`).
2. Deletes any existing `dist/student` directory.
3. Recursively copies `apps/student` → `dist/student`, **skipping** `node_modules` and `.DS_Store`.
4. The result is a clean static folder ready for Netlify to serve.

**Why not use a bundler (Vite/Webpack)?** — The frontend apps are plain HTML+CSS+JS using CDN-loaded libraries. There's nothing to bundle. A simple file copy is the most reliable, fastest approach.

---

## 4. Backend: `apps/api/` — The Express + Socket.io Server

### 4.1 Dependencies (`apps/api/package.json`)

```json
{
  "dependencies": {
    "better-sqlite3": "^12.8.0",   // SQLite database driver (synchronous, very fast)
    "cors": "^2.8.5",              // CORS middleware for Express
    "dotenv": "^17.3.1",           // Loads .env into process.env
    "express": "^4.18.2",          // HTTP framework
    "socket.io": "^4.7.4",        // WebSocket library for real-time communication
    "uuid": "^9.0.0"              // Generates unique session/student IDs
  }
}
```

**Why `better-sqlite3` instead of `sqlite3` or PostgreSQL?**
- `better-sqlite3` is **synchronous** — no callbacks or promises needed for database operations. This simplifies the code enormously.
- It's **blazingly fast** for single-server deployments.
- The project is designed for a single classroom or school. SQLite handles this perfectly.
- The `.env` includes Supabase credentials for **future migration** to a cloud database when the project scales.

**Why Socket.io instead of raw WebSockets?**
- Socket.io provides **automatic reconnection** with exponential backoff.
- It supports **namespaces** (`/student`, `/teacher`) to separate student and teacher connections.
- It supports **rooms** (each session is a room), so messages can be broadcast to only the relevant participants.
- It provides **acknowledgment callbacks** for request-response patterns.

### 4.2 `server.js` — The Main Server File (549 lines)

This is the heart of the backend. Let's walk through every section.

#### 4.2.1 Initialization & Imports (Lines 1–16)

```javascript
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config({
    path: path.resolve(__dirname, '../../.env'),
    override: false
});

const db = require('./db/database');
const sessionsRouter = require('./routes/sessions');
```

**Why `override: false`?** — If environment variables are already set (e.g., in Netlify's dashboard), `.env` values won't overwrite them. This allows the same code to work locally (reading `.env`) and in production (reading Netlify/Docker env vars).

**Why `http.createServer(app)` instead of `app.listen()`?** — Socket.io requires access to the raw HTTP server object. Express's `app.listen()` creates one internally but doesn't expose it. By creating the server explicitly, we can pass it to both Express and Socket.io.

#### 4.2.2 CORS Configuration (Lines 21–48)

```javascript
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '*')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const derivedOrigins = new Set(configuredOrigins);
if (!derivedOrigins.has('*')) {
    const selfOrigins = [
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`
    ];
    selfOrigins.forEach(origin => derivedOrigins.add(origin));
}
```

**Why this complexity?**
- In development, the student app is served by the same Express server (same origin), so CORS isn't needed.
- In production, student/teacher apps may be on different Netlify domains, so their origins must be whitelisted.
- `localhost` and `127.0.0.1` are **always** added automatically (they're the same machine but technically different origins).
- If `*` is specified, all origins are allowed (useful during early development).

#### 4.2.3 Static File Serving (Lines 51–63)

```javascript
const staticRoot = path.resolve(__dirname, '..');
const mountStatic = (mountPath, folder) => {
    const absolutePath = path.join(staticRoot, folder);
    if (fs.existsSync(absolutePath)) {
        app.use(mountPath, express.static(absolutePath));
    }
};

mountStatic('/', 'hub');
mountStatic('/hub', 'hub');
mountStatic('/student', 'student');
mountStatic('/teacher', 'teacher');
```

**Why the Express server serves the frontend apps:**
- During development, you only need to run one server (`npm run dev`) and all four apps are accessible:
  - `http://localhost:3000/` → Hub
  - `http://localhost:3000/student` → Student Portal
  - `http://localhost:3000/teacher` → Teacher Dashboard
- The `existsSync` check prevents crashes if a folder doesn't exist (e.g., if you only have the API).

**Why `/` and `/hub` both mount the hub?** — The hub is the default landing page (root URL), but also accessible at `/hub` for explicit navigation.

#### 4.2.4 In-Memory State (Lines 78–97)

```javascript
const sessionStore = new Map();
// sessionId => {
//     sessionId,
//     sessionCode,
//     teacherSocketId,
//     startTime,
//     students: Map( studentId => { name, socketId, active, lastPayload, history[] } )
// }
```

**Why a `Map` instead of the database?**
- WebSocket events happen **many times per second**. Querying SQLite for every incoming frame would be too slow.
- The `sessionStore` keeps the **current state** in RAM. The database stores the **historical record**.
- When a teacher refreshes their page, the server reconstructs the dashboard state from `sessionStore` instantly.
- `history[]` keeps the last 100 payloads per student in memory (with `shift()` to cap it). This allows the server to send recent history to a reconnecting teacher without a database query.

**Why dual-indexed (`sessionCode` AND `sessionId`)?**
```javascript
sessionStore.set(sessionCode, sessionData); // Students join by 6-char code
sessionStore.set(sessionId, sessionData);   // Internal references use UUID
```
- Students type a **human-friendly 6-character code** (e.g., `AB3F7K`).
- Internally, sessions are tracked by **UUID** (e.g., `a7b3c4d5-...`). This prevents collisions and is used for database keys and Socket.io room names.
- Both keys point to the **same object reference**, so updates are reflected everywhere.

#### 4.2.5 Session Code Generator (Lines 90–97)

```javascript
function generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
```

**Why 6 characters, uppercase + digits only?**
- 36^6 = **2.17 billion** possible codes. Collision probability is negligible for classroom use.
- Uppercase-only avoids confusion between `l`/`1`, `O`/`0` when dictated verbally.
- 6 characters is short enough to write on a whiteboard and dictate aloud.

#### 4.2.6 Socket.io Namespaces (Lines 99–103)

```javascript
const studentNsp = io.of('/student');
const teacherNsp = io.of('/teacher');
```

**Why separate namespaces?**
- **Security isolation** — Student connections should never receive teacher-only events (like class summaries with all student data).
- **Event naming clarity** — `student:join`, `student:data` vs `teacher:start-session`, `teacher:end-session` are scoped to their namespace.
- **Independent connection lifecycle** — A student disconnecting doesn't affect the teacher's connection.

---

## 5. Database Layer: `apps/api/db/database.js`

### 5.1 Database Path Resolution (Lines 1–16)

```javascript
const configuredPath = process.env.SESSION_DATABASE_PATH;
const resolvedDbPath = configuredPath
    ? (path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(apiRoot, configuredPath))
    : path.join(apiRoot, 'data', 'sessions.db');
```

**Why this resolution logic?**
- Default: `apps/api/data/sessions.db` (relative to the API folder).
- If `SESSION_DATABASE_PATH` is set in `.env`, it can be absolute (`/var/data/sessions.db`) or relative to the API folder (`data/mydb.db`).
- The directory is auto-created if missing (`fs.mkdirSync(resolvedDir, { recursive: true })`).

### 5.2 WAL Mode

```javascript
db.pragma('journal_mode = WAL');
```

**Why WAL (Write-Ahead Logging)?**
- In default journal mode, SQLite locks the entire database during writes. With WAL, **readers don't block writers and writers don't block readers**.
- During a live session, the server is simultaneously inserting snapshots (writes) and the REST API may be reading session lists (reads). WAL prevents these from conflicting.

### 5.3 Schema Design (Lines 24–115)

Three tables:

#### `sessions` Table
```sql
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,           -- UUID
    teacher_id TEXT,               -- Socket ID of the teacher who created it
    session_code TEXT UNIQUE,      -- 6-char human-readable code
    start_time INTEGER,            -- Unix timestamp (ms)
    end_time INTEGER,              -- NULL while session is active
    student_count INTEGER DEFAULT 0,
    total_snapshots INTEGER DEFAULT 0
);
```

**Why `TEXT` for IDs instead of `INTEGER`?** — UUIDs are strings. Using `TEXT` keeps the schema consistent with the in-memory `Map` keys. SQLite handles text primary keys efficiently.

**Why `student_count` and `total_snapshots`?** — These are denormalized counts updated when a session ends (`endSession()`). This avoids expensive `COUNT(*)` queries when listing sessions on the analytics page.

#### `students` Table
```sql
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    name TEXT,
    join_time INTEGER,
    last_seen INTEGER,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**Why `is_active`?** — Tracks whether a student is currently connected. When they disconnect, `is_active` is set to 0. If they reconnect, the `UPSERT` sets it back to 1.

**Why `UPSERT`?**
```sql
INSERT INTO students (...) VALUES (...)
ON CONFLICT(id) DO UPDATE SET
    last_seen = excluded.last_seen,
    is_active = 1
```
If the same student reconnects (same UUID stored in `localStorage`), we update their `last_seen` instead of creating a duplicate row.

#### `snapshots` Table (The Big One)
This table has **42 columns** — one row per 5-second aggregated data payload per student. Key column groups:

| Group | Columns | Purpose |
|---|---|---|
| **Attention** | `attention_score`, `attention_category`, `attention_trend`, `interval_attention_score` | The computed attention score and its classification |
| **Gaze** | `gaze_on_screen_pct`, `gaze_deviation_mean/max`, `gaze_x`, `gaze_y` | Where the student is looking |
| **Head Pose** | `head_pose_pitch/yaw/roll_mean`, `head_pose_category` | Head orientation (forward, looking down, etc.) |
| **Eyes** | `eye_openness_left/right_mean/min`, `eyes_closed_pct`, `blink_rate` | Eye state and blink detection |
| **Mouth** | `mouth_openness_mean`, `yawn_detected` | Yawn detection for drowsiness |
| **Drowsiness** | `drowsiness_score` | Computed drowsiness (from eye closure + yawns) |
| **Emotion** | `primary_emotion`, `emotion_*_pct` (7 emotions) | Rule-based emotion classification |
| **Alerts** | `alert_flags`, `alert_count` | Flags like `LOW_ATTENTION`, `GAZE_OFF`, `DROWSY` |
| **Timing** | `frame_count`, `interval_duration_ms` | How many video frames were analyzed in this 5-second window |

**Why store all these columns instead of just a JSON blob?**
- **Queryability** — You can write SQL like `SELECT * FROM snapshots WHERE attention_score < 40` to find all distracted intervals.
- **Aggregation** — The `/api/sessions/:id/summary` endpoint computes averages directly from these columns.
- **Indexing** — The `idx_snapshots_session` and `idx_snapshots_student` indexes make queries fast.

### 5.4 Prepared Statements (Lines 117–174)

```javascript
const stmts = {
    insertSession: db.prepare(`INSERT INTO sessions ...`),
    insertSnapshot: db.prepare(`INSERT INTO snapshots ...`),
    // ... 12 total statements
};
```

**Why prepared statements?**
- `better-sqlite3` compiles SQL into bytecode once. Subsequent executions skip parsing, making bulk inserts (many snapshots per second) much faster.
- They also prevent **SQL injection** — values are passed as parameters, not concatenated into the query string.

### 5.5 `insertSnapshot()` — The Data Mapper (Lines 191–266)

This function takes a raw WebSocket payload (from the student's browser) and maps it to the 42-column `snapshots` table:

```javascript
function insertSnapshot(sessionId, studentId, studentName, payload) {
    const agg = payload.aggregates || {};
    const comp = agg.computed || {};
    const pts = agg.percentages || {};
    const emo = agg.emotionDistribution || {};
    const modes = agg.modes || {};
    const timing = agg.timing || {};
    // ... maps each field using optional chaining with || 0 fallbacks
}
```

**Why all the `|| 0` fallbacks?**
- The payload structure is complex and nested. If a student's face isn't detected, many fields will be `undefined`. The fallbacks ensure SQLite always receives valid numbers, preventing `NULL` corruption.

### 5.6 `deleteSessionByCode()` — Cascade Deletion

```javascript
deleteSessionByCode: (code) => {
    const sessions = stmts.getSessionsByCode.all(code);
    for (const s of sessions) {
        stmts.deleteSnapshotsBySession.run(s.id);
        stmts.deleteStudentsBySession.run(s.id);
    }
    stmts.deleteSessionByCode.run(code);
}
```

**Why manual cascade instead of SQL `ON DELETE CASCADE`?**
- SQLite supports `ON DELETE CASCADE` but it requires `PRAGMA foreign_keys = ON`, which must be set on every connection. Using explicit deletes is more reliable and makes the cleanup order explicit.
- This is used by the demo mode to clean up the `DEMO01` session.

---

## 6. REST API Routes: `apps/api/routes/sessions.js`

Five endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions with metadata |
| `GET` | `/api/sessions/:id/students` | List students in a session |
| `GET` | `/api/sessions/:id/snapshots/:studentId` | Get all snapshots for a student |
| `GET` | `/api/sessions/:id/summary` | Compute aggregated analytics for the post-session report |
| `POST` | `/api/sessions/:id/end` | Mark a session as ended |

### 6.1 The Summary Endpoint (Lines 48–155)

This is the most complex endpoint. It powers the entire **post-session analytics page**. Here's what it does:

1. **Fetches all snapshots** for the session from SQLite.
2. **Groups them by student** — builds per-student statistics.
3. **Computes per-student metrics**:
   - Average attention score, gaze %, drowsiness
   - Focus time percentage (intervals where attention ≥ 60)
   - Distracted time percentage (intervals where attention < 40)
   - Away time percentage (intervals where face wasn't detected)
   - Mode emotion (most frequent emotion across all intervals)
   - Attention timeline (array of `{timestamp, score}` for charting)
4. **Computes class-level metrics**:
   - Class average attention
   - Emotion distribution (normalized to percentages)
   - Alerts breakdown by type

**Why compute this on-the-fly instead of pre-computing?**
- Sessions can be viewed from the analytics page **at any time** — even while they're still running.
- Pre-computing would require running aggregation jobs, adding complexity.
- SQLite is fast enough for classroom-sized datasets (typically a few hundred to a few thousand rows per session).

---

*Continue to Part 2 for the Student Client (CV Pipeline, Face Analysis, Data Collection) and Part 3 for the Teacher Dashboard, Analytics, Hub, and Demo Mode.*
