import {
  ACADEMY_V4_CATALOG_VERSION,
  ACADEMY_V4_CHAPTER_COUNT,
  ACADEMY_V4_LESSON_COUNT,
} from './content/v4/schema.js';

/** The only catalog the Academy serves: Học viện v4, 12 chapters (all published), 116 required lessons. */
export const ACADEMY_CATALOG_VERSION = ACADEMY_V4_CATALOG_VERSION;
/**
 * Catalogs whose attempts and completions may still be stored (the v3.3 catalog, the v3.2 catalog, the 13ch outline
 * and the legacy 18ch catalog). Their attempts are never graded or resumed again; completions keep their keys, and a
 * v3.3 completion of a lesson that is still in the v4 catalog counts there (spec v4 §5.3).
 */
export const ACADEMY_PREVIOUS_CATALOG_VERSIONS = [
  'iqx-academy-v3.3-13ch-87lessons',
  'iqx-academy-v3.2-14ch-94lessons',
  'iqx-academy-outline-13ch-71lessons-v1',
  'iqx-academy-legacy-18ch-125lessons',
] as const;
export const ACADEMY_CHAPTER_COUNT = ACADEMY_V4_CHAPTER_COUNT;
/** Required lessons over all 12 chapters (116). */
export const ACADEMY_LESSON_COUNT = ACADEMY_V4_LESSON_COUNT;
