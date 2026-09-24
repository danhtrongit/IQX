import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('src/modules/analysis/prompts');
if (!(await stat(source)).isDirectory())
  throw new Error('Versioned analysis prompt assets are missing');
const destination = resolve('dist/src/modules/analysis/prompts');
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.log('Copied versioned analysis prompts into the production build.');
