import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const targets = ['apps/web', 'apps/teacher', 'apps/extension', 'supabase'];
const textExtensions = new Set(['.js', '.mjs', '.html', '.css', '.json', '.sql', '.md']);
const forbidden = [
  [/http:\/\/localhost:3000/g, 'hard-coded legacy server URL'],
  [/socket\.io|\.\/socketHandler\.js/g, 'Socket.IO production dependency'],
  [/sb_secret_[A-Za-z0-9_-]+/g, 'Supabase secret key'],
  [/service_role[^\n]{0,40}[=:][^\n]+/gi, 'service-role credential']
];

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) result.push(...await files(full));
    else if (textExtensions.has(extname(entry.name))) result.push(full);
  }
  return result;
}

const failures = [];
for (const target of targets) for (const file of await files(resolve(root, target))) {
  const text = await readFile(file, 'utf8');
  for (const [pattern, label] of forbidden) if (pattern.test(text)) failures.push(`${file.slice(root.length + 1)}: ${label}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Production-path scan passed: no legacy server URL, Socket.IO dependency, or secret key found.');
