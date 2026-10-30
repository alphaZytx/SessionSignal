import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const requiredPages = [
  'apps/web/index.html', 'apps/web/features/index.html', 'apps/web/how-it-works/index.html',
  'apps/web/teachers/index.html', 'apps/web/teachers/login/index.html', 'apps/web/students/index.html',
  'apps/web/students/install/index.html', 'apps/web/privacy/index.html', 'apps/web/contact/index.html',
  'apps/teacher/index.html', 'apps/teacher/analytics.html', 'apps/teacher/sessions.html'
];

test('all required public and teacher route entry points exist', async () => {
  await Promise.all(requiredPages.map((path) => access(new URL(`../${path}`, import.meta.url))));
});

test('extension executes only packaged scripts', async () => {
  const html = await readFile(new URL('../apps/extension/student.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);
  assert.match(html, /vendor\/mediapipe\/face_mesh\.js/);
  assert.match(html, /vendor\/supabase\/supabase\.js/);
});

test('beta archive presents one clearly named folder to students', async () => {
  const packager = await readFile(new URL('../scripts/package-extension.mjs', import.meta.url), 'utf8');
  assert.match(packager, /const archiveRoot = `SessionSignal Beta \$\{manifest\.version\}`/);
  assert.match(packager, /prefix: archiveRoot/);
  await access(new URL('../apps/extension/START_HERE.html', import.meta.url));
});

test('canonical inclusive routes and legacy redirects are configured', async () => {
  const viteConfig = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  const vercelConfig = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  for (const route of ['/facilitators', '/participants', '/facilitator/analytics']) {
    assert.match(viteConfig, new RegExp(route.replace('/', '\\/')));
    assert.match(vercelConfig, new RegExp(route.replace('/', '\\/')));
  }
  assert.match(vercelConfig, /"source": "\/teachers"[^\n]+"destination": "\/facilitators"/);
});

test('teacher production modules no longer call the legacy REST or Socket.IO server', async () => {
  for (const path of ['apps/teacher/js/dashboard.js', 'apps/teacher/js/analytics.js', 'apps/teacher/js/supabaseHandler.js']) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localhost:3000|socket\.io|\/api\/sessions/);
  }
});
