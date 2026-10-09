import { z } from 'zod';

import { QUESTIONS_PER_LESSON } from './academy.constants.js';
import { canonicalHash, deepFreeze } from './academy.hash.js';
import {
  chartsFileSchema,
  privateQuestionsFileSchema,
  type ChartModel,
  type PrivateQuestion,
} from './content/packages/package.schema.js';

/**
 * Question banks. Server-only: the answer key and the explanations live here and leave the
 * server only through the review of a submitted attempt (see academy.grading.ts).
 *
 * Two bank formats exist and both are pinned by `questions_version` (a sha256):
 *  - `package-v1`: the 8 questions of a content package (chapters 1 and 3) plus the chart models
 *    their figures reference; every option carries its own explanation, option ids are opaque.
 *  - `legacy-v1`: the re-homed banks of the other chapters (`lessons/<id>/assessment.vi.private.json`)
 *    with one explanation per question.
 * A bank that is replaced stays gradable through `content/archive/banks/<questions_version>.json`.
 */
export type AcademyQuestionFigure =
  | { type: 'chart'; chart_id: string; chart: ChartModel }
  | { type: 'table'; head: string[]; rows: string[][] };

export type AcademyQuestionOption = {
  id: string;
  text: string;
  /** Per-option explanation (package banks); null for legacy banks. */
  explanation: string | null;
};

/** Server-only question with its answer key; never serialize this type to a client. */
export type AcademyQuestion = {
  id: string;
  prompt: string;
  topic: string | null;
  /** Lesson section (1-4) the question revises; null for legacy banks. */
  section: 1 | 2 | 3 | 4 | null;
  hint: string | null;
  figure: AcademyQuestionFigure | null;
  options: AcademyQuestionOption[];
  correct_option_id: string;
  /** Question-level explanation (legacy banks); null for package banks. */
  explanation: string | null;
};

export type BankFormat = 'package-v1' | 'legacy-v1';

export type LessonAssessment = {
  /** sha256 pinned by attempts (`academy_attempts.questions_version`). */
  version: string;
  format: BankFormat;
  /** Exactly 8 questions in bank order (`<lesson_id>-q01..q08`). */
  questions: readonly AcademyQuestion[];
};

/** A superseded bank, kept so attempts created against it are still graded with it. */
export type ArchivedBank = {
  lesson_id: string;
  lesson_key: string;
  content_version: string;
  superseded_by: string | null;
  assessment: LessonAssessment;
};

const lessonIdSchema = z.string().regex(/^ch\d{2}-l\d{2}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

const expectedQuestionIds = (lessonId: string): string[] =>
  Array.from(
    { length: QUESTIONS_PER_LESSON },
    (_, index) => `${lessonId}-q${String(index + 1).padStart(2, '0')}`,
  );

/* ---------------------------------------------------------------- legacy-v1 banks */

const legacyQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  lesson_id: lessonIdSchema,
  question: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1).max(64), text: z.string().min(1) })).min(2),
  correct_index: z.number().int().min(0),
  correct_option_id: z.string().min(1),
  explanation: z.string().min(1),
});

/** Non-strict on purpose: the version hash covers the parsed (known) fields only, as it always has. */
const legacyAssessmentFileSchema = z.object({
  lesson_id: lessonIdSchema,
  questions: z.array(legacyQuestionSchema),
});

function toLegacyQuestion(question: z.infer<typeof legacyQuestionSchema>): AcademyQuestion {
  return {
    id: question.id,
    prompt: question.question,
    topic: null,
    section: null,
    hint: null,
    figure: null,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      explanation: null,
    })),
    correct_option_id: question.correct_option_id,
    explanation: question.explanation,
  };
}

/** Validates a legacy bank file and builds the assessment. Question ids are checked against `seen`. */
export function buildLegacyAssessment(
  lessonId: string,
  raw: unknown,
  seenQuestionIds?: Set<string>,
): LessonAssessment {
  const file = legacyAssessmentFileSchema.parse(raw);
  if (file.lesson_id !== lessonId) fail(`assessment of ${lessonId} declares ${file.lesson_id}`);
  if (file.questions.length !== QUESTIONS_PER_LESSON)
    fail(`lesson ${lessonId} has ${file.questions.length} questions`);
  const expected = expectedQuestionIds(lessonId);
  file.questions.forEach((question, index) => {
    if (question.id !== expected[index] || question.lesson_id !== lessonId)
      fail(`question ${question.id} must be ${expected[index]} of lesson ${lessonId}`);
    if (seenQuestionIds?.has(question.id)) fail(`question id ${question.id} is duplicated`);
    seenQuestionIds?.add(question.id);
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length)
      fail(`question ${question.id} has duplicate option ids`);
    if (question.options[question.correct_index]?.id !== question.correct_option_id)
      fail(`question ${question.id} answer key is inconsistent`);
  });
  return {
    version: canonicalHash(file.questions),
    format: 'legacy-v1',
    questions: deepFreeze(file.questions.map(toLegacyQuestion)),
  };
}

/* --------------------------------------------------------------- package-v1 banks */

function toPackageQuestion(
  question: PrivateQuestion,
  charts: Readonly<Record<string, ChartModel>>,
): AcademyQuestion {
  let figure: AcademyQuestionFigure | null = null;
  if (question.figure?.type === 'chart') {
    const chart = charts[question.figure.chart_id];
    if (!chart)
      fail(`question ${question.id} references missing chart ${question.figure.chart_id}`);
    figure = { type: 'chart', chart_id: question.figure.chart_id, chart };
  } else if (question.figure?.type === 'table') {
    figure = { type: 'table', head: question.figure.head, rows: question.figure.rows };
  }
  return {
    id: question.id,
    prompt: question.prompt,
    topic: question.topic,
    section: question.section,
    hint: question.hint ?? null,
    figure,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      explanation: option.explanation,
    })),
    correct_option_id: question.correct_option_id,
    explanation: null,
  };
}

/** The data a package bank version covers: its questions and the chart models of their figures. */
function packageBankIdentity(
  lessonId: string,
  questions: readonly PrivateQuestion[],
  charts: Readonly<Record<string, ChartModel>>,
) {
  const figureCharts: Record<string, ChartModel> = {};
  for (const question of questions)
    if (question.figure?.type === 'chart') {
      const chart = charts[question.figure.chart_id];
      if (chart) figureCharts[question.figure.chart_id] = chart;
    }
  return { format: 'package-v1', lesson_id: lessonId, questions, charts: figureCharts };
}

/**
 * Builds the assessment of one package lesson from its (already schema-validated) private
 * questions. The version hashes the questions together with the chart models their figures use.
 */
export function buildPackageAssessment(
  lessonId: string,
  questions: readonly PrivateQuestion[],
  charts: Readonly<Record<string, ChartModel>>,
  seenQuestionIds?: Set<string>,
): LessonAssessment {
  const sorted = [...questions].sort((left, right) => (left.id < right.id ? -1 : 1));
  const expected = expectedQuestionIds(lessonId);
  if (sorted.length !== QUESTIONS_PER_LESSON)
    fail(`lesson ${lessonId} has ${sorted.length} questions`);
  sorted.forEach((question, index) => {
    if (question.id !== expected[index] || question.lesson_id !== lessonId)
      fail(`question ${question.id} must be ${expected[index]} of lesson ${lessonId}`);
    if (seenQuestionIds?.has(question.id)) fail(`question id ${question.id} is duplicated`);
    seenQuestionIds?.add(question.id);
  });
  const identity = packageBankIdentity(lessonId, sorted, charts);
  return {
    version: canonicalHash(identity),
    format: 'package-v1',
    questions: deepFreeze(sorted.map((question) => toPackageQuestion(question, charts))),
  };
}

/* ---------------------------------------------------------------- archived banks */

const archiveBaseShape = {
  questions_version: sha256Schema,
  lesson_id: lessonIdSchema,
  lesson_key: z.string().regex(/^(technical|fundamental|concept|guide):[a-z0-9_-]+$/),
  content_version: z.string().min(1).max(32),
  superseded_by: z.string().min(1).optional(),
};

export const archivedBankFileSchema = z.discriminatedUnion('format', [
  z.strictObject({ format: z.literal('legacy-v1'), ...archiveBaseShape, assessment: z.unknown() }),
  z.strictObject({
    format: z.literal('package-v1'),
    ...archiveBaseShape,
    questions: privateQuestionsFileSchema,
    charts: chartsFileSchema,
  }),
]);

export type ArchivedBankFile = z.infer<typeof archivedBankFileSchema>;

/** Wraps a package assessment source into the archive file format (used when a bank is retired). */
export function packageBankArchiveFile(input: {
  lesson_id: string;
  lesson_key: string;
  content_version: string;
  superseded_by?: string;
  questions: readonly PrivateQuestion[];
  charts: Readonly<Record<string, ChartModel>>;
}): ArchivedBankFile {
  const assessment = buildPackageAssessment(input.lesson_id, input.questions, input.charts);
  const sorted = [...input.questions].sort((left, right) => (left.id < right.id ? -1 : 1));
  const identity = packageBankIdentity(input.lesson_id, sorted, input.charts);
  return {
    format: 'package-v1',
    questions_version: assessment.version,
    lesson_id: input.lesson_id,
    lesson_key: input.lesson_key,
    content_version: input.content_version,
    ...(input.superseded_by !== undefined ? { superseded_by: input.superseded_by } : {}),
    questions: [...identity.questions],
    charts: identity.charts,
  };
}

/** Parses an archive file and proves its content still hashes to the version it is filed under. */
export function buildArchivedBank(raw: unknown, filedUnder: string): ArchivedBank {
  const file = archivedBankFileSchema.parse(raw);
  if (file.questions_version !== filedUnder)
    fail(`archived bank filed as ${filedUnder} declares ${file.questions_version}`);
  const assessment =
    file.format === 'legacy-v1'
      ? buildLegacyAssessment(file.lesson_id, file.assessment)
      : buildPackageAssessment(file.lesson_id, file.questions, file.charts);
  if (assessment.version !== file.questions_version)
    fail(
      `archived bank ${file.questions_version} of ${file.lesson_id} no longer hashes to its version`,
    );
  return {
    lesson_id: file.lesson_id,
    lesson_key: file.lesson_key,
    content_version: file.content_version,
    superseded_by: file.superseded_by ?? null,
    assessment,
  };
}
