import {
  ACADEMY_V3_CATALOG_VERSION,
  ACADEMY_V3_CHAPTER_COUNT,
  ACADEMY_V3_LESSON_COUNT,
} from './content/v3/schema.js';

/** The only catalog the Academy serves: Học viện v3.3, 13 chapters (all published). */
export const ACADEMY_CATALOG_VERSION = ACADEMY_V3_CATALOG_VERSION;
/**
 * Catalogs whose attempts and completions may still be stored (the v3.2 catalog, the 13ch outline
 * and the legacy 18ch catalog). Their attempts are never graded or resumed again; completions keep
 * their keys.
 */
export const ACADEMY_PREVIOUS_CATALOG_VERSIONS = [
  'iqx-academy-v3.2-14ch-94lessons',
  'iqx-academy-outline-13ch-71lessons-v1',
  'iqx-academy-legacy-18ch-125lessons',
] as const;
export const ACADEMY_CHAPTER_COUNT = ACADEMY_V3_CHAPTER_COUNT;
/** Required lessons over all 13 chapters (87). */
export const ACADEMY_LESSON_COUNT = ACADEMY_V3_LESSON_COUNT;
