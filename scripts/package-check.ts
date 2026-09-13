import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
run(npm, ['run', 'build']);
const folder = await mkdtemp(join(tmpdir(), 'three-gpu-baker-consumer-'));
try {
  const [pack] = JSON.parse(
    run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', folder]),
  );
  assert.equal(pack.name, 'three-gpu-baker');
  assert(
    pack.files.every(
      (file: { path: string }) =>
        !/^(?:tests|artifacts|upstream|node_modules|website)\//.test(file.path),
    ),
  );
  await writeFile(join(folder, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(folder, pack.filename),
      '@types/three@0.186.0',
      '@webgpu/types',
    ],
    folder,
  );
  const source = (await readFile('tests/types.ts', 'utf8')).replace(
    "'../src/index.js'",
    "'three-gpu-baker'",
  );
  await writeFile(join(folder, 'consumer.ts'), source);
  await writeFile(
    join(folder, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['@webgpu/types'],
      },
      include: ['consumer.ts'],
    }),
  );
  run(
    process.execPath,
    [resolve('node_modules/typescript/bin/tsc'), '-p', join(folder, 'tsconfig.json')],
    folder,
  );
  const smoke = `import {LightmapBaker,LightmapIO} from 'three-gpu-baker';
import {OptixDenoiser} from 'three-gpu-baker/node';
const baker=new LightmapBaker({backend:'cpu',width:16,height:16,samples:1});
await baker.prepare({triangles:[{p:[[0,0,0],[1,0,0],[0,1,0]]}],materials:[{}],environment:[1,1,1]});
const result=await baker.bake();const io=new LightmapIO();if(io.decode(io.encode(result)).samples!==1)throw new Error('Invalid roundtrip');
if(new OptixDenoiser().type!=='optix')throw new Error('Missing Node entry');await baker.dispose();`;
  await writeFile(join(folder, 'smoke.mjs'), smoke);
  run(process.execPath, ['smoke.mjs'], folder);
  console.log(
    `Package verified: ${pack.files.length} files, clean consumer import, CPU bake, codecs, and strict declarations.`,
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
