import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { capabilitiesForLesson } from './academy.capabilities.js';

/** Academy content shipped with the handoff (CURRICULUM.json `content_version` of every lesson). */
export const ACADEMY_CONTENT_VERSION = '2.0.0';
export const ACADEMY_CHAPTER_COUNT = 18;
export const ACADEMY_LESSON_COUNT = 125;
export const QUESTIONS_PER_LESSON = 8;

const lessonIdSchema = z.string().regex(/^ch\d{2}-l\d{2}$/);
const lessonKindSchema = z.enum(['technical', 'fundamental', 'tool', 'system']);
const chapterTypeSchema = z.enum(['technical', 'fundamental', 'tool', 'system']);

const curriculumFileSchema = z
  .array(
    z.object({
      no: z.number().int().min(1),
      title: z.string().min(1),
      type: chapterTypeSchema,
      bot: z.string().min(1).nullable(),
      lessons: z.array(z.string().min(1)),
      lesson_ids: z.array(lessonIdSchema).min(1),
    }),
  )
  .length(ACADEMY_CHAPTER_COUNT);

const lessonMapFileSchema = z
  .array(
    z.object({
      lesson_id: lessonIdSchema,
      name: z.string().min(1),
      chapter: z.number().int().min(1),
      config_id: z.string().min(1).nullable(),
      kind: lessonKindSchema,
      prerequisites: z.array(lessonIdSchema),
      sources: z.array(z.string()),
    }),
  )
  .length(ACADEMY_LESSON_COUNT);

const lessonFileSchema = z.array(
  z.object({
    id: lessonIdSchema,
    chapter: z.number().int().min(1),
    order: z.number().int().min(1),
    name: z.string().min(1),
    kind: lessonKindSchema,
    content_version: z.string().min(1),
    sections: z.array(z.object({ title: z.string(), html: z.string() })).min(1),
    fixture: z.record(z.string(), z.unknown()),
    config_id: z.string().min(1).nullable(),
    prerequisites: z.array(lessonIdSchema),
    sources: z.array(z.string()),
    review_status: z.string(),
  }),
);

const questionFileSchema = z.array(
  z.object({
    id: z.string().min(1).max(64),
    lesson_id: lessonIdSchema,
    question: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1).max(64), text: z.string().min(1) })).min(2),
    correct_index: z.number().int().min(0),
    correct_option_id: z.string().min(1),
    explanation: z.string().min(1),
  }),
);

export type AcademyLessonKind = z.infer<typeof lessonKindSchema>;
export type AcademyLesson = z.infer<typeof lessonFileSchema>[number] & {
  capabilities: string[];
};
/** Server-only question with its answer key; never serialize this type to a client. */
export type AcademyQuestion = z.infer<typeof questionFileSchema>[number];
export type AcademyChapter = Omit<z.infer<typeof curriculumFileSchema>[number], 'lessons'> & {
  lessons: AcademyLesson[];
};

export type AcademyContent = {
  content_version: string;
  /** sha256 hex of the canonical JSON of all 18 question banks in chapter order. */
  questions_version: string;
  chapters: AcademyChapter[];
  lessons: ReadonlyMap<string, AcademyLesson>;
  /** Exactly 8 questions per lesson, in bank order (`<lesson_id>-q01..q08`). */
  questionsByLesson: ReadonlyMap<string, readonly AcademyQuestion[]>;
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
  curriculum: unknown;
  lessonMap: unknown;
  /** Indexed by chapter number (1-based). */
  chapters: ReadonlyMap<number, { lessons: unknown; questions: unknown }>;
};

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

/** Validates the full content set and builds lookup tables. Throws on any inconsistency. */
export function buildAcademyContent(files: AcademyContentFiles): AcademyContent {
  const curriculum = curriculumFileSchema.parse(files.curriculum);
  const lessonMap = lessonMapFileSchema.parse(files.lessonMap);
  const mapById = new Map(lessonMap.map((entry) => [entry.lesson_id, entry]));
  if (mapById.size !== ACADEMY_LESSON_COUNT) fail('LESSON-MAP lesson ids are not unique');

  const lessons = new Map<string, AcademyLesson>();
  const questionsByLesson = new Map<string, AcademyQuestion[]>();
  const questionIds = new Set<string>();
  const banks: unknown[] = [];
  const chapters: AcademyChapter[] = [];

  curriculum.forEach((chapter, index) => {
    if (chapter.no !== index + 1) fail(`chapter ${chapter.no} is out of order`);
    const raw = files.chapters.get(chapter.no);
    if (!raw) fail(`chapter ${chapter.no} files are missing`);
    const chapterLessons = lessonFileSchema.parse(raw.lessons);
    const chapterQuestions = questionFileSchema.parse(raw.questions);
    banks.push(raw.questions);

    const ids = chapterLessons.map((lesson) => lesson.id);
    if (canonicalJson(ids) !== canonicalJson(chapter.lesson_ids))
      fail(`chapter ${chapter.no} lessons do not match CURRICULUM lesson_ids`);

    const built = chapterLessons.map((lesson, position): AcademyLesson => {
      const mapped = mapById.get(lesson.id);
      if (!mapped) fail(`lesson ${lesson.id} is missing from LESSON-MAP`);
      if (
        lesson.chapter !== chapter.no ||
        mapped.chapter !== chapter.no ||
        lesson.order !== position + 1 ||
        mapped.kind !== lesson.kind ||
        mapped.config_id !== lesson.config_id
      )
        fail(`lesson ${lesson.id} disagrees with LESSON-MAP or chapter order`);
      if (lesson.content_version !== ACADEMY_CONTENT_VERSION)
        fail(`lesson ${lesson.id} has content_version ${lesson.content_version}`);
      if (lessons.has(lesson.id)) fail(`lesson ${lesson.id} is duplicated`);
      const entry = { ...lesson, capabilities: capabilitiesForLesson(lesson) };
      lessons.set(lesson.id, entry);
      questionsByLesson.set(lesson.id, []);
      return entry;
    });

    for (const question of chapterQuestions) {
      const bucket = questionsByLesson.get(question.lesson_id);
      if (!bucket || lessons.get(question.lesson_id)?.chapter !== chapter.no)
        fail(`question ${question.id} references lesson ${question.lesson_id} outside chapter`);
      if (questionIds.has(question.id)) fail(`question id ${question.id} is duplicated`);
      questionIds.add(question.id);
      const optionIds = new Set(question.options.map((option) => option.id));
      if (optionIds.size !== question.options.length)
        fail(`question ${question.id} has duplicate option ids`);
      if (question.options[question.correct_index]?.id !== question.correct_option_id)
        fail(`question ${question.id} answer key is inconsistent`);
      bucket.push(question);
    }
    chapters.push({
      no: chapter.no,
      title: chapter.title,
      type: chapter.type,
      bot: chapter.bot,
      lesson_ids: chapter.lesson_ids,
      lessons: built,
    });
  });

  if (lessons.size !== ACADEMY_LESSON_COUNT)
    fail(`expected ${ACADEMY_LESSON_COUNT} lessons, found ${lessons.size}`);
  for (const [lessonId, questions] of questionsByLesson) {
    if (questions.length !== QUESTIONS_PER_LESSON)
      fail(`lesson ${lessonId} has ${questions.length} questions`);
  }

  return {
    content_version: ACADEMY_CONTENT_VERSION,
    questions_version: canonicalHash(banks),
    chapters,
    lessons,
    questionsByLesson,
  };
}

function contentRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'content');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Reads the shipped content directory (server-only question banks included). */
export function readAcademyContentFiles(root: string = contentRoot()): AcademyContentFiles {
  const chapters = new Map<number, { lessons: unknown; questions: unknown }>();
  for (let no = 1; no <= ACADEMY_CHAPTER_COUNT; no += 1) {
    const folder = join(root, 'chapters', String(no).padStart(2, '0'));
    chapters.set(no, {
      lessons: readJson(join(folder, 'lessons.vi.json')),
      questions: readJson(join(folder, 'questions.vi.private.json')),
    });
  }
  return {
    curriculum: readJson(join(root, 'CURRICULUM.json')),
    lessonMap: readJson(join(root, 'LESSON-MAP.json')),
    chapters,
  };
}

let memoized: AcademyContent | undefined;

/** Loads and validates the academy content once per process. */
export function loadAcademyContent(): AcademyContent {
  memoized ??= buildAcademyContent(readAcademyContentFiles());
  return memoized;
}
