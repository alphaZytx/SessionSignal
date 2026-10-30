import archiver from 'archiver';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const extensionDir = resolve(root, 'dist/extension');
const manifest = JSON.parse(await readFile(resolve(extensionDir, 'manifest.json'), 'utf8'));
const downloadsDir = resolve(root, 'apps/web/public/downloads');
await mkdir(downloadsDir, { recursive: true });
const versionedName = `sessionsignal-extension-beta-${manifest.version}.zip`;
const versionedPath = resolve(downloadsDir, versionedName);
const archiveDate = new Date('2026-01-01T00:00:00.000Z');
const archiveRoot = `SessionSignal Beta ${manifest.version}`;

await new Promise((resolveArchive, rejectArchive) => {
  const output = createWriteStream(versionedPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolveArchive);
  output.on('error', rejectArchive);
  archive.on('error', rejectArchive);
  archive.pipe(output);
  archive.glob('**/*', { cwd: extensionDir, dot: true, nodir: true }, {
    date: archiveDate,
    mode: 0o100644,
    prefix: archiveRoot
  });
  archive.finalize();
});

const aliasPath = resolve(downloadsDir, 'sessionsignal-extension-beta.zip');
await copyFile(versionedPath, aliasPath);
const checksum = createHash('sha256').update(await readFile(versionedPath)).digest('hex');
await writeFile(resolve(downloadsDir, `${versionedName}.sha256`), `${checksum}  ${versionedName}\n`);
await copyFile(resolve(root, 'apps/extension/RELEASE_NOTES.md'), resolve(downloadsDir, 'RELEASE_NOTES.md'));
console.log(`Packaged ${versionedName} with one folder named "${archiveRoot}" (${checksum})`);
