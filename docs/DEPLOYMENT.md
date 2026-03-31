# Deployment Playbook

## 1. GitHub Preparation
1. Copy `.env.example` - `.env` and populate Supabase + runtime values.
2. Run `npm install --prefix apps/api` locally so `package-lock.json` reflects the correct dependency tree.
3. Use conventional commits to capture structural changes before pushing.

## 2. Netlify (Static Apps)
- Control Hub (default): connect the repo and keep `netlify.toml` as-is. Netlify will run `npm run build:hub` and publish `dist/hub`.
- Teacher + Student: either
  - create dedicated branches (`teacher`, `student`) so the context blocks in `netlify.toml` kick in, or
  - create two extra Netlify sites that point to this repo and override the build command/publish directory using `netlify/teacher.toml` + `netlify/student.toml` for reference.
- Remember to add the following environment variables for each site so that Supabase values are available to browser code via your preferred injection method:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `VITE_API_URL` (or equivalent) pointing to the hosted API.

## 3. Supabase Backend
1. Create a Supabase project (free tier works for demos).
2. Generate API keys and place them inside `.env` and the Netlify dashboard.
3. Create the following tables/buckets when ready to migrate from SQLite:
   - `sessions`
   - `students`
   - `snapshots`
   - (optional) `organizations` for multi-tenant login from the Control Hub.
4. Set up Row Level Security and policies once the schema is finalized. The repo includes placeholders for these env vars so the API can switch from SQLite to Supabase later.

## 4. Supabase Auth for the Hub (Planned)
- The Control Hub is ready for Supabase Auth integration-wire the JS client to `SUPABASE_URL` + `SUPABASE_ANON_KEY` and gate access routes as soon as the product requirements land.

## 5. Local Development
```bash
npm install --prefix apps/api
npm run dev:api
# navigate to http://localhost:3000/hub for the aggregator view
```
