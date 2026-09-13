import { spawnSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
const run = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', 'gallery.spec.ts'],
  { stdio: 'inherit', env: { ...process.env, GALLERY_SAMPLES: '256' } },
);
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status ?? 1);
for (const id of ['cornell', 'studio', 'textures', 'courtyard'])
  await copyFile(`artifacts/gallery/${id}.png`, `website/public/images/${id}.png`);
console.log('Updated four 256-sample documentation images.');
