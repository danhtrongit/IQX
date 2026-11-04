import { describe, expect, it } from 'vitest';

import {
  ACADEMY_ERROR_CODES,
  linkQuerySchema,
  linkResponseSchema,
} from '../../src/modules/academy/academy.schemas.js';
import { OTHER_USER, USER, openItem, pass, setup } from './academy-test-kit.js';
import { academyV4Fixture } from './academy-v4-fixture.js';

const content = academyV4Fixture();
const lessons = [...content.items.values()].filter((entry) => entry.kind === 'lesson');
const sectorLessons = lessons.filter((entry) => entry.chapter === 8);
const metricLessons = lessons.filter((entry) => entry.chapter >= 8);

describe('academy v4 content of chapters 8-12 (spec v4 §3)', () => {
  it('gives every chapter 8-12 lesson one representative chart (Dashboard chart model) in its own section', () => {
    expect(metricLessons).toHaveLength(62);
    for (const entry of metricLessons) {
      const file = entry.lesson!.file;
      const id = `c${entry.chapter}l${entry.order}-rep`;
      expect(file.charts[id]?.kind, entry.id).toBe('fundamental');
      const section = file.sections.find((candidate) => candidate.title === 'Biểu đồ đại diện');
      expect(section, entry.id).toBeDefined();
      expect(
        section!.blocks.some((block) => block.type === 'chart' && block.chart_id === id),
        entry.id,
      ).toBe(true);
    }
  });

  it('asks exactly one question about the representative chart in every chapter 8-12 lesson', () => {
    for (const entry of metricLessons) {
      const about = entry.bank.questions.filter((question) => question.chart_id);
      expect(about, entry.id).toHaveLength(1);
      expect(about[0]!.chart_id).toBe(`c${entry.chapter}l${entry.order}-rep`);
      expect(about[0]!.prompt).toMatch(/^Trên biểu đồ đại diện/);
      expect(entry.bank.questions, entry.id).toHaveLength(5);
    }
    // No other bank points at a chart.
    for (const entry of content.items.values())
      if (!metricLessons.includes(entry))
        expect(
          entry.bank.questions.filter((question) => question.chart_id),
          entry.id,
        ).toHaveLength(0);
  });

  it('ends each chapter 8 lesson with the section for banks, securities and insurance, before the summary', () => {
    expect(sectorLessons).toHaveLength(17);
    for (const entry of sectorLessons) {
      const file = entry.lesson!.file;
      const last = file.sections.at(-1)!;
      expect(last.title, entry.id).toBe('Với ngân hàng, chứng khoán, bảo hiểm');
      expect(last.blocks, entry.id).toHaveLength(1);
      const block = last.blocks[0]!;
      expect(block.type).toBe('cards');
      if (block.type === 'cards') {
        expect(block.items.map((card) => card.title)).toEqual([
          'Ngân hàng',
          'Công ty chứng khoán',
          'Công ty bảo hiểm',
        ]);
      }
      expect(file.summary.length, entry.id).toBeGreaterThan(0);
    }
    // Only chapter 8 has it (chapters 9-12 are specific to one industry).
    for (const entry of lessons.filter((candidate) => candidate.chapter !== 8))
      expect(
        entry.lesson!.file.sections.some((section) => section.title.startsWith('Với ngân hàng')),
        entry.id,
      ).toBe(false);
  });

  it('serves 30-question exams for chapters 4-12 and the chapter 8-12 exams are new keys', () => {
    for (const chapter of [8, 9, 10, 11, 12]) {
      const exam = content.items.get(`ch${String(chapter).padStart(2, '0')}-exam`)!;
      expect(exam.bank.questions, exam.id).toHaveLength(30);
      expect(exam.lesson_key).toBe(`exam:ch${String(chapter).padStart(2, '0')}-v4`);
    }
    const questions = [...content.items.values()].reduce(
      (sum, entry) => sum + entry.bank.questions.length,
      0,
    );
    expect(questions).toBe(855);
  });
});

describe('academy deep link (spec v4 §6)', () => {
  it('finds a lesson by metric_key first', async () => {
    const { service } = setup();
    const hit = await service.link(USER, 'nim');
    expect(linkResponseSchema.parse(hit)).toEqual(hit);
    expect(hit).toEqual({
      found: true,
      metric: 'nim',
      lesson_id: 'ch10-l01',
      lesson_key: 'fundamental:nim',
      metric_key: 'nim',
      chapter_id: 'ch10',
      chapter_display_no: 10,
      locked: false,
      title: 'NIM · biên lãi thuần',
      matched_by: 'metric_key',
      url: '/hoc-vien/ch10-l01',
    });
    // The key is also found in upper case (the dashboard may send either).
    expect(await service.link(USER, 'ROE')).toMatchObject({
      lesson_id: 'ch08-l11',
      matched_by: 'metric_key',
    });
  });

  it('finds the lesson whose title equals the name, then the one that starts with "name ·"', async () => {
    const { service } = setup();
    expect(await service.link(USER, 'Biên lợi nhuận gộp')).toMatchObject({
      found: true,
      lesson_id: 'ch09-l01',
      matched_by: 'title',
    });
    expect(await service.link(USER, 'EV / EBITDA')).toMatchObject({
      lesson_id: 'ch09-l15',
      matched_by: 'title',
    });
    // The dashboard names of the bank / securities / insurance metrics start the title ("Tên · mô tả").
    expect(await service.link(USER, 'Tỷ lệ dự phòng / Dư nợ')).toMatchObject({
      lesson_id: 'ch10-l07',
      matched_by: 'title_prefix',
      chapter_display_no: 10,
      metric_key: 'provision_to_loans',
    });
    expect(await service.link(USER, 'Combined ratio')).toMatchObject({
      lesson_id: 'ch12-l05',
      matched_by: 'title_prefix',
    });
    expect(await service.link(USER, 'Net Debt / EBITDA')).toMatchObject({
      lesson_id: 'ch09-l09',
      matched_by: 'title_prefix',
    });
    // Indicator lessons of chapters 4, 6 and 7 are reachable by name too (Bot, Bộ lọc, Flashback later).
    expect(await service.link(USER, 'RSI')).toMatchObject({
      lesson_id: 'ch04-l06',
      lesson_key: 'technical:rsi',
      metric_key: null,
      matched_by: 'title',
    });
  });

  it('ignores case, accents form and extra spaces, and never matches half a word', async () => {
    const { service } = setup();
    expect(await service.link(USER, '  ev   /  ebitda ')).toMatchObject({ lesson_id: 'ch09-l15' });
    expect((await service.link(USER, 'Combined')).found).toBe(false);
    expect((await service.link(USER, 'Combined ratio ·')).found).toBe(false);
    expect((await service.link(USER, 'fundamental:nim')).found).toBe(false);
  });

  it('is never an error: nothing found answers with the lesson the learner is on', async () => {
    const { service, memory } = setup();
    const nothing = await service.link(USER, 'chi tieu khong ton tai');
    expect(linkResponseSchema.parse(nothing)).toEqual(nothing);
    expect(nothing).toEqual({
      found: false,
      metric: 'chi tieu khong ton tai',
      lesson_id: 'ch01-l01',
      lesson_key: null,
      metric_key: null,
      chapter_id: null,
      chapter_display_no: null,
      locked: false,
      title: null,
      matched_by: null,
      url: '/hoc-vien/ch01-l01',
    });
    // The first required lesson still to pass.
    memory.complete(USER, ['concept:dau_tu_chung_khoan']);
    expect(await service.link(USER, 'khong co')).toMatchObject({
      found: false,
      lesson_id: 'ch01-l02',
    });
    // The lesson opened last wins.
    await service.lesson(USER, 'ch11-l04');
    expect(await service.link(USER, 'khong co')).toMatchObject({
      found: false,
      lesson_id: 'ch11-l04',
      url: '/hoc-vien/ch11-l04',
    });
    // Another learner is not affected.
    expect(await service.link(OTHER_USER, 'khong co')).toMatchObject({ lesson_id: 'ch01-l01' });
  });

  it('is found for every one of the 62 metric keys and reaches the right lesson', async () => {
    const { service } = setup();
    for (const entry of metricLessons) {
      const hit = await service.link(USER, entry.metric_key!);
      expect(hit, entry.id).toMatchObject({
        found: true,
        lesson_id: entry.id,
        matched_by: 'metric_key',
      });
      // Every lesson title also resolves by its own name (the dashboard sends names, spec §6).
      expect(await service.link(USER, entry.name), entry.id).toMatchObject({
        found: true,
        lesson_id: entry.id,
        matched_by: 'title',
      });
      const short = entry.name.split(' · ')[0]!;
      const byShort = await service.link(USER, short);
      expect(byShort.found, short).toBe(true);
    }
  });

  it('validates the query: a metric of 1-120 characters, trimmed', () => {
    expect(linkQuerySchema.parse({ metric: '  nim ' })).toEqual({ metric: 'nim' });
    expect(linkQuerySchema.safeParse({ metric: '' }).success).toBe(false);
    expect(linkQuerySchema.safeParse({ metric: '   ' }).success).toBe(false);
    expect(linkQuerySchema.safeParse({}).success).toBe(false);
    expect(linkQuerySchema.safeParse({ metric: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('academy current lesson, "bài đang học" (spec v4 §4.1)', () => {
  it('remembers the lesson or exam opened last, per learner, and reports it in the progress', async () => {
    const { service, memory } = setup();
    expect((await service.progress(USER)).current_item_id).toBe('ch01-l01');
    await service.lesson(USER, 'ch10-l01');
    expect(memory.lastOpenedRows).toEqual([
      expect.objectContaining({
        user_id: USER,
        lesson_key: 'fundamental:nim',
        lesson_id: 'ch10-l01',
        catalog_version: 'iqx-academy-v4.0-12ch-116lessons',
      }),
    ]);
    expect((await service.progress(USER)).current_item_id).toBe('ch10-l01');
    await service.lesson(USER, 'ch05-exam');
    expect((await service.progress(USER)).current_item_id).toBe('ch05-exam');
    expect(memory.lastOpenedRows).toHaveLength(1);
    expect((await service.progress(OTHER_USER)).current_item_id).toBe('ch01-l01');
    // An already passed lesson can be the current one (the learner is reviewing it).
    memory.complete(USER, ['technical:rsi']);
    await service.lesson(USER, 'ch04-l06');
    expect((await service.progress(USER)).current_item_id).toBe('ch04-l06');
  });

  it('is not changed by the optional practice, an unknown item or a failed write', async () => {
    const { service, memory } = setup();
    await service.lesson(USER, 'ch09-l01');
    await service.lesson(USER, 'ch03-practice');
    await expect(service.lesson(USER, 'ch99-l01')).rejects.toMatchObject({ status: 404 });
    expect((await service.progress(USER)).current_item_id).toBe('ch09-l01');
    // Writing the "opened" row fails: the lesson is served all the same.
    memory.failRecordOpened = true;
    expect(await service.lesson(USER, 'ch12-l02')).toMatchObject({ id: 'ch12-l02', state: 'open' });
    expect((await service.progress(USER)).current_item_id).toBe('ch09-l01');
  });

  it('a sequential learner only records the items they can open', async () => {
    const { service, memory } = setup({ mode: 'sequential' });
    await expect(service.lesson(USER, 'ch10-l01')).rejects.toMatchObject({ status: 403 });
    expect(memory.lastOpenedRows).toHaveLength(0);
    await service.lesson(USER, 'ch01-l01');
    expect(memory.lastOpenedRows).toHaveLength(1);
  });

  it('a stored pick of an older catalog still resolves by its durable key', async () => {
    const { service, memory } = setup();
    memory.lastOpenedRows.push({
      user_id: USER,
      lesson_key: 'fundamental:roe',
      lesson_id: 'ch10-l01',
      catalog_version: 'iqx-academy-v3.3-13ch-87lessons',
      opened_at: new Date(),
    });
    // In v3.3 `ch10-l01` was ROE; in v4 the same key is `ch08-l11`.
    expect((await service.progress(USER)).current_item_id).toBe('ch08-l11');
    memory.lastOpenedRows[0]!.lesson_key = 'fundamental:dividend_yield';
    expect((await service.progress(USER)).current_item_id).toBe('ch01-l01');
  });
});

describe('academy free learning flow (spec v4 §4.1, §4.3)', () => {
  it('a new learner passes a chapter 12 lesson, then its exam, before anything else, and is paid once', async () => {
    const { service, rewards, memory } = setup();
    const lesson = await pass(service, 'ch12-l08', 'attempt-key-0001');
    expect(lesson).toMatchObject({
      passed: true,
      reward: { status: 'credited', delta: 100 },
      next_item_id: 'ch12-exam',
    });
    const exam = await pass(service, 'ch12-exam', 'attempt-key-0002');
    expect(exam).toMatchObject({
      passed: true,
      reward: null,
      chapter_completed: 12,
      next_item_id: null,
    });
    expect(rewards!.calls).toHaveLength(1);
    expect(memory.completionRows.map((row) => row.lesson_key).sort()).toEqual([
      'exam:ch12-v4',
      'fundamental:reserves_to_equity',
    ]);
    const progress = await service.progress(USER);
    expect(progress).toMatchObject({ course_done: 1, access_mode: 'free' });
    expect(progress.chapters.at(-1)).toMatchObject({
      chapter_id: 'ch12',
      display_no: 12,
      done: 1,
      total: 8,
      exam_passed: true,
    });
    expect(progress.items.some((entry) => entry.state === 'locked')).toBe(false);
  });

  it('an exam and the practice open at once; the exam of a chapter does not need its lessons', async () => {
    const { service, memory } = setup();
    openItem(memory, 'ch03-practice'); // stores the scenario choice some chapter 3 items need
    expect(await service.lesson(USER, 'ch08-exam')).toMatchObject({
      kind: 'chapter_exam',
      state: 'open',
    });
    expect(await service.lesson(USER, 'ch03-practice')).toMatchObject({
      kind: 'practice',
      state: 'open',
    });
  });

  it('keeps the scenario gate of chapters 2-3 (ACADEMY_SCENARIO_REQUIRED) and drops ACADEMY_ITEM_LOCKED from free mode', async () => {
    expect(ACADEMY_ERROR_CODES).toContain('ACADEMY_SCENARIO_REQUIRED');
    const { service } = setup();
    for (const id of ['ch02-l05', 'ch03-l09'])
      await expect(
        service.createAttempt(USER, {
          lesson_id: id,
          catalog_version: content.catalog.catalog_version,
          idempotency_key: `attempt-key-${id}`,
        }),
      ).rejects.toMatchObject({ status: 403, response: { code: 'ACADEMY_SCENARIO_REQUIRED' } });
  });
});
