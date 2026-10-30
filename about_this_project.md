# SessionSignal — Current Project Handoff

## Purpose of this document

This is the detailed context file to give ChatGPT or another developer before discussing new features, workflow changes, scoring changes, UI redesigns, or database migrations in SessionSignal.

Treat the implementation in this repository as the source of truth. Before proposing a change, identify whether it affects:

- the public website;
- teacher authentication or session ownership;
- the live teacher dashboard;
- historical analytics and migrated records;
- the Chrome extension and camera lifecycle;
- local attention-analysis or aggregation logic;
- the Supabase schema, RLS, RPCs, Realtime topics, or retention policy;
- privacy, consent, accessibility, packaging, or deployment.

Do not replace working dashboard or analytics behavior with mock data. Preserve historical compatibility deliberately and version any telemetry meaning change.

## Product summary

SessionSignal is a controlled-beta, local-first participation-indicator companion for classes, workshops, training, coaching, and other live sessions. A provisioned facilitator signs into the web portal and creates an active session with a six-character code. A participant opens the SessionSignal Chrome extension in either the Side Panel or a normal tab, signs in anonymously behind the scenes, validates the code, reviews the camera notice, and explicitly starts monitoring.

MediaPipe Face Mesh and the project’s heuristic analysis run inside the extension document. Raw frames remain local. About every five seconds, the extension sends a derived numerical aggregate to Supabase through a validated PostgreSQL function. The facilitator dashboard hydrates owned session state from PostgreSQL and receives live updates through private Supabase Realtime Broadcast topics.

After a session ends, the same stored snapshots power session history, analytics, heatmaps, comparisons, participant deep dives, printable reports, and CSV export.

The outputs are heuristic estimates. They do not verify attention, emotion, learning, intent, attendance, or mental state, and must not be used alone for grading, discipline, or another high-stakes decision.

## Current production architecture

```text
Vite website and facilitator portal
  ├─ public marketing/install/privacy pages
  ├─ Supabase email/password facilitator authentication
  ├─ trusted public.profiles `teacher` role (retained internal identifier)
  ├─ live dashboard and historical analytics
  └─ Vercel static deployment target
                  │
                  ├─ Supabase PostgreSQL with RLS
                  ├─ validated SECURITY DEFINER RPCs
                  └─ private Realtime Broadcast topics
                  │
Chrome Manifest V3 extension
  ├─ popup launcher
  ├─ Side Panel or New Tab (one shared application)
  ├─ anonymous Supabase identity
  ├─ explicit code validation, notice, consent, camera start
  ├─ locally packaged MediaPipe analysis
  ├─ five-second numerical aggregation
  ├─ bounded idempotent retry queue
  └─ single-monitoring-document lease
```

Normal production operation does not use Express, Socket.IO, REST endpoints, or SQLite. The legacy server remains only for migration verification and rollback/reference until the owner verifies the remote import.

## Repository map

```text
apps/
  web/
    index.html                 public homepage
    features/                  feature page
    how-it-works/              product workflow
    teachers/                  teacher product page and login
    students/                  student and installation pages
    privacy/                   privacy and telemetry disclosure
    contact/                   contact page
    src/auth/                  teacher guard and login logic
    src/lib/                   Supabase client and Chart.js setup
    src/marketing/             shared public header/footer behavior
    src/styles/                public design system
    public/downloads/          reproducible beta extension ZIP/checksum
  teacher/
    index.html                 authenticated live dashboard
    sessions.html              owned session history
    analytics.html             historical report
    js/supabaseHandler.js      live hydration/private Broadcast adapter
    js/analyticsRepository.js  paged RLS-protected historical queries
    js/dashboard.js            live UI orchestration
    js/charts.js               existing live Chart.js visualizations
    js/studentGrid.js          participant cards and detail table
    js/analytics.js            heatmaps, reports, print, and CSV
  extension/
    manifest.json              Chrome MV3 manifest
    service-worker.js          launcher coordination only
    popup.*                    explicit Side Panel/New Tab launcher
    student.html               shared monitoring application
    src/app.js                 join, consent, camera, telemetry lifecycle
    src/telemetryClient.js     anonymous auth, RPC, queue, Realtime
    src/monitoringLease.js     prevents duplicate monitoring loops
  student/js/
    faceAnalyzer.js            canonical local frame analysis
    dataCollector.js           canonical five-second aggregation
  api/                         legacy Express/Socket.IO/SQLite system
supabase/migrations/           versioned database schema and policies
scripts/                       builds, packaging, migration, scans
tests/                         scoring, runtime, privacy/security, build tests
docs/                          setup, migration, cleanup, manual acceptance
vite.config.js                 multi-page build and local pretty routes
vercel.json                    production route rewrites and headers
```

The extension build copies the canonical `apps/student/js/faceAnalyzer.js` and `dataCollector.js` sources into `dist/extension/src/shared/`. Do not create a second scoring implementation inside the extension.

## Main user workflows

### Facilitator

1. Visit `/facilitators/login` and sign in with a permanent Supabase Auth account.
2. The route guard reads the trusted `public.profiles` row. Only `role = 'teacher'` is accepted.
3. Open `/facilitator` and create or resume a session.
4. The `create_class_session()` RPC generates a cryptographically random collision-checked six-character code.
5. Share the code with participants.
6. The dashboard subscribes to the private facilitator-owned topic, queries participants and their latest snapshots, then applies buffered live events.
7. Live cards, table rows, six charts, class summary, alerts, and rule-based recommendations update from five-second packets.
8. End the session. The database marks participants ended, rejects future telemetry, and broadcasts the terminal event to each participant.
9. Review `/facilitator/sessions` or `/facilitator/analytics?sessionId=<uuid>`.

The dashboard can resume the newest owned active session after a refresh because active state is stored in PostgreSQL, not server memory.

### Participant

1. Install/load the extension and click its toolbar popup.
2. Choose **Open Side Panel** or **Open New Tab**. Both launch `student.html` and use the same logic.
3. Enter a display name and session code.
4. The extension obtains an anonymous Supabase identity and calls `join_class_session()`.
5. Only after the session is validated, review the local-processing notice, check consent, and click Start.
6. The extension obtains a monitoring lease so a second SessionSignal document cannot run another camera/telemetry loop.
7. Chrome requests camera permission. Frames are processed locally and local indicators update continuously.
8. Every five seconds, the aggregate is assigned a UUID and submitted through `submit_student_snapshot()`.
9. Failed numerical packets are kept in a 36-packet, 15-minute bounded queue and retried with backoff. Snapshot UUIDs make retries idempotent.
10. Stop, facilitator end, unload, or fatal camera failure releases tracks, analysis, timers, and the lease.

## Attention-analysis logic

`FaceAnalyzer` uses MediaPipe Face Mesh with one face and refined iris landmarks. It derives approximate signals from geometry; it is not a calibrated gaze, pose, or emotion model.

The observable-frame attention score remains:

- gaze on screen: 35 points;
- forward head pose: 25 points;
- not drowsy: 20 points;
- low gaze deviation: 10 points;
- focused or engaged rule-based emotion label: 10 points.

The result is clamped to 0–100 and categorized as:

| Score | Category |
|---:|---|
| 80–100 | `highly_focused` |
| 60–79 | `focused` |
| 40–59 | `neutral` |
| 20–39 | `distracted` |
| 0–19 | `disengaged` |

### Unknown-signal rule

If no face is observable, the score is `null`, the category/signal is `unavailable`, and no distraction alert is created. Missing-face frames do not reduce the mean of observable frames. The system does not fabricate face confidence; it uses `null` because this integration does not provide a meaningful per-frame confidence.

This rule must remain consistent in:

- `faceAnalyzer.js` per-frame output;
- `dataCollector.js` aggregates;
- snapshot RPC validation and normalized columns;
- teacher cards and live charts;
- class averages and distributions;
- historical analytics, heatmaps, insights, and CSV.

Unavailable means unknown data, not disengagement or proof the student left.

### Aggregation and alerts

`DataCollector` computes timing, descriptive statistics, percentages, modes, event flags, emotion distribution, trend, and an interval score roughly every five seconds.

Supported alert flags are:

- `GAZE_OFF`
- `HEAD_TURNED`
- `DROWSY`
- `YAWNING`
- `HIGH_DISTRACTION`
- `LOW_BLINK`
- `EYES_CLOSED`

Alert thresholds are prototype heuristics. Any threshold redesign should preserve old records, be documented, and preferably introduce an explicit payload/algorithm version.

## Telemetry contract

The transport packet contains identifiers and derived data only:

```js
{
  snapshotId,          // client-generated UUID; idempotency key
  sessionId,
  participantId,
  capturedAt,
  intervalStartedAt,
  intervalEndedAt,
  payloadVersion: '1.0',
  signalState: 'observable' | 'unavailable',
  metrics: {
    timing,
    faceConfidence,
    attentionScore,
    gazeDeviation,
    gazeX, gazeY,
    headPosePitch, headPoseYaw, headPoseRoll,
    eyeOpennessLeft, eyeOpennessRight,
    blinkRate,
    mouthOpenness,
    drowsinessScore,
    percentages,
    modes,
    eventFlags,
    emotionDistribution,
    computed,
    signalState
  }
}
```

Prohibited transport/storage fields include raw frames, image data, screenshots, canvas captures, video/audio blobs, face crops, embeddings, and raw landmarks. The extension requests no microphone, meeting-page inspection, scripting, tabs, or activeTab permission.

## Supabase data model

The foundation migration is `supabase/migrations/202610300001_sessionsignal_foundation.sql`.

### `profiles`

Trusted application role keyed to `auth.users`. Teacher roles are provisioned administratively using `scripts/provision-teacher.sql`; browser-editable metadata never grants the role.

### `sessions`

Owned by one teacher. Stores the public code, active/ended state, start/end timestamps, source/demo labels, retention deadline, and legacy metadata.

### `session_participants`

Maps an anonymous auth user to one participant per session. Stores display name, connection/camera/stop state, join/last-seen timestamps, and legacy metadata. `auth_user_id` is nullable only so old SQLite participants can be imported.

### `student_snapshots`

Stores the idempotent snapshot UUID, ownership links, timestamps/version/signal state, normalized analytics columns, full bounded numerical metrics JSON, source labels, and alerts. It contains no raw media.

### `session_join_attempts`

Provides a modest per-auth-identity database join-attempt limit. Public deployment also requires Supabase Auth rate limits and CAPTCHA/Turnstile because the database does not reliably identify client IPs.

## RPC and authorization boundaries

Application clients do not directly insert or update core tables. They call validated functions:

| Function | Caller | Purpose |
|---|---|---|
| `create_class_session()` | trusted teacher | creates owned active session/code |
| `get_session_latest_snapshots(uuid)` | owning teacher | dashboard rehydration |
| `join_class_session(code, name)` | anonymous student | validates active code and joins/reconnects |
| `submit_student_snapshot(...)` | owning anonymous participant | validates and inserts numerical packet |
| `set_participant_status(...)` | owning participant | connected/reconnecting/stopped state |
| `end_class_session(uuid)` | owning teacher | atomically ends session and participants |
| `delete_expired_sessionsignal_data()` | database owner/scheduler | retention cleanup |

RLS allows a teacher to select only owned sessions, participants, and snapshots. A student can select only their participant row. There are no normal client insert/update/delete policies. Security-definer functions validate role, participant ownership, active session state, timestamps, version, payload size, categorical values, alert flags, and score ranges.

## Realtime behavior

Topics are private:

- `sessionsignal:teacher-session:<session_uuid>` for snapshot/join/status/end events;
- `sessionsignal:student-session:<session_uuid>:<auth_user_uuid>` for that participant’s end event.

PostgreSQL uses `realtime.send`; a snapshot trigger broadcasts only identifiers and derived metrics. `realtime.messages` select authorization checks teacher ownership or exact participant membership. Clients have no Broadcast insert policy, so they cannot bypass the snapshot RPC and inject dashboard events directly.

The teacher adapter subscribes before hydration, buffers events during database queries, de-duplicates snapshots by UUID, and then emits the existing dashboard event shape. A 15-second refresh detects stale participants if a document disappears without a clean status update.

## Historical analytics

`analyticsRepository.js` fetches all snapshots in pages of 1,000 and maps normalized Supabase rows into the established report model. The analytics UI retains:

- session metadata and summary cards;
- student list/tabs;
- attention heatmap and class averages;
- emotion, gaze, head-pose, blink, drowsiness, and attention charts;
- comparative charts and timelines;
- per-student deep dive and rule-based insights;
- print/PDF through the browser print flow;
- CSV export, including signal state.

Unavailable samples remain gaps and do not become zero in averages, charts, reports, or CSV.

Legacy SQLite imports intentionally preserve the numerical meanings originally stored so old reports remain comparable. Import metadata records how old low/no-face samples would be classified under the new rule; new extension telemetry always uses strict unavailable semantics.

## Build and configuration

Use Node.js 20.19 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Public browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `EXTENSION_SUPABASE_URL`
- `EXTENSION_SUPABASE_PUBLISHABLE_KEY`
- optional `VITE_SUPPORT_EMAIL`

Migration-only server variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `LEGACY_TEACHER_ID`
- optional `SQLITE_DATABASE_PATH`

Never expose a secret/service-role key through a `VITE_` or `EXTENSION_` variable, browser source, archive, or Git.

Useful commands:

```bash
npm test                       # unit/static contract tests
npm run build                  # extension package + production web build
npm run preview                # production preview with pretty routes
npm run scan:production        # legacy URL/Socket.IO/secret scan
npm run check                  # test + build + scan
npm run migrate:sqlite -- --dry-run
```

Extension outputs:

- unpacked: `dist/extension/`
- beta ZIP: `apps/web/public/downloads/sessionsignal-extension-beta-0.3.0.zip`
- stable alias: `sessionsignal-extension-beta.zip`
- checksum: matching `.sha256` file

Packaging fixes archive dates and file modes, so identical inputs produce the same SHA-256.
The archive contains one top-level folder named `SessionSignal Beta <version>` so a student can extract it and choose that single folder in Chrome without navigating the extension internals.

## Deployment and manual acceptance

The web build targets Vercel via `vercel.json`. The owner must create separate development/production Supabase projects, apply migrations, configure Auth/anonymous sign-ins/CAPTCHA/rate limits, provision teachers, configure public environment variables, verify RLS with multiple identities, and deploy Vercel.

The following cannot be proven by static tests alone and must be completed before real classroom use:

- actual Chrome MV3 load and Side Panel/New Tab lifecycle;
- camera permission, denial, track shutdown, and concurrent Meet/Zoom behavior;
- raw-media absence inspection in extension DevTools;
- deployed RLS and private-topic isolation with teacher A/B and student A/B;
- cross-device, cross-network, disconnect/retry/end-session behavior;
- representative class-size performance and Supabase usage;
- imported historical count/report comparison;
- institutional consent, retention, opt-out, and human-review policy.

See `docs/MANUAL_TEST_PLAN.md`, `docs/SUPABASE_SETUP.md`, and `docs/MIGRATION_VERIFICATION.md`.

## Legacy path and migration

`apps/api`, the old hub, and the old standalone student pages are excluded from the Vite/Vercel production path. They remain temporarily because the SQLite source and historical reports must not be deleted before external Supabase verification.

The read-only importer:

- requires an explicit provisioned teacher UUID;
- uses deterministic IDs and upserts for idempotent reruns;
- preserves timestamps, numerical values, versions, demo/source labels, and legacy metadata;
- uses the last snapshot as the end time when a legacy session has no recorded end;
- reports source and destination counts.

Do not delete the SQLite source, its consistent backup, or the legacy report path until the owner confirms imported counts and representative reports.

## Rules for future changes

1. Read this file, the relevant source, and active migrations before editing.
2. Preserve teacher ownership and RLS; never trust a client-supplied role or participant ID alone.
3. Keep raw media local and keep extension permissions minimal.
4. Validate a session before requesting the camera and keep camera start explicit.
5. Always release tracks, timers, subscriptions, retry work, and the monitoring lease on terminal paths.
6. Treat unavailable data as unknown, never as zero or proof of behavior.
7. Preserve the observable scoring formula unless the requested change explicitly versions it.
8. Keep one shared extension application and one canonical analysis/collector implementation.
9. Keep snapshot UUID idempotency and bounded offline storage.
10. Subscribe before hydration and de-duplicate live events to avoid race gaps.
11. Paginate historical queries; do not assume Supabase’s default row limit contains a full session.
12. Preserve print, CSV, heatmap, comparisons, deep dives, and live charts when redesigning UI.
13. Add a new migration; do not rewrite an already deployed migration after production adoption.
14. Update tests, privacy text, setup docs, and this handoff when behavior or data meaning changes.
15. Do not remove legacy data/code until the replacement is tested against real imported records.

## Known limits

- The attention/emotion/gaze/pose outputs are heuristics, not validated measurements.
- Browser/OS camera sharing with Meet or Zoom varies by device and must be tested.
- Side Panel programmatic opening requires a supported Chrome version and user gesture.
- The controlled beta package is not a Chrome Web Store release.
- CAPTCHA, remote RLS verification, final website deployment, and production monitoring require owner configuration. The default 180-day telemetry retention cleanup is scheduled daily in Supabase Cron.
- The retained legacy server is unauthenticated and unsuitable for production.
