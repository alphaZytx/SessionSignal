# ClassPulse Monorepo

Structured workspace for the Student Attention Monitoring System. It now bundles every deployable experience-API, Student portal, Teacher dashboard, and the new Control Hub-under a single cohesive layout that is ready for GitHub, Netlify, and Supabase.

## Directory Map

```
apps/
  api/        -> Node/Express realtime + REST API (SQLite today, Supabase-ready)
  student/    -> lightweight capture client served via Netlify or `/student`
  teacher/    -> analytics dashboard served via Netlify or `/teacher`
  hub/        -> central landing/login surface served via Netlify or `/`
.env.example  -> shared runtime + Supabase secrets template
netlify/      -> helper configs per Netlify site; root netlify.toml targets the hub
tools/        -> build helpers (copy static apps into dist/* for Netlify)
docs/         -> deployment notes and future migration guides
```

## Quick Start

```bash
cp .env.example .env        # add Supabase + deployment secrets
npm run setup               # installs API dependencies
npm run dev                 # API + Socket server on http://localhost:3000
```

- Hub: http://localhost:3000/
- Student Client: http://localhost:3000/student
- Teacher Dashboard: http://localhost:3000/teacher

Use `npm run start` for a production-style boot without the Node watcher once you're ready to mirror your Netlify deployment locally.

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `3000`) |
| `CORS_ALLOWED_ORIGINS` | Comma-delimited list for Netlify/Supabase domains |
| `SESSION_DATABASE_PATH` | Optional override for SQLite DB; defaults to `apps/api/data/sessions.db` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_PROJECT_ID` | Provide once the Supabase project is provisioned |
| `HUB_TITLE`, `HUB_SUPPORT_EMAIL` | Optional Control Hub branding |

Fill them in `.env` for local dev and mirror them in Netlify + Supabase dashboards.

## Netlify Deployment

1. **Control Hub (default)** - connect the repo, keep `netlify.toml` as-is (build `hub`, publish `dist/hub`).
2. **Teacher Dashboard / Student Client** - either:
   - create dedicated branches (`teacher`, `student`) so their contexts in `netlify.toml` kick in, or
   - create two more Netlify sites and copy the commands from `netlify/teacher.toml` and `netlify/student.toml`.
3. Inject `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `VITE_API_URL` (or similar) per site so the browsers can call the hosted API.

Run `npm run build:web` locally if you want to inspect the generated `dist/` artifacts before uploading.

## Supabase Readiness

- `.env.example` already contains every Supabase credential required by the API and Hub.
- `apps/api/db/database.js` now respects `SESSION_DATABASE_PATH`, so you can swap SQLite for Supabase by pointing the API to a cloud-hosted file or by gradually migrating tables.
- Future Supabase Auth wiring for the Control Hub can live inside `apps/hub/js/main.js` once keys are issued.

## Health Check & Monitoring

- `/api/health` - lightweight endpoint used by the Hub to verify uptime.
- The Hub status widget pings `/api/health`, `/teacher`, and `/student` so you can quickly verify deployments after each push.

## Next Steps

1. Hook Supabase Auth and storage into `apps/hub`.
2. Gradually migrate SQLite persistence to Supabase tables (see `docs/DEPLOYMENT.md`).
3. Add CI (GitHub Actions) for linting and automated Netlify builds once workflows are defined.
