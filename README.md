# SessionSignal

[![Verify SessionSignal](https://github.com/alphaZytx/SessionSignal/actions/workflows/ci.yml/badge.svg)](https://github.com/alphaZytx/SessionSignal/actions/workflows/ci.yml)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FalphaZytx%2FSessionSignal&env=VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY,EXTENSION_SUPABASE_URL,EXTENSION_SUPABASE_PUBLISHABLE_KEY&project-name=sessionsignal&repository-name=SessionSignal)

SessionSignal is a local-first participation-indicator companion for live classes, workshops, training, coaching, and other online sessions. Facilitators use an authenticated web portal; participants use a Chrome Manifest V3 extension beside Google Meet, Zoom, Teams, or another session website.

Webcam frames are processed locally in the active extension document. SessionSignal sends only derived five-second numerical telemetry, identifiers, timestamps, status, and the participant's chosen display name. It does not upload raw frames, images, video, screenshots, face crops, embeddings, or audio.

SessionSignal outputs are heuristic estimates—not verified measurements of attention, learning, emotion, intent, attendance, or mental state. They must not be used as the sole basis for grades, discipline, or other high-stakes decisions.

## Product architecture

```text
Public website + authenticated facilitator portal (Vite/Vercel)
                         │
                         ├── Supabase Auth (provisioned facilitators)
                         ├── PostgreSQL + RLS (sessions and history)
                         └── private Realtime Broadcast (live updates)
                         │
Chrome extension ────────┘
  Side Panel or New Tab
  anonymous Supabase identity
  local MediaPipe analysis
  five-second numerical aggregation
```

Normal production operation does not require the legacy Express/Socket.IO server.

## Repository

```text
apps/web/          public product pages, teacher login, shared web libraries
apps/teacher/      preserved live dashboard, charts, grid, and historical reports
apps/extension/    Chrome MV3 launcher and shared student application
apps/student/      retained attention engine/collector source used by extension build
apps/api/          retained legacy SQLite server for migration verification only
supabase/          versioned schema, functions, RLS, and Realtime authorization
scripts/           extension packaging, migration, and production scans
tests/             scoring, privacy/security contract, and build integrity tests
```

See `new_idea_implementation.md` for the product specification and `IMPLEMENTATION_CHECKLIST.md` for migration status.

## Prerequisites

- Node.js 20.19 or newer
- npm
- Google Chrome 116+ for programmatic Side Panel opening
- A development Supabase project or local Supabase stack

## Local web development

```bash
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Open `http://127.0.0.1:5173/`. Canonical routes include `/features`, `/facilitators/login`, `/facilitator`, `/facilitator/sessions`, `/participants/install`, and `/privacy`. The previous teacher/student URLs permanently redirect in production and remain local compatibility aliases.

Facilitator routes redirect to `/facilitators/login` unless Supabase Auth has a valid user whose trusted database role is `teacher`. The internal role name is intentionally retained for existing-data compatibility.

## Supabase setup

1. Create a development project (keep production separate).
2. Copy the project URL and publishable key into `.env.local`.
3. Apply every file in `supabase/migrations/` in filename order, including the foundation and SessionSignal reliability migration.
4. Enable Anonymous Sign-Ins for the student extension.
5. Configure CAPTCHA/Turnstile and review Auth rate limits before public use.
6. Disable public Realtime channels if the project is dedicated to SessionSignal; SessionSignal subscriptions are private.
7. Create the teacher Auth user through a trusted dashboard/admin process and provision the matching profile using `scripts/provision-teacher.sql`.
8. Verify RLS and private-topic access with separate teacher A, teacher B, anonymous student, and unauthenticated clients.
9. Verify the daily `sessionsignal-daily-retention-cleanup` Supabase Cron run. New sessions default to a 180-day retention date.

Detailed owner steps are in `docs/SUPABASE_SETUP.md`. Never expose `sb_secret_...` or a legacy service-role key in browser code, extension files, Vercel public variables, or Git.

## Chrome extension

Build the unpacked extension:

```bash
npm run build:extension
```

The output is `dist/extension/`. Load that folder using `chrome://extensions` → Developer mode → Load unpacked.

Package a deterministic beta release:

```bash
npm run package:extension
```

This creates:

- `apps/web/public/downloads/sessionsignal-extension-beta-0.3.0.zip`
- stable download alias `sessionsignal-extension-beta.zip`
- SHA-256 checksum
- release notes

The ZIP extracts into one versioned folder named `SessionSignal Beta <version>`. Participants can open `START_HERE.html` for a three-step guide, then select that entire folder in Chrome's **Load unpacked** dialog. They never need to understand the internal files. The build copies the existing `faceAnalyzer.js` and `dataCollector.js` into one shared extension application; Side Panel and New Tab do not have separate monitoring engines.

The extension build reads `EXTENSION_SUPABASE_URL` and `EXTENSION_SUPABASE_PUBLISHABLE_KEY` (falling back to the `VITE_` equivalents). Placeholder configuration shows a setup error and cannot join a class; it never falls back to a mock backend.

## Build and tests

```bash
npm test
npm run build
npm run scan:production
npm run check
```

`npm run build` packages the extension first so the website download is never a missing link, then builds all public and teacher routes into `dist/web/`.

Automated coverage currently checks:

- observable scoring aggregation and unavailable-signal semantics;
- absence of raw-media fields in telemetry transport;
- minimal extension permissions and locally packaged scripts;
- RLS/ownership/session-end requirements in the migration;
- production teacher source no longer calling localhost REST or Socket.IO;
- required page/route entry points.

Camera, Chrome lifecycle, real Supabase RLS, Realtime delivery, and cross-network behavior require the manual matrix in `docs/MANUAL_TEST_PLAN.md`.

## Historical SQLite migration

The original SQLite database remains at `apps/api/data/sessions.db` and is ignored by Git. A consistent pre-migration backup was made as `sessions.pre-supabase-migration-20261030.db`.

Dry run:

```bash
npm run migrate:sqlite -- --dry-run
```

Apply only after provisioning the explicit owner teacher UUID and setting server-only migration credentials:

```bash
SUPABASE_URL=... \
SUPABASE_SECRET_KEY=sb_secret_... \
LEGACY_TEACHER_ID=<provisioned-teacher-uuid> \
npm run migrate:sqlite -- --apply
```

The importer opens SQLite read-only, uses deterministic destination IDs for idempotent reruns, preserves metric/timestamp values, labels legacy/demo records, and reports source/destination counts. Never use the secret key in frontend or extension configuration.

See `docs/MIGRATION_VERIFICATION.md` before removing any legacy database path.

## Vercel deployment

`vercel.json` sets the build/output configuration and rewrites all public and teacher routes. Configure only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- optional `VITE_SUPPORT_EMAIL`
- the matching `EXTENSION_` public values for the beta build

Configure preview and production values separately. Do not configure a secret key as a `VITE_` or `EXTENSION_` variable.

This repository has not been deployed from this environment; deployment requires the project owner's Supabase and Vercel access.

For the shortest owner-only checklist, follow [`docs/GO_LIVE.md`](docs/GO_LIVE.md). Production builds validate that the website and extension use the same real Supabase project and reject placeholders, mismatched keys, or server secrets. After deployment, run `npm run smoke:live -- https://YOUR_DEPLOYMENT.vercel.app`.

## Legacy local server

The old server is intentionally retained until Supabase data import and representative reports are verified:

```bash
npm run legacy:setup
npm run legacy:dev
```

It is not part of the production build or normal MVP architecture. Its unauthenticated endpoints and in-memory active-session state are unsuitable for production.

## More documentation

- `docs/SUPABASE_SETUP.md` — migrations, Auth, teacher provisioning, Realtime, retention
- `docs/MANUAL_TEST_PLAN.md` — required browser, privacy, RLS, and cross-location validation
- `docs/MIGRATION_VERIFICATION.md` — SQLite counts, import, and report comparison
- `docs/CLEANUP_REPORT.md` — retired and intentionally retained legacy files
- `docs/GO_LIVE.md` — minimum owner actions for final Supabase and Vercel deployment
- `about_this_project.md` — current architecture and future-change handoff
