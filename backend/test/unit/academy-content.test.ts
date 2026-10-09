import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { packageBankArchiveFile } from '../../src/modules/academy/academy.banks.js';
import type { AcademyBlock } from '../../src/modules/academy/academy.blocks.js';
import {
  ACADEMY_CATALOG_VERSION,
  ACADEMY_LEGACY_CATALOG_VERSION,
  buildAcademyContent,
  loadAcademyContent,
  readAcademyContentFiles,
  type AcademyPackageFiles,
} from '../../src/modules/academy/academy.content.js';
import { buildAttemptOrder } from '../../src/modules/academy/academy.grading.js';
import type { AttemptRow } from '../../src/modules/academy/academy.repository.js';
import {
  attemptResponseSchema,
  lessonResponseSchema,
  submitResponseSchema,
} from '../../src/modules/academy/academy.schemas.js';
import {
  chartModelSchema,
  type PackageLesson,
  type PrivateQuestion,
} from '../../src/modules/academy/content/packages/package.schema.js';
import {
  MemoryAcademy,
  TestAcademyService,
  USER,
  answerKey,
  correctAnswers,
  deepKeys,
  pass,
  seededRandom,
  setup,
  start,
} from './academy-test-kit.js';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, '../../src/modules/academy/content');
const publicDir = join(here, '../../../frontend/public');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const CHAPTER_LESSONS = (chapter: number) =>
  Array.from({ length: 6 }, (_, i) => `ch0${chapter}-l0${i + 1}`);
const PACKAGED_QUIZ_LESSONS = [...CHAPTER_LESSONS(1), ...CHAPTER_LESSONS(3)];

function walk(blocks: readonly AcademyBlock[], visit: (block: AcademyBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.type === 'callout' || block.type === 'details') walk(block.blocks, visit);
  }
}

type Lesson = Awaited<ReturnType<ReturnType<typeof setup>['service']['lesson']>>;
function blocksOf(lesson: Lesson, type: AcademyBlock['type']): AcademyBlock[] {
  const found: AcademyBlock[] = [];
  for (const section of lesson.sections)
    walk(section.blocks, (block) => block.type === type && found.push(block));
  return found;
}

/** Keys that must never be visible before a submit (and, for the lesson, never at all). */
const PRIVATE_KEY = /"(correct_option_id|correct_index|explanation|source_id|correct|proof)"\s*:/;

type PackageMap = Map<number, AcademyPackageFiles>;
/** Builds the live content with a mutated copy of the chapter packages. */
function buildWithPackages(mutate: (packages: PackageMap) => void) {
  const files = readAcademyContentFiles();
  const packages: PackageMap = new Map(
    [...(files.packages ?? [])].map(([chapter, value]) => [chapter, structuredClone(value)]),
  );
  mutate(packages);
  return buildAcademyContent({ ...files, packages });
}
const lessonsOf = (packages: PackageMap, chapter: number) =>
  packages.get(chapter)!.lessons as PackageLesson[];
const questionsOf = (packages: PackageMap, chapter: number) =>
  packages.get(chapter)!.questions as PrivateQuestion[];

describe('academy chapter 1-4 packages are the live content', () => {
  const content = loadAcademyContent();
  const { service } = setup();

  it('serves 24 package lessons whose keys, kinds, names and bindings come from the catalog', () => {
    const packaged = [...content.lessons.values()].filter((lesson) => lesson.chapter <= 4);
    expect(packaged).toHaveLength(24);
    for (const lesson of packaged) {
      expect(lesson.content?.origin, lesson.id).toBe('package');
      expect(lesson.content?.package?.id, lesson.id).toMatch(/^iqx-ch[1-4]-/);
      expect(
        lesson.content?.sections.map((section) => section.id),
        lesson.id,
      ).toEqual(['s1', 's2', 's3', 's4']);
    }
    expect(content.lessons.get('ch01-l06')).toMatchObject({
      lesson_key: 'concept:hop_luu',
      capabilities: [],
    });
    expect(content.lessons.get('ch03-l06')).toMatchObject({
      lesson_key: 'fundamental:roe',
      capabilities: ['metric:roe'],
    });
    // Everything the package says about a lesson is checked against the catalog (kept in sync).
    const packages = readAcademyContentFiles().packages!;
    for (const [chapter, files] of packages)
      for (const lesson of files.lessons as PackageLesson[]) {
        const entry = content.lessons.get(lesson.id)!;
        expect(entry.chapter).toBe(chapter);
        expect(entry.lesson_key).toBe(lesson.lesson_key);
        expect(entry.kind).toBe(lesson.kind);
        expect(entry.capability_binding?.id ?? null).toBe(lesson.config_id);
      }
  });

  it('counts: C1 16 chart blocks and 48 questions, C2 22 images, C3 13 charts and 48 questions, C4 27 images', async () => {
    const lessons = {
      1: await Promise.all(CHAPTER_LESSONS(1).map((id) => service.lesson(USER, id))),
      2: await Promise.all(CHAPTER_LESSONS(2).map((id) => service.lesson(USER, id))),
      3: await Promise.all(CHAPTER_LESSONS(3).map((id) => service.lesson(USER, id))),
      4: await Promise.all(CHAPTER_LESSONS(4).map((id) => service.lesson(USER, id))),
    };
    const per = (chapter: 1 | 2 | 3 | 4, type: AcademyBlock['type']) =>
      lessons[chapter].map((lesson) => blocksOf(lesson, type).length);
    expect(per(1, 'chart')).toEqual([3, 3, 3, 3, 4, 0]);
    expect(per(3, 'chart')).toEqual([3, 2, 2, 2, 2, 2]);
    expect(per(2, 'image')).toEqual([3, 5, 3, 1, 6, 4]);
    expect(per(4, 'image')).toEqual([3, 5, 2, 4, 5, 8]);
    expect(per(1, 'chart').reduce((a, b) => a + b)).toBe(16);
    expect(per(3, 'chart').reduce((a, b) => a + b)).toBe(13);
    expect(per(2, 'image').reduce((a, b) => a + b)).toBe(22);
    expect(per(4, 'image').reduce((a, b) => a + b)).toBe(27);
    for (const chapter of [1, 2, 3, 4] as const)
      for (const lesson of lessons[chapter]) {
        expect(lesson.sections, lesson.id).toHaveLength(4);
        expect(lesson.nav_labels, lesson.id).toHaveLength(4);
      }

    const questions = (chapter: number) =>
      CHAPTER_LESSONS(chapter).flatMap(
        (id) => content.lessons.get(id)!.assessment?.questions ?? [],
      );
    expect(questions(1)).toHaveLength(48);
    expect(questions(3)).toHaveLength(48);
    expect(questions(2)).toHaveLength(0);
    expect(questions(4)).toHaveLength(0);
    const figures = (chapter: number, type: 'chart' | 'table') =>
      questions(chapter).filter((question) => question.figure?.type === type).length;
    expect([figures(1, 'chart'), figures(1, 'table')]).toEqual([10, 2]);
    expect([figures(3, 'chart'), figures(3, 'table')]).toEqual([10, 8]);
    for (const question of [...questions(1), ...questions(3)]) {
      expect(question.options, question.id).toHaveLength(4);
      expect(
        question.options.every((option) => option.explanation),
        question.id,
      ).toBe(true);
      expect(question.options.some((o) => o.id === question.correct_option_id)).toBe(true);
    }
  });

  it('serves the chart models of the lesson chart blocks and validates every one', async () => {
    for (const lessonId of [...CHAPTER_LESSONS(1), ...CHAPTER_LESSONS(3)]) {
      const lesson = await service.lesson(USER, lessonId);
      const ids = blocksOf(lesson, 'chart').map(
        (block) => (block as Extract<AcademyBlock, { type: 'chart' }>).chart_id,
      );
      expect(Object.keys(lesson.charts).sort(), lessonId).toEqual([...new Set(ids)].sort());
      for (const model of Object.values(lesson.charts))
        expect(chartModelSchema.safeParse(model).success, lessonId).toBe(true);
    }
    // Guide chapters and re-homed lessons carry no chart models.
    expect((await service.lesson(USER, 'ch02-l01')).charts).toEqual({});
    expect((await service.lesson(USER, 'ch01-l06')).charts).toEqual({});
    // The golden C1 window: rsi-application is the fallback case, A=116 and B=117.
    const rsi = (await service.lesson(USER, 'ch01-l01')).charts['rsi-application']!;
    expect(rsi).toMatchObject({ kind: 'series_panels' });
    expect((rsi as { marks: unknown }).marks).toEqual([
      { i: 116, label: 'A' },
      { i: 117, label: 'B' },
    ]);
  });

  it('serves image blocks with a public src, size and alt whose files are the verified screenshots', async () => {
    for (const chapter of [2, 4]) {
      const manifest = readJson<
        Record<string, { file: string; sha256: string; width: number; height: number; alt: string }>
      >(join(contentDir, 'packages', `ch0${chapter}`, 'assets.manifest.json'));
      for (const lessonId of CHAPTER_LESSONS(chapter)) {
        const lesson = await service.lesson(USER, lessonId);
        for (const block of blocksOf(lesson, 'image')) {
          const image = block as Extract<AcademyBlock, { type: 'image' }>;
          expect(image.src, image.asset_id).toMatch(
            new RegExp(`^/assets/academy/ch0${chapter}/[A-Za-z0-9._-]+\\.[0-9a-f]{8}\\.webp$`),
          );
          const entry = manifest[image.asset_id]!;
          expect(image.src).toBe(`/${entry.file}`);
          expect([image.width, image.height]).toEqual([entry.width, entry.height]);
          expect(image.alt.length).toBeGreaterThan(0);
          const file = join(publicDir, entry.file);
          expect(existsSync(file), image.src).toBe(true);
          expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(entry.sha256);
        }
      }
    }
  });

  it('keeps every public response inside its documented shape (no extra or private fields)', async () => {
    const { service: fresh } = setup();
    for (const lesson of content.lessons.values()) {
      const response = await fresh.lesson(USER, lesson.id);
      expect(lessonResponseSchema.parse(response), lesson.id).toEqual(response);
      expect(JSON.stringify(response), lesson.id).not.toMatch(PRIVATE_KEY);
      // Package banks use opaque ids: not even the id of the right option appears in the lesson.
      if (lesson.assessment?.format === 'package-v1')
        for (const question of lesson.assessment.questions)
          expect(JSON.stringify(response)).not.toContain(question.correct_option_id);
    }
    const catalog = JSON.stringify(fresh.catalog());
    expect(catalog).not.toMatch(PRIVATE_KEY);
    expect(catalog).not.toMatch(/"(questions|options)"\s*:/);
  });

  it('the response schemas convert to OpenAPI 3.0 without recursion', () => {
    for (const schema of [lessonResponseSchema, attemptResponseSchema, submitResponseSchema]) {
      const json = JSON.stringify(z.toJSONSchema(schema, { target: 'openapi-3.0' }));
      expect(json).not.toContain('$defs');
      expect(json).not.toContain('"$ref":"#"');
    }
  });
});

describe('academy package loading fails loudly', () => {
  it('validates the content when the module starts, not on the first learner request', () => {
    const { service } = setup();
    expect(() => service.onModuleInit()).not.toThrow();
    class BrokenService extends TestAcademyService {
      protected override readonly content = (): never => {
        throw new Error('Invalid academy content: broken package');
      };
    }
    expect(() => new BrokenService(new MemoryAcademy(), undefined).onModuleInit()).toThrow(
      /broken package/,
    );
  });

  it('rejects a package lesson whose key, kind, name or order differs from the catalog', () => {
    expect(() =>
      buildWithPackages((p) => (lessonsOf(p, 1)[0]!.lesson_key = 'technical:macd')),
    ).toThrow(/lesson key technical:macd, the catalog says technical:rsi/);
    expect(() => buildWithPackages((p) => (lessonsOf(p, 3)[1]!.kind = 'concept'))).toThrow(
      /the catalog says fundamental/,
    );
    expect(() => buildWithPackages((p) => (lessonsOf(p, 2)[0]!.name = 'Khác'))).toThrow(
      /the catalog says "Bắt đầu với Backtest"/,
    );
    expect(() => buildWithPackages((p) => (lessonsOf(p, 4)[2]!.config_id = 'rsi'))).toThrow(
      /config_id/,
    );
  });

  it('rejects incomplete or foreign packages', () => {
    expect(() => buildWithPackages((p) => lessonsOf(p, 4).pop())).toThrow(/covers 5 of 6/);
    expect(() => buildWithPackages((p) => (lessonsOf(p, 2)[0]!.id = 'ch02-l09'))).toThrow(
      /not in the catalog/,
    );
    expect(() =>
      buildAcademyContent({
        ...readAcademyContentFiles(),
        assessments: new Map([
          ...readAcademyContentFiles().assessments,
          ['ch01-l01', { lesson_id: 'ch01-l01', questions: [] }],
        ]),
      }),
    ).toThrow(/keeps a legacy question bank/);
  });

  it('rejects dangling chart references, bad banks and guide questions', () => {
    expect(() =>
      buildWithPackages(
        (p) => delete (p.get(1)!.charts as Record<string, unknown>)['concept-chart'],
      ),
    ).toThrow(/missing chart concept-chart/);
    expect(() =>
      buildWithPackages((p) => {
        const figure = questionsOf(p, 1).find((q) => q.figure?.type === 'chart')!.figure!;
        (figure as { chart_id: string }).chart_id = 'does-not-exist';
      }),
    ).toThrow(/missing chart does-not-exist/);
    expect(() => buildWithPackages((p) => questionsOf(p, 3).pop())).toThrow(/7 questions/);
    expect(() =>
      buildWithPackages((p) => {
        const extra = structuredClone(questionsOf(p, 1)[0]!);
        extra.id = 'ch02-l01-q01';
        extra.lesson_id = 'ch02-l01';
        p.get(2)!.questions = [extra];
      }),
    ).toThrow(/guide lesson ch02-l01 must not have questions/);
    expect(() =>
      buildWithPackages((p) => {
        const questions = questionsOf(p, 1);
        questions[1]!.id = questions[0]!.id;
      }),
    ).toThrow(/must be ch01-l01-q02|duplicated/);
  });

  it('keeps containers flat and images inside their chapter folder', () => {
    expect(() =>
      buildWithPackages((p) => {
        const details = lessonsOf(p, 2)
          .flatMap((lesson) => lesson.sections.flatMap((section) => section.blocks))
          .find((block) => block.type === 'details')!;
        (details as { blocks: unknown[] }).blocks.push({
          type: 'callout',
          variant: 'notice',
          blocks: [{ type: 'html', html: '<p>x</p>' }],
        });
      }),
    ).toThrow(/containers hold leaf blocks only/);
    expect(() =>
      buildWithPackages((p) => {
        const image = lessonsOf(p, 2)
          .flatMap((lesson) => lesson.sections.flatMap((section) => section.blocks))
          .find((block) => block.type === 'image')!;
        (image as { src: string }).src = '/assets/academy/ch04/01-overview.00000000.webp';
      }),
    ).toThrow(/is not under \/assets\/academy\/ch02\//);
  });
});

describe('no private question data before submit', () => {
  const content = loadAcademyContent();

  it('the attempt payload of every quiz lesson carries no key, explanation or source id', async () => {
    const { service } = setup();
    let index = 0;
    for (const lesson of content.lessons.values()) {
      if (lesson.completion.mode !== 'quiz') continue;
      index += 1;
      const attempt = await start(
        service,
        lesson.id,
        `attempt-key-${String(index).padStart(4, '0')}`,
      );
      const json = JSON.stringify(attempt);
      expect(json, lesson.id).not.toMatch(PRIVATE_KEY);
      expect(attemptResponseSchema.parse(attempt), lesson.id).toEqual(attempt);
      for (const question of lesson.assessment!.questions) {
        // Package banks: the id of the right option is only ever an option id, no field points at
        // it. (Legacy banks of chapters 5-13 keep the position ids o1..o4, shuffled per attempt.)
        if (lesson.assessment!.format === 'package-v1')
          expect(json.split(question.correct_option_id).length - 1, question.id).toBe(1);
        for (const option of question.options)
          if (option.explanation && option.explanation.length > 25)
            expect(json, question.id).not.toContain(option.explanation);
        // Some legacy explanations repeat an option verbatim; only distinct ones can leak.
        if (
          question.explanation &&
          question.explanation.length > 25 &&
          !question.options.some((option) => option.text === question.explanation)
        )
          expect(json, question.id).not.toContain(question.explanation);
      }
    }
    expect(index).toBe(59);
  });

  it('serves hints and figures (chart model or table) so questions can be answered', async () => {
    const { service } = setup();
    const c1 = await start(service, 'ch01-l01', 'attempt-key-0001');
    const chartQuestions = c1.questions.filter((question) => question.figure?.type === 'chart');
    expect(chartQuestions.map((question) => question.id).sort()).toEqual([
      'ch01-l01-q03',
      'ch01-l01-q04',
    ]);
    for (const question of chartQuestions) {
      const figure = question.figure as Extract<
        NonNullable<typeof question.figure>,
        { type: 'chart' }
      >;
      expect(figure.chart_id).toBe(question.id);
      expect(chartModelSchema.safeParse(figure.chart).success).toBe(true);
    }
    expect(c1.questions.filter((question) => question.hint)).toHaveLength(2);
    const matrix = await start(service, 'ch01-l06', 'attempt-key-0002');
    const tables = matrix.questions.filter((question) => question.figure?.type === 'table');
    expect(tables.map((question) => question.id).sort()).toEqual(['ch01-l06-q03', 'ch01-l06-q04']);
    expect(tables[0]!.figure).toMatchObject({ type: 'table' });
    // Every question knows its topic and the lesson section it revises.
    for (const question of [...c1.questions, ...matrix.questions]) {
      expect(question.topic).toEqual(expect.any(String));
      expect([1, 2, 3, 4]).toContain(question.section);
    }
  });
});

describe('per-attempt shuffles', () => {
  it('shuffles question and option order per attempt, differently across attempts (seeded)', async () => {
    const { service } = setup({ random: seededRandom(20261008) });
    const first = await start(service, 'ch03-l02', 'attempt-key-0001');
    const second = await start(service, 'ch03-l02', 'attempt-key-0002');
    const ids = (attempt: typeof first) => attempt.questions.map((question) => question.id);
    // The same 8 questions, in a different order each time.
    expect([...ids(first)].sort()).toEqual([...ids(second)].sort());
    expect(ids(first)).toHaveLength(8);
    expect(ids(first)).not.toEqual(ids(second));
    expect(ids(first)).not.toEqual([...ids(first)].sort());
    // Each question keeps its four options, in an order that differs between attempts.
    const optionOrder = (attempt: typeof first, id: string) =>
      attempt.questions.find((question) => question.id === id)!.options.map((option) => option.id);
    let differing = 0;
    for (const id of ids(first)) {
      expect([...optionOrder(first, id)].sort()).toEqual([...optionOrder(second, id)].sort());
      if (optionOrder(first, id).join() !== optionOrder(second, id).join()) differing += 1;
    }
    expect(differing).toBeGreaterThan(0);

    // The same seed rebuilds the same attempt: the order is a pure function of the random source.
    const replayed = await start(setup({ random: seededRandom(20261008) }).service, 'ch03-l02');
    expect(replayed.questions).toEqual(first.questions);
  });

  it('is stable on resume and reload: the stored order is returned, even by a new service instance', async () => {
    const { service, memory } = setup({ random: seededRandom(7) });
    const created = await start(service, 'ch01-l02', 'attempt-key-0001');
    expect(await start(service, 'ch01-l02', 'attempt-key-0001')).toEqual(created);
    const reloaded = new TestAcademyService(memory, undefined, undefined, seededRandom(99999));
    expect(
      await reloaded.createAttempt(USER, {
        lesson_id: 'ch01-l02',
        catalog_version: ACADEMY_CATALOG_VERSION,
        idempotency_key: 'attempt-key-0001',
      }),
    ).toEqual(created);
    const stored = memory.attempts[0]!;
    expect(created.questions.map((question) => question.id)).toEqual(stored.question_ids);
    expect(memory.attempts).toHaveLength(1);
  });

  it('uses real randomness by default: repeated attempts do not all share one order', async () => {
    const memory = new MemoryAcademy();
    const service = new TestAcademyService(memory, undefined);
    const questionOrders = new Set<string>();
    const optionOrders = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const attempt = await start(service, 'ch01-l01', `attempt-key-${index + 100}`);
      questionOrders.add(attempt.questions.map((question) => question.id).join());
      optionOrders.add(
        attempt.questions
          .find((q) => q.id === 'ch01-l01-q01')!
          .options.map((o) => o.id)
          .join(),
      );
    }
    expect(questionOrders.size).toBeGreaterThan(1);
    expect(optionOrders.size).toBeGreaterThan(1);
  });

  it('grades by option id, not by position: any shuffle passes with the right ids', async () => {
    const { service } = setup({ random: seededRandom(3) });
    for (let index = 0; index < 3; index += 1) {
      const attempt = await start(service, 'ch03-l05', `attempt-key-${index + 1}0000`);
      const key = new Map(
        answerKey('ch03-l05').map((question) => [question.id, question.correct_option_id]),
      );
      const result = await service.submit(USER, attempt.attempt_id, {
        answers: attempt.questions.map((question) => ({
          question_id: question.id,
          option_id: key.get(question.id)!,
        })),
      });
      expect(result).toMatchObject({ score: 8, passed: true });
      // The review follows the attempt: same question order, same option order.
      expect(result.results.map((item) => item.question_id)).toEqual(
        attempt.questions.map((question) => question.id),
      );
      result.results.forEach((item, position) => {
        expect(item.options.map((option) => option.id)).toEqual(
          attempt.questions[position]!.options.map((option) => option.id),
        );
      });
    }
  });
});

describe('submit and review responses', () => {
  it('returns, in attempt order, the chosen and correct option with every explanation', async () => {
    const { service, memory } = setup({ random: seededRandom(11) });
    const attempt = await start(service, 'ch01-l01', 'attempt-key-0001');
    const key = new Map(
      answerKey('ch01-l01').map((question) => [question.id, question.correct_option_id]),
    );
    const wrongQuestion = attempt.questions[2]!;
    const wrongOption = wrongQuestion.options.find((o) => o.id !== key.get(wrongQuestion.id))!;
    const answers = attempt.questions.map((question) => ({
      question_id: question.id,
      option_id: question.id === wrongQuestion.id ? wrongOption.id : key.get(question.id)!,
    }));
    const result = await service.submit(USER, attempt.attempt_id, { answers });
    expect(submitResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      score: 7,
      total: 8,
      correct: 7,
      wrong: 1,
      passed: false,
      review_available: true,
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      best_score: 7,
      attempts_submitted: 1,
      reward: null,
    });
    expect(result.submitted_at).toEqual(expect.any(String));
    expect(result.results.map((item) => item.question_id)).toEqual(
      attempt.questions.map((question) => question.id),
    );
    const item = result.results[2]!;
    expect(item).toMatchObject({
      question_id: wrongQuestion.id,
      option_id: wrongOption.id,
      correct: false,
      correct_option_id: key.get(wrongQuestion.id),
      explanation: null,
    });
    expect(item.topic).toEqual(expect.any(String));
    expect(item.section).toBeGreaterThanOrEqual(1);
    expect(item.prompt).toBe(wrongQuestion.prompt);
    expect(item.options.map((option) => option.id)).toEqual(wrongQuestion.options.map((o) => o.id));
    expect(item.options.filter((option) => option.chosen).map((option) => option.id)).toEqual([
      wrongOption.id,
    ]);
    expect(item.options.filter((option) => option.correct).map((option) => option.id)).toEqual([
      key.get(wrongQuestion.id),
    ]);
    expect(item.options.every((option) => option.explanation)).toBe(true);
    // Figures come back with the question, from the pinned bank.
    const figured = result.results.find((entry) => entry.question_id === 'ch01-l01-q03')!;
    expect(figured.figure).toMatchObject({ type: 'chart', chart_id: 'ch01-l01-q03' });
    // The stored rows hold the choices, so the result can be rebuilt at any time.
    expect(memory.answerRows).toHaveLength(8);
    expect(await service.submit(USER, attempt.attempt_id, { answers: [] })).toEqual(result);
  });

  it('a retake is a new attempt over the same 8 questions; best score and pass never decrease', async () => {
    const { service, memory, rewards } = setup({ random: seededRandom(5) });
    const first = await start(service, 'ch03-l02', 'attempt-key-0001');
    const key = new Map(
      answerKey('ch03-l02').map((question) => [question.id, question.correct_option_id]),
    );
    const passed = await service.submit(USER, first.attempt_id, {
      answers: first.questions.map((q) => ({ question_id: q.id, option_id: key.get(q.id)! })),
    });
    expect(passed).toMatchObject({ score: 8, passed: true, best_score: 8, attempts_submitted: 1 });
    expect(passed.reward).toMatchObject({ status: 'credited', delta: 100 });

    const retake = await start(service, 'ch03-l02', 'attempt-key-0002');
    expect(retake.attempt_id).not.toBe(first.attempt_id);
    expect(retake.questions.map((q) => q.id).sort()).toEqual(
      first.questions.map((q) => q.id).sort(),
    );
    expect(retake.questions.map((q) => q.id)).not.toEqual(first.questions.map((q) => q.id));
    const zero = await service.submit(USER, retake.attempt_id, {
      answers: retake.questions.map((q) => ({
        question_id: q.id,
        option_id: q.options.find((o) => o.id !== key.get(q.id))!.id,
      })),
    });
    expect(zero).toMatchObject({
      score: 0,
      correct: 0,
      wrong: 8,
      passed: false,
      best_score: 8,
      attempts_submitted: 2,
      newly_granted: [],
      granted_capabilities: ['metric:profit_yoy'],
      completion: { completed: true, completion_method: 'quiz', newly_completed: false },
      reward: null,
    });
    expect(zero.completion.completed_at).toBe(passed.completion.completed_at);

    const lesson = await service.lesson(USER, 'ch03-l02');
    expect(lesson).toMatchObject({ completed: true, best_score: 8, attempts_submitted: 2 });
    // Passing again neither re-rewards nor re-grants.
    const third = await start(service, 'ch03-l02', 'attempt-key-0003');
    const again = await service.submit(USER, third.attempt_id, {
      answers: third.questions.map((q) => ({ question_id: q.id, option_id: key.get(q.id)! })),
    });
    expect(again).toMatchObject({
      passed: true,
      best_score: 8,
      attempts_submitted: 3,
      reward: null,
    });
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);
  });

  it('quiz 8/8 credits exactly once per lesson for all 12 chapter 1 and 3 lessons', async () => {
    const { service, memory, rewards } = setup();
    let balance = 0;
    for (const lessonId of PACKAGED_QUIZ_LESSONS) {
      const result = await pass(service, lessonId, `attempt-key-${lessonId}`);
      balance += 100;
      expect(result.reward, lessonId).toEqual({
        status: 'credited',
        delta: 100,
        balance_after: balance,
      });
      expect(result.completion.newly_completed).toBe(true);
      const repeat = await pass(service, lessonId, `attempt-key-${lessonId}-again`);
      expect(repeat.reward, lessonId).toBeNull();
      expect(repeat.completion.newly_completed).toBe(false);
    }
    expect(rewards!.calls).toHaveLength(12);
    expect(rewards!.balance).toBe(1200);
    expect(memory.completionRows).toHaveLength(12);
    const progress = await service.progress(USER);
    expect(progress).toMatchObject({ course_done: 12, progress_revision: 12 });
    expect(progress.granted_capabilities).toEqual(
      [
        'indicator:bollinger',
        'indicator:ma',
        'indicator:macd',
        'indicator:rsi',
        'indicator:volume',
        'metric:eps_yoy',
        'metric:gross_margin',
        'metric:net_margin',
        'metric:profit_yoy',
        'metric:revenue_yoy',
        'metric:roe',
      ].sort(),
    );
  });
});

describe('pinned question banks', () => {
  /** The live content with the ch01-l01 bank edited (answer key moved) and the lesson text bumped. */
  function editedContent(options: { archive: boolean }) {
    const files = readAcademyContentFiles();
    const packages: PackageMap = new Map(
      [...files.packages!].map(([chapter, value]) => [chapter, structuredClone(value)]),
    );
    const original = structuredClone(
      (files.packages!.get(1)!.questions as PrivateQuestion[]).filter(
        (question) => question.lesson_id === 'ch01-l01',
      ),
    );
    const charts = files.packages!.get(1)!.charts as Parameters<
      typeof packageBankArchiveFile
    >[0]['charts'];
    const edited = questionsOf(packages, 1).find((question) => question.id === 'ch01-l01-q01')!;
    edited.correct_option_id = edited.options.find(
      (option) => option.id !== edited.correct_option_id,
    )!.id;
    lessonsOf(packages, 1)[0]!.content_version = 'ch01-v2.1';
    const archive = new Map(files.archive);
    const archived = packageBankArchiveFile({
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      content_version: 'ch01-v2.0',
      superseded_by: 'ch01-v2.1',
      questions: original,
      charts,
    });
    if (options.archive) archive.set(archived.questions_version, archived);
    return { content: buildAcademyContent({ ...files, packages, archive }), archived, original };
  }

  it('grades an open attempt against the bank it was created with, after the bank changed', async () => {
    const before = setup();
    const attempt = await start(before.service, 'ch01-l01', 'attempt-key-0001');
    const { content, archived, original } = editedContent({ archive: true });
    expect(content.lessons.get('ch01-l01')!.assessment!.version).not.toBe(
      attempt.assessment_version,
    );
    expect(archived.questions_version).toBe(attempt.assessment_version);

    // Same database, new deployment with the edited bank and lesson text.
    const after = new TestAcademyService(before.memory, before.rewards, content);
    expect((await after.lesson(USER, 'ch01-l01')).content_version).toBe('ch01-v2.1');
    // Resuming still shows the questions of the pinned bank.
    const resumed = await after.createAttempt(USER, {
      lesson_id: 'ch01-l01',
      catalog_version: ACADEMY_CATALOG_VERSION,
      idempotency_key: 'attempt-key-0001',
    });
    expect(resumed).toEqual(attempt);

    // The answer key of the OLD bank passes; the new key would have failed question 1.
    const oldKey = new Map(original.map((q) => [q.id, q.correct_option_id]));
    const newKey = answerKey('ch01-l01', content).find(
      (q) => q.id === 'ch01-l01-q01',
    )!.correct_option_id;
    expect(newKey).not.toBe(oldKey.get('ch01-l01-q01'));
    const result = await after.submit(USER, attempt.attempt_id, {
      answers: attempt.questions.map((q) => ({ question_id: q.id, option_id: oldKey.get(q.id)! })),
    });
    expect(result).toMatchObject({ score: 8, passed: true, review_available: true });
    // The completion records the lesson text the learner studied, not the newer one.
    expect(before.memory.completionRows[0]).toMatchObject({
      lesson_key: 'technical:rsi',
      content_version: 'ch01-v2.0',
      source: { assessment_version: attempt.assessment_version },
    });
    expect(before.rewards!.calls).toHaveLength(1);
    // A replay returns the committed result, graded and reviewed with the same pinned bank.
    expect(await after.submit(USER, attempt.attempt_id, { answers: [] })).toEqual(result);

    // The same answers with the new key fail question 1 on a fresh attempt of the old bank.
    const other = await start(before.service, 'ch01-l01', 'attempt-key-0002');
    const mixed = await after.submit(USER, other.attempt_id, {
      answers: other.questions.map((q) => ({
        question_id: q.id,
        option_id: q.id === 'ch01-l01-q01' ? newKey : oldKey.get(q.id)!,
      })),
    });
    expect(mixed).toMatchObject({ score: 7, passed: false });
    // A new attempt after the change is pinned to the new bank.
    const fresh = await after.createAttempt(USER, {
      lesson_id: 'ch01-l01',
      catalog_version: ACADEMY_CATALOG_VERSION,
      idempotency_key: 'attempt-key-0003',
    });
    expect(fresh.assessment_version).toBe(content.lessons.get('ch01-l01')!.assessment!.version);
    expect(fresh.content_version).toBe('ch01-v2.1');
  });

  it('refuses (409) and keeps the attempt open when the pinned bank was not archived', async () => {
    const before = setup();
    const attempt = await start(before.service, 'ch01-l01', 'attempt-key-0001');
    const { content } = editedContent({ archive: false });
    const after = new TestAcademyService(before.memory, before.rewards, content);
    await expect(
      after.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ASSESSMENT_VERSION_MISMATCH' } });
    expect(before.memory.attempts[0]!.status).toBe('open');
    expect(before.memory.completionRows).toHaveLength(0);
  });

  it('grades attempts created against the superseded chapter 1 and 3 banks with their archived bank', async () => {
    const content = loadAcademyContent();
    const { service, memory, rewards } = setup();
    expect(content.archivedBanks.size).toBe(12);
    for (const [version, bank] of content.archivedBanks) {
      expect(PACKAGED_QUIZ_LESSONS).toContain(bank.lesson_id);
      expect(bank.assessment.format).toBe('legacy-v1');
      expect(bank.assessment.version).toBe(version);
      expect(bank.superseded_by).toMatch(/^ch0[13]-v2\.0$/);
      // An attempt row exactly as the previous release wrote it.
      const order = buildAttemptOrder(bank.assessment.questions, seededRandom(1));
      const row: AttemptRow = {
        id: randomUUID(),
        user_id: USER,
        lesson_id: bank.lesson_id,
        lesson_key: bank.lesson_key,
        catalog_version: ACADEMY_CATALOG_VERSION,
        content_version: '2.0.0',
        questions_version: version,
        question_ids: order.question_ids,
        option_orders: order.option_orders,
        status: 'open',
        idempotency_key: `legacy-key-${bank.lesson_id}`,
        created_at: new Date(),
        submitted_at: null,
        score: null,
        passed: null,
      };
      memory.attempts.push(row);
      const resumed = await service.createAttempt(USER, {
        lesson_id: bank.lesson_id,
        catalog_version: ACADEMY_CATALOG_VERSION,
        idempotency_key: row.idempotency_key,
      });
      expect(resumed).toMatchObject({ assessment_version: version, content_version: '2.0.0' });
      // The old shape: no topic, section, hint or figure, one explanation per question.
      expect(resumed.questions.every((q) => q.topic === null && q.section === null)).toBe(true);
      expect(resumed.questions.every((q) => q.hint === null && q.figure === null)).toBe(true);
      const result = await service.submit(USER, row.id, {
        answers: bank.assessment.questions.map((q) => ({
          question_id: q.id,
          option_id: q.correct_option_id,
        })),
      });
      expect(result).toMatchObject({ score: 8, passed: true, review_available: true });
      expect(result.results.every((item) => item.explanation && item.options.length === 4)).toBe(
        true,
      );
      expect(
        result.results.every((item) => item.options.every((o) => o.explanation === null)),
      ).toBe(true);
    }
    expect(memory.completionRows).toHaveLength(12);
    expect(memory.completionRows.every((row) => row.content_version === '2.0.0')).toBe(true);
    expect(rewards!.balance).toBe(1200);
    // They were not answerable with the new keys: different questions, different ids.
    const old = [...content.archivedBanks.values()].find((b) => b.lesson_id === 'ch03-l01')!;
    const current = content.lessons.get('ch03-l01')!.assessment!;
    expect(old.assessment.questions[0]!.prompt).not.toBe(current.questions[0]!.prompt);
  });

  it('rejects a tampered archive and an archive for an unknown lesson', () => {
    const files = readAcademyContentFiles();
    const [version, raw] = [...files.archive!][0]!;
    const tampered = structuredClone(raw) as {
      assessment: { questions: Array<{ explanation: string }> };
    };
    tampered.assessment.questions[0]!.explanation += ' (edited)';
    expect(() =>
      buildAcademyContent({ ...files, archive: new Map([[version, tampered]]) }),
    ).toThrow(/no longer hashes to its version/);
    const foreign = { ...(structuredClone(raw) as object), lesson_key: 'technical:macd' };
    expect(() => buildAcademyContent({ ...files, archive: new Map([[version, foreign]]) })).toThrow(
      /unknown lesson/,
    );
    expect(() =>
      buildAcademyContent({ ...files, archive: new Map([['0'.repeat(64), raw]]) }),
    ).toThrow(/filed as/);
  });

  it('keeps a ledger of every released bank: a changed bank must be archived before it is registered', () => {
    const content = loadAcademyContent();
    const ledger = readJson<{
      banks: Array<{
        lesson_id: string;
        questions_version: string;
        format: string;
        status: 'current' | 'superseded';
      }>;
    }>(join(contentDir, 'archive', 'banks.index.json')).banks;
    const archived = new Set(
      readdirSync(join(contentDir, 'archive', 'banks')).map((name) => name.replace(/\.json$/, '')),
    );
    for (const lesson of content.lessons.values()) {
      if (!lesson.assessment) continue;
      const current = ledger.filter((e) => e.lesson_id === lesson.id && e.status === 'current');
      expect(
        current.map((entry) => entry.questions_version),
        `${lesson.id}: the bank changed. Archive the previous bank in content/archive/banks, mark it superseded in banks.index.json and register the new version as current.`,
      ).toEqual([lesson.assessment.version]);
    }
    for (const entry of ledger.filter((e) => e.status === 'superseded'))
      expect(archived.has(entry.questions_version), entry.questions_version).toBe(true);
    // Nothing is archived that the ledger does not know, and the loader reads all of it.
    expect(
      new Set(ledger.filter((e) => e.status === 'superseded').map((e) => e.questions_version)),
    ).toEqual(archived);
    expect(new Set(content.archivedBanks.keys())).toEqual(archived);
    // The superseded ch01/ch03 banks are no longer part of the live lesson folders.
    for (const lessonId of PACKAGED_QUIZ_LESSONS)
      expect(
        existsSync(join(contentDir, 'lessons', lessonId, 'assessment.vi.private.json')),
        lessonId,
      ).toBe(false);
  });
});

describe('legacy attempts of the 18-chapter catalog stay readable', () => {
  const legacyRow = (status: 'open' | 'submitted'): AttemptRow => ({
    id: randomUUID(),
    user_id: USER,
    lesson_id: 'ch07-l01',
    lesson_key: null,
    catalog_version: ACADEMY_LEGACY_CATALOG_VERSION,
    content_version: '1.0.0',
    questions_version: 'f'.repeat(64),
    question_ids: Array.from({ length: 8 }, (_, i) => `ch07-l01-q0${i + 1}`),
    option_orders: {},
    status,
    idempotency_key: `legacy-${status}-0001`,
    created_at: new Date('2026-01-01T00:00:00Z'),
    submitted_at: status === 'submitted' ? new Date('2026-01-01T00:10:00Z') : null,
    score: status === 'submitted' ? 6 : null,
    passed: status === 'submitted' ? false : null,
  });

  it('answers a submitted legacy attempt with its stored score and no review; never grades an open one', async () => {
    const { service, memory } = setup();
    const submitted = legacyRow('submitted');
    memory.attempts.push(submitted, legacyRow('open'));
    memory.answerRows.push(
      ...submitted.question_ids.map((question_id, index) => ({
        attempt_id: submitted.id,
        question_id,
        option_id: 'o1',
        correct: index < 6,
      })),
    );
    const result = await service.submit(USER, submitted.id, { answers: [] });
    expect(submitResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      lesson_id: 'ch07-l01',
      lesson_key: null,
      catalog_version: ACADEMY_LEGACY_CATALOG_VERSION,
      score: 6,
      correct: 6,
      wrong: 2,
      passed: false,
      review_available: false,
      results: [],
      best_score: null,
      attempts_submitted: 0,
      newly_granted: [],
      reward: null,
    });
    const open = memory.attempts.find((row) => row.status === 'open')!;
    await expect(service.submit(USER, open.id, { answers: [] })).rejects.toMatchObject({
      status: 409,
      response: { code: 'CATALOG_VERSION_MISMATCH' },
    });
    expect(memory.completionRows).toHaveLength(0);
    // The legacy lesson id is not read as the current lesson of the same id (ATR is not OBV).
    expect((await service.lesson(USER, 'ch07-l01')).completed).toBe(false);
  });
});

describe('package content fits the existing attempt and completion columns (no migration)', () => {
  const content = loadAcademyContent();

  it('keeps versions, keys and ids inside the varchar limits of migrations 0008 and 0014', () => {
    const sql = ['0008_academy.sql', '0014_academy_catalog_v1.sql']
      .map((name) => readFileSync(join(here, '../../migrations', name), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/content_version varchar\(32\) NOT NULL/);
    expect(sql).toMatch(/questions_version char\(64\) NOT NULL/);
    expect(sql).toMatch(/question_ids text\[\] NOT NULL/);
    expect(sql).toMatch(/option_orders jsonb NOT NULL/);
    expect(sql).toMatch(/lesson_key varchar\(96\)/);
    expect(sql).toMatch(/question_id varchar\(64\) NOT NULL/);
    expect(sql).toMatch(/option_id varchar\(64\) NOT NULL/);
    for (const lesson of content.lessons.values()) {
      expect(lesson.content!.content_version.length, lesson.id).toBeLessThanOrEqual(32);
      expect(lesson.lesson_key.length, lesson.id).toBeLessThanOrEqual(96);
      if (lesson.assessment) {
        expect(lesson.assessment.version, lesson.id).toMatch(/^[0-9a-f]{64}$/);
        for (const question of lesson.assessment.questions) {
          expect(question.id.length).toBeLessThanOrEqual(64);
          for (const option of question.options) expect(option.id.length).toBeLessThanOrEqual(64);
        }
      }
    }
    // The pinned order is stored per attempt: no new column is needed for it.
    expect(deepKeys({ question_ids: [], option_orders: {} }).size).toBe(2);
  });
});
