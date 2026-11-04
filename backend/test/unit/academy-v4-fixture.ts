import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import type {
  AcademyContent,
  AcademyContentSource,
} from '../../src/modules/academy/academy.content.types.js';

/**
 * Học viện v4 content for unit tests: the real `content/v4` files joined by the runtime loader
 * (design §1.2), memoized. Provide it through the `ACADEMY_CONTENT` token:
 * `{ provide: ACADEMY_CONTENT, useValue: academyV4Source }`.
 */

/** Memoized real v4 content (129 items: 116 required lessons, 12 exams, 1 optional practice). */
export function academyV4Fixture(): AcademyContent {
  return loadAcademyContent();
}

/** `ACADEMY_CONTENT` provider value for tests. */
export const academyV4Source: AcademyContentSource = academyV4Fixture;
