# SessionSignal go-live: minimum owner work

Everything that can be validated without access to the owner's hosted accounts is automated. The remaining steps require account ownership, generated credentials, or real devices.

## 1. Create the production Supabase project

1. Create a Supabase project and save its database password in a password manager.
2. In **Project Settings → API Keys**, copy the project URL and `sb_publishable_...` key. Never use an `sb_secret_...` key in Vercel or the extension.
3. Run:

   ```bash
   npx supabase@latest login
   npx supabase@latest link
   npx supabase@latest db push
   ```

4. In **Authentication → Providers**, keep email/password enabled and enable Anonymous Sign-Ins.
5. Configure Cloudflare Turnstile or invisible CAPTCHA before sharing the extension publicly. Anonymous users create database records, so this is an abuse-control requirement.
6. In Realtime settings, use private channels. SessionSignal already supplies the required topic authorization policies.

Do not make later schema edits directly in the remote Table or SQL editor. Add a migration file and run `db push`, so deployment history remains consistent.

## 2. Create the first facilitator

1. Create a permanent email/password user in **Authentication → Users**.
2. Copy that user's UUID.
3. Open `scripts/provision-teacher.sql`, replace the UUID and display name, then run it once in Supabase SQL Editor as the project owner.
4. Confirm the resulting `public.profiles` row has `role = 'teacher'`. The internal role name is retained for database compatibility; the product displays “facilitator.”

## 3. Deploy the website with Vercel

Import `alphaZytx/SessionSignal` from the Vercel **New Project** screen. The repository already defines its build command, output directory, redirects, routes, and security headers.

Add these four values to both **Production** and **Preview** environments:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
EXTENSION_SUPABASE_URL
EXTENSION_SUPABASE_PUBLISHABLE_KEY
```

Use the same project URL and publishable key for each matching `VITE_`/`EXTENSION_` pair. The production build deliberately fails if values are missing, placeholders, secrets, or mismatched. Optionally set `VITE_SUPPORT_EMAIL`.

After deployment, run:

```bash
npm run smoke:live -- https://YOUR_DEPLOYMENT.vercel.app
```

## 4. Complete one acceptance run

Use one facilitator browser and two Chrome profiles or computers with the unpacked extension:

1. Sign in, start a session, and copy the code.
2. Join from both participant extensions and explicitly start camera analysis.
3. Confirm live cards update, refresh recovery works, stopping releases the camera, and ending the session stops later telemetry.
4. Open the historical report and export one CSV.
5. Inspect extension Network and Storage once to confirm only numerical summaries are transmitted and queued.

Record the result in `docs/MANUAL_TEST_PLAN.md`. Real-camera, deployed RLS, and cross-network behavior cannot be truthfully certified by a source-only test.

## 5. Before a larger or institutional rollout

- Choose and document a retention period; schedule `public.delete_expired_sessionsignal_data()` accordingly.
- Configure backups and usage/budget alerts.
- Publish the real support contact and privacy/controller details.
- Obtain organizational consent and legal/privacy review appropriate to participants, region, disability/accessibility needs, and age group.
- Complete name/domain/trademark clearance for “SessionSignal.”
- Publish through the Chrome Web Store to replace Developer Mode installation when distributing beyond a controlled beta.
