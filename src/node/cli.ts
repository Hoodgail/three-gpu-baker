#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { LightmapIO } from '../io/LightmapIO.js';
import { OptixDenoiser } from './OptixDenoiser.js';
const [input, output, executable] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: three-gpu-baker-denoise input.tlmb output.tlmb [native-executable]');
  process.exitCode = 1;
} else
  try {
    const io = new LightmapIO();
    const result = await new OptixDenoiser({
      executable,
      onProgress: (p) => console.log(`Chart ${p.completed}/${p.total}`),
    }).run(io.decode(await readFile(input)));
    await writeFile(output, io.encode(result));
    console.log(`Saved ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
