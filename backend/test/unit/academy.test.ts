import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { AcademyEnabledGuard } from '../../src/modules/academy/academy-enabled.guard.js';
import { ACADEMY_CATALOG_VERSION } from '../../src/modules/academy/academy.constants.js';
import type {
  AcademyContent,
  AcademyItem,
} from '../../src/modules/academy/academy.content.types.js';
import {
  findInvalidAnswers,
  gradeAnswers,
  shuffle,
} from '../../src/modules/academy/academy.grading.js';
import { canonicalHash } from '../../src/modules/academy/academy.hash.js';
import {
  AcademyRepository,
  AcademySqlStore,
  type CompletionRow,
} from '../../src/modules/academy/academy.repository.js';
import {
  attemptResponseSchema,
  catalogResponseSchema,
  draftSaveResponseSchema,
  historyResponseSchema,
  itemResponseSchema,
  notesResponseSchema,
  progressResponseSchema,
  resumeResponseSchema,
  scenarioChoiceResponseSchema,
  submitResponseSchema,
} from '../../src/modules/academy/academy.schemas.js';
import { AcademyService, buildProgress } from '../../src/modules/academy/academy.service.js';
import {
  ACADEMY_V3_CATALOG_VERSION,
  NOTES_KEY_MAX,
  itemIdSchema,
  nextRequiredItemId,
  scenarioOf,
  type LessonFile,
} from '../../src/modules/academy/content/v3/schema.js';
import type { Environment } from '../../src/platform/config/environment.js';
import { LESSON_REWARD_PORT } from '../../src/platform/ports/lesson-reward.port.js';
import {
  FakeRewards,
  MemoryAcademy,
  OTHER_USER,
  USER,
  answersScoring,
  correctAnswers,
  deepKeys,
  item,
  jsonbText,
  keysBefore,
  openItem,
  pass,
  seededRandom,
  setup,
  start,
} from './academy-test-kit.js';
import { academyV3Fixture } from './academy-v3-fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const content = academyV3Fixture();

/** Exact names that must never appear in any academy response (design §2). */
const BANNED_KEYS = [
  'correct_option_id',
  'correct',
  'results',
  'review',
  'explanation',
  'assessment_version',
  'salt',
];

const expectNoBannedKeys = (value: unknown) => {
  const keys = deepKeys(value);
  for (const banned of BANNED_KEYS) expect(keys.has(banned), banned).toBe(false);
};

const expectExactKeys = (value: object, schema: z.ZodObject) =>
  expect(Object.keys(value).sort()).toEqual(Object.keys(schema.shape).sort());

const completion = (lessonKey: string, method: CompletionRow['completion_method'] = 'quiz') =>
  ({
    user_id: USER,
    lesson_key: lessonKey,
    catalog_version: ACADEMY_CATALOG_VERSION,
    lesson_id: 'x',
    completion_method: method,
    attempt_id: null,
    request_id: null,
    content_version: null,
    completed_at: new Date(Date.UTC(2026, 0, 1)),
    source: {},
  }) satisfies CompletionRow;

/** Content with ch03-practice swapped for a lesson file of many interactive blocks (notes limits). */
function contentWithBigPractice(): AcademyContent {
  const base = item('ch03-practice');
  const longId = 'a'.repeat(48);
  const file = {
    ...base.lesson!.file,
    sections: [
      {
        id: 's1',
        title: 'Bài tập',
        blocks: [
          ...Array.from({ length: 8 }, (_, index) => ({
            type: 'workpad' as const,
            id: `w${index}`,
            title: 'Ghi chú',
            prompts: [],
          })),
          {
            type: 'checklist' as const,
            id: longId,
            mode: 'todo' as const,
            title: 'Việc cần làm',
            items: [{ id: 'b'.repeat(48), text: 'Một việc' }],
          },
        ],
      },
    ],
  } as LessonFile;
  const practice: AcademyItem = { ...base, lesson: { ...base.lesson!, file } };
  const items = new Map(content.items);
  items.set(practice.id, practice);
  const itemsByKey = new Map(content.itemsByKey);
  itemsByKey.set(practice.lesson_key, practice);
  return { ...content, items, itemsByKey };
}

describe('academy v3.3 catalog', () => {
  it('serves 13 published chapters, 87 required lessons, 13 exams and the optional practice', () => {
    const { service } = setup();
    const catalog = service.catalog();
    expect(catalogResponseSchema.parse(catalog)).toEqual(catalog);
    expect(catalog.catalog_version).toBe(ACADEMY_V3_CATALOG_VERSION);
    expect(catalog.required_total).toBe(87);
    expect(catalog.chapters.map((chapter) => [chapter.no, chapter.lesson_count])).toEqual([
      [1, 10],
      [2, 10],
      [3, 9],
      [4, 10],
      [5, 4],
      [6, 4],
      [7, 7],
      [8, 6],
      [9, 5],
      [10, 7],
      [11, 4],
      [12, 5],
      [13, 6],
    ]);
    expect(catalog.chapters.map((chapter) => chapter.title)).toEqual([
      'Nền tảng',
      'Kỹ năng Sale SACO',
      'Thương hiệu cá nhân',
      'Phương pháp kỹ thuật',
      'Phương pháp cơ bản',
      'Chỉ báo xu hướng',
      'Chỉ báo động lượng và dòng tiền',
      'Tốc độ tăng trưởng',
      'Độ ổn định',
      'Hiệu quả và biên lợi nhuận',
      'Nợ và khả năng thanh toán',
      'Dòng tiền',
      'Định giá',
    ]);
    const items = catalog.chapters.flatMap((chapter) => chapter.items);
    expect(items).toHaveLength(101);
    expect(items.filter((entry) => entry.kind === 'chapter_exam')).toHaveLength(13);
    const practice = items.filter((entry) => entry.optional);
    expect(practice.map((entry) => [entry.id, entry.kind, entry.position])).toEqual([
      ['ch03-practice', 'practice', null],
    ]);
    expect(catalog.retired_lessons.length).toBeGreaterThan(0);
    expect(catalog.retired_lessons.map((entry) => entry.lesson_key)).toContain('concept:hop_luu');
    expectNoBannedKeys(catalog);
  });

  it('uses the item id and key formats, positions, question counts and exam intros', () => {
    const items = setup()
      .service.catalog()
      .chapters.flatMap((chapter) => chapter.items);
    for (const entry of items) {
      expect(itemIdSchema.safeParse(entry.id).success, entry.id).toBe(true);
      if (entry.kind === 'chapter_exam') {
        const cc = entry.id.slice(0, 4);
        expect(entry.lesson_key).toBe(`exam:${cc}`);
        expect(entry.question_count).toBe(entry.chapter <= 3 ? 20 : 30);
        expect(entry.intro).toMatch(/^Bài thi gồm \d+ câu hỏi/);
        expect(entry.content_version).toBeNull();
        expect(entry.position).toBeNull();
      } else {
        expect(entry.lesson_key).toMatch(/^(concept|technical|fundamental):[a-z0-9_]+$/);
        expect(entry.question_count).toBe(entry.chapter <= 3 ? 3 : 5);
        expect(entry.intro).toBeNull();
        expect(entry.content_version).toMatch(/^[0-9a-f]{16}$/);
      }
      expect(entry.has_scenario).toBe(
        entry.kind === 'lesson' && (entry.chapter === 2 || entry.chapter === 3),
      );
    }
    expect(items.find((entry) => entry.id === 'ch01-exam')?.intro).toBe(
      'Bài thi gồm 20 câu hỏi về toàn bộ kiến thức Chương 1.',
    );
    expect(items.find((entry) => entry.id === 'ch04-l03')?.position).toBe(3);
    const unlocks = items.filter((entry) => entry.unlock);
    expect(
      unlocks.map((entry) => [entry.id, entry.lesson_key, entry.unlock?.capability_id]),
    ).toEqual([
      ['ch04-l04', 'technical:volume', 'indicator:volume'],
      ['ch04-l05', 'technical:ma', 'indicator:ma'],
      ['ch04-l06', 'technical:rsi', 'indicator:rsi'],
      ['ch04-l07', 'technical:macd', 'indicator:macd'],
      ['ch04-l08', 'technical:bollinger', 'indicator:bollinger'],
      ['ch06-l01', 'technical:ema', 'indicator:ema'],
      ['ch06-l02', 'technical:ma_cross', 'indicator:ma_cross'],
      ['ch06-l03', 'technical:dmi', 'indicator:dmi'],
      ['ch06-l04', 'technical:donchian', 'indicator:donchian'],
      ['ch07-l01', 'technical:stochastic', 'indicator:stochastic'],
      ['ch07-l02', 'technical:cci', 'indicator:cci'],
      ['ch07-l03', 'technical:roc', 'indicator:roc'],
      ['ch07-l04', 'technical:williams_r', 'indicator:williams_r'],
      ['ch07-l05', 'technical:obv', 'indicator:obv'],
      ['ch07-l06', 'technical:mfi', 'indicator:mfi'],
      ['ch07-l07', 'technical:cmf', 'indicator:cmf'],
      ['ch08-l01', 'fundamental:revenue_yoy', 'metric:revenue_yoy'],
      ['ch08-l02', 'fundamental:profit_yoy', 'metric:profit_yoy'],
      ['ch08-l03', 'fundamental:eps_yoy', 'metric:eps_yoy'],
      ['ch08-l04', 'fundamental:revenue_cagr3', 'metric:revenue_cagr3'],
      ['ch08-l05', 'fundamental:profit_cagr3', 'metric:profit_cagr3'],
      ['ch08-l06', 'fundamental:eps_cagr3', 'metric:eps_cagr3'],
      ['ch09-l01', 'fundamental:profit_positive_streak', 'metric:profit_positive_streak'],
      ['ch09-l02', 'fundamental:revenue_growth_stability', 'metric:revenue_growth_stability'],
      ['ch09-l03', 'fundamental:net_margin_stability', 'metric:net_margin_stability'],
      ['ch09-l04', 'fundamental:eps_growth_stability', 'metric:eps_growth_stability'],
      ['ch09-l05', 'fundamental:roic_stability', 'metric:roic_stability'],
      ['ch10-l01', 'fundamental:roe', 'metric:roe'],
      ['ch10-l02', 'fundamental:roa', 'metric:roa'],
      ['ch10-l03', 'fundamental:roic', 'metric:roic'],
      ['ch10-l04', 'fundamental:gross_margin', 'metric:gross_margin'],
      ['ch10-l05', 'fundamental:net_margin', 'metric:net_margin'],
      ['ch10-l06', 'fundamental:asset_turnover', 'metric:asset_turnover'],
      ['ch10-l07', 'fundamental:ccc', 'metric:ccc'],
      ['ch11-l01', 'fundamental:debt_equity', 'metric:debt_equity'],
      ['ch11-l02', 'fundamental:current_ratio', 'metric:current_ratio'],
      ['ch11-l03', 'fundamental:interest_coverage', 'metric:interest_coverage'],
      ['ch11-l04', 'fundamental:net_debt_ebitda', 'metric:net_debt_ebitda'],
      ['ch12-l01', 'fundamental:cfo_margin', 'metric:cfo_margin'],
      ['ch12-l02', 'fundamental:cfo_profit', 'metric:cfo_profit'],
      ['ch12-l03', 'fundamental:capex_revenue', 'metric:capex_revenue'],
      ['ch12-l04', 'fundamental:fcf_margin', 'metric:fcf_margin'],
      ['ch12-l05', 'fundamental:fcf_positive_streak', 'metric:fcf_positive_streak'],
      ['ch13-l01', 'fundamental:pe', 'metric:pe'],
      ['ch13-l02', 'fundamental:pb', 'metric:pb'],
      ['ch13-l03', 'fundamental:ps', 'metric:ps'],
      ['ch13-l04', 'fundamental:peg', 'metric:peg'],
      ['ch13-l05', 'fundamental:ev_ebitda', 'metric:ev_ebitda'],
      ['ch13-l06', 'fundamental:fcf_yield', 'metric:fcf_yield'],
    ]);
    expect(unlocks).toHaveLength(49);
  });
});

describe('academy v3.3 sequence and progress (design §3)', () => {
  const states = (keys: string[]) =>
    new Map(
      buildProgress(
        content,
        keys.map((key) => completion(key)),
      ).items.map((entry) => [entry.id, entry.state]),
    );

  it('a new user has only ch01-l01 open and 0 / 87', () => {
    const progress = buildProgress(content, []);
    expect(progressResponseSchema.parse(progress)).toEqual(progress);
    expect(
      progress.items.filter((entry) => entry.state !== 'locked').map((entry) => entry.id),
    ).toEqual(['ch01-l01']);
    expect(progress).toMatchObject({
      course_done: 0,
      course_total: 87,
      current_item_id: 'ch01-l01',
    });
    expect(progress.chapters.map((chapter) => chapter.total)).toEqual([
      10, 10, 9, 10, 4, 4, 7, 6, 5, 7, 4, 5, 6,
    ]);
    expect(progress.granted_capabilities).toEqual([]);
  });

  it('a user holding only technical:rsi sees ch04-l06 passed and everything else locked', () => {
    const result = states(['technical:rsi']);
    expect(result.get('ch01-l01')).toBe('open');
    expect(result.get('ch04-l06')).toBe('passed');
    expect([...result.values()].filter((state) => state === 'open')).toHaveLength(1);
    expect(buildProgress(content, [completion('technical:rsi')]).granted_capabilities).toEqual([
      'indicator:rsi',
    ]);
  });

  it('after the ch3 exam the optional practice and ch04-l01 open together; practice never blocks', () => {
    const keys = keysBefore('ch04-l01');
    const result = states(keys);
    expect(result.get('ch03-practice')).toBe('open');
    expect(result.get('ch04-l01')).toBe('open');
    const progress = buildProgress(
      content,
      keys.map((key) => completion(key)),
    );
    expect(progress.current_item_id).toBe('ch04-l01');
    expect(progress.course_done).toBe(29);
    expect(progress.chapters.slice(0, 3).every((chapter) => chapter.exam_passed)).toBe(true);
    // Practice passed changes nothing in the totals.
    const withPractice = buildProgress(content, [
      ...keys.map((key) => completion(key)),
      completion(item('ch03-practice').lesson_key),
    ]);
    expect(withPractice.course_done).toBe(29);
    expect(withPractice.current_item_id).toBe('ch04-l01');
  });

  it('counts every published lesson once and reports null current when all is passed', () => {
    const all = [...content.items.values()].map((entry) => completion(entry.lesson_key));
    const progress = buildProgress(content, all);
    expect(progress).toMatchObject({ course_done: 87, current_item_id: null });
    const expected = [
      ...new Set([...content.items.values()].flatMap((entry) => entry.capabilities)),
    ].sort();
    expect(progress.granted_capabilities).toEqual(expected);
    expect(
      progress.granted_capabilities.filter((capability) => capability.startsWith('indicator:')),
    ).toHaveLength(16);
    expect(
      progress.granted_capabilities.filter((capability) => capability.startsWith('metric:')),
    ).toHaveLength(33);
  });

  it('maps completion methods outside quiz / legacy_migration to null', () => {
    const progress = buildProgress(content, [
      completion('concept:dau_tu_chung_khoan', 'guide'),
      completion('technical:rsi', 'legacy_migration'),
    ]);
    const byId = new Map(progress.items.map((entry) => [entry.id, entry]));
    expect(byId.get('ch01-l01')?.completion_method).toBeNull();
    expect(byId.get('ch04-l06')?.completion_method).toBe('legacy_migration');
  });

  it('counts best score and attempts of the current catalog only', async () => {
    const { service, memory } = setup();
    const attempt = await start(service, 'ch01-l01', 'attempt-key-0001');
    await service.submit(USER, attempt.attempt_id, { answers: answersScoring('ch01-l01', 1) });
    memory.attempts.push({
      ...memory.attempts[0]!,
      id: '00000000-0000-4000-8000-0000000000ff',
      catalog_version: 'iqx-academy-outline-13ch-71lessons-v1',
      idempotency_key: 'old-key-0001',
      score: 3,
    });
    const progress = await service.progress(USER);
    expect(progress.items[0]).toMatchObject({
      id: 'ch01-l01',
      best_score: 2,
      attempts_submitted: 1,
    });
    const history = await service.attemptHistory(USER, 'ch01-l01', { limit: 20, offset: 0 });
    expect(history.total).toBe(1);
  });
});

describe('academy v3.3 item content', () => {
  it('serves a lesson with its blocks and no answers; a locked item is 403; unknown is 404', async () => {
    const { service } = setup();
    const lesson = await service.lesson(USER, 'ch01-l01');
    expect(itemResponseSchema.parse(lesson)).toEqual(lesson);
    expect(lesson).toMatchObject({
      kind: 'lesson',
      state: 'open',
      scenario_choice: null,
      reward: null,
    });
    expectNoBannedKeys(lesson);
    await expect(service.lesson(USER, 'ch01-l02')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
    await expect(service.lesson(USER, 'ch06-l01')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
    await expect(service.lesson(USER, 'ch99-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'LESSON_NOT_FOUND' },
    });
  });

  it('serves the exam intro and the passed state of an out-of-order indicator lesson', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch01-exam');
    const exam = await service.lesson(USER, 'ch01-exam');
    expect(exam).toMatchObject({
      kind: 'chapter_exam',
      chapter_title: 'Nền tảng',
      question_count: 20,
      state: 'open',
    });
    expect(itemResponseSchema.parse(exam)).toEqual(exam);

    const other = setup();
    other.memory.complete(USER, ['technical:rsi']);
    expect(await other.service.lesson(USER, 'ch04-l06')).toMatchObject({ state: 'passed' });
  });
});

describe('academy v3.3 scenario choice', () => {
  it('requires a choice before the quiz, stores it once and returns the first choice on replay', async () => {
    const { service, memory } = setup();
    memory.complete(USER, keysBefore('ch02-l01'));
    await expect(start(service, 'ch02-l01')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_SCENARIO_REQUIRED' },
    });
    const first = await service.chooseScenario(USER, 'ch02-l01', { choice: 2 });
    expect(scenarioChoiceResponseSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({ lesson_id: 'ch02-l01', choice: 2, created: true });
    const replay = await service.chooseScenario(USER, 'ch02-l01', { choice: 0 });
    expect(replay).toMatchObject({ choice: 2, created: false, chosen_at: first.chosen_at });
    const lesson = await service.lesson(USER, 'ch02-l01');
    expect(lesson).toMatchObject({ scenario_choice: { choice: 2, chosen_at: first.chosen_at } });
    // The scenario block itself is public content (best_option / debrief by design).
    expectNoBannedKeys(lesson);
    expect((await start(service, 'ch02-l01')).total).toBe(3);
  });

  it('refuses items without a scenario (422) and locked items (403)', async () => {
    const { service } = setup();
    await expect(service.chooseScenario(USER, 'ch01-l01', { choice: 0 })).rejects.toMatchObject({
      status: 422,
      response: { code: 'NO_SCENARIO' },
    });
    await expect(service.chooseScenario(USER, 'ch02-l01', { choice: 0 })).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
  });

  it('a stale scenario hash shows no choice, still satisfies the gate, and is replaced once', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch02-l01'); // stores a choice with a stale hash
    expect(await service.lesson(USER, 'ch02-l01')).toMatchObject({ scenario_choice: null });
    expect((await start(service, 'ch02-l01')).kind).toBe('lesson');
    const replaced = await service.chooseScenario(USER, 'ch02-l01', { choice: 1 });
    expect(replaced).toMatchObject({ choice: 1, created: true });
    expect(memory.scenarioRows).toHaveLength(1);
    expect(memory.scenarioRows[0]!.scenario_hash).toBe(
      canonicalHash(scenarioOf(item('ch02-l01').lesson!.file)),
    );
    expect(await service.chooseScenario(USER, 'ch02-l01', { choice: 0 })).toMatchObject({
      choice: 1,
      created: false,
    });
  });
});

describe('academy v3.3 practice notes', () => {
  it('is only available for lessons with interactive blocks and respects the lock', async () => {
    const { service, memory } = setup();
    await expect(service.lessonNotes(USER, 'ch01-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOTES_NOT_AVAILABLE' },
    });
    await expect(service.lessonNotes(USER, 'ch02-l02')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
    openItem(memory, 'ch02-l02');
    const empty = await service.lessonNotes(USER, 'ch02-l02');
    expect(notesResponseSchema.parse(empty)).toEqual(empty);
    expect(empty).toEqual({
      lesson_id: 'ch02-l02',
      revision: 0,
      texts: {},
      checks: {},
      scores: {},
      updated_at: null,
    });
  });

  it('merges by key with a revision, adopts nothing on no-op, and never touches progress', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch03-practice');
    const before = await service.progress(USER);
    const first = await service.saveLessonNotes(USER, 'ch03-practice', {
      texts: { case1: 'Khách sợ mất tiền' },
      expected_revision: 0,
    });
    expect(first).toMatchObject({ revision: 1, texts: { case1: 'Khách sợ mất tiền' } });
    const second = await service.saveLessonNotes(USER, 'ch03-practice', {
      texts: { case2: 'Khách vội' },
      scores: { sc6: [5, 5, 5, 5, 5, 6] },
      expected_revision: 1,
    });
    expect(second).toMatchObject({
      revision: 2,
      texts: { case1: 'Khách sợ mất tiền', case2: 'Khách vội' },
      scores: { sc6: [5, 5, 5, 5, 5, 6] },
    });
    const noop = await service.saveLessonNotes(USER, 'ch03-practice', {
      texts: { case2: 'Khách vội' },
    });
    expect(noop.revision).toBe(2);
    expect(await service.lessonNotes(USER, 'ch03-practice')).toEqual(second);
    expect(await service.progress(USER)).toEqual(before);
    expect(memory.completionRows).toHaveLength(keysBefore('ch03-practice').length);
  });

  it('409 NOTES_REVISION_CONFLICT carries the stored notes; expected 0 against a row conflicts', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch02-l03');
    await service.saveLessonNotes(USER, 'ch02-l03', { checks: { 'l3:0': true } });
    for (const expected of [0, 5])
      await expect(
        service.saveLessonNotes(USER, 'ch02-l03', {
          checks: { 'l3:1': true },
          expected_revision: expected,
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'NOTES_REVISION_CONFLICT',
          details: [{ notes: { revision: 1, checks: { 'l3:0': true } } }],
        },
      });
    // A guarded save on a missing row conflicts and leaves no placeholder behind.
    openItem(memory, 'ch02-l04');
    await expect(
      service.saveLessonNotes(USER, 'ch02-l04', { texts: { l4: 'x' }, expected_revision: 3 }),
    ).rejects.toMatchObject({
      response: { code: 'NOTES_REVISION_CONFLICT', details: [{ notes: { revision: 0 } }] },
    });
    expect(memory.notesRows.map((row) => row.lesson_id)).toEqual(['ch02-l03']);
  });

  it('rejects keys outside the lesson (422 INVALID_NOTES)', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch02-l03');
    await expect(
      service.saveLessonNotes(USER, 'ch02-l03', { texts: { l4: 'x' }, checks: { 'l3:9': true } }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'INVALID_NOTES',
        details: [
          { field: 'texts', key: 'l4' },
          { field: 'checks', key: 'l3:9' },
        ],
      },
    });
    expect(memory.notesRows).toEqual([]);
  });

  it('accepts a 97-character checklist key and maps an over-size merge to 422, never 500', async () => {
    const big = contentWithBigPractice();
    const { service, memory } = setup({ content: big });
    openItem(memory, 'ch03-practice', USER, big);
    const longKey = `${'a'.repeat(48)}:${'b'.repeat(48)}`;
    expect(longKey).toHaveLength(NOTES_KEY_MAX);
    expect(
      await service.saveLessonNotes(USER, 'ch03-practice', { checks: { [longKey]: true } }),
    ).toMatchObject({ revision: 1, checks: { [longKey]: true } });

    // Compact JSON under the limit, jsonb text over it (the SQL measure decides).
    const texts: Record<string, string> = {};
    for (let index = 0; index < 8; index += 1) texts[`w${index}`] = 'ệ'.repeat(2725);
    const stored = { texts, checks: { [longKey]: true }, scores: {} };
    const compact = Buffer.byteLength(JSON.stringify({ texts }));
    const jsonb =
      Buffer.byteLength(jsonbText(stored.texts)) +
      Buffer.byteLength(jsonbText(stored.checks)) +
      Buffer.byteLength(jsonbText(stored.scores));
    expect(compact).toBeLessThanOrEqual(65536);
    expect(jsonb).toBeGreaterThan(65536);
    await expect(service.saveLessonNotes(USER, 'ch03-practice', { texts })).rejects.toMatchObject({
      status: 422,
      response: { code: 'NOTES_TOO_LARGE' },
    });
    expect((await service.lessonNotes(USER, 'ch03-practice')).revision).toBe(1);
  });
});

describe('academy v3.3 attempts and grading', () => {
  const cases: Array<[string, number, boolean]> = [
    ['ch01-l01', 2, false],
    ['ch01-l01', 3, true],
    ['ch04-l01', 4, false],
    ['ch04-l01', 5, true],
    ['ch01-exam', 19, false],
    ['ch01-exam', 20, true],
    ['ch04-exam', 29, false],
    ['ch04-exam', 30, true],
  ];
  for (const [itemId, score, passed] of cases) {
    it(`${itemId}: ${score} correct ${passed ? 'passes' : 'fails'}`, async () => {
      const { service, memory } = setup();
      openItem(memory, itemId);
      const attempt = await start(service, itemId, `key-${itemId}-${score}`);
      const total = item(itemId).question_count;
      expect(attempt.total).toBe(total);
      expect(attempt.questions).toHaveLength(total);
      const result = await service.submit(USER, attempt.attempt_id, {
        answers: answersScoring(itemId, total - score),
      });
      expect(submitResponseSchema.parse(result)).toEqual(result);
      expect(result).toMatchObject({ score, total, passed });
      expect(result.completion.completed).toBe(passed);
      expect(result.next_item_id).toBe(
        passed ? nextRequiredItemId(content.sequence, itemId) : null,
      );
      expectNoBannedKeys(result);
    });
  }

  it('a passed lesson pays +100 once, opens the next item and replays unchanged', async () => {
    const { service, rewards, memory } = setup();
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result).toMatchObject({
      passed: true,
      kind: 'lesson',
      completion: { completed: true, newly_completed: true },
      reward: { status: 'credited', delta: 100, balance_after: 100 },
      next_item_id: 'ch01-l02',
      chapter_completed: null,
      newly_granted: [],
      unlocked_labels: [],
    });
    expect(rewards!.calls).toHaveLength(1);
    expect(rewards!.calls[0]!.tx).toBe(memory.tx);
    expect(await service.submit(USER, result.attempt_id, { answers: [] })).toEqual(result);
    expect((await service.lesson(USER, 'ch01-l02')).state).toBe('open');
    expect(await service.lesson(USER, 'ch01-l01')).toMatchObject({
      state: 'passed',
      reward: { status: 'credited', delta: 100 },
    });
    // A later pass of the same lesson never pays again.
    const again = await pass(service, 'ch01-l01', 'attempt-key-0002');
    expect(again).toMatchObject({
      passed: true,
      reward: null,
      completion: { newly_completed: false },
    });
    expect(rewards!.calls).toHaveLength(1);
  });

  it('an indicator lesson reports the unlock label and the capability', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch04-l06');
    const result = await pass(service, 'ch04-l06', 'attempt-key-0001');
    expect(result).toMatchObject({
      newly_granted: ['indicator:rsi'],
      unlocked_labels: ['RSI'],
      next_item_id: 'ch04-l07',
    });
    expect(result.granted_capabilities).toContain('indicator:rsi');
  });

  it('an exam pass completes the chapter without a reward or a hook call', async () => {
    const { service, rewards, memory } = setup();
    openItem(memory, 'ch01-exam');
    const result = await pass(service, 'ch01-exam', 'attempt-key-0001');
    expect(result).toMatchObject({
      kind: 'chapter_exam',
      passed: true,
      reward: null,
      chapter_completed: 1,
      next_item_id: 'ch02-l01',
      completion: { newly_completed: true },
    });
    expect(rewards!.calls).toHaveLength(0);
    expect(memory.completionRows.find((row) => row.lesson_key === 'exam:ch01')).toBeTruthy();
    expect(memory.attempts[0]).toMatchObject({ kind: 'chapter_exam', content_version: null });
    expect((await service.progress(USER)).chapters[0]).toMatchObject({ exam_passed: true });
  });

  it('the practice pays +100 and leaves course_done unchanged', async () => {
    const { service, rewards, memory } = setup();
    openItem(memory, 'ch03-practice');
    const before = (await service.progress(USER)).course_done;
    const result = await pass(service, 'ch03-practice', 'attempt-key-0001');
    expect(result).toMatchObject({
      kind: 'lesson',
      reward: { status: 'credited', delta: 100 },
      next_item_id: 'ch04-l01',
    });
    expect(rewards!.calls).toHaveLength(1);
    expect((await service.progress(USER)).course_done).toBe(before);
  });

  it('a failing reward hook rolls the whole pass back; a retry then succeeds', async () => {
    const { service, rewards, memory } = setup();
    rewards!.failWith = new Error('ledger down');
    const attempt = await start(service);
    await expect(
      service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toThrow('ledger down');
    expect(memory.completionRows).toEqual([]);
    expect(memory.attempts[0]!.status).toBe('open');
    rewards!.failWith = null;
    const result = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01'),
    });
    expect(result.reward).toMatchObject({ status: 'credited' });
  });

  it('cannot double-complete or double-reward under concurrent submits', async () => {
    const { service, rewards, memory } = setup();
    const first = await start(service, 'ch01-l01', 'attempt-key-0001');
    const second = await start(service, 'ch01-l01', 'attempt-key-0002');
    const answers = correctAnswers('ch01-l01');
    const results = await Promise.all([
      service.submit(USER, first.attempt_id, { answers }),
      service.submit(USER, first.attempt_id, { answers }),
      service.submit(USER, second.attempt_id, { answers }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results.filter((result) => result.completion.newly_completed)).toHaveLength(2);
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);
    expect(results[2]!.reward).toBeNull();
  });

  it('shuffles questions and options per attempt (seeded), never in a fixed order', async () => {
    const { service, memory } = setup({ random: seededRandom(42) });
    openItem(memory, 'ch01-exam');
    const a = await start(service, 'ch01-exam', 'attempt-key-0001');
    const b = await start(service, 'ch01-exam', 'attempt-key-0002');
    const source = item('ch01-exam').bank.questions.map((question) => question.id);
    expect(a.questions.map((question) => question.id)).not.toEqual(source);
    expect(a.questions.map((question) => question.id)).not.toEqual(
      b.questions.map((question) => question.id),
    );
    expect([...a.questions.map((question) => question.id)].sort()).toEqual([...source].sort());
    const optionOrders = (attempt: typeof a) =>
      attempt.questions.map((question) => question.options.map((option) => option.id).join());
    expect(optionOrders(a)).not.toEqual(optionOrders(b));
    for (const question of a.questions) expect(question.options).toHaveLength(3);
  });

  it('replays by idempotency key and refuses the key for another item or catalog', async () => {
    const { service, memory } = setup();
    const first = await start(service, 'ch01-l01', 'attempt-key-0001');
    expect(await start(service, 'ch01-l01', 'attempt-key-0001')).toEqual(first);
    expect(memory.attempts).toHaveLength(1);
    memory.complete(USER, ['concept:dau_tu_chung_khoan']);
    await expect(start(service, 'ch01-l02', 'attempt-key-0001')).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    memory.attempts[0]!.catalog_version = 'iqx-academy-outline-13ch-71lessons-v1';
    await expect(start(service, 'ch01-l01', 'attempt-key-0001')).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('rejects a stale catalog, unknown items and locked items', async () => {
    const { service } = setup();
    await expect(
      service.createAttempt(USER, {
        lesson_id: 'ch01-l01',
        catalog_version: 'iqx-academy-outline-13ch-71lessons-v1',
        idempotency_key: 'attempt-key-0001',
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CATALOG_VERSION_MISMATCH' } });
    await expect(start(service, 'ch99-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'LESSON_NOT_FOUND' },
    });
    await expect(start(service, 'ch09-l01')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
    await expect(start(service, 'ch01-exam')).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACADEMY_ITEM_LOCKED' },
    });
  });

  it('rejects incomplete or foreign answers with 422 and keeps the attempt open', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    await expect(
      service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01').slice(1) }),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'INVALID_ANSWERS', message: expect.stringContaining('3 câu') },
    });
    expect(memory.attempts[0]!.status).toBe('open');
    await expect(
      service.submit(OTHER_USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
  });

  it('old-catalog attempts: a submitted one replays score-only, an open one is 409', async () => {
    const { service, memory } = setup();
    const old = {
      user_id: USER,
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      kind: 'lesson' as const,
      catalog_version: 'iqx-academy-outline-13ch-71lessons-v1',
      content_version: '2.0.0',
      questions_version: 'a'.repeat(64),
      question_ids: Array.from({ length: 8 }, (_, index) => `ch01-l01-q0${index + 1}`),
      option_orders: {},
      created_at: new Date(),
    };
    memory.attempts.push(
      {
        ...old,
        id: '00000000-0000-4000-8000-0000000000a1',
        idempotency_key: 'old-0001',
        status: 'submitted',
        submitted_at: new Date(),
        score: 8,
        passed: true,
      },
      {
        ...old,
        id: '00000000-0000-4000-8000-0000000000a2',
        idempotency_key: 'old-0002',
        status: 'open',
        submitted_at: null,
        score: null,
        passed: null,
      },
    );
    const replay = await service.submit(USER, '00000000-0000-4000-8000-0000000000a1', {
      answers: [],
    });
    expect(replay).toMatchObject({
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      score: 8,
      total: 8,
      passed: true,
      next_item_id: null,
      newly_granted: [],
      reward: null,
    });
    expectExactKeys(replay, submitResponseSchema);
    for (const call of [
      () => service.submit(USER, '00000000-0000-4000-8000-0000000000a2', { answers: [] }),
      () => service.saveDraft(USER, '00000000-0000-4000-8000-0000000000a2', { answers: [] }),
    ])
      await expect(call()).rejects.toMatchObject({
        status: 409,
        response: { code: 'CATALOG_VERSION_MISMATCH' },
      });
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt).toBeNull();
  });

  it('refuses an attempt whose pinned bank changed (409 ASSESSMENT_VERSION_MISMATCH)', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    memory.attempts[0]!.questions_version = 'b'.repeat(64);
    await expect(
      service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ASSESSMENT_VERSION_MISMATCH' } });
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt).toBeNull();
  });

  it('a pass only writes academy rows: no bot, capital, config or indicator flip', async () => {
    const { service, memory } = setup();
    await pass(service, 'ch01-l01', 'attempt-key-0001');
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(memory)),
      ...Object.keys(memory),
    ];
    expect(
      surface.filter((name) =>
        /bot|capital|account|wallet|cash|outbox|shared|master|indicator/i.test(name),
      ),
    ).toEqual([]);
  });
});

describe('academy v3.3 responses never carry answers', () => {
  it('walks every response and checks the exact keys of attempt, resume, draft, submit and history', async () => {
    const { service, memory } = setup();
    const responses: unknown[] = [service.catalog(), await service.progress(USER)];
    responses.push(await service.lesson(USER, 'ch01-l01'));
    const attempt = await start(service);
    expectExactKeys(attempt, attemptResponseSchema);
    for (const question of attempt.questions)
      expect(Object.keys(question).sort()).toEqual(['id', 'options', 'prompt']);
    const draft = await service.saveDraft(USER, attempt.attempt_id, {
      answers: [
        { question_id: attempt.questions[0]!.id, option_id: attempt.questions[0]!.options[0]!.id },
      ],
    });
    expectExactKeys(draft, draftSaveResponseSchema);
    const resume = await service.resumeAttempt(USER, 'ch01-l01');
    expectExactKeys(resume, resumeResponseSchema);
    expect(Object.keys(resume.attempt!).sort()).toEqual(
      [...Object.keys(attemptResponseSchema.shape), 'created_at', 'draft'].sort(),
    );
    const submit = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01'),
    });
    expectExactKeys(submit, submitResponseSchema);
    const history = await service.attemptHistory(USER, 'ch01-l01', { limit: 20, offset: 0 });
    expectExactKeys(history, historyResponseSchema);
    for (const entry of history.items)
      expect(Object.keys(entry).sort()).toEqual(
        ['attempt_id', 'passed', 'score', 'submitted_at', 'total'].sort(),
      );
    openItem(memory, 'ch02-l03');
    responses.push(
      await service.lesson(USER, 'ch02-l03'),
      await service.chooseScenario(USER, 'ch02-l03', { choice: 0 }),
      await service.saveLessonNotes(USER, 'ch02-l03', { checks: { 'l3:0': true } }),
      await service.lessonNotes(USER, 'ch02-l03'),
    );
    openItem(memory, 'ch01-exam');
    responses.push(await service.lesson(USER, 'ch01-exam'));
    for (const response of [...responses, attempt, draft, resume, submit, history])
      expectNoBannedKeys(response);
  });

  it('salts option ids: none equals sha256(qid|j), and the bank version is not the unsalted hash', () => {
    for (const entry of content.items.values()) {
      for (const question of entry.bank.questions)
        for (let j = 0; j < 3; j += 1) {
          const naive = createHash('sha256')
            .update(`${question.id}|${j}`)
            .digest('hex')
            .slice(0, 10);
          expect(question.options.map((option) => option.id)).not.toContain(naive);
        }
      expect(entry.bank.version).toMatch(/^[0-9a-f]{64}$/);
      expect(
        canonicalHash({
          format: 'iqx-academy-bank-v3',
          item_id: entry.id,
          questions: entry.bank.questions,
        }),
      ).not.toBe(entry.bank.version);
    }
  });
});

describe('academy grading primitives', () => {
  it('shuffles with Fisher-Yates into a permutation', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const result = shuffle(items, seededRandom(7));
    expect([...result].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('passes only with every answer right and reports invalid answers', () => {
    const questions = item('ch01-l01').bank.questions;
    const ids = questions.map((question) => question.id);
    expect(gradeAnswers(questions, ids, correctAnswers('ch01-l01'))).toMatchObject({
      score: 3,
      passed: true,
    });
    expect(gradeAnswers(questions, ids, answersScoring('ch01-l01', 1))).toMatchObject({
      score: 2,
      passed: false,
    });
    const issues = findInvalidAnswers(questions, ids, [
      { question_id: 'nope', option_id: 'x' },
      { question_id: ids[0]!, option_id: 'x' },
      { question_id: ids[1]!, option_id: questions[1]!.correct_option_id },
      { question_id: ids[1]!, option_id: questions[1]!.correct_option_id },
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual([
      'unknown_question',
      'unknown_option',
      'duplicate_question',
      'missing_answer',
    ]);
  });
});

describe('academy SQL store (v3.3)', () => {
  const makeStore = (rows: unknown[] = []) => {
    const statements: Array<{ text: string; values?: readonly unknown[] }> = [];
    const store = new AcademySqlStore({
      query: (text: string, values?: readonly unknown[]) => {
        statements.push({ text, values });
        return Promise.resolve(rows);
      },
    } as never);
    return { store, statements };
  };

  it('writes the attempt kind and filters stats and history by catalog', async () => {
    const { store, statements } = makeStore();
    await store.insertAttempt({
      id: '00000000-0000-4000-8000-0000000000aa',
      user_id: USER,
      lesson_id: 'ch01-exam',
      lesson_key: 'exam:ch01',
      kind: 'chapter_exam',
      catalog_version: ACADEMY_CATALOG_VERSION,
      content_version: null,
      questions_version: 'a'.repeat(64),
      question_ids: ['ch01-exam-q01'],
      option_orders: {},
      idempotency_key: 'attempt-key-0001',
    });
    expect(statements[0]!.text).toMatch(/lesson_key, kind, catalog_version, content_version/);
    expect(statements[0]!.values).toEqual(expect.arrayContaining(['chapter_exam', null]));
    await store.attemptStats(USER, 'exam:ch01', ACADEMY_CATALOG_VERSION);
    await store.submittedAttempts(USER, 'exam:ch01', ACADEMY_CATALOG_VERSION, 20, 0);
    await store.attemptStatsAll(USER, ACADEMY_CATALOG_VERSION);
    for (const statement of statements.slice(1)) {
      expect(statement.text).toMatch(/catalog_version = \$/);
      expect(statement.values).toContain(ACADEMY_CATALOG_VERSION);
    }
    expect(statements[3]!.text).toMatch(/group by lesson_key/);
  });

  it('inserts a scenario choice once and replaces only a stale hash', async () => {
    const { store, statements } = makeStore();
    await expect(
      store.insertScenarioChoice({
        user_id: USER,
        lesson_key: 'concept:x',
        lesson_id: 'ch02-l01',
        choice: 1,
        scenario_hash: 'c'.repeat(64),
        catalog_version: ACADEMY_CATALOG_VERSION,
      }),
    ).rejects.toThrow(/disappeared/);
    expect(statements[0]!.text).toMatch(/on conflict \(user_id, lesson_key\) do update/);
    expect(statements[0]!.text).toMatch(
      /where academy_scenario_choices\.scenario_hash <> excluded\.scenario_hash/,
    );
    expect(statements[1]!.text).toMatch(/from academy_scenario_choices/);
  });

  it('saves notes with a placeholder insert, a row lock and a size-bounded merge', async () => {
    const statements: string[] = [];
    let call = 0;
    const row = {
      user_id: USER,
      lesson_key: 'concept:x',
      lesson_id: 'ch02-l02',
      texts: {},
      checks: {},
      scores: {},
      revision: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const store = new AcademySqlStore({
      query: (text: string) => {
        statements.push(text);
        call += 1;
        return Promise.resolve(call === 1 ? [{ inserted: 1 }] : call === 2 ? [row] : []);
      },
    } as never);
    expect(
      await store.savePracticeNotes(USER, 'concept:x', 'ch02-l02', { texts: { l2: 'x' } }),
    ).toEqual({ status: 'too_large' });
    expect(statements[0]).toMatch(/on conflict \(user_id, lesson_key\) do nothing/);
    expect(statements[1]).toMatch(/for update/);
    expect(statements[2]).toMatch(/octet_length\(\(texts \|\| \$3::jsonb\)::text\)/);
    expect(statements[2]).toMatch(/<= 65536/);
    expect(statements[2]).toMatch(/case when \$6::boolean then 1 else revision \+ 1 end/);
  });

  it('maps the size check violation to too_large', async () => {
    let call = 0;
    const store = new AcademySqlStore({
      query: () => {
        call += 1;
        if (call === 1) return Promise.resolve([]);
        if (call === 2)
          return Promise.resolve([
            { revision: 3, texts: {}, checks: {}, scores: {}, updated_at: new Date() },
          ]);
        return Promise.reject(
          Object.assign(new Error('check'), {
            code: '23514',
            constraint: 'ck_academy_practice_notes_size',
          }),
        );
      },
    } as never);
    expect(await store.savePracticeNotes(USER, 'k', 'ch02-l02', { texts: { a: 'b' } })).toEqual({
      status: 'too_large',
    });
  });

  it('never writes academy_grants', () => {
    const source = readFileSync(
      join(here, '../../src/modules/academy/academy.repository.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/(insert into|update|delete from)\s+academy_grants/i);
  });
});

describe('migration 0026', () => {
  const sql = readFileSync(join(here, '../../migrations/0026_academy_v32.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('adds exams, nullable exam content, exam keys, scenario choices and practice notes, idempotently', () => {
    expect(statements).toMatch(
      /ADD COLUMN IF NOT EXISTS kind varchar\(16\) NOT NULL DEFAULT 'lesson'/,
    );
    expect(statements).toMatch(/CHECK \(kind IN \('lesson', 'chapter_exam'\)\)/);
    expect(statements).toMatch(/DROP CONSTRAINT IF EXISTS academy_attempts_score_check/);
    expect(statements).toMatch(/score <= cardinality\(question_ids\)/);
    expect(statements).toMatch(/ALTER COLUMN content_version DROP NOT NULL/);
    expect(statements).toMatch(/\(technical\|fundamental\|concept\|guide\|exam\)/);
    expect(statements).toMatch(/ck_lesson_rewards_not_exam CHECK \(lesson_key NOT LIKE 'exam:%'\)/);
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS academy_scenario_choices/);
    expect(statements).toMatch(/PRIMARY KEY \(user_id, lesson_key\)/);
    expect(statements).toMatch(/CHECK \(choice BETWEEN 0 AND 2\)/);
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS academy_practice_notes/);
    expect(statements).toMatch(/<= 65536/);
    // Every ADD CONSTRAINT is preceded by its DROP ... IF EXISTS (re-runnable).
    for (const [, name] of statements.matchAll(/ADD CONSTRAINT (\w+)/g))
      expect(statements).toContain(`DROP CONSTRAINT IF EXISTS ${name}`);
    expect(statements).not.toMatch(/TRUNCATE|DELETE FROM|DROP TABLE|UPDATE /i);
  });
});

describe('AcademyEnabledGuard', () => {
  const guard = (enabled: boolean) =>
    new AcademyEnabledGuard({ get: () => enabled } as unknown as ConfigService<Environment, true>);

  it('returns 404 FEATURE_DISABLED when ACADEMY_ENABLED=false', () => {
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    try {
      guard(false).canActivate();
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
    expect(guard(true).canActivate()).toBe(true);
  });
});

describe('AcademyService dependency injection of the reward hook', () => {
  const build = async (withReward: boolean) => {
    const rewards = new FakeRewards();
    const memory = new MemoryAcademy();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AcademyService,
        { provide: AcademyRepository, useValue: memory },
        ...(withReward ? [{ provide: LESSON_REWARD_PORT, useValue: rewards }] : []),
      ],
    }).compile();
    return { service: moduleRef.get(AcademyService), rewards };
  };

  it('works without a Shop module: the hook is optional and reports unavailable', async () => {
    const { service } = await build(false);
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result.reward).toEqual({ status: 'unavailable' });
  });

  it('uses the provided LESSON_REWARD_PORT exactly once per first completion', async () => {
    const { service, rewards } = await build(true);
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result.reward).toEqual({ status: 'credited', delta: 100, balance_after: 100 });
    expect(rewards.calls).toHaveLength(1);
  });
});
