import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import type {
  AcademyContent,
  AcademyContentSource,
} from '../../src/modules/academy/academy.content.types.js';

/**
 * Học viện content for unit tests (served catalog, now v5): the real `content/v5` files joined by the runtime loader
 * (design §1.2), memoized. Provide it through the `ACADEMY_CONTENT` token:
 * `{ provide: ACADEMY_CONTENT, useValue: academyV4Source }`.
 */

/** Memoized real served content (v5: 221 items, 203 required lessons, 17 exams, 1 optional practice). */
export function academyV4Fixture(): AcademyContent {
  return loadAcademyContent();
}

/** `ACADEMY_CONTENT` provider value for tests. */
export const academyV4Source: AcademyContentSource = academyV4Fixture;
