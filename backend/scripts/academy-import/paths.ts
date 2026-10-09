import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Find backend/ by walking up to the package.json named @iqx/backend (works from src and dist). */
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

export interface Locations {
  /** backend/src/modules/academy/content/packages */
  packagesDir: string;
  /** frontend/public */
  publicDir: string;
  /** backend/src/modules/screener/registry/fundamental-registry.json */
  fundamentalRegistry: string;
}

export function defaultLocations(backendRoot: string = findBackendRoot()): Locations {
  return {
    packagesDir: join(backendRoot, 'src/modules/academy/content/packages'),
    publicDir: join(backendRoot, '..', 'frontend', 'public'),
    fundamentalRegistry: join(
      backendRoot,
      'src/modules/screener/registry/fundamental-registry.json',
    ),
  };
}

export const chapterDirName = (chapter: number): string => `ch${String(chapter).padStart(2, '0')}`;
