import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Versioned, server-only assets that tsc does not emit. Academy question banks
// (questions.vi.private.json) live here and must never be copied into frontend/. Only the served Academy catalog
// (content/v5) ships: content/v4 is the frozen base of the v5 importer, never read at runtime.
const ASSET_DIRECTORIES = [
  'src/modules/analysis/prompts',
  'src/modules/research/prompts',
  'src/modules/academy/content/v5',
  'src/modules/candle-dojo/content',
  'src/modules/quant/v2/registry',
  'src/modules/screener/registry',
  'src/modules/market-bulletins/render/fonts',
] as const;

for (const relative of ASSET_DIRECTORIES) {
  const source = resolve(relative);
  if (!(await stat(source)).isDirectory())
    throw new Error(`Versioned assets are missing: ${relative}`);
  const destination = resolve('dist', relative);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}
console.log(
  `Copied ${ASSET_DIRECTORIES.length} versioned asset directories into the production build.`,
);
