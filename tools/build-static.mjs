import fs from 'node:fs';
import path from 'node:path';

const appName = process.argv[2];
if (!appName) {
  console.error('Usage: node tools/build-static.mjs <app-name>');
  process.exit(1);
}

const ROOT = process.cwd();
const source = path.join(ROOT, 'apps', appName);
if (!fs.existsSync(source)) {
  console.error(`Unknown app "${appName}". Expected folder at ${source}`);
  process.exit(1);
}

const distRoot = path.join(ROOT, 'dist');
const target = path.join(distRoot, appName);
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

const skip = new Set(['node_modules', '.DS_Store']);

fs.cpSync(source, target, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(source, src);
    if (!rel) return true;
    return rel.split(path.sep).every((segment) => !skip.has(segment));
  }
});

console.log(`Copied ${appName} -> ${path.relative(ROOT, target)}`);
