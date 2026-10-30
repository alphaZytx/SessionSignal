import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const validator = fileURLToPath(new URL('../scripts/validate-deployment-env.mjs', import.meta.url));

test('production deployment rejects placeholder backend configuration', async () => {
  await assert.rejects(execFileAsync(process.execPath, [validator], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME',
      EXTENSION_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
      EXTENSION_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME'
    }
  }));
});

test('production deployment accepts one matching public Supabase configuration', async () => {
  const key = `sb_publishable_${'a'.repeat(32)}`;
  const { stdout } = await execFileAsync(process.execPath, [validator], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://sessionsignal.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      EXTENSION_SUPABASE_URL: 'https://sessionsignal.supabase.co',
      EXTENSION_SUPABASE_PUBLISHABLE_KEY: key
    }
  });
  assert.match(stdout, /environment is valid/i);
});

test('Vercel and GitHub use the verified deployment pipeline', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(vercel, /npm run build:production/);
  assert.match(workflow, /npm run check/);
});
