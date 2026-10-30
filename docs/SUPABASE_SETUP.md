# Supabase owner setup

These actions require the SessionSignal project owner. They cannot be completed safely with only public client credentials.

## 1. Create environments

Use separate Supabase projects for development and production. Copy only each project's URL and publishable key to the matching Vercel/extension build environment. Never put a secret key in `VITE_*`, `EXTENSION_*`, Git, browser JavaScript, or an extension archive.

## 2. Apply schema

Apply migrations in filename order, currently:

```text
supabase/migrations/202610300001_sessionsignal_foundation.sql
supabase/migrations/202610310001_sessionsignal_reliability.sql
```

The migrations create trusted profiles, owned sessions, participants, numerical snapshots, indexes, validation RPCs, RLS policies, private Realtime authorization, idempotent session starts, reconnect-safe join throttling, and terminal status protection.

## 3. Configure Auth

- Enable email/password (or the chosen permanent flow) for teachers.
- Enable Anonymous Sign-Ins for extension students.
- Configure CAPTCHA/Cloudflare Turnstile before public release.
- Review anonymous and sign-in rate limits.
- Do not expose teacher self-promotion or accept a role from browser metadata.

## 4. Provision a teacher

Create the permanent user through Supabase Auth administration. Copy its UUID into `scripts/provision-teacher.sql`, review the display name, and execute as database owner. The login page refuses accounts without the trusted `teacher` profile role.

## 5. Configure Realtime

SessionSignal uses private Broadcast topics:

- teacher: `sessionsignal:teacher-session:<session_uuid>`
- student lifecycle: `sessionsignal:student-session:<session_uuid>:<student_auth_uuid>`

The database sends snapshot and lifecycle events through `realtime.send`. Clients have no `realtime.messages` insert policy, so they cannot directly broadcast fabricated metrics. The select policy checks session ownership or exact participant membership.

For a dedicated project, disable public channels in Realtime settings. Confirm a client calls `supabase.realtime.setAuth()` before joining private channels.

## 6. Retention

New sessions receive `retention_until = now() + 180 days`. The managed migration schedules owner-only `public.delete_expired_sessionsignal_data()` daily at 02:15 UTC through Supabase Cron. Monitor the first completed run in **Integrations → Cron**; change the schedule or retention policy only through a reviewed migration.

## 7. Required RLS verification

Use distinct browser profiles/tokens for teacher A, teacher B, one anonymous participant in A's session, one unrelated anonymous user, and an unauthenticated visitor. Verify the matrix in `MANUAL_TEST_PLAN.md`. SQL definitions and static tests are not a substitute for testing deployed policies.

## 8. Operational configuration

- Configure database backups appropriate to the controlled beta.
- Monitor database size, Realtime messages/connections, and egress.
- Review current plan limits and inactivity behavior before a scheduled class.
- Keep development data separate from production.
