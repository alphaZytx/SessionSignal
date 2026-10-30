import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = process.cwd();

const buildRoutes = new Map([
  ['/', '/apps/web/index.html'],
  ['/features', '/apps/web/features/index.html'],
  ['/how-it-works', '/apps/web/how-it-works/index.html'],
  ['/facilitators', '/apps/web/teachers/index.html'],
  ['/facilitators/login', '/apps/web/teachers/login/index.html'],
  ['/participants', '/apps/web/students/index.html'],
  ['/participants/install', '/apps/web/students/install/index.html'],
  ['/privacy', '/apps/web/privacy/index.html'],
  ['/contact', '/apps/web/contact/index.html'],
  ['/facilitator', '/apps/teacher/index.html'],
  ['/facilitator/analytics', '/apps/teacher/analytics.html'],
  ['/facilitator/sessions', '/apps/teacher/sessions.html']
]);

// Keep pre-redesign URLs working in local development and previews. Production
// uses permanent redirects in vercel.json so links converge on inclusive names.
const routeMap = new Map([
  ...buildRoutes,
  ['/teachers', '/apps/web/teachers/index.html'],
  ['/teachers/login', '/apps/web/teachers/login/index.html'],
  ['/students', '/apps/web/students/index.html'],
  ['/students/install', '/apps/web/students/install/index.html'],
  ['/teacher', '/apps/teacher/index.html'],
  ['/teacher/analytics', '/apps/teacher/analytics.html'],
  ['/teacher/sessions', '/apps/teacher/sessions.html']
]);

function prettyRoutes() {
  const routeMiddleware = (request, _response, next) => {
    const url = new URL(request.url || '/', 'http://sessionsignal.local');
    const target = routeMap.get(url.pathname.replace(/\/$/, '') || '/');
    if (target) request.url = `${target}${url.search}`;
    next();
  };
  return {
    name: 'sessionsignal-pretty-routes',
    configureServer(server) {
      server.middlewares.use(routeMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(routeMiddleware);
    }
  };
}

export default defineConfig({
  root,
  publicDir: resolve(root, 'apps/web/public'),
  plugins: [prettyRoutes()],
  build: {
    outDir: resolve(root, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        [...buildRoutes.entries()].map(([route, file]) => [
          route === '/' ? 'home' : route.slice(1).replaceAll('/', '-'),
          resolve(root, file.slice(1))
        ])
      )
    }
  }
});
