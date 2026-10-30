# SessionSignal Supabase + Extension Migration Checklist

Status legend: `[ ]` pending, `[~]` in progress, `[x]` complete, `[!]` requires owner credentials or external/manual verification.

## Phase 0 — audit and baseline

- [x] Read `new_idea_implementation.md` completely (1,037 lines).
- [x] Read `about_this_project.md` and inventory all repository files.
- [x] Confirm existing architecture: plain HTML/CSS/ES modules, Express, Socket.IO, SQLite; no React/Next/Vite frontend.
- [x] Start existing system with `npm run dev` and verify `/`, `/teacher/`, `/student/`, `/api/health`, and `/api/sessions` respond.
- [x] Inspect existing screenshots for hub, teacher dashboard, student join, and student monitoring.
- [x] Trace student frame analysis → five-second collector → Socket.IO → SQLite → teacher charts/analytics.
- [x] Search for localhost, Socket.IO, REST, SQLite, browser-storage, CDN, and DOM dependencies.
- [x] Record pre-migration SQLite counts: 9 sessions, 3 students, 279 snapshots.
- [x] Create consistent SQLite backup: `apps/api/data/sessions.pre-supabase-migration-20261030.db` (ignored from Git; integrity `ok`; counts match).
- [x] Verify current official Chrome Side Panel, Supabase anonymous auth, private Broadcast, and Realtime authorization APIs.

### Existing functions that must survive

- [x] Teacher: create/end/resume active session and six-character code.
- [x] Teacher: live participant cards, status, detailed table, class summary.
- [x] Teacher: attention, emotion, gaze, blink, head-pose, drowsiness charts.
- [x] Teacher: live alerts and rule-based recommendations.
- [x] Analytics: session metadata/list, snapshot history, summary, heatmap, comparisons, per-student reports, print, CSV.
- [x] Student: name/code join, explicit camera flow, local Face Mesh analysis, local metrics dashboard, stop control.
- [x] Student: unchanged observable-frame score formula and categories.
- [x] Student: five-second aggregation, bounded retry, honest offline/ended/unavailable states.
- [x] Development-only synthetic dashboard demo, clearly isolated from production records.

### Baseline discrepancies/defects found

- Teacher pages and all historical REST endpoints have no authentication/ownership checks.
- Active session recovery depends on the Node process's in-memory `sessionStore`.
- Six-character code generation uses `Math.random()` and does not collision-check before insert.
- Dashboard, analytics, and student monitoring hard-code `http://localhost:3000`.
- Hub and student page use inconsistent local-storage keys.
- Student invalid-code server event (`session:error`) does not match the join Promise's `error` listener.
- Camera starts even when session join fails; target behavior requires validating first and explicit consent/start.
- Missing face currently becomes attention zero; target behavior requires `unavailable`, not fabricated disengagement.
- Face confidence is fabricated as `0.99`; target requires null/not available.
- Homepage shows unsupported/fake usage statistics and an admin demo login.
- Analytics duplicates each student tab button and has several loose legacy field assumptions.
- Current UI loads runtime dependencies from CDNs; the extension must package all executable dependencies locally.
- No automated tests, database migrations, RLS, input schema validation, or retention policy exist.

## Phase 1 — Supabase foundation

- [x] Add public client configuration and safe `.env.example`.
- [x] Add versioned SQL schema for trusted profiles, sessions, participants, snapshots, indexes, constraints, and retention metadata.
- [x] Add secure teacher provisioning procedure.
- [x] Add RPCs for create, join/reconnect, snapshot submission, participant stop, and end session.
- [x] Add RLS for teacher ownership, student participant ownership, and no public table access.
- [x] Add private Realtime authorization for teacher and participant session topics.
- [x] Add database-triggered minimal numerical snapshot and lifecycle broadcasts.
- [x] Add SQL/security static tests and manual two-identity RLS test guide.

## Phase 2 — historical data migration

- [x] Add idempotent SQLite export/import script requiring explicit legacy teacher UUID.
- [x] Preserve timestamps, values, payload version, legacy/demo labels, and deterministic IDs.
- [x] Add dry-run and post-import verification reports/count checks.
- [x] Keep SQLite source and backup until external Supabase verification passes.

## Phase 3 — teacher portal

- [x] Add teacher login/sign-out and route guard using Supabase Auth/trusted profile.
- [x] Replace Socket.IO adapter with Supabase RPC/query/private-Broadcast adapter.
- [x] Rehydrate active session and latest participant snapshots from PostgreSQL.
- [x] Preserve all existing live dashboard charts/cards/table/alerts/recommendations.
- [x] Repoint historical analytics to Supabase and retain print/CSV behavior.
- [x] Add historical session list.
- [x] Add stale/disconnected and Realtime reconnect states.

## Phase 4 — Chrome extension

- [x] Add MV3 manifest with only `sidePanel` and `storage` permissions and Chrome 116 minimum for programmatic `sidePanel.open()`.
- [x] Add launcher with user-clicked Side Panel and New Tab choices.
- [x] Share one student application and analysis/collector implementation between both modes.
- [x] Package Supabase, Chart.js, and MediaPipe executable assets locally.
- [x] Add anonymous auth, join RPC, session status subscription, snapshot RPC, bounded idempotent retry queue.
- [x] Add one active monitoring lease per extension profile to prevent duplicate loops.
- [x] Validate session before camera request; show privacy/consent review before explicit start.
- [x] Stop camera/tracks/processing/timers on stop, end, unload, and fatal error.
- [x] Represent no observable face as unavailable and remove fabricated face confidence.
- [x] Preserve existing local metrics and scoring for observable frames.

## Phase 5 — public website

- [x] Build professional responsive homepage without fake metrics/testimonials.
- [x] Add `/features`, `/how-it-works`, `/teachers`, `/teachers/login`, `/students`, `/students/install`, `/privacy`, `/contact`.
- [x] Use accurate local-processing and numerical-telemetry language.
- [x] Add real product preview/screenshot content and extension mode explanations.
- [x] Add accessible navigation/forms/focus/reduced-motion behavior.
- [x] Add working beta ZIP download only after build artifact exists.

## Phase 6 — packaging, tests, and documentation

- [x] Add repeatable web build and local preview commands.
- [x] Add deterministic extension build/package ZIP, version, release notes, and checksum.
- [x] Add automated tests for scoring/aggregation, payload privacy/validation, queue/lease behavior, and route/build integrity.
- [x] Run syntax, unit, build, link, migration dry-run, secret scan, and production-path dependency scans.
- [x] Add manual Chrome, camera privacy, RLS, cross-location, performance, and regression test guide.
- [x] Update README with Supabase, local dev, Vercel, teacher provisioning, extension, migration, and tests.
- [!] Apply migrations/configure Auth/Realtime on an owner-created Supabase project.
- [!] Configure/deploy Vercel project and production/preview environment variables.
- [!] Run real multi-device/cross-network, camera concurrency, and DevTools raw-media inspection tests.

## Phase 7 — safe cleanup

- [x] Confirm new production path no longer depends on localhost, Socket.IO, Express, or SQLite.
- [!] Retire old hub/student entry points after owner acceptance; currently retained as non-production rollback/reference paths.
- [x] Retain legacy API/SQLite code only where required for migration/reference, clearly marked non-production.
- [x] Record every deleted and intentionally retained legacy file/dependency.
