# SessionSignal — New Product Architecture & Implementation Specification

> **Purpose:** This is the implementation handoff for Codex. Read this document together with the existing source code and `about_this_project.md` before making changes. Implement the target product in the existing repository; do not create a disconnected demo or replace working functionality with mock screens.
>
> **Primary goal:** Transform SessionSignal from a locally hosted prototype with a student website into a polished public product website, an authenticated teacher web portal, and a student Chrome extension. Keep all webcam/video analysis on the student's device. Send only the numerical/derived telemetry needed by the teacher to a managed Supabase backend. Use Supabase for authentication, PostgreSQL persistence and Realtime delivery. Do not require a separately deployed, always-running Node.js server for the MVP.

---

## 1. Product decisions that are already approved

Treat the following as confirmed requirements. Do not reopen these decisions unless the current repository makes one technically impossible; explain any such blocker instead of silently changing the design.

1. **Product name:** SessionSignal.
2. **Public website:** Completely redesign and rewrite the current landing/hub page as the official SessionSignal website. It must look like a professionally designed SaaS/EdTech product, not a generic AI-generated landing page.
3. **Teacher experience:** Teachers use the web portal after signing in. The teacher portal must retain the existing teacher dashboard and every useful existing capability described in Section 4.
4. **Student experience:** The student product is a Chrome extension. The public website explains it and provides its beta download/install instructions. Do not keep a separate student web application as the primary student experience.
5. **Two extension opening modes:** Students decide whether to open SessionSignal in Chrome's Side Panel or in a separate extension tab. Both modes must use the same student application, data, session state and monitoring engine.
6. **Session join:** The teacher starts a SessionSignal session and receives the existing unique session code. The student opens the extension, enters their display name and session code, reviews the camera/privacy notice, grants camera access and starts monitoring.
7. **External meeting platforms:** SessionSignal does not host classes or meetings. Google Meet, Zoom, Microsoft Teams or an institution's own website continue to host the class. SessionSignal works alongside them and does not need to create, join, control or record those meetings.
8. **Local video processing:** Webcam frames must remain on the student's computer. MediaPipe/face analysis and attention calculations run locally in the extension page. Never upload, stream, store or log raw webcam frames, video, screenshots, canvas frames, face images or audio.
9. **Numerical data transfer:** Only derived numerical metrics, necessary status fields, timestamps, session/participant identifiers and the student display name needed by the teacher dashboard may be transferred to Supabase.
10. **Live updates:** The teacher must receive student updates while the class is in progress, from geographically separate computers over the internet. Retain the existing five-second aggregation/transmission behavior as the default.
11. **Managed backend:** Use Supabase Auth, Supabase PostgreSQL and Supabase Realtime. Host the public website/teacher frontend on Vercel (or an equivalent static/frontend host if the repository is already set up for it). Do not require Render, Railway, AWS or another separately managed, continuously running Node.js server for the MVP.
12. **No camera-free participation mode in this release.** Do not build the proposed camera-free mode, keystroke/active-tab monitoring, meeting-page inspection, LMS integrations or any alternative “attention score” without camera signals. These may be reconsidered later but are expressly out of the present scope.
13. **No unapproved feature expansion:** Do not add an AI analytics chatbot, class scheduling, QR-code joining, institutional multi-tenant management, roster import, student personal analytics portal or other optional suggestions unless they already exist and are necessary to preserve a current capability.
14. **Safe cleanup:** Remove genuinely obsolete code only after its replacement works and its behavior has been tested. Do not delete historical data, teacher analytics, working scoring logic or useful demo/testing tools simply because the architecture is changing.

## 2. First task: inspect the real repository before editing

The existing `about_this_project.md` is a technical handoff, not a substitute for source inspection. The source code is the final source of truth.

Before changing files:

1. Inspect the complete repository tree, `package.json`, scripts, lockfile, environment files, all current HTML/CSS/JS modules, `docs/`, and the SQLite schema/data code.
2. Run the current project using its documented commands and record which existing flows work and which are already broken.
3. Inspect the current student and teacher dashboards visually and trace every event/data dependency.
4. Identify all existing features and their files. Make a migration checklist before deleting or moving anything.
5. Search for hard-coded `localhost:3000`, Socket.IO references, Express REST endpoints, SQLite calls, local-storage keys, and direct DOM assumptions.
6. Inspect the current `faceAnalyzer.js`, `dataCollector.js`, teacher charts, dashboard logic and historical analytics. Preserve behavior unless a change is explicitly required below.
7. Do not assume the repository uses React, Next.js, Vite or any particular framework until `package.json` and the source prove it.

Create or update an implementation checklist in the repository while working. Do the migration in small, testable stages. Do not perform a single destructive rewrite of the entire codebase.

## 3. Target product architecture

### 3.1 High-level architecture

```text
                         CLASS PULSE PUBLIC WEBSITE
                        hosted on Vercel / frontend host
                 Home | Product | How it works | Teachers
                      Students | Install | Privacy | Contact
                                      |
                         +------------+------------+
                         |                         |
                  TEACHER WEB PORTAL         STUDENT EXTENSION
                  Teacher sign-in             Chrome Manifest V3
                  Protected routes             Student joins session
                  Existing dashboard           Side Panel OR New Tab
                  Existing live charts          Camera permission/consent
                  Historical analytics          Local MediaPipe analysis
                         |                       Local data aggregation
                         |                              |
                         +---------------+--------------+
                                         |
                              SUPABASE MANAGED SERVICES
                    Supabase Auth | PostgreSQL | Realtime
                     Row Level Security | SQL/RPC functions
                                         |
                 Student writes numerical snapshots (HTTPS)
                 Database trigger broadcasts permitted updates
                 Teacher listens to a private Realtime channel
```

### 3.2 Responsibilities

**Student's computer / extension**
- Obtain the camera stream only after the student explicitly starts monitoring and grants permission.
- Process camera frames locally using the existing MediaPipe implementation.
- Run the existing attention/scoring and five-second aggregation logic locally.
- Display the student's existing monitoring dashboard and status.
- Send only validated, aggregated numerical telemetry to Supabase.
- Temporarily queue unsent numerical packets when offline and retry when connectivity returns, subject to queue limits and session validity.
- Stop the camera and processing immediately when the student ends monitoring, permission is revoked, the class ends, or the monitoring page is closed/unloaded.

**Teacher web portal**
- Authenticate the teacher with Supabase Auth.
- Allow the teacher to create, view and end sessions they own.
- Show the current session code to its owner.
- Load current participants and historical data from Supabase.
- Subscribe to the session's private Realtime channel for live participant and metric updates.
- Retain all current live and historical dashboard functionality.

**Supabase**
- Authenticate teachers and anonymous/pseudonymous student extension users.
- Enforce authorization through Row Level Security (RLS).
- Store session metadata, participants and aggregated snapshots in PostgreSQL.
- Broadcast snapshot events to authorised teacher sessions using private Realtime channels.
- Provide durable session history so teacher data does not depend on a local server process or in-memory state.

**Public website / frontend hosting**
- Deliver public marketing/product pages and teacher portal frontend files.
- Provide the student extension beta ZIP and installation instructions.
- Must not contain Supabase secret keys or privileged server credentials.

### 3.3 No separate application server for the MVP

Do not deploy an Express/Socket.IO server to Render, Railway, AWS or a similar host as part of this implementation.

Use Supabase's managed services directly from the teacher web app and extension via the official Supabase JavaScript client. Use PostgreSQL functions (RPC) and database triggers for operations that need to be atomic or privileged. Supabase Edge Functions are **not required for the initial implementation**. Add one only if a specific requirement cannot be secured with Supabase Auth, RLS and database functions; document the reason first.

Do not run camera processing, MediaPipe or attention scoring in Supabase, Vercel functions, database functions or any cloud service.

---

## 4. Existing functionality that MUST be preserved

The existing teacher portal is not to be replaced with a stripped-down or static dashboard. Retain the current useful functionality and redesign/refactor it as needed.

### 4.1 Existing teacher live dashboard

Preserve:
- Teacher can start a live session.
- Backend/database creates a session UUID and unique human-shareable session code (the existing code is six characters; retain this format unless a documented security or collision issue requires a deliberate change).
- Teacher can share the code with students.
- Live list/grid of connected students.
- Individual student cards and detailed student table.
- Class-level attention summary and active-student count.
- Existing emotion/attention summaries and charts, subject to the accuracy caveats in Section 10.
- Rolling charts for attention, emotion distribution, gaze, blink rate, head pose and drowsiness where the current implementation supports them.
- Live alert feed.
- Existing rule-based recommendations, such as a break or a check-in question.
- Student connection/disconnection status.
- Teacher can end the active session.
- Refresh/reopen behavior for active teacher sessions should be improved using database state rather than in-memory server state.

### 4.2 Existing historical analytics

Preserve:
- Historical session list and session metadata.
- Per-session student list.
- Per-student snapshot history.
- Summary metrics.
- Attention heatmap.
- Comparison charts.
- Per-student deep dives.
- Printable report behavior.
- CSV export behavior.

Repoint historical data queries from the old REST API to secure Supabase queries/RPCs while keeping report semantics stable. Do not replace real analytics with sample data.

### 4.3 Existing student-side functionality

Move/adapt the existing student join and monitoring experience into the extension. Preserve:
- Student display-name entry.
- Session-code entry and validation.
- Camera permission flow.
- Existing MediaPipe Face Mesh analysis.
- Face presence and current gaze/head-pose/eye metrics.
- Blink-rate, yawn and drowsiness calculations as currently implemented.
- Existing attention score and attention category logic.
- Local real-time student dashboard/metric display.
- Five-second data aggregation.
- Reconnect/retry behavior, improved for Supabase.
- Clear indication when the teacher ends the session.
- A clear stop/end-monitoring control.

The student-facing UI must be available in both extension presentation modes:
- Chrome Side Panel.
- Full extension tab.

Both presentation modes must load the same application components and use the same Supabase auth session, participant record, monitoring lifecycle and telemetry implementation. Do not fork the attention engine or build two different student dashboards.

### 4.4 Existing scoring/aggregation behavior

Initially preserve the current scoring formula and thresholds unless an implementation defect or data-integrity issue makes a narrowly scoped correction necessary. Do not silently redesign the score while migrating the transport layer.

Current project documentation describes:
- Gaze: 35 points.
- Forward head pose: 25 points.
- Not drowsy: 20 points.
- Low gaze deviation: 10 points.
- Focused/engaged emotion contribution: 10 points.
- Overall score clamped to 0–100.

Current categories:
- 80–100: `highly_focused`
- 60–79: `focused`
- 40–59: `neutral`
- 20–39: `distracted`
- 0–19: `disengaged`

Current collector sends approximately five-second aggregated packets, including means/min/max/standard deviation/trend, percentages, modal labels and event flags. Preserve the existing payload semantics and charts. Version any intentional payload contract change.

### 4.5 Demo/test functionality

If the existing synthetic demo is useful for teacher-dashboard development, keep a clearly labelled development-only mock/demo path. It must never be mixed with real student records or shown as real data. Do not expose a public production endpoint that lets anonymous users create or inject fake production sessions.

---

## 5. Public SessionSignal website redesign

The current hub/landing page is to be replaced with a complete public-facing website. The old role-selection/control-hub look should not remain as the product homepage.

### 5.1 Website goals

- Make SessionSignal look like a serious, mature SaaS/EdTech product.
- Explain clearly what SessionSignal does and what it does not do.
- Explain local webcam processing and numerical-only telemetry prominently and accurately.
- Give teachers a clear sign-in route to their portal.
- Give students a clear extension download and installation route.
- Make the site feel professionally designed, responsive and dynamic without unnecessary visual gimmicks.

### 5.2 Required public routes/pages

Implement equivalent routes using the framework that best fits the inspected repository. The route names may be adapted, but all required destinations must exist.

| Route (suggested) | Content/purpose |
|---|---|
| `/` | Main SessionSignal homepage and product positioning. |
| `/features` | Existing SessionSignal capabilities, attention estimates, teacher analytics and session flow. |
| `/how-it-works` | Teacher creates session → student opens extension → local analysis → numerical metrics → teacher dashboard. |
| `/teachers` | Teacher-focused product explanation and portal call to action. |
| `/teachers/login` | Teacher authentication. |
| `/teacher/*` | Protected teacher portal pages, including existing dashboard and analytics. |
| `/students` | Student extension overview, requirements and privacy explanation. |
| `/students/install` | Beta extension download and step-by-step Developer Mode installation guide. |
| `/privacy` | Plain-language privacy/data handling statement matching actual implementation. |
| `/contact` | Project support/contact information, using only real details available in the repository/config. |

Do not create a separate student web portal or browser-based student monitoring route as the primary product. The student pages are extension pages.

### 5.3 Homepage content structure

The homepage should include, at minimum:
1. Professional navigation with SessionSignal identity/logo and links to product, features, teachers, students and privacy.
2. Strong hero section describing SessionSignal as an attention-analytics companion for online learning; clear CTAs for teachers and students.
3. A convincing product preview using real screenshots or carefully built UI previews from the actual product. Do not show fake customer logos, fake endorsements, fake usage numbers or unsupported performance claims.
4. “How it works” section with the three main steps: teacher starts a session, student joins through the extension, teacher receives live numerical insights.
5. Teacher dashboard feature showcase using the existing dashboard's real capabilities.
6. Student extension section demonstrating Side Panel and New Tab modes.
7. Local-first privacy section explaining exactly what stays on the student's device and what numerical data is transmitted.
8. Clear beta installation/download call to action.
9. FAQ addressing camera permission, Google Meet/Zoom relationship, data transmission and installation.
10. Professional footer with product navigation, privacy and support.

### 5.4 Visual quality requirements

The design must not look like a quick generic AI landing-page template.

- Establish a coherent design system: typography, spacing, grid, colors, radii, borders, shadows, buttons, cards, chart styles and icon treatment.
- Use deliberate visual hierarchy and editorial-quality copy.
- Prefer product-specific dashboard/extension imagery, real interface previews and custom diagrams over generic stock imagery.
- Use motion sparingly and purposefully: section reveals, subtle hover states, meaningful transitions and interactive product previews where useful.
- Avoid excessive gradients, excessive glassmorphism, random floating blobs, repeated identical feature cards, unnecessary 3D objects and oversized rounded containers.
- Ensure responsive behavior across desktop, laptop, tablet and mobile.
- Respect `prefers-reduced-motion` and keyboard navigation.
- Provide accessible contrast, focus states, labels and semantic HTML.
- Keep pages fast. Lazy-load non-critical imagery and avoid large unnecessary animation libraries.
- Maintain a consistent visual identity between the public site, teacher portal and extension. The teacher dashboard may retain its existing dark analytics visual language while being polished to match the new system.

Do not change product claims to sound more impressive than the actual prototype. Describe outputs as camera-based attention estimates/indicators, not verified measurements of learning, intent or mental state.

### 5.5 Teacher authentication and portal access

- Teacher routes must be protected by Supabase Auth.
- Unauthenticated users visiting `/teacher/*` must be redirected to the teacher login page.
- A teacher must only read/manage sessions and student data belonging to that teacher.
- Do not create a client-side role dropdown that lets anyone choose “teacher/admin”.
- Do not let a client set or change their own privileged role in `user_metadata` or a public profile update.
- Provision the initial owner/teacher account through a documented secure setup procedure. If teacher self-registration is implemented, it must not grant privileged teacher status merely because the user selected a role in the browser; use an invitation/approval/allowlist mechanism.
- Keep the existing teacher dashboard routes and their functions reachable behind authentication.

---

## 6. Student Chrome extension implementation

### 6.1 Extension platform

- Use Chrome Extension Manifest V3.
- Use the Chrome Side Panel API for the Side Panel experience.
- Also support opening the same student application in a normal extension tab.
- Use a popup or a small extension launcher UI that clearly offers both choices: **Open Side Panel** and **Open in New Tab**.
- Let the student choose the opening mode. Do not force one mode or automatically redirect to a separate website.
- The two modes must share the same extension-origin auth/storage and application logic.
- Set a suitable `minimum_chrome_version` for the Side Panel API. Verify the current official Chrome API compatibility requirements at implementation time; do not assume every older Chrome version supports it.

### 6.2 Suggested extension structure

Adapt the layout to the current repository; this is a conceptual structure, not a requirement to duplicate files unnecessarily.

```text
apps/
  extension/
    manifest.json
    service-worker.js
    popup.html
    popup.js
    sidepanel.html
    student.html
    src/
      app/
      components/
      camera/
        cameraManager.js
        faceAnalyzer.js
      analytics/
        scoring.js
        dataCollector.js
      session/
        sessionManager.js
      supabase/
        client.js
        auth.js
        telemetryRepository.js
        realtimeClient.js
      styles/
    assets/
    vendor/                 # local MediaPipe assets/WASM/models if required
    dist/                   # generated extension build output; do not edit by hand
```

Reuse existing student modules. Do not duplicate `faceAnalyzer` or `dataCollector` into separate Side Panel and tab implementations.

### 6.3 Extension launcher behavior

When the user clicks the extension icon, show a lightweight launcher with two explicit actions:
- Open Side Panel.
- Open in New Tab.

The action must be triggered by the user's click. The Side Panel button should open the panel through the supported `chrome.sidePanel` API. The New Tab button should open the extension's own student page using `chrome.tabs.create` and `chrome.runtime.getURL`.

Do not request broad access to every website or inject scripts into Google Meet/Zoom pages. The extension is not required to inspect meeting DOM, read meeting chat, capture the tab, record audio, capture screenshots or access page content.

Use the minimum permissions required. Likely permissions include `sidePanel` and `storage`; add additional permissions only where the implementation demonstrably needs them. Do not request `tabs`, `scripting`, `activeTab`, broad host permissions or screen-capture permissions without a documented requirement.

### 6.4 Manifest V3 service worker rules

- The extension service worker is event-driven and may be stopped by Chrome.
- Do not run continuous camera capture, MediaPipe, video processing, a permanent timer or the long-lived monitoring loop in the service worker.
- Run camera/MediaPipe/monitoring inside the Side Panel or extension tab document, where DOM and media APIs are available.
- Use the service worker only for extension events, launcher coordination, lightweight messaging and other short-lived extension tasks.
- Do not attempt to keep the service worker alive using artificial activity or undocumented workarounds.
- Test what happens when the Side Panel is closed, tab is closed, Chrome is restarted and the extension page reloads. The UI must not claim that monitoring continues if the document/camera stream has stopped.

### 6.5 Camera and local processing

- Request camera permission only after the student has entered a valid session code, reviewed the notice and explicitly clicks Start Monitoring.
- Show a clear explanation that SessionSignal itself will use the webcam for local analysis, even if the student has disabled their video in Google Meet/Zoom. Turning video off in the meeting app is not the same as denying SessionSignal camera access.
- SessionSignal must use its own permitted camera stream from the browser extension context. It must not read or extract the meeting platform's video stream.
- Whether a webcam can be shared at the same time by Meet/Zoom and the extension depends on browser, OS, device driver and hardware. Test this combination. Do not guarantee simultaneous access without testing.
- Process frames in memory locally. Never persist video frames or send them to Supabase.
- Do not enable microphone/audio capture.
- Show a persistent visible “SessionSignal camera analysis is active” indicator while analysis is running.
- Stop all `MediaStreamTrack`s, clear video elements, stop frame processing and release resources on stop/end/unload/error.
- If the student denies camera permission or the camera is unavailable, do not fabricate an attention score and do not enable camera-based monitoring. Explain why monitoring cannot start.
- If no face is observable for an interval, distinguish “signal unavailable/not observable” from a score of zero. Do not treat a missing face as proof of disengagement. Keep the existing scoring formula for observable frames.
- Side Panel and tab modes must show the same monitoring state. If the student closes the active monitoring document, teacher-side last-seen/connection state should become stale/disconnected rather than pretending the camera continues running.

### 6.6 Side Panel and New Tab lifecycle

- Opening Side Panel and opening New Tab should enter the same app route/state.
- Persist only necessary UI preferences and Supabase auth/session tokens in extension storage. Do not persist video or frame data.
- Use a shared student session state module so duplicate extension pages cannot accidentally submit duplicate snapshots for the same active participant. Define a single active monitoring owner/lease per extension profile or reject duplicate starts.
- If the user opens a second mode while monitoring is already active, guide them back to the active monitor or explicitly transfer control. Do not start two camera loops or double-submit metrics.
- The student must understand that closing the active Side Panel/tab stops monitoring unless the implementation has a reliable, explicit transfer mechanism. Do not imply background monitoring without proof.
- In New Tab mode, test foreground/background behavior. Browser throttling may change frame-processing cadence; show an honest processing/connection status when data becomes stale.

### 6.7 Extension UI

Preserve the existing student dashboard metrics and monitoring controls, but redesign the UI to fit both a narrow Side Panel and a full tab.

Required states:
- Initial/welcome state.
- Enter name and session code.
- Invalid/expired session code.
- Camera permission explanation and request.
- Camera unavailable/permission denied.
- Consent/review notice.
- Ready to start.
- Active monitoring.
- Temporarily reconnecting/offline.
- Session ended by teacher.
- Student manually stopped monitoring.
- Unexpected failure with recover/retry instructions.

The student must always see whether camera analysis is active and whether numerical data is being transmitted. Show the last successful sync time or connection state. Do not show a misleading “Live” state when the backend is unreachable.

---

## 7. Supabase backend design (no custom long-running server)

### 7.1 Supabase project setup

Use one Supabase project for the initial deployment, with separate development and production environments if practical.

Use:
- Supabase Auth for teacher accounts and anonymous student authentication.
- Supabase PostgreSQL for durable session, participant and telemetry records.
- Supabase Realtime for low-latency live updates.
- Row Level Security on every application table exposed to the Supabase Data API.
- SQL migrations committed to the repository, preferably under `supabase/migrations/`.

Use the current Supabase **publishable key** in browser/extension clients. Never put a Supabase secret/service-role key in website JavaScript, extension files, build output, source control or `.env` variables prefixed for public exposure. RLS must protect all client-accessible rows. A publishable key is not a replacement for RLS.

### 7.2 Authentication model

**Teacher**
- Use a permanent Supabase Auth account (email/password or an appropriate email-based sign-in flow).
- Teacher sign-in occurs on the SessionSignal website.
- The authenticated user's `auth.uid()` is the owner identity for their sessions.
- A user's role must be provisioned securely. Do not trust a role supplied by browser form fields or editable user metadata.

**Student extension**
- Preserve the simple student join experience: enter display name + session code; do not require a student email/password account for the MVP.
- Use Supabase Anonymous Sign-In to obtain an authenticated, pseudonymous `auth.uid()` for the extension user before joining a session.
- Keep the Supabase session in extension-origin storage so the student can reconnect after a Side Panel/tab reload where possible.
- Explain that an anonymous identity is tied to that extension/browser profile and may not be recoverable after clearing extension data, uninstalling or changing devices. Do not present it as verified student identity.
- Apply rate limiting/abuse protection to anonymous sign-in and session-code join attempts. Enable suitable CAPTCHA/Turnstile protection where supported/needed before public release.
- Only allow anonymous users to perform the student actions needed for joining a session and submitting their own telemetry. They must not access teacher-only routes or records belonging to other students/sessions.

If the repository already has a secure student identity implementation that is clearly better and compatible with the extension, inspect it before changing. Otherwise follow the anonymous-auth approach above.

### 7.3 Suggested database entities

Adapt names/columns after inspecting existing SQLite schema and historical analytics, but the target model should represent at least:

**`profiles`**
- `id` references `auth.users.id`.
- `role` or an equivalent trusted role mapping; only trusted setup/admin operations may assign teacher privileges.
- `display_name` and minimal required profile fields.
- Do not store unnecessary student personal information.

**`sessions`**
- `id` UUID primary key.
- `teacher_id` references the owning authenticated teacher.
- `session_code` or a protected code representation.
- `status` (`active`, `ended`, optionally `cancelled`).
- `created_at`, `started_at`, `ended_at`.
- Any existing session metadata/count fields needed by the teacher UI.
- Indexes on `teacher_id`, `status`, and session creation time.
- Session code lookup must not expose session rows to unauthenticated users. A student must use a restricted join RPC, not a general query over all sessions.

**`session_participants`** (or the equivalent existing `students` table migrated)
- `id` UUID primary key.
- `session_id` foreign key.
- `auth_user_id` for the student's Supabase anonymous user.
- `display_name` entered by the student.
- `joined_at`, `last_seen_at`, `is_active`/connection status.
- Unique constraint preventing duplicate participant rows for the same student identity/session.
- Indexes on `session_id`, `auth_user_id` and `last_seen_at`.

**`student_snapshots`** (or an equivalent preserved snapshots table)
- Unique snapshot ID / idempotency ID.
- `session_id`.
- `participant_id` and/or `student_auth_user_id` as needed for RLS and analytics.
- `captured_at` and interval start/end timestamps.
- `payload_version`.
- Aggregated metric fields or a validated JSONB metrics object that preserves the existing payload contract.
- `created_at`.
- Unique idempotency constraint so retries do not create duplicate snapshots.
- Composite indexes for `(session_id, participant_id, captured_at)` and any frequently queried historical path.

Use only the data required by the current student and teacher dashboards. Do not persist raw video, raw frames, screenshots, audio or biometric images. Avoid collecting extra telemetry merely because it is technically available.

### 7.4 Session code and join workflow

Preserve the existing teacher-generated unique session code behavior.

Implement secure database operations (RPC functions or equivalent protected operations) for:
- `create_class_session`: only an authenticated authorised teacher can create a session. Generate a cryptographically random, collision-checked session code. Return the session UUID and code to the owner.
- `join_class_session`: only an authenticated student extension identity can call it. Accept the code and display name, validate that the session exists and is active, create or reconnect that student's participant record, and return only the minimum session/participant data needed by the extension.
- `end_class_session`: only the owning teacher can end the session. Mark it ended, stop accepting new snapshots and notify connected students/teacher dashboard via Realtime.

Do not let the student client query all session rows or read a teacher's account information to validate a code. Do not let a student submit an arbitrary `teacher_id`, `participant_id` or session owner value that the database trusts without checking against `auth.uid()` and the participant relationship.

The existing six-character code may be retained for usability, but it must be generated using secure randomness, checked for collisions among active sessions and invalidated when the session ends. Protect join attempts with rate limiting/abuse controls. Do not rely on obscurity of the code as the only security layer.

If a session is active and the student reconnects with the same anonymous identity, restore that participant instead of creating a second duplicate student card. If the extension data was cleared and the student receives a new anonymous identity, the teacher may see a new participant; do not falsely claim that this identity is verified.

### 7.5 RLS/security policies (mandatory)

Enable RLS on all public application tables.

At minimum enforce:
- A teacher can select/update/end only sessions where `sessions.teacher_id = auth.uid()` and the profile has a trusted teacher role.
- A teacher can select participants and snapshots only for sessions they own.
- A student can select/update only their own participant record, subject to the active-session lifecycle.
- A student can insert a snapshot only when the authenticated user owns that participant record, that participant belongs to the supplied session, and the session is active.
- A student cannot read other participants' private data or any other teacher's sessions.
- Anonymous users cannot create teacher accounts, change roles or read teacher portal data.
- Public website visitors cannot access session or telemetry tables.
- No table should be exposed without a deliberate policy.

Use database constraints and/or protected functions to validate payload shape and size. Treat every client payload as untrusted. Validate the session, participant, authenticated user, timestamp, supported payload version and reasonable numeric ranges.

Never ship a service-role/secret key to the client. Never rely only on hiding a button or checking a role in frontend JavaScript.

### 7.6 Realtime strategy

Use Supabase Realtime **Broadcast through private channels**, preferably triggered from PostgreSQL after a successful snapshot insert. Supabase's current documentation recommends Broadcast over Postgres Changes for scalability/security in many database-change subscriptions.

Suggested flow:

1. The extension completes a five-second aggregate locally.
2. It submits one numerical snapshot to `student_snapshots` using the authenticated Supabase client.
3. RLS validates that the student owns the participant and the session is active.
4. A database trigger emits a minimal Broadcast event to a private teacher session topic, for example `sessionsignal:teacher-session:<session_uuid>`.
5. The teacher portal subscribes to that private channel after Supabase has authorised the teacher as the owner.
6. The teacher dashboard updates the relevant student card, chart, class summary and alert feed.
7. The snapshot remains in PostgreSQL for post-session analytics.

The Broadcast payload should contain only what the teacher UI needs: session ID, snapshot ID, participant ID, display name if needed, timestamp/interval, payload version and aggregated numerical metrics/status. Never include raw media or unnecessary authentication data.

Use private channels. Add policies on `realtime.messages` so only the session-owning teacher can subscribe to the teacher metrics topic. If students need a session-ended event, use a separate private student topic or another securely authorised mechanism that allows only actual participants in that session to receive the lifecycle event.

Do not make session channels public. Do not assume that using a private channel by itself proves that the user belongs to the session; enforce membership in Realtime authorization policies.

Do not let clients broadcast arbitrary fake student metrics directly to teacher channels. Persist through the authorised database path and broadcast from the trusted database trigger.

### 7.7 Teacher subscription and reconnect behavior

- On teacher dashboard load, authenticate and verify session ownership.
- Subscribe to the private Realtime channel and wait for the subscription to become active.
- Load the initial participant/latest-snapshot state from PostgreSQL.
- Buffer live events received during initial hydration, then reconcile/deduplicate using snapshot ID and timestamp/sequence so an event is not lost or applied twice.
- On Realtime disconnect, show a visible connection warning; reconnect and rehydrate latest state from the database.
- On teacher refresh, restore an active session using database state, not a process-local `sessionStore`.
- On session end, unsubscribe/close the channel and update the teacher UI.
- Never display old data as if it were current. Show a last-update timestamp for every participant or otherwise make stale status clear.

### 7.8 Telemetry frequency, reliability and performance

- Keep `5000 ms` (five seconds) as the default telemetry aggregation/transmission interval because this is the existing behavior.
- Centralise the interval in configuration so it can be tuned later. Do not add a student-facing interval selector in this release.
- A five-second interval means 12 snapshots per minute per active student. Account for this when indexing, storing and querying snapshots.
- Do not send every camera frame to Supabase. Do not insert per-frame data. Only send the five-second aggregated packet.
- Include `snapshot_id`/idempotency key, participant ID, session ID, `payload_version`, interval start/end and captured timestamp.
- Retry transient failures with bounded exponential backoff and jitter. Stop retrying when the teacher has ended the session or the student has explicitly stopped monitoring.
- Keep a bounded local queue of numerical snapshots only. Apply a maximum age/size and clear expired/invalid entries. Do not retain video/frame data.
- Ensure a retried snapshot is not duplicated in PostgreSQL.
- Update participant `last_seen_at` when a valid snapshot is accepted and/or through a modest heartbeat. Avoid unnecessary high-frequency heartbeat writes.
- Distinguish `connected`, `reconnecting`, `stale`, `disconnected`, `camera_unavailable` and `session_ended` states as appropriate. Do not translate a connection failure into a low attention score.
- If no data has arrived for a defined timeout, mark the participant stale/disconnected instead of continuing to show the previous score as live.
- Keep the default 5-second interval. Do not switch to 2 seconds merely to make the UI look more “live”.

### 7.9 Session end lifecycle

When the teacher ends a session:
- Verify ownership in the database function/RLS.
- Mark the session ended with timestamp.
- Reject all later student snapshot inserts for that session.
- Broadcast the end event to connected students through an authorised private mechanism.
- Teacher portal updates status and navigates to the existing post-session analytics/report page.
- Student extension stops MediaPipe processing and camera tracks, flushes only valid already-accepted/pending numerical packets if policy allows, clears monitoring state and shows “Session ended by teacher”.
- A student must not be able to continue sending telemetry into an ended session by replaying an old request.

---

## 8. Attention measurement, camera privacy and honest states

### 8.1 Local-only guarantee

This is a core product promise and must be true in code, not merely in marketing copy.

- Camera frames are consumed locally by MediaPipe/FaceAnalyzer.
- No raw frame, video blob, screenshot, canvas image, face crop, face embedding, audio sample or recording is sent to Supabase or the public website.
- No raw media is stored in IndexedDB, extension storage, localStorage, logs, crash reports or analytics providers.
- Network payloads must be reviewed in browser DevTools during testing to confirm that they contain only derived metrics and necessary identifiers/status values.
- No third-party analytics/monitoring script may receive camera-derived raw media. If a third-party error-monitoring tool is added, scrub request bodies and user data.

### 8.2 Meet/Zoom camera toggle is separate from SessionSignal permission

The student may choose not to broadcast their camera through Google Meet/Zoom while still separately granting SessionSignal permission to use their local webcam for on-device analysis. Explain this distinction before the student starts.

SessionSignal must not state that the camera is unused merely because the meeting platform's own camera toggle is off. The SessionSignal camera indicator must remain visible while its own camera stream is active.

Simultaneous camera access is not guaranteed on every OS/browser/camera driver. Test Meet-in-Chrome + extension, Zoom-in-browser + extension and Zoom desktop + extension. If concurrent access fails, show a clear camera-unavailable error; do not bypass OS/browser permissions or capture the meeting stream.

### 8.3 No camera-free mode in this release

Do not implement a camera-free attendance/participation mode, active-tab monitoring, keyboard activity analysis, page focus tracking as an attention proxy or a synthetic attention estimate when the camera is off.

If a student denies SessionSignal camera permission, the student cannot start camera-based SessionSignal monitoring. Show a clear reason and do not send an attention score. The teacher may see an honest `camera_unavailable`/`not_monitoring` connection state, not a false low-attention score.

### 8.4 Score limitations

The current heuristic score is an estimate and is not a validated measurement of attention, learning, emotion, intent or mental health.

- Do not market it as scientifically proven or as a perfect measure of attentiveness.
- Do not use it as the sole basis for grades, discipline, hiring, attendance penalties or other high-stakes decisions.
- Do not claim that gaze direction proves whether someone is listening.
- If no face/usable signal is available in an interval, represent the interval as unavailable/unknown instead of forcing attention to zero.
- The existing emotion label is rule-based and may be unreliable. Preserve current behavior for compatibility in the migration, but label it accurately and do not use it to make definitive claims about a student's mental state. Do not add new emotion categories or ML claims.
- Remove or correct any hard-coded confidence value (the current project documentation notes a confidence value hard-coded to 0.99). Never present a fabricated confidence score. If actual signal confidence is unavailable, show “not available” or a separately defined signal-quality indicator only if it is genuinely computed.

### 8.5 Student transparency and consent

Before the first monitoring session, show:
- What SessionSignal analyses (camera frames locally).
- What is sent to the teacher (aggregated numerical metrics and the student's display name/session association).
- What is never sent (video, screenshots, audio or raw frames).
- When monitoring starts and how to stop it.
- That Meet/Zoom camera-off does not disable SessionSignal's separately granted camera access.

Do not start the camera automatically on extension installation, opening the public website, entering a code or loading the dashboard. Start only after a clear user action and browser permission.

---

## 9. Existing data migration and compatibility

### 9.1 Preserve existing SQLite records

The current application stores sessions, students and snapshots in `apps/api/data/sessions.db` using SQLite. Do not delete this database or its records during the refactor.

Before migration:
1. Make a timestamped backup of the SQLite database.
2. Record counts of sessions, students and snapshots.
3. Export a sample of records and compare their field meanings to the current dashboard/analytics expectations.
4. Create an idempotent migration/import script to move historical data into Supabase PostgreSQL.
5. Define how existing sessions without a trusted `teacher_id` are mapped to the initial owner/teacher account. Do not guess an owner ID; require a documented setup value or explicit migration parameter.
6. Keep an untouched backup until row counts and representative analytics reports match.

### 9.2 Historical compatibility

- Preserve original timestamps and original score values.
- Preserve `payloadVersion`/payload version information.
- Preserve legacy sessions and demo labels.
- If the database schema or metric names change, write a migration/normalisation layer rather than silently changing historical field meanings.
- Ensure the historical report can display both migrated legacy snapshots and new Supabase snapshots.
- Do not drop SQLite or old REST code until the migration is verified and the new teacher reports work end-to-end.

### 9.3 Payload versioning

The existing student payload has `payloadVersion: '1.0'` and an `aggregates` object. Keep the meaning of existing fields stable. If the transport wrapper changes, version it deliberately and provide an adapter so teacher charts/reporting do not break.

Document every field written to PostgreSQL. Avoid using ambiguous field names or mixing milliseconds and seconds. Store timestamps as PostgreSQL `timestamptz` in UTC.

---

## 10. Security, privacy and production configuration

Mandatory requirements:
- HTTPS for all website traffic and secure Supabase connections; Realtime must use WSS.
- Supabase publishable key only in browser/extension code; secret/service-role keys must stay server-side and must not be required by this architecture's normal client flow.
- RLS enabled and tested on every client-accessible table.
- Private Realtime channels with membership/ownership authorisation.
- Secure, non-guessable session IDs and cryptographically random join codes.
- Rate limits/abuse protection for anonymous sign-in, join-code attempts and telemetry submission.
- Input validation on names, codes and metric payloads. Limit strings, packet sizes and numeric ranges.
- Do not trust `studentName`, `studentId`, `teacherId`, `sessionId` or role values supplied by a client without validating their relationship to `auth.uid()`.
- No credentials or Supabase secret values in Git. Add `.env.example` with placeholder names only.
- Avoid wildcard RLS policies such as `USING (true)` for session or telemetry tables.
- Log security/connection errors without logging raw video, auth tokens, complete sensitive payloads or unnecessary student details.
- Define a basic retention/deletion approach for snapshots before real student deployment. Do not leave retention unlimited by accident; document the current configured retention and how it can be changed.
- Provide a privacy page that accurately describes actual behavior. Do not claim legal compliance/certification unless independently established.

Expected frontend configuration (adapt to the actual framework):

```env
# Public client configuration; safe to expose only because RLS protects all data.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

For a Vite frontend, use the appropriate `VITE_` prefix instead. Do not include a secret key in any `NEXT_PUBLIC_` or `VITE_` variable.

---

## 11. Extension beta distribution and website download

The Chrome Web Store review is not assumed to be complete for the first beta.

### 11.1 Initial beta distribution

- Provide a downloadable ZIP containing the built, unpacked extension files.
- The ZIP must contain a single root extension folder with `manifest.json` at its root after extraction (or make the archive layout instructions unambiguous).
- Add a website page with clear manual installation instructions:
  1. Download the SessionSignal beta ZIP.
  2. Extract it to a permanent folder.
  3. Open `chrome://extensions` in Chrome.
  4. Enable Developer Mode.
  5. Click Load unpacked.
  6. Select the extracted folder containing `manifest.json`.
  7. Pin SessionSignal to the toolbar and open Side Panel or New Tab.
- Explain that some college/company-managed computers may block Developer Mode or unpacked extensions.
- Explain that unpacked beta updates may require downloading/replacing the folder and reloading the extension.
- Do not claim this is equivalent to the normal Chrome Web Store installation/update experience.
- Do not create an automatic installer or ask students to run shell scripts.

### 11.2 Build/release artifact

- Add a deterministic extension build/package command.
- Generate the ZIP from the built extension output, not by zipping the whole source repository or `node_modules`.
- Include a version number and release notes.
- Optionally provide a SHA-256 checksum for verifying the ZIP.
- Store or publish the actual built artifact in the website's static downloads location/release storage.
- Do not show a working Download button pointing to a missing ZIP. If no beta build exists yet, show a clear “Beta package is being prepared” state.

### 11.3 Future Chrome Web Store path

Keep the extension structured and permission-minimal so it can later be submitted to the Chrome Web Store. Do not build around a permanently sideloaded-only assumption. A Web Store release/unlisted listing is a future distribution phase, not a dependency for the initial beta.

---

## 12. Suggested repository organization

Do not force this exact tree if the current repo has a sounder structure. Keep responsibilities clear and avoid duplicating applications unnecessarily.

```text
SessionSignal/
├── apps/
│   ├── web/                       # public website + protected teacher portal
│   │   ├── public/
│   │   └── src/
│   │       ├── marketing/         # homepage/features/how-it-works/install/privacy
│   │       ├── auth/               # teacher auth and route protection
│   │       ├── teacher/            # existing teacher dashboard and analytics
│   │       ├── components/
│   │       └── lib/supabase/
│   │
│   └── extension/                 # Manifest V3 student extension
│       ├── manifest.json
│       ├── service-worker.js
│       ├── popup/
│       ├── sidepanel/
│       ├── student-tab/
│       └── src/
│           ├── camera/
│           ├── analytics/
│           ├── session/
│           ├── transport/
│           └── components/
│
├── supabase/
│   ├── config.toml                # if using Supabase CLI
│   ├── migrations/
│   └── seed.sql                   # development-only safe seed data
│
├── scripts/
│   ├── migrate-sqlite-to-supabase.*
│   └── package-extension.*
│
├── docs/
├── about_this_project.md
├── new_idea_implementation.md
├── .env.example
└── package.json
```

If the project is plain HTML/CSS/JS and migration to a large framework would add unnecessary risk, use a lightweight structure consistent with the existing tooling. Do not introduce Next.js, React, a monorepo tool or multiple build systems merely for fashion. Choose one coherent web build approach and document why.

---

## 13. Deployment configuration

### 13.1 Vercel/frontend host

- Connect the repository to Vercel (or the selected frontend host).
- Configure the correct application root/build command/output directory.
- Add only the public Supabase URL and publishable key as frontend environment variables.
- Configure production and preview environment variables separately.
- Ensure protected teacher routes work on refresh/deep links.
- Ensure extension ZIP download paths are served correctly.
- Do not attempt to host a persistent Socket.IO/Express server as part of this design.

### 13.2 Supabase

- Create the project and record project URL/publishable key in the deployment environment.
- Apply versioned SQL migrations.
- Enable/configure anonymous Auth for the student extension if using the specified anonymous identity approach.
- Configure teacher account provisioning.
- Enable private Realtime channels and apply `realtime.messages` RLS policies.
- Verify table RLS policies using separate teacher, student anonymous and unauthenticated test identities.
- Configure backup/retention and monitor database size, egress, Realtime connections and message usage.
- Do not assume a free plan will remain suitable indefinitely. Verify the current plan limits and inactivity/pausing behavior before relying on it for a class that must run at a fixed time.

### 13.3 Local development

Provide an `.env.example` and clear setup guide. Developers should be able to run the website and load the unpacked extension locally while connecting to a dedicated development Supabase project or a local Supabase stack.

- Keep development/test data separate from production.
- Do not commit real keys or production student records.
- Keep a clearly labelled mock/demo mode for local UI tests if useful.
- Document how to run database migrations and seed only synthetic test records.

---

## 14. Testing requirements and acceptance criteria

Do not consider the implementation complete merely because the pages render. Verify the entire teacher/student workflow.

### 14.1 Public website
- Homepage and all required public routes load and are responsive.
- Navigation, CTAs, teacher login and student install links work.
- No broken links, placeholder sections, fake testimonials or fake metrics.
- Privacy explanation matches the network behavior of the actual implementation.
- Accessibility basics: keyboard navigation, focus state, semantic headings, form labels, adequate contrast and reduced-motion support.

### 14.2 Teacher authentication/authorization
- Teacher can sign in and sign out.
- Unauthenticated users cannot open protected teacher routes/data.
- Teacher A cannot query, view, end or export Teacher B's sessions or snapshots.
- A browser user cannot promote themselves to teacher by editing local storage, request bodies or user metadata.

### 14.3 Student extension
- Extension loads as unpacked in Chrome.
- Launcher offers both Side Panel and New Tab.
- Both modes render the same student interface and session state.
- Student can enter a display name and valid session code.
- Invalid/ended session codes are rejected with a useful message.
- Camera permission is requested only after explicit user action.
- Camera analysis works locally and the UI clearly shows it is active.
- Denying camera permission prevents camera-based monitoring and does not produce a fake score.
- Stopping monitoring releases the camera tracks and stops processing.
- Closing the active document does not leave a false active status in the teacher portal.
- Opening both modes does not create duplicate camera loops or duplicate telemetry.

### 14.4 Local-media privacy test (critical)
Use Chrome DevTools/network inspection while monitoring:
- Confirm no webcam frames, images, screenshots, audio or video are sent in any request/WebSocket message.
- Confirm only numerical aggregates, identifiers, timestamps, display name and necessary status/event metadata are transmitted.
- Confirm no raw media is stored in extension storage, localStorage, IndexedDB or logs.
- Confirm the Supabase database contains only the permitted telemetry and session metadata.

### 14.5 Cross-location live communication test
Test with the teacher and at least two student clients on separate computers and different internet connections (not only one localhost machine):
1. Teacher signs in and starts a session.
2. Students install the beta extension and join with the code.
3. Teacher sees students join.
4. Student metrics arrive about every five seconds.
5. Teacher cards/charts/class summary update from Realtime events.
6. Snapshots are persisted and visible in historical analytics after session end.
7. Temporarily disconnect a student network; confirm reconnect/retry and deduplication.
8. Refresh the teacher page; confirm the session state is recovered from Supabase.
9. End the session; confirm students stop monitoring and cannot submit new snapshots.

### 14.6 Performance and data behavior
- Do not transmit per-frame data.
- Confirm one aggregated snapshot per active student per configured interval (default five seconds), not duplicate writes caused by multiple app views.
- Confirm one student's reconnect does not duplicate participant records or snapshots.
- Confirm stale student statuses are visible.
- Confirm snapshots can be queried efficiently by session and participant.
- Test a realistic small pilot class size chosen by the project owner; record observed Supabase Realtime/database usage.

### 14.7 Historical data
- Compare pre-migration and post-migration row counts.
- Compare representative historical session summaries, attention charts and per-student reports.
- Confirm CSV export and print reports still work.
- Confirm legacy/demo records remain labelled and are not counted as real class sessions.
- Keep the SQLite backup until verification passes.

### 14.8 Security tests
- Anonymous student cannot query another student's snapshots.
- Anonymous student cannot read another teacher's session.
- Student cannot end a session.
- Student cannot write to a different participant ID/session ID.
- Student cannot insert after session end.
- Non-owner teacher cannot subscribe to another teacher's private Realtime topic.
- Unauthenticated/public visitor cannot subscribe to private teacher data.
- Client bundle contains no Supabase secret/service-role key.

---

## 15. Remove/retire old code carefully

The old architecture includes `apps/api` (Express, Socket.IO, SQLite), `apps/student` (standalone student web pages), and `apps/hub` (old hub/control page). These are migration candidates, not files to delete immediately.

After the replacement is running and all tests pass:
- Replace the old hub page with the new public website.
- Move/reuse the current student dashboard/monitoring code in `apps/extension`.
- Replace the teacher Socket.IO adapter with a Supabase Realtime adapter while retaining the teacher dashboard UI and analytics functionality.
- Replace old SQLite REST queries with secure Supabase queries/RPCs.
- Remove obsolete Express/Socket.IO server startup scripts and dependencies only if no remaining tool/test uses them.
- Remove old student website entry points from production routing after the extension is complete.
- Retain migration scripts and a protected backup/export of old SQLite data.
- Retain or adapt demo/testing tools as development-only functionality.
- Remove hard-coded localhost URLs and inconsistent legacy storage keys.
- Remove duplicate or unused code only after confirming that no retained feature depends on it.

Do not delete `faceAnalyzer.js`, `dataCollector.js`, teacher chart modules, historical analytics or existing scoring logic simply because the transport layer is changing.

---

## 16. Explicitly out of scope for this release

Do **not** implement these in this task:
- Camera-free participation mode.
- Monitoring through keyboard/mouse activity, tab focus, page content or meeting DOM.
- Reading/capturing Google Meet, Zoom or Teams video/audio.
- Hosting meetings/classes inside SessionSignal.
- AI chatbot or LLM-generated student judgements.
- Automated grading, disciplinary decisions or verified attendance claims based on attention scores.
- Class scheduling/calendar integration.
- QR-code joining.
- Institutional multi-tenant administration.
- Student-facing historical analytics portal separate from the extension's current dashboard.
- Roster import or LMS integrations.
- Multiple extension browsers (Firefox/Edge) in the first release.
- A custom always-on Node.js/Socket.IO server.

Keep the code reasonably modular so these may be added later, but do not spend time building them now.

---

## 17. Recommended implementation order

Implement in this order to reduce breakage and make each stage testable.

### Phase 0 — Audit and baseline
- Inspect the source repository and run the current system.
- Record all existing features, event contracts and database fields.
- Capture screenshots or notes for the current teacher/student experience.
- Back up SQLite.
- Create the migration checklist and identify the current build framework.

### Phase 1 — Supabase foundation
- Set up Supabase configuration and versioned migrations.
- Create profiles/roles, sessions, participants and snapshot schema.
- Implement Auth and safe teacher account provisioning.
- Implement anonymous student auth.
- Implement secure create/join/end session RPC functions.
- Implement and test RLS and private Realtime authorization.
- Implement snapshot persistence and trigger-based Broadcast.

### Phase 2 — Data and historical migration
- Create the idempotent SQLite export/import migration.
- Map legacy session ownership using an explicit setup parameter.
- Validate row counts and historical analytics.
- Keep the original database backup.

### Phase 3 — Teacher portal backend adapter
- Replace Socket.IO and old REST data dependencies with Supabase data access and Realtime subscriptions.
- Preserve the existing teacher layout, student grid, charts, alerts, recommendations and analytics.
- Add subscription reconnect and database rehydration.
- Add protected routes and teacher ownership checks.

### Phase 4 — Student extension
- Create Manifest V3 extension launcher.
- Implement Side Panel and New Tab routes sharing the same application.
- Port/reuse the current student join and monitoring interfaces.
- Reuse MediaPipe, FaceAnalyzer and DataCollector.
- Replace Socket.IO transport with Supabase Auth + snapshot insert + retry + Realtime lifecycle handling.
- Verify local video-only processing and numerical-only network payloads.

### Phase 5 — Public website redesign
- Rewrite the current hub as the new public SessionSignal website.
- Implement product/feature/how-it-works/teacher/student-install/privacy/contact pages.
- Integrate teacher login and protected portal navigation.
- Add real product screenshots/previews and accurate privacy explanation.
- Add the beta extension installation guide and package download path.

### Phase 6 — Deployment and end-to-end validation
- Deploy website/teacher frontend to Vercel.
- Configure production Supabase Auth, schema, RLS and Realtime.
- Build/package extension beta ZIP.
- Run separate-network teacher/student test.
- Run privacy, RLS, migration, performance and regression tests.
- Update README and deployment documentation.

### Phase 7 — Cleanup
- Remove only the old paths/dependencies proven obsolete.
- Verify no old localhost/Socket.IO/SQLite dependency remains in the production path.
- Keep data backup and migration tooling.
- Confirm `npm`/build scripts are understandable and repeatable.

---

## 18. Required final deliverables from Codex

At completion, provide:
1. Rewritten official SessionSignal public website.
2. Working teacher login and protected teacher portal.
3. Existing teacher dashboard and historical analytics preserved and connected to Supabase.
4. Student Chrome extension with Side Panel and New Tab options.
5. Existing student monitoring and attention analysis preserved in the extension.
6. Supabase schema migrations, RLS policies, RPC functions and Realtime configuration/migration SQL committed in the repository.
7. SQLite-to-Supabase migration script and a verification report/checklist.
8. Repeatable extension build and beta ZIP packaging command.
9. Student Developer Mode installation guide on the public website.
10. `.env.example` with placeholders and no secrets.
11. Updated README with local development, Supabase setup, deployment, extension install and test instructions.
12. Automated tests for the most important scoring, session, permission, data-access and Realtime behaviors, plus a documented manual end-to-end test.
13. A cleanup report listing old files/dependencies removed and why; list any old files intentionally retained.
14. A short summary of any incomplete items or deployment steps that require the project owner's credentials/actions.

Do not claim that Vercel or Supabase has been deployed/configured unless the required credentials and deployment access were actually available and the deployment was verified.

---

## 19. Definition of done

SessionSignal is ready for its first controlled beta only when all of the following are true:

- A visitor sees a polished official SessionSignal website rather than the old hub page.
- A teacher can sign in and access the complete existing teacher portal.
- A teacher can start a session and receive a session code.
- A student can install the unpacked beta extension, choose Side Panel or New Tab, enter their name/code and start camera-based monitoring.
- The camera frames are processed locally and never leave the student's device.
- Only aggregated numerical telemetry and required metadata are sent to Supabase.
- A teacher on a different internet connection receives live updates approximately every five seconds.
- The snapshots are stored and available for historical reports after the session.
- A teacher cannot see another teacher's sessions; a student cannot read another student's/private teacher data.
- If camera access is denied or the signal is unavailable, no fabricated attention score is produced.
- Ending the session stops student camera processing and rejects further telemetry.
- Historical SQLite records have been migrated or safely retained with a verified migration path.
- Existing teacher dashboard charts, alerts, recommendations, reports, print and CSV workflows still work.
- No custom always-running Node.js backend is required for normal production operation.

---

## 20. Official technical references

Use these official references while implementing and verify current API details rather than relying on old examples:

- Chrome Side Panel API: <https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- Chrome extension Manifest V3 service worker lifecycle: <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>
- Chrome extension service workers: <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers>
- Chrome extension distribution: <https://developer.chrome.com/docs/extensions/how-to/distribute>
- Chrome unpacked extension testing: <https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked>
- Supabase Auth anonymous sign-ins: <https://supabase.com/docs/guides/auth/auth-anonymous>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Realtime Broadcast: <https://supabase.com/docs/guides/realtime/broadcast>
- Supabase Realtime authorization: <https://supabase.com/docs/guides/realtime/authorization>
- Supabase database change subscriptions and Broadcast recommendation: <https://supabase.com/docs/guides/realtime/subscribing-to-database-changes>
- Supabase database functions/RPC: <https://supabase.com/docs/guides/database/functions>
- Supabase Edge Functions (not required for initial scope): <https://supabase.com/docs/guides/functions>
- Supabase platform billing/limits: <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Vercel deployment documentation: <https://vercel.com/docs/deployments/overview>

---

## Final instruction to Codex

Implement the product described in this document **inside the current SessionSignal codebase**. First inspect the repository, then make a staged migration. Preserve all useful existing teacher portal capabilities and the existing local attention-analysis behavior. Replace the old student website entry point with the Chrome extension, offering both Side Panel and New Tab modes. Replace the self-hosted Express/Socket.IO/SQLite production path with Supabase Auth, PostgreSQL, RLS and private Realtime Broadcast. Keep every webcam frame and all face/video processing local to the student computer; send only derived numerical aggregates and necessary session metadata.

Do not build the explicitly out-of-scope features. Do not throw away historical data or existing working functionality. Do not claim security, privacy, successful deployment or real-time delivery without tests. If the existing code contradicts this document, inspect the actual behavior, preserve user-facing functionality, and document the discrepancy before making a destructive change.
