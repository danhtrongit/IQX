import type {
  BankQuestion,
  CatalogFile,
  CatalogItem,
  LessonFile,
  SequenceItem,
} from './content/v3/schema.js';

/**
 * Loader output of Học viện v3.2 (design §1.2). `academy.content.ts` implements
 * `buildAcademyContent` / `loadAcademyContent` against these types; the service, grants and the
 * staff progress reader consume exactly these fields.
 */

/** One catalog item of a published chapter, joined with its lesson file and question bank. */
export interface AcademyItem extends CatalogItem {
  chapter: number;
  chapter_title: string;
  /** 1..lesson_count for kind 'lesson', else null. */
  position: number | null;
  /** `['indicator:<id>']` when the item has `unlock`, else `[]`. */
  capabilities: string[];
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
  /** Required lessons of published chapters (43). */
  requiredTotal: number;
  /** lesson_key -> name of keys no longer in the catalog (shop ledger labels). */
  retired: ReadonlyMap<string, string>;
}

/**
 * Raw parsed JSON of `content/v3`, validated by `buildAcademyContent` (catalog.json,
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

/** Memoized reader of `content/v3` (the default `ACADEMY_CONTENT` provider). */
export type AcademyContentSource = () => AcademyContent;

/**
 * Injection token of the content source (`AcademyContentSource`). Consumers outside the request
 * path (staff progress reader) inject it so unit tests can pass `test/unit/academy-v3-fixture.ts`.
 */
export const ACADEMY_CONTENT = Symbol('ACADEMY_CONTENT');
