# Netlify Configurations

- `netlify.toml` ? default hub build (main branch)
- `netlify/student.toml` ? use when wiring the Student portal to its own Netlify site
- `netlify/teacher.toml` ? use when wiring the Teacher dashboard

Each build simply copies the static folder into `dist/<app>` via `npm run build:<app>`. Once you link a Netlify site, set the **Base directory** to the repo root, keep the build command in sync, and set **Publish directory** to the matching `dist` path.
