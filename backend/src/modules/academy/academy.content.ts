import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { capabilitiesForLesson } from './academy.capabilities.js';
import { buildArchivedBank, buildLegacyAssessment } from './academy.banks.js';
import type { ArchivedBank, LessonAssessment } from './academy.banks.js';
import type { AcademySection } from './academy.blocks.js';
import {
  ACADEMY_CATALOG_VERSION,
  ACADEMY_CHAPTER_COUNT,
  ACADEMY_LEGACY_CATALOG_VERSION,
  ACADEMY_LESSON_COUNT,
  QUESTIONS_PER_LESSON,
} from './academy.constants.js';
import { canonicalHash, canonicalJson, deepFreeze } from './academy.hash.js';
import {
  assertPackageLessonMatchesCatalog,
  buildPackageBundles,
  type AcademyPackageFiles,
  type PackageLessonBundle,
} from './academy.packages.js';
import type { ChartModel } from './content/packages/package.schema.js';

export {
  ACADEMY_CATALOG_VERSION,
  ACADEMY_CHAPTER_COUNT,
  ACADEMY_LEGACY_CATALOG_VERSION,
  ACADEMY_LESSON_COUNT,
  QUESTIONS_PER_LESSON,
  canonicalHash,
  canonicalJson,
};
export type {
  AcademyQuestion,
  AcademyQuestionFigure,
  AcademyQuestionOption,
  ArchivedBank,
  LessonAssessment,
} from './academy.banks.js';
export type { AcademyBlock, AcademySection } from './academy.blocks.js';
export type { AcademyPackageFiles } from './academy.packages.js';

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
 * Re-homed lessons of the chapters without a package keep their approved HTML sections
 * (`{ title, html }`, normalised to one `html` block) and their 8-question legacy bank.
 */
const legacyLessonFileSchema = z.object({
  lesson_id: lessonIdSchema,
  content_version: z.string().min(1).max(32),
  origin: z.string().optional(),
  sections: z
    .array(
      z.object({ id: z.string().min(1).optional(), title: z.string(), html: z.string().min(1) }),
    )
    .min(1),
  fixture: z.record(z.string(), z.unknown()).nullable().default(null),
  sources: z.array(z.string()).default([]),
  review_status: z.string().default(''),
});

/**
 * A lesson served from a content package may keep its old `lessons/<id>/lesson.vi.json` only as a
 * stub (the worked fixture still read by the quant registry tests). The stub names the package
 * version that first superseded it, so a stale full lesson file can never be mistaken for live
 * content: a file without `superseded_by` is refused.
 */
const supersededLessonFileSchema = z.object({
  lesson_id: lessonIdSchema,
  superseded_by: z.string().min(1),
});

export type AcademyLessonKind = z.infer<typeof lessonKindSchema>;
export type AcademyChapterType = z.infer<typeof chapterTypeSchema>;
export type AcademyContentStatus = z.infer<typeof contentStatusSchema>;
export type AcademyCompletion = z.infer<typeof completionSchema>;
type CatalogLessonFile = z.infer<typeof catalogLessonSchema>;

export type PublishedLessonContent = {
  content_version: string;
  origin: 'package' | 'legacy';
  /** Reader heading: the package title, or the catalog name of a legacy lesson. */
  title: string;
  lead: string | null;
  nav_labels: readonly [string, string, string, string] | null;
  /** Label of the guide completion button ("Hoàn thành bài học"); null for quiz lessons. */
  completion_button_label: string | null;
  sections: AcademySection[];
  /** Chart models of the lesson's chart blocks, keyed by chart id. */
  charts: Record<string, ChartModel>;
  fixture: Record<string, unknown> | null;
  sources: string[];
  review_status: string | null;
  package: { id: string; version: string } | null;
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
  /** Superseded banks by `questions_version`: attempts pinned to them are still graded with them. */
  archivedBanks: ReadonlyMap<string, ArchivedBank>;
};

/** Raw parsed JSON files of the content directory. */
export type AcademyContentFiles = {
  catalog: unknown;
  /** Lesson files by lesson id (`lessons/<id>/lesson.vi.json`). */
  lessons: ReadonlyMap<string, unknown>;
  /** Server-only legacy question banks by lesson id (`lessons/<id>/assessment.vi.private.json`). */
  assessments: ReadonlyMap<string, unknown>;
  /** Chapter number -> raw package files (`packages/chNN`). */
  packages?: ReadonlyMap<number, AcademyPackageFiles>;
  /** `questions_version` -> raw archived bank (`archive/banks/<questions_version>.json`). */
  archive?: ReadonlyMap<string, unknown>;
};

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

function legacyContent(
  entry: CatalogLessonFile,
  file: z.infer<typeof legacyLessonFileSchema>,
): PublishedLessonContent {
  const sections = file.sections.map((section, index): AcademySection => ({
    id: section.id ?? `s${index + 1}`,
    title: section.title,
    blocks: [{ type: 'html', html: section.html }],
  }));
  const ids = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.id)) fail(`lesson ${entry.id} duplicates section ${section.id}`);
    ids.add(section.id);
  }
  return {
    content_version: file.content_version,
    origin: 'legacy',
    title: entry.name,
    lead: null,
    nav_labels: null,
    completion_button_label: null,
    sections,
    charts: {},
    fixture: file.fixture,
    sources: file.sources,
    review_status: file.review_status || null,
    package: null,
  };
}

function packageContent(bundle: PackageLessonBundle): PublishedLessonContent {
  return {
    ...bundle.content,
    origin: 'package',
    fixture: Object.keys(bundle.lesson.fixture).length ? bundle.lesson.fixture : null,
    sources: [],
    review_status: null,
  };
}

/**
 * Validates the catalog and every content file against it and builds lookup tables. Throws on
 * any inconsistency. Chapters that have a package are served from it (their lessons must match the
 * catalog's lesson keys, kinds, names and completion modes); the others from the legacy files.
 */
export function buildAcademyContent(files: AcademyContentFiles): AcademyContent {
  const catalog = catalogFileSchema.parse(files.catalog);
  const lessons = new Map<string, AcademyLesson>();
  const lessonsByKey = new Map<string, AcademyLesson>();
  const lessonsByLegacyId = new Map<string, AcademyLesson>();
  const questionIds = new Set<string>();
  const chapters: AcademyChapter[] = [];

  const bundles = new Map<string, PackageLessonBundle>();
  for (const [chapter, packageFiles] of [...(files.packages ?? [])].sort((a, b) => a[0] - b[0]))
    for (const [id, bundle] of buildPackageBundles(chapter, packageFiles, questionIds)) {
      if (bundles.has(id)) fail(`lesson ${id} is provided by two packages`);
      bundles.set(id, bundle);
    }
  const catalogIds = new Set(
    catalog.chapters.flatMap((chapter) => chapter.lessons.map((entry) => entry.id)),
  );
  for (const id of bundles.keys())
    if (!catalogIds.has(id)) fail(`package lesson ${id} is not in the catalog`);

  catalog.chapters.forEach((chapter, chapterIndex) => {
    if (chapter.no !== chapterIndex + 1) fail(`chapter ${chapter.no} is out of order`);
    const packaged = chapter.lessons.filter((entry) => bundles.has(entry.id)).length;
    if (packaged !== 0 && packaged !== chapter.lessons.length)
      fail(`chapter ${chapter.no} package covers ${packaged} of ${chapter.lessons.length} lessons`);

    const built = chapter.lessons.map((entry, position): AcademyLesson => {
      const expectedId = `ch${String(chapter.no).padStart(2, '0')}-l${String(position + 1).padStart(2, '0')}`;
      if (entry.id !== expectedId || entry.order !== position + 1)
        fail(`lesson ${entry.id} must be ${expectedId} with order ${position + 1}`);
      if (lessons.has(entry.id)) fail(`lesson ${entry.id} is duplicated`);
      if (lessonsByKey.has(entry.lesson_key)) fail(`lesson key ${entry.lesson_key} is duplicated`);
      assertKindRules(entry);

      let content: PublishedLessonContent | null = null;
      let assessment: LessonAssessment | null = null;
      const bundle = bundles.get(entry.id);
      const rawLesson = files.lessons.get(entry.id);
      const rawAssessment = files.assessments.get(entry.id);
      if (entry.content_status === 'published') {
        if (bundle) {
          assertPackageLessonMatchesCatalog(entry, chapter.no, bundle.lesson);
          if (rawAssessment !== undefined)
            fail(`lesson ${entry.id} is served from a package but keeps a legacy question bank`);
          if (rawLesson !== undefined) {
            const stub = supersededLessonFileSchema.parse(rawLesson);
            if (stub.lesson_id !== entry.id)
              fail(`legacy file of ${entry.id} declares ${stub.lesson_id}`);
          }
          content = packageContent(bundle);
          assessment = bundle.assessment;
        } else {
          if (rawLesson === undefined) fail(`published lesson ${entry.id} has no lesson file`);
          const file = legacyLessonFileSchema.parse(rawLesson);
          if (file.lesson_id !== entry.id)
            fail(`lesson file of ${entry.id} declares ${file.lesson_id}`);
          content = legacyContent(entry, file);
          if (entry.completion.mode === 'quiz') {
            if (rawAssessment === undefined)
              fail(`published quiz lesson ${entry.id} has no assessment`);
            assessment = buildLegacyAssessment(entry.id, rawAssessment, questionIds);
          } else if (rawAssessment !== undefined) {
            fail(`guide lesson ${entry.id} must not have an assessment`);
          }
        }
        deepFreeze(content);
      } else if (bundle || rawLesson !== undefined || rawAssessment !== undefined) {
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

  const archivedBanks = new Map<string, ArchivedBank>();
  for (const [version, raw] of files.archive ?? []) {
    const bank = buildArchivedBank(raw, version);
    const owner = lessons.get(bank.lesson_id);
    if (!owner || owner.lesson_key !== bank.lesson_key)
      fail(`archived bank ${version} belongs to unknown lesson ${bank.lesson_id}`);
    archivedBanks.set(version, bank);
  }

  return {
    catalog_version: catalog.catalog_version,
    legacy_catalog_version: catalog.legacy_catalog_version,
    chapters,
    lessons,
    lessonsByKey,
    lessonsByLegacyId,
    archivedBanks,
  };
}

/**
 * The bank an attempt was created against: the lesson's current bank when the versions agree,
 * otherwise the archived bank of that version. Never a different bank: null when it is unknown.
 */
export function resolveAssessment(
  content: AcademyContent,
  lesson: AcademyLesson,
  questionsVersion: string,
): LessonAssessment | null {
  if (lesson.assessment?.version === questionsVersion) return lesson.assessment;
  const archived = content.archivedBanks.get(questionsVersion);
  return archived?.lesson_id === lesson.id && archived.lesson_key === lesson.lesson_key
    ? archived.assessment
    : null;
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
 *   packages/chNN/lessons.vi.json                    chapter packages (typed lessons)
 *   packages/chNN/charts.vi.json                     chart models (chapters 1 and 3)
 *   packages/chNN/questions.vi.private.json          package question banks (chapters 1 and 3)
 *   lessons/<lesson id>/lesson.vi.json               legacy lesson content (or a superseded stub)
 *   lessons/<lesson id>/assessment.vi.private.json   legacy 8-question bank
 *   archive/banks/<questions_version>.json           superseded banks, still used to grade
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

  const packages = new Map<number, AcademyPackageFiles>();
  const packagesDir = join(root, 'packages');
  if (existsSync(packagesDir)) {
    for (const name of readdirSync(packagesDir).sort()) {
      const match = /^ch(\d{2})$/.exec(name);
      if (!match) continue;
      const dir = join(packagesDir, name);
      const optional = (file: string): unknown =>
        existsSync(join(dir, file)) ? readJson(join(dir, file)) : undefined;
      const charts = optional('charts.vi.json');
      const questions = optional('questions.vi.private.json');
      packages.set(Number(match[1]), {
        lessons: readJson(join(dir, 'lessons.vi.json')),
        ...(charts !== undefined ? { charts } : {}),
        ...(questions !== undefined ? { questions } : {}),
      });
    }
  }

  const archive = new Map<string, unknown>();
  const archiveDir = join(root, 'archive', 'banks');
  if (existsSync(archiveDir))
    for (const name of readdirSync(archiveDir).sort()) {
      const match = /^([0-9a-f]{64})\.json$/.exec(name);
      if (match) archive.set(match[1]!, readJson(join(archiveDir, name)));
    }

  return {
    catalog: readJson(join(root, 'catalog.v1.json')),
    lessons,
    assessments,
    packages,
    archive,
  };
}

let memoized: AcademyContent | undefined;

/** Loads and validates the academy content once per process. */
export function loadAcademyContent(): AcademyContent {
  memoized ??= buildAcademyContent(readAcademyContentFiles());
  return memoized;
}
