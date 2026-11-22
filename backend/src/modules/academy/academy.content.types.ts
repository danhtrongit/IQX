import type {
  BankQuestion,
  CatalogFile,
  CatalogItem,
  LessonFile,
  SequenceItem,
} from './content/v5/schema.js';

/**
 * Loader output of Học viện v5 (design §1.2). `academy.content.ts` implements
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
  /**
   * By `metric_key`: every metric lesson (chapters 8-17) teaching it, in catalog order (spec v5 §5.1: one key may
   * have a lesson per industry, e.g. `roe` in Chương 8, 10, 11 and 12).
   */
  itemsByMetricKey: ReadonlyMap<string, readonly AcademyItem[]>;
  /** By `"<metric_key>|<nganh>"` (unique per catalog, spec v5 §5.1). */
  itemByMetricNganh: ReadonlyMap<string, AcademyItem>;
  /** Required lessons of published chapters (203). */
  requiredTotal: number;
  /** lesson_key -> name of keys no longer in the catalog (shop ledger labels). */
  retired: ReadonlyMap<string, string>;
}

/**
 * Raw parsed JSON of `content/v5`, validated by `buildAcademyContent` (catalog.json,
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

/** Memoized reader of `content/v5` (the default `ACADEMY_CONTENT` provider). */
export type AcademyContentSource = () => AcademyContent;

/**
 * Injection token of the content source (`AcademyContentSource`). Consumers outside the request
 * path (staff progress reader) inject it so unit tests can pass `test/unit/academy-v4-fixture.ts`.
 */
export const ACADEMY_CONTENT = Symbol('ACADEMY_CONTENT');
