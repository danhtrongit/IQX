import {
  ACADEMY_V4_CATALOG_VERSION,
  ACADEMY_V5_CATALOG_VERSION,
  ACADEMY_V5_CHAPTER_COUNT,
  ACADEMY_V5_LESSON_COUNT,
} from './content/v5/schema.js';

/** The only catalog the Academy serves: Học viện v5, 17 chapters (all published), 203 required lessons. */
export const ACADEMY_CATALOG_VERSION = ACADEMY_V5_CATALOG_VERSION;
/**
 * Catalogs whose attempts and completions may still be stored (the v4 catalog, the v3.3 catalog, the v3.2 catalog,
 * the 13ch outline and the legacy 18ch catalog). Their attempts are never graded or resumed again; completions keep
 * their keys, so a completion of a lesson key that is still in the v5 catalog counts there (spec v5 §5.2).
 */
export const ACADEMY_PREVIOUS_CATALOG_VERSIONS = [
  ACADEMY_V4_CATALOG_VERSION,
  'iqx-academy-v3.3-13ch-87lessons',
  'iqx-academy-v3.2-14ch-94lessons',
  'iqx-academy-outline-13ch-71lessons-v1',
  'iqx-academy-legacy-18ch-125lessons',
] as const;
/**
 * Catalogs whose SUBMITTED attempts count in the attempt stats (best score, number of attempts) of a lesson key
 * (plan v5 D13): v5 kept every v4 lesson key, so the stats must not drop to 0 at the catalog bump. Open attempts and
 * drafts stay current-catalog only.
 */
export const ACADEMY_STATS_CATALOG_VERSIONS: readonly string[] = [
  ACADEMY_V5_CATALOG_VERSION,
  ACADEMY_V4_CATALOG_VERSION,
];
export const ACADEMY_CHAPTER_COUNT = ACADEMY_V5_CHAPTER_COUNT;
/** Required lessons over all 17 chapters (203). */
export const ACADEMY_LESSON_COUNT = ACADEMY_V5_LESSON_COUNT;
