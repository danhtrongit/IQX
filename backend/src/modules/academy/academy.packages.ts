import { z } from 'zod';

import {
  chartIdsOf,
  computedTableChartIdsOf,
  imageBlocksOf,
  lessonBlockSchema,
  type AcademySection,
} from './academy.blocks.js';
import { buildPackageAssessment, type LessonAssessment } from './academy.banks.js';
import { deepFreeze } from './academy.hash.js';
import {
  chartsFileSchema,
  packageLessonsFileSchema,
  privateQuestionsFileSchema,
  type ChartModel,
  type PackageLesson,
  type PrivateQuestion,
} from './content/packages/package.schema.js';

/** Raw JSON of one chapter package folder (`content/packages/chNN`). */
export type AcademyPackageFiles = {
  lessons: unknown;
  /** Present for chapters 1 and 3. */
  charts?: unknown;
  /** Present for chapters 1 and 3 (private). */
  questions?: unknown;
};

/** What the reader needs besides the sections of a lesson. */
export type PackageLessonContent = {
  content_version: string;
  title: string;
  lead: string;
  nav_labels: readonly [string, string, string, string];
  /** Label of the guide completion button; null for quiz lessons. */
  completion_button_label: string | null;
  sections: AcademySection[];
  /** Chart models referenced by this lesson's chart blocks, keyed by chart id. */
  charts: Record<string, ChartModel>;
  package: { id: string; version: string };
};

export type PackageLessonBundle = {
  lesson: PackageLesson;
  content: PackageLessonContent;
  /** The 8-question bank of quiz lessons; null for guides. */
  assessment: LessonAssessment | null;
};

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

const chapterDir = (chapter: number): string => `ch${String(chapter).padStart(2, '0')}`;

function parseSections(lesson: PackageLesson): AcademySection[] {
  return lesson.sections.map((section) => {
    const parsed = z.array(lessonBlockSchema).safeParse(section.blocks);
    if (!parsed.success)
      fail(
        `lesson ${lesson.id} section ${section.id} has a block the reader contract does not allow ` +
          `(containers hold leaf blocks only): ${parsed.error.issues[0]?.message ?? 'invalid block'}`,
      );
    return { id: section.id, title: section.title, blocks: parsed.data };
  });
}

/**
 * Validates one chapter package with package.schema.ts and groups it by lesson: typed sections,
 * the chart models its chart blocks use, and (quiz lessons) the pinned question bank.
 * Fails loudly on any reference that does not resolve.
 */
export function buildPackageBundles(
  chapter: number,
  files: AcademyPackageFiles,
  seenQuestionIds?: Set<string>,
): Map<string, PackageLessonBundle> {
  const dir = chapterDir(chapter);
  const lessons = packageLessonsFileSchema.parse(files.lessons);
  const charts: Record<string, ChartModel> =
    files.charts === undefined ? {} : chartsFileSchema.parse(files.charts);
  const questions: PrivateQuestion[] =
    files.questions === undefined ? [] : privateQuestionsFileSchema.parse(files.questions);

  const questionsByLesson = new Map<string, PrivateQuestion[]>();
  for (const question of questions) {
    const list = questionsByLesson.get(question.lesson_id) ?? [];
    list.push(question);
    questionsByLesson.set(question.lesson_id, list);
  }

  const bundles = new Map<string, PackageLessonBundle>();
  for (const lesson of lessons) {
    if (bundles.has(lesson.id)) fail(`package ${dir} lists lesson ${lesson.id} twice`);
    if (lesson.chapter !== chapter || !lesson.id.startsWith(`${dir}-`))
      fail(`lesson ${lesson.id} does not belong to package ${dir}`);

    const sections = parseSections(lesson);
    const used: Record<string, ChartModel> = {};
    for (const id of sections.flatMap((section) => chartIdsOf(section.blocks))) {
      const chart = charts[id];
      if (!chart) fail(`lesson ${lesson.id} references missing chart ${id}`);
      used[id] = chart;
    }
    for (const id of sections.flatMap((section) => computedTableChartIdsOf(section.blocks)))
      if (!charts[id]) fail(`lesson ${lesson.id} computed table references missing chart ${id}`);
    for (const image of sections.flatMap((section) => imageBlocksOf(section.blocks)))
      if (!image.src.startsWith(`/assets/academy/${dir}/`))
        fail(`lesson ${lesson.id} image ${image.asset_id} is not under /assets/academy/${dir}/`);

    const own = questionsByLesson.get(lesson.id) ?? [];
    let assessment: LessonAssessment | null = null;
    if (lesson.completion.mode === 'quiz') {
      assessment = buildPackageAssessment(lesson.id, own, charts, seenQuestionIds);
    } else if (own.length) {
      fail(`guide lesson ${lesson.id} must not have questions`);
    }

    bundles.set(
      lesson.id,
      deepFreeze({
        lesson,
        content: {
          content_version: lesson.content_version,
          title: lesson.title,
          lead: lesson.lead,
          nav_labels: lesson.nav_labels,
          completion_button_label:
            lesson.completion.mode === 'manual' ? lesson.completion.button_label : null,
          sections,
          charts: used,
          package: { id: lesson.source.package, version: lesson.source.package_version },
        },
        assessment,
      }),
    );
  }

  for (const lessonId of questionsByLesson.keys())
    if (!bundles.has(lessonId)) fail(`questions of unknown lesson ${lessonId} in package ${dir}`);
  return bundles;
}

/** Package lesson versus catalog entry: the catalog owns identity, binding and completion mode. */
export function assertPackageLessonMatchesCatalog(
  entry: {
    id: string;
    order: number;
    name: string;
    lesson_key: string;
    kind: string;
    completion: { mode: 'quiz' | 'guide' };
    capability_binding: { id: string } | null;
  },
  chapter: number,
  lesson: PackageLesson,
): void {
  const where = `package lesson ${lesson.id}`;
  if (lesson.lesson_key !== entry.lesson_key)
    fail(`${where} has lesson key ${lesson.lesson_key}, the catalog says ${entry.lesson_key}`);
  if (lesson.chapter !== chapter || lesson.order !== entry.order)
    fail(`${where} is chapter ${lesson.chapter} order ${lesson.order}, catalog differs`);
  if (lesson.kind !== entry.kind)
    fail(`${where} is a ${lesson.kind} lesson, the catalog says ${entry.kind}`);
  if (lesson.name !== entry.name)
    fail(`${where} is named "${lesson.name}", the catalog says "${entry.name}"`);
  const mode = lesson.completion.mode === 'quiz' ? 'quiz' : 'guide';
  if (mode !== entry.completion.mode)
    fail(`${where} completes by ${mode}, the catalog says ${entry.completion.mode}`);
  if ((lesson.config_id ?? null) !== (entry.capability_binding?.id ?? null))
    fail(`${where} config_id ${lesson.config_id} differs from the catalog capability binding`);
}
