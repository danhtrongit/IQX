import { join, sep } from 'node:path';

import { findBackendRoot } from '../academy-v4-import/paths.js';

export { findBackendRoot };

/** SHA-256 of the approved mockup `IQX-Hoc-Vien-v5-MAU.html` (3 607 272 B, spec v5). Any other input is refused. */
export const SOURCE_SHA256 = '6e963a09a9f12a7159517175108ee3b0302c49f940f5ed709017b95fe6487dc6';

/** Default source: `backend/docs/update-22-11/IQX-Hoc-Vien-v5-MAU.html`; `$ACADEMY_V5_SOURCE` or `--source` override it. */
export function defaultSource(backendRoot: string = findBackendRoot()): string {
  return join(backendRoot, 'docs', 'update-22-11', 'IQX-Hoc-Vien-v5-MAU.html');
}

const contentDir = (backendRoot: string, v: 'v4' | 'v5'): string => {
  const dir = join(backendRoot, 'src', 'modules', 'academy', 'content', v);
  if (!dir.endsWith(['academy', 'content', v].join(sep)))
    throw new Error(`unexpected content directory ${dir}`);
  return dir;
};

/** backend/src/modules/academy/content/v5 (output), resolved from the package root (never from dist). */
export const outDir = (backendRoot: string = findBackendRoot()): string =>
  contentDir(backendRoot, 'v5');

/** backend/src/modules/academy/content/v4: the frozen base (117 lesson files, 129 banks). Read only. */
export const v4Dir = (backendRoot: string = findBackendRoot()): string =>
  contentDir(backendRoot, 'v4');

/** backend/scripts/academy-v5-import (overrides live here, also when running from dist). */
export function importerDir(backendRoot: string = findBackendRoot()): string {
  return join(backendRoot, 'scripts', 'academy-v5-import');
}

export { bankFileName, lessonFileName, OUTPUT_FILES } from '../academy-v4-import/paths.js';
