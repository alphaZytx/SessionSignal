import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'apps/extension');
const output = resolve(root, 'dist/extension');

async function loadLocalEnv() {
  const values = {};
  for (const name of ['.env.local', '.env']) {
    try {
      const text = await readFile(resolve(root, name), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
        const separator = line.indexOf('=');
        values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
  return values;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, filter: (entry) => !entry.endsWith('RELEASE_NOTES.md') });

await mkdir(resolve(output, 'src/shared'), { recursive: true });
await cp(resolve(root, 'apps/student/js/faceAnalyzer.js'), resolve(output, 'src/shared/faceAnalyzer.js'));
await cp(resolve(root, 'apps/student/js/dataCollector.js'), resolve(output, 'src/shared/dataCollector.js'));

await mkdir(resolve(output, 'vendor/supabase'), { recursive: true });
await mkdir(resolve(output, 'vendor/chart'), { recursive: true });
await mkdir(resolve(output, 'vendor/mediapipe'), { recursive: true });
await cp(resolve(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), resolve(output, 'vendor/supabase/supabase.js'));
await cp(resolve(root, 'node_modules/chart.js/dist/chart.umd.js'), resolve(output, 'vendor/chart/chart.umd.js'));

const mediaFiles = [
  'face_mesh.js', 'face_mesh.binarypb', 'face_mesh_solution_packed_assets.data',
  'face_mesh_solution_packed_assets_loader.js', 'face_mesh_solution_simd_wasm_bin.data',
  'face_mesh_solution_simd_wasm_bin.js', 'face_mesh_solution_simd_wasm_bin.wasm',
  'face_mesh_solution_wasm_bin.js', 'face_mesh_solution_wasm_bin.wasm'
];
for (const file of mediaFiles) {
  if (file === 'face_mesh.js') {
    let code = await readFile(resolve(root, 'node_modules/@mediapipe/face_mesh', file), 'utf8');
    code = code
      .replace(
        'if(!a.startsWith("chrome-extension:"))b.setAttribute("crossorigin","anonymous");',
        'b.setAttribute("crossorigin","anonymous");'
      )
      .replace(
        'b.setAttribute("crossorigin","anonymous");',
        'if(!a.startsWith("chrome-extension:")&&location.protocol!=="chrome-extension:")b.setAttribute("crossorigin","anonymous");'
      );
    await writeFile(resolve(output, 'vendor/mediapipe', file), code, 'utf8');
  } else {
    await cp(resolve(root, 'node_modules/@mediapipe/face_mesh', file), resolve(output, 'vendor/mediapipe', file));
  }
}
await cp(resolve(root, 'node_modules/@mediapipe/camera_utils/camera_utils.js'), resolve(output, 'vendor/mediapipe/camera_utils.js'));

const localEnv = await loadLocalEnv();
const url = process.env.EXTENSION_SUPABASE_URL || process.env.VITE_SUPABASE_URL || localEnv.EXTENSION_SUPABASE_URL || localEnv.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const publishableKey = process.env.EXTENSION_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || localEnv.EXTENSION_SUPABASE_PUBLISHABLE_KEY || localEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_REPLACE_ME';
await writeFile(resolve(output, 'config.js'), `globalThis.SESSIONSIGNAL_CONFIG = Object.freeze(${JSON.stringify({ url, publishableKey })});\n`);

console.log(`Built unpacked extension at ${output}`);
