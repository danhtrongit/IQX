import type {
  BankQuestion,
  CatalogFile,
  CatalogItem,
  LessonFile,
  SequenceItem,
} from './content/v4/schema.js';

/**
 * Loader output of Học viện v4 (design §1.2). `academy.content.ts` implements
 * `buildAcademyContent` / `loadAcademyContent` against these types; the service, the deep link and the
 * staff progress reader consume exactly these fields.
 */

/** One catalog item of a published chapter, joined with its lesson file and question bank. */
export interface AcademyItem extends CatalogItem {
  chapter: number;
  chapter_title: string;
  /** 1..lesson_count for kind 'lesson', else null. */
  position: number | null;
  /** null for chapter exams. `content_version = canonicalHash(file).slice(0, 16)`. */
  lesson: { file: LessonFile; content_version: string } | null;
  /** Private bank. `version = canonicalHash(bankFile)` (salt included, never served). */
  bank: { questions: BankQuestion[]; version: string };
}

export interface AcademyContent {
  catalog: CatalogFile;
  /** `buildSequence(catalog)`. */
  sequence: SequenceItem[];
  /** By item id. */
  items: ReadonlyMap<string, AcademyItem>;
  /** By lesson_key. */
  itemsByKey: ReadonlyMap<string, AcademyItem>;
  /** By `metric_key` (chapter 8-12 lessons, spec v4 §5.1). */
  itemsByMetricKey: ReadonlyMap<string, AcademyItem>;
  /** Required lessons of published chapters (116). */
  requiredTotal: number;
  /** lesson_key -> name of keys no longer in the catalog (shop ledger labels). */
  retired: ReadonlyMap<string, string>;
}

/**
 * Raw parsed JSON of `content/v4`, validated by `buildAcademyContent` (catalog.json,
 * lessons/*.vi.json, questions/*.private.json, retired-lessons.json).
 */
export interface AcademyContentFiles {
  catalog: unknown;
  lessons: readonly unknown[];
  banks: readonly unknown[];
  retired: unknown;
}

/** Pure; throws on any inconsistency between catalog, lesson files and banks. */
export type BuildAcademyContent = (files: AcademyContentFiles) => AcademyContent;

/** Memoized reader of `content/v4` (the default `ACADEMY_CONTENT` provider). */
export type AcademyContentSource = () => AcademyContent;

/**
 * Injection token of the content source (`AcademyContentSource`). Consumers outside the request
 * path (staff progress reader) inject it so unit tests can pass `test/unit/academy-v4-fixture.ts`.
 */
export const ACADEMY_CONTENT = Symbol('ACADEMY_CONTENT');
