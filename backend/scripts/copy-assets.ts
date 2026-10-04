import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Versioned, server-only assets that tsc does not emit. Academy question banks
// (questions.vi.private.json) live here and must never be copied into frontend/.
const ASSET_DIRECTORIES = [
  'src/modules/analysis/prompts',
  'src/modules/academy/content',
  'src/modules/quant/v2/registry',
  'src/modules/screener/registry',
] as const;

for (const relative of ASSET_DIRECTORIES) {
  const source = resolve(relative);
  if (!(await stat(source)).isDirectory()) throw new Error(`Versioned assets are missing: ${relative}`);
  const destination = resolve('dist', relative);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}
console.log(`Copied ${ASSET_DIRECTORIES.length} versioned asset directories into the production build.`);
