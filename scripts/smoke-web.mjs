import { spawn } from 'node:child_process';

const liveBase = process.argv[2]?.replace(/\/$/, '');
const localBase = 'http://127.0.0.1:4197';
const base = liveBase || localBase;
let preview;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${base}`);
}

async function check(path, expectedText = 'SessionSignal') {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const text = await response.text();
  if (expectedText && !text.includes(expectedText)) throw new Error(`${path} did not contain ${expectedText}`);
  if (/ClassPulse/i.test(text)) throw new Error(`${path} contains retired ClassPulse branding`);
}

try {
  if (!liveBase) {
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4197', '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer();
  }

  for (const path of ['/', '/features', '/how-it-works', '/facilitators', '/facilitators/login', '/participants', '/participants/install', '/privacy', '/contact']) {
    await check(path);
  }
  await check('/downloads/sessionsignal-extension-beta.zip', null);
  await check('/downloads/sessionsignal-extension-beta-0.3.0.zip.sha256', null);

  if (liveBase) {
    const home = await fetch(base);
    const requiredHeaders = ['x-content-type-options', 'referrer-policy', 'permissions-policy'];
    for (const header of requiredHeaders) if (!home.headers.get(header)) throw new Error(`Live response is missing ${header}`);
    const legacy = await fetch(`${base}/teachers`, { redirect: 'manual' });
    if (![301, 302, 307, 308].includes(legacy.status)) throw new Error(`/teachers did not redirect (HTTP ${legacy.status})`);
  }

  console.log(`${liveBase ? 'Live deployment' : 'Built website'} smoke test passed at ${base}.`);
} finally {
  if (preview && !preview.killed) preview.kill('SIGTERM');
}
