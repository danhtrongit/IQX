import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** SHA-256 of the approved mockup `IQX-Hoc-Vien-MAU.html` (566,586 bytes). Any other input is refused. */
export const SOURCE_SHA256 = '52d11cb805ee8ce28dc6172908a6383b421947e128c0d908a3c92e389072059f';

/** Default location of the source (outside the repo); `$ACADEMY_V32_SOURCE` or `--source` override it. */
export const DEFAULT_SOURCE =
  '/Users/danhtrongit/Projects/IQX-sources/academy-v32/IQX-Hoc-Vien-MAU.html';

/** Find backend/ by walking up to the package.json named @iqx/backend (works from scripts and dist). */
export function findBackendRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name;
        if (name === '@iqx/backend') return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('backend root (package.json @iqx/backend) not found');
    dir = parent;
  }
}

const OUT_SUFFIX = ['src', 'modules', 'academy', 'content', 'v3'].join(sep);

/** backend/src/modules/academy/content/v3, resolved from the package root (never from dist). */
export function outDir(backendRoot: string = findBackendRoot()): string {
  const dir = join(backendRoot, 'src', 'modules', 'academy', 'content', 'v3');
  if (!dir.endsWith(OUT_SUFFIX)) throw new Error(`unexpected output directory ${dir}`);
  return dir;
}

/** backend/scripts/academy-v32-import (overrides live here, also when running from dist). */
export function importerDir(backendRoot: string = findBackendRoot()): string {
  return join(backendRoot, 'scripts', 'academy-v32-import');
}

export const OUTPUT_FILES = {
  catalog: 'catalog.json',
  retired: 'retired-lessons.json',
  manifest: 'import-manifest.json',
  lessonsDir: 'lessons',
  questionsDir: 'questions',
} as const;

export const lessonFileName = (id: string): string => `${id}.vi.json`;
export const bankFileName = (id: string): string => `${id}.private.json`;
