import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { capabilitiesForLesson } from './academy.capabilities.js';

/** The only catalog the Academy serves: 13 chapters / 71 lessons. */
export const ACADEMY_CATALOG_VERSION = 'iqx-academy-outline-13ch-71lessons-v1';
/** Label of the previous 18-chapter / 125-lesson catalog (legacy grants/attempts only). */
export const ACADEMY_LEGACY_CATALOG_VERSION = 'iqx-academy-legacy-18ch-125lessons';
export const ACADEMY_CHAPTER_COUNT = 13;
export const ACADEMY_LESSON_COUNT = 71;
export const QUESTIONS_PER_LESSON = 8;

const lessonIdSchema = z.string().regex(/^ch\d{2}-l\d{2}$/);
const lessonKeySchema = z.string().regex(/^(technical|fundamental|concept|guide):[a-z0-9_-]+$/);

const lessonKindSchema = z.enum(['technical', 'fundamental', 'concept', 'guide']);
const chapterTypeSchema = z.enum(['technical', 'fundamental', 'tool']);
const contentStatusSchema = z.enum(['published', 'not_published']);

const completionSchema = z.union([
  z.strictObject({
    mode: z.literal('quiz'),
    question_count: z.literal(QUESTIONS_PER_LESSON),
    required_correct: z.literal(QUESTIONS_PER_LESSON),
  }),
  z.strictObject({ mode: z.literal('guide') }),
]);

const capabilityBindingSchema = z
  .strictObject({
    kind: z.enum(['technical', 'fundamental']),
    id: z.string().regex(/^[a-z0-9_]+$/),
  })
  .nullable();

const catalogLessonSchema = z.strictObject({
  id: lessonIdSchema,
  order: z.number().int().min(1),
  name: z.string().min(1),
  lesson_key: lessonKeySchema,
  kind: lessonKindSchema,
  completion: completionSchema,
  capability_binding: capabilityBindingSchema,
  /** Ids this lesson had in the legacy catalog (mapped by capability, never by position). */
  legacy_lesson_ids: z.array(lessonIdSchema),
  content_status: contentStatusSchema,
});

const catalogFileSchema = z.strictObject({
  catalog_version: z.literal(ACADEMY_CATALOG_VERSION),
  legacy_catalog_version: z.literal(ACADEMY_LEGACY_CATALOG_VERSION),
  chapters: z
    .array(
      z.strictObject({
        no: z.number().int().min(1),
        title: z.string().min(1),
        type: chapterTypeSchema,
        lessons: z.array(catalogLessonSchema).min(1),
      }),
    )
    .length(ACADEMY_CHAPTER_COUNT),
});

/**
 * Typed lesson blocks. Re-homed lessons keep their approved HTML sections (`{ title, html }`,
 * normalised to one `html` block); content packages imported later may use typed blocks.
 */
const blockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('html'), html: z.string().min(1) }),
  z.strictObject({ type: z.literal('text'), text: z.string().min(1) }),
  z.strictObject({
    type: z.literal('formula'),
    expression: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('table'),
    caption: z.string().optional(),
    header: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
    note: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('chart'),
    chart_id: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('image'),
    asset_id: z.string().min(1),
    alt: z.string().min(1),
    caption: z.string().optional(),
  }),
]);

const assetSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['image', 'chart']),
  /** Immutable reference of the approved resource (served by the content package). */
  ref: z.string().min(1),
});

const sectionFileSchema = z.union([
  z.object({ id: z.string().min(1).optional(), title: z.string(), html: z.string() }),
  z.object({
    id: z.string().min(1).optional(),
    title: z.string(),
    blocks: z.array(blockSchema).min(1),
  }),
]);

const lessonFileSchema = z.object({
  lesson_id: lessonIdSchema,
  content_version: z.string().min(1).max(32),
  origin: z.string().optional(),
  sections: z.array(sectionFileSchema).min(1),
  assets: z.array(assetSchema).default([]),
  fixture: z.record(z.string(), z.unknown()).nullable().default(null),
  sources: z.array(z.string()).default([]),
  review_status: z.string().default(''),
  rehomed_from: z
    .strictObject({
      catalog_version: z.string(),
      lesson_id: lessonIdSchema,
      chapter: z.number().int(),
    })
    .optional(),
});

const questionSchema = z.object({
  id: z.string().min(1).max(64),
  lesson_id: lessonIdSchema,
  question: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1).max(64), text: z.string().min(1) })).min(2),
  correct_index: z.number().int().min(0),
  correct_option_id: z.string().min(1),
  explanation: z.string().min(1),
});

const assessmentFileSchema = z.object({
  lesson_id: lessonIdSchema,
  questions: z.array(questionSchema),
});

export type AcademyLessonKind = z.infer<typeof lessonKindSchema>;
export type AcademyChapterType = z.infer<typeof chapterTypeSchema>;
export type AcademyContentStatus = z.infer<typeof contentStatusSchema>;
export type AcademyCompletion = z.infer<typeof completionSchema>;
export type AcademyBlock = z.infer<typeof blockSchema>;
export type AcademyAsset = z.infer<typeof assetSchema>;
/** Server-only question with its answer key; never serialize this type to a client. */
export type AcademyQuestion = z.infer<typeof questionSchema>;
type CatalogLessonFile = z.infer<typeof catalogLessonSchema>;

export type AcademySection = { id: string; title: string; blocks: AcademyBlock[] };

export type PublishedLessonContent = {
  content_version: string;
  sections: AcademySection[];
  assets: AcademyAsset[];
  fixture: Record<string, unknown> | null;
  sources: string[];
  review_status: string;
};

export type LessonAssessment = {
  /** sha256 of the canonical JSON of this lesson's question bank (pinned by attempts). */
  version: string;
  /** Exactly 8 questions in bank order (`<lesson_id>-q01..q08`). */
  questions: readonly AcademyQuestion[];
};

export type AcademyLesson = CatalogLessonFile & {
  chapter: number;
  /** Capability ids granted by completing it (`indicator:<id>` / `metric:<id>` / none). */
  capabilities: string[];
  content: PublishedLessonContent | null;
  assessment: LessonAssessment | null;
};

export type AcademyChapter = {
  no: number;
  title: string;
  type: AcademyChapterType;
  lessons: AcademyLesson[];
};

export type AcademyContent = {
  catalog_version: typeof ACADEMY_CATALOG_VERSION;
  legacy_catalog_version: typeof ACADEMY_LEGACY_CATALOG_VERSION;
  chapters: AcademyChapter[];
  lessons: ReadonlyMap<string, AcademyLesson>;
  lessonsByKey: ReadonlyMap<string, AcademyLesson>;
  /** Legacy (18ch/125) lesson id -> the lesson that replaces it; ids absent here map to nothing. */
  lessonsByLegacyId: ReadonlyMap<string, AcademyLesson>;
};

/** Canonical JSON: object keys sorted recursively, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Raw parsed JSON files of the content directory. */
export type AcademyContentFiles = {
  catalog: unknown;
  /** Published lesson files by lesson id (`lessons/<id>/lesson.vi.json`). */
  lessons: ReadonlyMap<string, unknown>;
  /** Server-only question banks by lesson id (`lessons/<id>/assessment.vi.private.json`). */
  assessments: ReadonlyMap<string, unknown>;
};

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

function normalizeSections(
  lessonId: string,
  sections: z.infer<typeof lessonFileSchema>['sections'],
): AcademySection[] {
  return sections.map((section, index) => {
    const id = section.id ?? `s${index + 1}`;
    const blocks: AcademyBlock[] =
      'blocks' in section ? section.blocks : [{ type: 'html', html: section.html }];
    if (!blocks.length) fail(`lesson ${lessonId} section ${id} has no content`);
    return { id, title: section.title, blocks };
  });
}

function validateAssets(
  lessonId: string,
  sections: AcademySection[],
  assets: AcademyAsset[],
): void {
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) fail(`lesson ${lessonId} duplicates asset ${asset.id}`);
    ids.add(asset.id);
  }
  const kindOf = new Map(assets.map((asset) => [asset.id, asset.kind]));
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (sectionIds.has(section.id)) fail(`lesson ${lessonId} duplicates section ${section.id}`);
    sectionIds.add(section.id);
    for (const block of section.blocks) {
      if (block.type === 'image' && kindOf.get(block.asset_id) !== 'image')
        fail(`lesson ${lessonId} references missing image asset ${block.asset_id}`);
      if (block.type === 'chart' && kindOf.get(block.chart_id) !== 'chart')
        fail(`lesson ${lessonId} references missing chart ${block.chart_id}`);
    }
  }
}

function buildAssessment(lessonId: string, raw: unknown, seenQuestionIds: Set<string>) {
  const file = assessmentFileSchema.parse(raw);
  if (file.lesson_id !== lessonId) fail(`assessment of ${lessonId} declares ${file.lesson_id}`);
  if (file.questions.length !== QUESTIONS_PER_LESSON)
    fail(`lesson ${lessonId} has ${file.questions.length} questions`);
  file.questions.forEach((question, index) => {
    const expectedId = `${lessonId}-q${String(index + 1).padStart(2, '0')}`;
    if (question.id !== expectedId || question.lesson_id !== lessonId)
      fail(`question ${question.id} must be ${expectedId} of lesson ${lessonId}`);
    if (seenQuestionIds.has(question.id)) fail(`question id ${question.id} is duplicated`);
    seenQuestionIds.add(question.id);
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length)
      fail(`question ${question.id} has duplicate option ids`);
    if (question.options[question.correct_index]?.id !== question.correct_option_id)
      fail(`question ${question.id} answer key is inconsistent`);
  });
  return { version: canonicalHash(file.questions), questions: file.questions };
}

/** Validates the catalog and every content file against it and builds lookup tables. Throws on any inconsistency. */
export function buildAcademyContent(files: AcademyContentFiles): AcademyContent {
  const catalog = catalogFileSchema.parse(files.catalog);
  const lessons = new Map<string, AcademyLesson>();
  const lessonsByKey = new Map<string, AcademyLesson>();
  const lessonsByLegacyId = new Map<string, AcademyLesson>();
  const questionIds = new Set<string>();
  const chapters: AcademyChapter[] = [];

  catalog.chapters.forEach((chapter, chapterIndex) => {
    if (chapter.no !== chapterIndex + 1) fail(`chapter ${chapter.no} is out of order`);
    const built = chapter.lessons.map((entry, position): AcademyLesson => {
      const expectedId = `ch${String(chapter.no).padStart(2, '0')}-l${String(position + 1).padStart(2, '0')}`;
      if (entry.id !== expectedId || entry.order !== position + 1)
        fail(`lesson ${entry.id} must be ${expectedId} with order ${position + 1}`);
      if (lessons.has(entry.id)) fail(`lesson ${entry.id} is duplicated`);
      if (lessonsByKey.has(entry.lesson_key)) fail(`lesson key ${entry.lesson_key} is duplicated`);
      assertKindRules(entry);

      let content: PublishedLessonContent | null = null;
      let assessment: LessonAssessment | null = null;
      const rawLesson = files.lessons.get(entry.id);
      const rawAssessment = files.assessments.get(entry.id);
      if (entry.content_status === 'published') {
        if (rawLesson === undefined) fail(`published lesson ${entry.id} has no lesson file`);
        const file = lessonFileSchema.parse(rawLesson);
        if (file.lesson_id !== entry.id)
          fail(`lesson file of ${entry.id} declares ${file.lesson_id}`);
        const sections = normalizeSections(entry.id, file.sections);
        validateAssets(entry.id, sections, file.assets);
        content = {
          content_version: file.content_version,
          sections,
          assets: file.assets,
          fixture: file.fixture,
          sources: file.sources,
          review_status: file.review_status,
        };
        if (entry.completion.mode === 'quiz') {
          if (rawAssessment === undefined)
            fail(`published quiz lesson ${entry.id} has no assessment`);
          assessment = buildAssessment(entry.id, rawAssessment, questionIds);
        } else if (rawAssessment !== undefined) {
          fail(`guide lesson ${entry.id} must not have an assessment`);
        }
      } else if (rawLesson !== undefined || rawAssessment !== undefined) {
        fail(`lesson ${entry.id} is not_published but has content files`);
      }

      const lesson: AcademyLesson = {
        ...entry,
        chapter: chapter.no,
        capabilities: capabilitiesForLesson(entry),
        content,
        assessment,
      };
      lessons.set(lesson.id, lesson);
      lessonsByKey.set(lesson.lesson_key, lesson);
      for (const legacyId of lesson.legacy_lesson_ids) {
        if (lessonsByLegacyId.has(legacyId)) fail(`legacy lesson ${legacyId} maps to two lessons`);
        lessonsByLegacyId.set(legacyId, lesson);
      }
      return lesson;
    });
    chapters.push({ no: chapter.no, title: chapter.title, type: chapter.type, lessons: built });
  });

  if (lessons.size !== ACADEMY_LESSON_COUNT)
    fail(`expected ${ACADEMY_LESSON_COUNT} lessons, found ${lessons.size}`);
  for (const id of [...files.lessons.keys(), ...files.assessments.keys()])
    if (!lessons.has(id)) fail(`content file for unknown lesson ${id}`);

  return {
    catalog_version: catalog.catalog_version,
    legacy_catalog_version: catalog.legacy_catalog_version,
    chapters,
    lessons,
    lessonsByKey,
    lessonsByLegacyId,
  };
}

/** Kind <-> completion mode <-> capability binding <-> lesson key consistency. */
function assertKindRules(entry: CatalogLessonFile): void {
  const { kind, completion, capability_binding: binding, lesson_key: key } = entry;
  switch (kind) {
    case 'technical':
    case 'fundamental':
      if (completion.mode !== 'quiz') fail(`${entry.id}: ${kind} lessons complete by quiz`);
      if (binding?.kind !== kind) fail(`${entry.id}: ${kind} lesson needs a ${kind} binding`);
      if (key !== `${kind}:${binding.id}`)
        fail(`${entry.id}: lesson key must be ${kind}:${binding.id}`);
      return;
    case 'concept':
      if (completion.mode !== 'quiz') fail(`${entry.id}: concept lessons complete by quiz`);
      if (binding !== null) fail(`${entry.id}: concept lessons open no capability`);
      if (!key.startsWith('concept:')) fail(`${entry.id}: concept lesson key must be concept:*`);
      return;
    case 'guide':
      if (completion.mode !== 'guide') fail(`${entry.id}: guide lessons complete by button`);
      if (binding !== null) fail(`${entry.id}: guide lessons open no capability`);
      if (key !== `guide:${entry.id}`)
        fail(`${entry.id}: guide lesson key must be guide:${entry.id}`);
      if (entry.legacy_lesson_ids.length) fail(`${entry.id}: guide lessons have no legacy mapping`);
      return;
  }
}

function contentRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'content');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/**
 * Reads the shipped content directory (server-only question banks included):
 *   catalog.v1.json
 *   lessons/<lesson id>/lesson.vi.json              published lesson content
 *   lessons/<lesson id>/assessment.vi.private.json  8-question bank (quiz lessons)
 * `content/legacy/**` is history of removed lessons and is never part of the catalog.
 */
export function readAcademyContentFiles(root: string = contentRoot()): AcademyContentFiles {
  const lessons = new Map<string, unknown>();
  const assessments = new Map<string, unknown>();
  const lessonsDir = join(root, 'lessons');
  if (existsSync(lessonsDir)) {
    for (const lessonId of readdirSync(lessonsDir).sort()) {
      const lessonFile = join(lessonsDir, lessonId, 'lesson.vi.json');
      const assessmentFile = join(lessonsDir, lessonId, 'assessment.vi.private.json');
      if (existsSync(lessonFile)) lessons.set(lessonId, readJson(lessonFile));
      if (existsSync(assessmentFile)) assessments.set(lessonId, readJson(assessmentFile));
    }
  }
  return { catalog: readJson(join(root, 'catalog.v1.json')), lessons, assessments };
}

let memoized: AcademyContent | undefined;

/** Loads and validates the academy content once per process. */
export function loadAcademyContent(): AcademyContent {
  memoized ??= buildAcademyContent(readAcademyContentFiles());
  return memoized;
}
