import { describe, expect, it } from 'vitest';

import { AdminAcademyConfigsController } from '../../src/modules/academy/academy-config.controller.js';
import type {
  AcademyConfigLogRow,
  AcademyConfigRepository,
  AcademyConfigRow,
  AcademyConfigWithActor,
  AcademyLeaderRow,
  AcademyNewLog,
  AcademySubjectRow,
} from '../../src/modules/academy/academy-config.repository.js';
import { AcademyConfigService } from '../../src/modules/academy/academy-config.service.js';
import {
  allChapterIds,
  displayIntro,
  displayName,
  itemLabel,
  normalizeChapterIds,
  type AcademyConfigData,
  type AcademyProgram,
} from '../../src/modules/academy/academy.config.js';
import {
  catalogResponseSchema,
  itemResponseSchema,
  linkResponseSchema,
  progressResponseSchema,
} from '../../src/modules/academy/academy.schemas.js';
import { AUTH_ROLES_KEY } from '../../src/modules/auth/auth.decorators.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import type { SqlClient } from '../../src/platform/database/index.js';
import {
  OTHER_USER,
  USER,
  configPort,
  item,
  pass,
  programFor,
  setup,
  start,
} from './academy-test-kit.js';
import { academyV4Fixture, academyV4Source } from './academy-v4-fixture.js';

// Học viện v4.1 · Cấu hình Học viện theo trưởng nhóm: the pure rules of a config, what a learner sees under it
// (renumbering, N, modes, locks, the deep link), what changes when the config changes while he learns (spec §7), the
// admin CRUD with its change log and audit trail, and the resolution of the config of a user (spec §8.2).
const content = academyV4Fixture();
const ALL = allChapterIds(content);
/** Group A of the spec: no "Kỹ thuật bán hàng" chapter (Kỹ năng Sale SACO, original chapter 2). */
const GROUP_A = ALL.filter((id) => id !== 'ch02');
/** Group B of the spec: no "Thương hiệu cá nhân" chapter, and so no practice room. */
const GROUP_B = ALL.filter((id) => id !== 'ch03');
/** A config without Phương pháp cơ bản: its lessons have no scenario gate, so the tests can pass them. */
const NO_CH05 = ALL.filter((id) => id !== 'ch05');

/** Lesson keys of every required item before `itemId` in the chain of a program. */
function keysBefore(program: AcademyProgram, itemId: string): string[] {
  const at = program.sequence.findIndex((entry) => entry.id === itemId);
  if (at < 0) throw new Error(`${itemId} is not in the program`);
  return program.sequence
    .slice(0, at)
    .filter((entry) => !entry.optional)
    .map((entry) => entry.lesson_key);
}

const keyOf = (itemId: string) => item(itemId).lesson_key;

describe('academy config rules (v4.1 §1.2, §2, §3)', () => {
  it('stores chapters as fixed ids in catalog order, collapses duplicates, refuses an empty or unknown list', () => {
    expect(ALL).toEqual(Array.from({ length: 12 }, (_, i) => `ch${String(i + 1).padStart(2, '0')}`));
    expect(normalizeChapterIds(content, ['ch04', 'ch01', 'ch04'])).toEqual({
      ok: true,
      chapter_ids: ['ch01', 'ch04'],
    });
    expect(normalizeChapterIds(content, [])).toEqual({ ok: false, reason: 'empty', unknown: [] });
    expect(normalizeChapterIds(content, ['ch01', 'ch13', 'x'])).toEqual({
      ok: false,
      reason: 'unknown',
      unknown: ['ch13', 'x'],
    });
  });

  it('numbers the chapters again from 1 over the config and keeps their fixed ids (§2.1, §2.3)', () => {
    const a = programFor({ chapter_ids: GROUP_A });
    expect(a.chapters.map((chapter) => [chapter.chapter_id, chapter.display_no])).toEqual(
      GROUP_A.map((id, index) => [id, index + 1]),
    );
    expect(a.chapters.slice(0, 3).map((chapter) => [chapter.display_no, chapter.title])).toEqual([
      [1, 'Nền tảng'],
      [2, 'Thương hiệu cá nhân'],
      [3, 'Phương pháp kỹ thuật'],
    ]);
    expect(a.chapters[1]).toMatchObject({ chapter_id: 'ch03', chapter: 3, display_no: 2 });
    const b = programFor({ chapter_ids: GROUP_B });
    expect(b.chapters.slice(0, 3).map((chapter) => [chapter.chapter_id, chapter.display_no])).toEqual([
      ['ch01', 1],
      ['ch02', 2],
      ['ch04', 3],
    ]);
    // The default config is the identity: every learner of it sees the catalog numbers.
    expect(programFor().chapters.map((chapter) => chapter.display_no)).toEqual(ALL.map((_, i) => i + 1));
  });

  it('counts N over the required lessons of the config chapters only: 116, group A 106, no practice (§2.4)', () => {
    expect(programFor().requiredTotal).toBe(116);
    expect(programFor({ chapter_ids: GROUP_A }).requiredTotal).toBe(106);
    expect(programFor({ chapter_ids: GROUP_B }).requiredTotal).toBe(116 - content.catalog.chapters[2]!.lesson_count);
    expect(programFor({ chapter_ids: ['ch01'] }).requiredTotal).toBe(10);
  });

  it('the practice room goes with the personal-brand chapter: a group without it has none (§1.2)', () => {
    const hasPractice = (program: AcademyProgram) =>
      program.chapters.some((chapter) => chapter.items.some((entry) => entry.kind === 'practice'));
    expect(hasPractice(programFor())).toBe(true);
    expect(hasPractice(programFor({ chapter_ids: GROUP_A }))).toBe(true);
    expect(hasPractice(programFor({ chapter_ids: GROUP_B }))).toBe(false);
    expect(programFor({ chapter_ids: GROUP_B }).chapterOf('ch03-practice')).toBeUndefined();
    expect(programFor({ chapter_ids: GROUP_B }).sequence.some((entry) => entry.id === 'ch03-practice')).toBe(false);
  });

  it('runs the chain over the config chapters only, in catalog order, renumbered from 0 (§3.2)', () => {
    const program = programFor({ mode: 'sequential', chapter_ids: GROUP_A });
    expect(program.sequence.some((entry) => entry.id.startsWith('ch02-'))).toBe(false);
    expect(program.sequence.map((entry) => entry.index)).toEqual(program.sequence.map((_, index) => index));
    const inCatalogOrder = content.sequence.filter((entry) => !entry.id.startsWith('ch02-')).map((entry) => entry.id);
    expect(program.sequence.map((entry) => entry.id)).toEqual(inCatalogOrder);
  });

  it('free mode opens every item; sequential opens an item once every earlier required item of the config is passed (§3)', () => {
    const free = programFor({ chapter_ids: GROUP_A });
    expect([...free.states(new Set()).values()].every((state) => state === 'open')).toBe(true);

    const sequential = programFor({ mode: 'sequential', chapter_ids: GROUP_A });
    const none = sequential.states(new Set());
    expect(none.get('ch01-l01')).toBe('open');
    expect(none.get('ch01-l02')).toBe('locked');
    expect(none.get('ch03-l01')).toBe('locked');
    expect(none.has('ch02-l01')).toBe(false);
    // Passing chapter 1 (lessons and exam) opens lesson 1 of the next chapter of the CONFIG, nothing from the removed one.
    const after = sequential.states(new Set(keysBefore(sequential, 'ch03-l01')));
    expect(after.get('ch01-exam')).toBe('passed');
    expect(after.get('ch03-l01')).toBe('open');
    expect(after.get('ch03-l02')).toBe('locked');
  });

  it('passing the personal-brand exam opens the practice room and the next chapter together (§10.4)', () => {
    const program = programFor({ mode: 'sequential', chapter_ids: GROUP_A });
    const states = program.states(new Set(keysBefore(program, 'ch03-practice')));
    expect(states.get('ch03-exam')).toBe('passed');
    expect(states.get('ch03-practice')).toBe('open');
    expect(states.get('ch04-l01')).toBe('open');
    expect(states.get('ch04-l02')).toBe('locked');
  });

  it('stores the exam name and intro as templates with {n} and fills the learner number in (§2.3)', () => {
    const exams = [...content.items.values()].filter((entry) => entry.kind === 'chapter_exam');
    expect(exams).toHaveLength(12);
    for (const exam of exams) {
      expect(exam.name, exam.id).toBe('Bài thi Chương {n}');
      expect(exam.intro, exam.id).toContain('{n}');
    }
    const exam = item('ch03-exam');
    expect(displayName(exam, 2)).toBe('Bài thi Chương 2');
    expect(displayIntro(exam, 2)).toContain('Chương 2');
    expect(displayIntro(exam, 2)).not.toContain('{n}');
    expect(displayIntro(item('ch03-l01'), 2)).toBeNull();
    expect(itemLabel(exam, 2)).toBe('Bài thi Chương 2');
    expect(itemLabel(item('ch03-l01'), 2)).toBe(`Chương 2 · Bài 1: ${item('ch03-l01').name}`);
    expect(itemLabel(item('ch03-practice'), 2)).toBe(`Chương 2 · ${item('ch03-practice').name}`);
  });
});

describe('academy content never names a chapter number (v4.1 §5, §10.8)', () => {
  it('has no "Chương <số>" in any lesson, practice or question', () => {
    const offenders = [...content.items.values()].flatMap((entry) =>
      /chương\s*\d/i.test(JSON.stringify([entry.lesson?.file ?? null, entry.bank.questions])) ? [entry.id] : [],
    );
    expect(offenders).toEqual([]);
  });

  it('names the lesson or topic where the nine lessons of the spec pointed at a chapter (§5)', () => {
    const text = (id: string) => JSON.stringify([item(id).lesson?.file ?? null, item(id).bank.questions]);
    expect(text('ch03-l03')).toContain('bài Chăm sóc và giới thiệu');
    expect(text('ch03-l04')).toContain('bài Tìm khách hàng');
    expect(text('ch03-l06')).toContain('bài Chăm sóc và giới thiệu');
    expect(text('ch03-practice')).toContain('phần Nền tảng của Học viện');
    expect(text('ch05-l03')).toContain('phần Phương pháp kỹ thuật');
    expect(text('ch06-l01')).toContain('đã học ở bài MA');
    expect(text('ch07-l01')).toContain('đã học ở bài RSI');
    expect(text('ch07-l06')).toContain('RSI chỉ dùng giá');
    expect(text('ch09-l03')).toContain('Bài ROIC giải thích kỹ cách tính');
    expect(text('ch09-l03')).not.toContain('Chương 10 sẽ học kỹ về ROIC');
  });
});

describe('academy learner program (v4.1 §2, §3, §4)', () => {
  it('serves group A the chapters renumbered, with fixed ids and N = 106 (§2.3, §10.3)', async () => {
    const { service } = setup({ configs: configPort({ chapter_ids: GROUP_A }, [USER]) });
    const catalog = await service.catalog(USER);
    expect(catalogResponseSchema.parse(catalog)).toEqual(catalog);
    expect(catalog.mode).toBe('free');
    expect(catalog.required_total).toBe(106);
    expect(catalog.chapters).toHaveLength(11);
    expect(catalog.chapters.slice(0, 3).map((chapter) => [chapter.chapter_id, chapter.display_no, chapter.title])).toEqual([
      ['ch01', 1, 'Nền tảng'],
      ['ch03', 2, 'Thương hiệu cá nhân'],
      ['ch04', 3, 'Phương pháp kỹ thuật'],
    ]);
    const brand = catalog.chapters[1]!;
    expect(brand.items.every((entry) => entry.chapter_id === 'ch03' && entry.chapter_display_no === 2)).toBe(true);
    // Ids never change; only the number a learner reads does ("Bài thi Chương 2", the intro with his number).
    const exam = brand.items.find((entry) => entry.kind === 'chapter_exam')!;
    expect(exam).toMatchObject({ id: 'ch03-exam', name: 'Bài thi Chương 2' });
    expect(exam.intro).toContain('Chương 2');
    expect(JSON.stringify(catalog)).not.toContain('{n}');
    expect(JSON.stringify(catalog.chapters)).not.toContain('ch02-l01');
    // The removed chapter's lessons stay nameable for the Shop ledger.
    expect(catalog.retired_lessons.map((entry) => entry.lesson_key)).toContain(keyOf('ch02-l01'));
    expect(catalog.retired_lessons.map((entry) => entry.lesson_key)).not.toContain(keyOf('ch03-l01'));

    // Another learner of the same service has the default config: 12 chapters, the catalog numbers.
    const other = await service.catalog(OTHER_USER);
    expect(other.required_total).toBe(116);
    expect(other.chapters.find((chapter) => chapter.chapter_id === 'ch03')?.display_no).toBe(3);
  });

  it('counts the progress x / N over the config chapters, with their numbers (§2.4)', async () => {
    const { service, memory } = setup({ configs: configPort({ chapter_ids: GROUP_A }) });
    memory.complete(USER, [keyOf('ch01-l01'), keyOf('ch03-l01'), keyOf('ch02-l01')]);
    const progress = await service.progress(USER);
    expect(progressResponseSchema.parse(progress)).toEqual(progress);
    expect(progress.course_total).toBe(106);
    // The lesson of the removed chapter is not counted and not listed.
    expect(progress.course_done).toBe(2);
    expect(progress.items.some((entry) => entry.id.startsWith('ch02-'))).toBe(false);
    expect(progress.chapters.slice(0, 2)).toMatchObject([
      { chapter_id: 'ch01', display_no: 1, done: 1 },
      { chapter_id: 'ch03', display_no: 2, done: 1 },
    ]);
  });

  it('serves an item with the learner number: lesson locator and exam name and intro (§2.2)', async () => {
    const { service } = setup({ chapters: GROUP_A });
    const lesson = await service.lesson(USER, 'ch03-l01');
    expect(itemResponseSchema.parse(lesson)).toEqual(lesson);
    expect(lesson).toMatchObject({ id: 'ch03-l01', chapter_id: 'ch03', chapter_display_no: 2 });
    const exam = await service.lesson(USER, 'ch03-exam');
    expect(exam).toMatchObject({ kind: 'chapter_exam', name: 'Bài thi Chương 2', chapter_display_no: 2 });
    expect((exam as { intro: string }).intro).toContain('Chương 2');
    expect(JSON.stringify(exam)).not.toContain('{n}');
  });

  it('refuses an item whose chapter is not in the config: 404 ACADEMY_ITEM_NOT_IN_PROGRAM everywhere (§7)', async () => {
    const { service } = setup({ chapters: GROUP_A });
    const missing = { status: 404, response: { code: 'ACADEMY_ITEM_NOT_IN_PROGRAM' } };
    for (const id of ['ch02-l01', 'ch02-exam']) {
      await expect(service.lesson(USER, id), id).rejects.toMatchObject(missing);
      await expect(service.resumeAttempt(USER, id), id).rejects.toMatchObject(missing);
      await expect(start(service, id, `key-${id}`), id).rejects.toMatchObject(missing);
    }
    // An unknown id stays a plain 404, a different thing from "not in your program".
    await expect(service.lesson(USER, 'ch14-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'LESSON_NOT_FOUND' },
    });
    // The group without the personal-brand chapter has no practice room.
    const b = setup({ chapters: GROUP_B });
    await expect(b.service.lesson(USER, 'ch03-practice')).rejects.toMatchObject(missing);
  });

  it('the deep link only looks in the learner chapters: a metric of a removed chapter is not found (§4)', async () => {
    const { service } = setup({ chapters: ALL.filter((id) => id !== 'ch10') });
    const miss = await service.link(USER, 'nim');
    expect(linkResponseSchema.parse(miss)).toEqual(miss);
    expect(miss).toMatchObject({ found: false, locked: false, chapter_id: null, chapter_display_no: null });
    expect(miss.lesson_id).not.toBeNull();
    // Chapters after the removed one are renumbered: a chapter 11 metric reads "Chương 10" for this learner.
    const hit = await service.link(USER, 'roe');
    expect(hit).toMatchObject({ found: true, lesson_id: 'ch08-l11', chapter_id: 'ch08', chapter_display_no: 8 });
    const later = await service.link(USER, item('ch11-l01').metric_key ?? 'xxx');
    expect(later).toMatchObject({ found: true, chapter_id: 'ch11', chapter_display_no: 10 });
  });

  it('sequential: 403 ACADEMY_ITEM_LOCKED on the content and attempts, link.locked, locked states (§3.2, §4, §10.6)', async () => {
    const { service } = setup({ mode: 'sequential', chapters: GROUP_A });
    expect(await service.lesson(USER, 'ch01-l01')).toMatchObject({ state: 'open' });
    const locked = { status: 403, response: { code: 'ACADEMY_ITEM_LOCKED' } };
    for (const id of ['ch01-l02', 'ch03-l01', 'ch10-l01', 'ch12-exam']) {
      await expect(service.lesson(USER, id), id).rejects.toMatchObject(locked);
      await expect(start(service, id, `key-${id}`), id).rejects.toMatchObject(locked);
    }
    // The Dashboard's "Học" button: the link says the lesson exists but is not its turn; no content comes with it.
    const link = await service.link(USER, 'nim');
    expect(linkResponseSchema.parse(link)).toEqual(link);
    expect(link).toMatchObject({
      found: true,
      lesson_id: 'ch10-l01',
      locked: true,
      chapter_id: 'ch10',
      chapter_display_no: 9,
    });
    expect(JSON.stringify(link)).not.toContain('sections');
    const progress = await service.progress(USER);
    expect(progress.access_mode).toBe('sequential');
    expect(progress.next_item_id).toBe('ch01-l01');
    expect(progress.items.find((entry) => entry.id === 'ch01-l02')?.state).toBe('locked');
    expect(progress.items.find((entry) => entry.id === 'ch01-l01')?.state).toBe('open');
  });

  it('a new sequential learner opens the first lesson only; passing chapter 1 opens lesson 1 of chapter 2 (§10.4)', async () => {
    const { service, memory } = setup({ mode: 'sequential', chapters: GROUP_A });
    const program = programFor({ mode: 'sequential', chapter_ids: GROUP_A });
    const first = await service.progress(USER);
    expect(first.items.filter((entry) => entry.state === 'open').map((entry) => entry.id)).toEqual(['ch01-l01']);

    memory.complete(USER, keysBefore(program, 'ch03-l01'));
    const next = await service.progress(USER);
    expect(next.next_item_id).toBe('ch03-l01');
    expect(next.items.find((entry) => entry.id === 'ch03-l01')?.state).toBe('open');
    expect(next.items.find((entry) => entry.id === 'ch03-l02')?.state).toBe('locked');
    expect(await service.lesson(USER, 'ch03-l01')).toMatchObject({ state: 'open', chapter_display_no: 2 });
  });

  it('free mode: every item opens and the first pass of any item pays 100 xu once (§10.5)', async () => {
    const { service, rewards } = setup({ chapters: GROUP_A });
    const passed = await pass(service, 'ch12-l08', 'key-free-1');
    expect(passed).toMatchObject({ passed: true, reward: { status: 'credited', delta: 100 } });
    expect(rewards?.balance).toBe(100);
    const exam = await pass(service, 'ch03-exam', 'key-free-2');
    // The exam pays nothing and reports the chapter number THIS learner sees.
    expect(exam).toMatchObject({ passed: true, reward: null, chapter_completed: 2 });
    expect(rewards?.calls).toHaveLength(1);
  });
});

describe('academy config change while learning (v4.1 §7, §10.7)', () => {
  it('removing a chapter keeps its completions and xu and recomputes x / N; adding it back restores "Xem lại"', async () => {
    const live: Partial<AcademyConfigData> = { chapter_ids: ALL };
    const { service, memory, rewards } = setup({ configs: configPort(live) });
    await pass(service, 'ch05-l01', 'key-keep-1');
    expect(rewards?.balance).toBe(100);
    expect(await service.progress(USER)).toMatchObject({ course_done: 1, course_total: 116 });

    live.chapter_ids = NO_CH05;
    const hidden = await service.progress(USER);
    expect(hidden).toMatchObject({ course_done: 0, course_total: 116 - content.catalog.chapters[4]!.lesson_count });
    expect(hidden.items.some((entry) => entry.id === 'ch05-l01')).toBe(false);
    // Nothing was deleted, moved or paid again.
    expect(memory.completionRows.filter((row) => row.lesson_key === keyOf('ch05-l01'))).toHaveLength(1);
    expect(rewards?.balance).toBe(100);
    expect(rewards?.calls).toHaveLength(1);
    await expect(service.lesson(USER, 'ch05-l01')).rejects.toMatchObject({
      response: { code: 'ACADEMY_ITEM_NOT_IN_PROGRAM' },
    });

    live.chapter_ids = ALL;
    const back = await service.progress(USER);
    expect(back).toMatchObject({ course_done: 1, course_total: 116 });
    expect(back.items.find((entry) => entry.id === 'ch05-l01')?.state).toBe('passed');
    expect(await service.lesson(USER, 'ch05-l01')).toMatchObject({ state: 'passed' });
    expect(rewards?.balance).toBe(100);
  });

  it('free to sequential continues from the first required item still to pass; later passed items stay reviewable', async () => {
    const live: Partial<AcademyConfigData> = { mode: 'free' };
    const { service, memory } = setup({ configs: configPort(live) });
    memory.complete(USER, [keyOf('ch01-l01'), keyOf('ch01-l02'), keyOf('ch04-l06')]);
    expect((await service.progress(USER)).access_mode).toBe('free');

    live.mode = 'sequential';
    const progress = await service.progress(USER);
    expect(progress.access_mode).toBe('sequential');
    expect(progress.next_item_id).toBe('ch01-l03');
    const state = (id: string) => progress.items.find((entry) => entry.id === id)?.state;
    expect(state('ch01-l03')).toBe('open');
    expect(state('ch01-l04')).toBe('locked');
    // An item passed further on is still passed and can be opened to review.
    expect(state('ch04-l06')).toBe('passed');
    expect(await service.lesson(USER, 'ch04-l06')).toMatchObject({ state: 'passed' });
    await expect(service.lesson(USER, 'ch04-l07')).rejects.toMatchObject({ response: { code: 'ACADEMY_ITEM_LOCKED' } });
    // And the other way: back to free opens everything at once.
    live.mode = 'free';
    expect(await service.lesson(USER, 'ch04-l07')).toMatchObject({ state: 'open' });
  });

  it('sequential: a chapter added before the learner position locks the later items until it is completed (§11.2)', async () => {
    const live: Partial<AcademyConfigData> = { mode: 'sequential', chapter_ids: ['ch01', 'ch04'] };
    const { service, memory } = setup({ configs: configPort(live) });
    const before = programFor({ mode: 'sequential', chapter_ids: ['ch01', 'ch04'] });
    memory.complete(USER, keysBefore(before, 'ch04-l03'));
    expect(await service.lesson(USER, 'ch04-l03')).toMatchObject({ state: 'open' });

    live.chapter_ids = ['ch01', 'ch02', 'ch04'];
    const after = await service.progress(USER);
    expect(after.next_item_id).toBe('ch02-l01');
    await expect(service.lesson(USER, 'ch04-l03')).rejects.toMatchObject({ response: { code: 'ACADEMY_ITEM_LOCKED' } });
    // What was passed before stays passed.
    expect(after.items.find((entry) => entry.id === 'ch04-l01')?.state).toBe('passed');

    // Completing the new chapter (its lessons and exam) opens the rest again.
    const withNew = programFor({ mode: 'sequential', chapter_ids: ['ch01', 'ch02', 'ch04'] });
    memory.complete(USER, keysBefore(withNew, 'ch04-l03'));
    expect(await service.lesson(USER, 'ch04-l03')).toMatchObject({ state: 'open' });
  });

  it('an attempt in flight submits while its chapter is in the program and gets 404 once it is not; nothing is recorded', async () => {
    const live: Partial<AcademyConfigData> = { chapter_ids: ALL };
    const { service, memory, rewards } = setup({ configs: configPort(live) });
    const attempt = await start(service, 'ch05-l01', 'key-flight-1');
    const answers = item('ch05-l01').bank.questions.map((question) => ({
      question_id: question.id,
      option_id: question.correct_option_id,
    }));

    live.chapter_ids = NO_CH05;
    await expect(service.submit(USER, attempt.attempt_id, { answers })).rejects.toMatchObject({
      status: 404,
      response: { code: 'ACADEMY_ITEM_NOT_IN_PROGRAM' },
    });
    expect(memory.completionRows).toHaveLength(0);
    expect(rewards?.calls).toHaveLength(0);
    expect(memory.attempts.find((row) => row.id === attempt.attempt_id)?.status).toBe('open');

    // Another chapter removed instead: the chapter of the attempt is still there, the submit goes through.
    live.chapter_ids = ALL.filter((id) => id !== 'ch06');
    const submitted = await service.submit(USER, attempt.attempt_id, { answers });
    expect(submitted).toMatchObject({ passed: true, reward: { status: 'credited' } });
    expect(rewards?.calls).toHaveLength(1);
  });

  it('a config lookup that fails fails the request: there is no fallback config (§8.2)', async () => {
    const down = () => Promise.reject(new Error('config down'));
    const { service } = setup({ configs: { configOf: down, configsOf: down } });
    await expect(service.catalog(USER)).rejects.toThrow('config down');
    await expect(service.link(USER, 'nim')).rejects.toThrow('config down');
  });
});

/* ------------------------------------------------------------------------------- AcademyConfigService (§1, §8) */

const ADMIN_ID = '00000000-0000-4000-8000-0000000000a1';
const LEAD_A = '00000000-0000-4000-8000-0000000000b1';
const LEAD_B = '00000000-0000-4000-8000-0000000000b2';
const MEMBER_A = '00000000-0000-4000-8000-0000000000c1';
const MEMBER_B = '00000000-0000-4000-8000-0000000000c2';
const LOOSE = '00000000-0000-4000-8000-0000000000c3';
const REVOKED = '00000000-0000-4000-8000-0000000000b3';
const MEMBER_REVOKED = '00000000-0000-4000-8000-0000000000c4';
const DEFAULT_ID = '00000000-0000-4000-8000-0000000000d0';

const audit: AuditContext = { adminId: ADMIN_ID, actorRole: 'admin', ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

/** Just enough of `AcademyConfigRepository` to run the service: configs, a few users and the writes it makes. */
class FakeConfigs {
  configs: AcademyConfigWithActor[] = [];
  logRows: AcademyNewLog[] = [];
  auditCalls: { sql: string; params: unknown[] }[] = [];
  failWith: Error | null = null;
  subjectRows: AcademySubjectRow[] = [
    { user_id: ADMIN_ID, role: 'admin', is_active_lead: false, group_lead_id: null },
    { user_id: LEAD_A, role: 'user', is_active_lead: true, group_lead_id: null },
    { user_id: LEAD_B, role: 'user', is_active_lead: true, group_lead_id: null },
    { user_id: REVOKED, role: 'user', is_active_lead: false, group_lead_id: null },
    { user_id: MEMBER_A, role: 'user', is_active_lead: false, group_lead_id: LEAD_A },
    { user_id: MEMBER_B, role: 'user', is_active_lead: false, group_lead_id: LEAD_B },
    { user_id: MEMBER_REVOKED, role: 'user', is_active_lead: false, group_lead_id: REVOKED },
    { user_id: LOOSE, role: 'user', is_active_lead: false, group_lead_id: null },
  ];
  leaderRows: AcademyLeaderRow[] = [
    { user_id: LEAD_A, username: 'lead.a', full_name: 'Lead A', status: 'active' },
    { user_id: LEAD_B, username: 'lead.b', full_name: 'Lead B', status: 'active' },
  ];
  private sequence = 0;
  private clock = Date.UTC(2026, 10, 4, 10, 0, 0);

  readonly tx = {
    query: (sql: string, params: unknown[]) => {
      this.auditCalls.push({ sql, params });
      return Promise.resolve([]);
    },
  } as unknown as SqlClient;

  constructor(withDefault = true) {
    if (withDefault) this.configs.push(this.row({ id: DEFAULT_ID, owner_type: 'default', leader_id: null }));
  }

  asRepository() {
    return this as unknown as AcademyConfigRepository;
  }

  row(
    partial: Partial<AcademyConfigWithActor> & Pick<AcademyConfigRow, 'owner_type' | 'leader_id'>,
  ): AcademyConfigWithActor {
    this.sequence += 1;
    this.clock += 60_000;
    return {
      id: `00000000-0000-4000-8000-${String(this.sequence + 500).padStart(12, '0')}`,
      mode: 'free',
      chapter_ids: ALL,
      updated_by: ADMIN_ID,
      created_at: new Date(this.clock),
      updated_at: new Date(this.clock),
      updated_by_username: 'admin',
      updated_by_full_name: 'Quản trị',
      ...partial,
    };
  }

  own(leaderId: string, data: Partial<AcademyConfigData>) {
    const { chapter_ids: chapterIds, ...rest } = data;
    const row = this.row({
      owner_type: 'leader',
      leader_id: leaderId,
      ...rest,
      ...(chapterIds ? { chapter_ids: [...chapterIds] } : {}),
    });
    this.configs.push(row);
    return row;
  }

  private check() {
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve();
  }

  transaction<T>(operation: (client: SqlClient) => Promise<T>) {
    return operation(this.tx);
  }
  async subjects(ids: readonly string[]) {
    await this.check();
    return this.subjectRows.filter((row) => ids.includes(row.user_id));
  }
  async configsForUsers() {
    await this.check();
    return this.configs;
  }
  allConfigs() {
    return Promise.resolve(this.configs);
  }
  configById(id: string) {
    return Promise.resolve(this.configs.find((row) => row.id === id) ?? null);
  }
  defaultConfig() {
    return Promise.resolve(this.configs.find((row) => row.owner_type === 'default') ?? null);
  }
  leaderConfig(leaderId: string) {
    return Promise.resolve(this.configs.find((row) => row.leader_id === leaderId) ?? null);
  }
  leaders() {
    return Promise.resolve(this.leaderRows);
  }
  leader(leaderId: string) {
    return Promise.resolve(this.leaderRows.find((row) => row.user_id === leaderId) ?? null);
  }
  memberCounts() {
    const counts = new Map<string, number>();
    for (const row of this.subjectRows)
      if (row.group_lead_id && row.role !== 'admin') counts.set(row.group_lead_id, (counts.get(row.group_lead_id) ?? 0) + 1);
    return Promise.resolve(counts);
  }
  defaultUserCount() {
    return Promise.resolve(1);
  }
  activeLeadIds() {
    return Promise.resolve(new Set(this.subjectRows.filter((row) => row.is_active_lead).map((row) => row.user_id)));
  }
  insertConfig(
    _tx: SqlClient,
    input: { owner_type: 'default' | 'leader'; leader_id: string | null; mode: AcademyConfigData['mode']; chapter_ids: readonly string[]; updated_by: string },
  ) {
    if (this.configs.some((row) => row.owner_type === input.owner_type && row.leader_id === input.leader_id))
      return Promise.resolve(null);
    const row = this.row({ ...input, chapter_ids: [...input.chapter_ids] });
    this.configs.push(row);
    return Promise.resolve(row);
  }
  updateConfig(_tx: SqlClient, id: string, input: AcademyConfigData & { updated_by: string }) {
    const row = this.configs.find((entry) => entry.id === id)!;
    this.clock += 60_000;
    Object.assign(row, { mode: input.mode, chapter_ids: [...input.chapter_ids], updated_by: input.updated_by, updated_at: new Date(this.clock) });
    return Promise.resolve(row);
  }
  deleteConfig(_tx: SqlClient, id: string) {
    this.configs = this.configs.filter((row) => row.id !== id);
    return Promise.resolve();
  }
  insertLog(_tx: SqlClient, log: AcademyNewLog) {
    this.logRows.push(log);
    return Promise.resolve();
  }
  logs(owner: { owner_type: 'default' } | { owner_type: 'leader'; leader_id: string }, limit: number) {
    const rows = this.logRows
      .filter((log) => (owner.owner_type === 'default' ? log.owner_type === 'default' : log.leader_id === owner.leader_id))
      .map(
        (log, index): AcademyConfigLogRow => ({
          id: `log-${index}`,
          ...log,
          changed_by_username: 'admin',
          changed_by_full_name: 'Quản trị',
          changed_at: new Date(Date.UTC(2026, 10, 4, 11, index)),
        }),
      );
    return Promise.resolve(rows.reverse().slice(0, limit));
  }
}

function configService(fake: FakeConfigs) {
  return new AcademyConfigService(fake.asRepository(), academyV4Source);
}

const auditActions = (fake: FakeConfigs) => fake.auditCalls.map((call) => call.params[2]);

describe('academy config resolution (v4.1 §1.1, §8.2, §10.2)', () => {
  it('gives each user the config of his group, the default to the rest, and the built-in full view to an admin', async () => {
    const fake = new FakeConfigs();
    const a = fake.own(LEAD_A, { mode: 'sequential', chapter_ids: GROUP_A });
    const configs = configService(fake);
    const resolved = await configs.configsOf([ADMIN_ID, LEAD_A, MEMBER_A, MEMBER_B, LOOSE, 'unknown-user']);

    expect(resolved.get(ADMIN_ID)).toMatchObject({ source: 'admin', mode: 'free', chapter_ids: ALL, config_id: null });
    // Group A: the lead himself (when he learns) and every member use config A.
    for (const id of [LEAD_A, MEMBER_A])
      expect(resolved.get(id), id).toMatchObject({ source: 'leader', mode: 'sequential', chapter_ids: GROUP_A, config_id: a.id });
    // Lead B has no own config: his group, a user in no group and an unknown id use the default.
    for (const id of [MEMBER_B, LOOSE, 'unknown-user'])
      expect(resolved.get(id), id).toMatchObject({ source: 'default', mode: 'free', chapter_ids: ALL, config_id: DEFAULT_ID });
  });

  it('follows an edited default and a changed group at once: nothing is cached', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    fake.own(LEAD_A, { mode: 'sequential', chapter_ids: GROUP_A });
    expect((await configs.configOf(MEMBER_B)).mode).toBe('free');

    // The default is edited: every user without an own-config group sees it on the next call.
    fake.configs.find((row) => row.owner_type === 'default')!.mode = 'sequential';
    expect(await configs.configOf(MEMBER_B)).toMatchObject({ mode: 'sequential', source: 'default' });
    expect(await configs.configOf(LOOSE)).toMatchObject({ mode: 'sequential', source: 'default' });

    // The user moves to group A: his config is A's from the next call on.
    fake.subjectRows.find((row) => row.user_id === MEMBER_B)!.group_lead_id = LEAD_A;
    expect(await configs.configOf(MEMBER_B)).toMatchObject({ source: 'leader', chapter_ids: GROUP_A });
    // ...and back to no group.
    fake.subjectRows.find((row) => row.user_id === MEMBER_B)!.group_lead_id = null;
    expect(await configs.configOf(MEMBER_B)).toMatchObject({ source: 'default' });
  });

  it('a revoked lead keeps his group on his config, but he himself learns with the default', async () => {
    const fake = new FakeConfigs();
    fake.own(REVOKED, { mode: 'sequential', chapter_ids: ['ch01', 'ch02'] });
    const configs = configService(fake);
    expect(await configs.configOf(MEMBER_REVOKED)).toMatchObject({ source: 'leader', chapter_ids: ['ch01', 'ch02'] });
    expect(await configs.configOf(REVOKED)).toMatchObject({ source: 'default' });
  });

  it('falls back to the built-in default (free, every chapter) when no default row exists yet', async () => {
    const fake = new FakeConfigs(false);
    expect(await configService(fake).configOf(LOOSE)).toEqual({
      mode: 'free',
      chapter_ids: ALL,
      source: 'default',
      config_id: null,
    });
  });

  it('answers every user it was asked about, and a database error is an error, never another config', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    expect(await configs.configsOf([])).toEqual(new Map());
    expect((await configs.configsOf([LOOSE, LOOSE, MEMBER_A])).size).toBe(2);
    fake.failWith = new Error('db down');
    await expect(configs.configOf(LOOSE)).rejects.toThrow('db down');
    await expect(configs.configsOf([LOOSE, MEMBER_A])).rejects.toThrow('db down');
  });
});

describe('academy config admin (v4.1 §1.3, §1.4, §8.3, §10.1)', () => {
  it('lists the default first, then every team lead with his own config or "Theo mặc định"', async () => {
    const fake = new FakeConfigs();
    fake.own(LEAD_A, { mode: 'sequential', chapter_ids: GROUP_A });
    const list = await configService(fake).list();
    expect(list.catalog_chapters).toHaveLength(12);
    expect(list.catalog_chapters.find((chapter) => chapter.chapter_id === 'ch03')).toMatchObject({
      no: 3,
      title: 'Thương hiệu cá nhân',
      has_practice: true,
    });
    expect(list.items.map((entry) => [entry.owner_type, entry.name, entry.inherits_default])).toEqual([
      ['default', 'Mặc định', false],
      ['leader', 'Lead A', false],
      ['leader', 'Lead B', true],
    ]);
    expect(list.items[0]).toMatchObject({ id: DEFAULT_ID, mode: 'free', chapter_count: 12, chapter_total: 12, required_total: 116 });
    expect(list.items[1]).toMatchObject({ mode: 'sequential', chapter_count: 11, chapter_total: 12, required_total: 106, user_count: 2 });
    // A lead without an own config shows the default's content and no config row to edit.
    expect(list.items[2]).toMatchObject({ id: null, mode: 'free', chapter_count: 12, user_count: 2 });
  });

  it('creates an own config for a lead: validated, logged with before and after, audited; once only', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    const created = await configs.create({ leader_id: LEAD_A, mode: 'sequential', chapter_ids: ['ch04', 'ch01'] }, audit);
    expect(created).toMatchObject({ owner_type: 'leader', inherits_default: false, mode: 'sequential', chapter_ids: ['ch01', 'ch04'] });
    expect(created.id).not.toBeNull();
    expect(fake.logRows).toEqual([
      {
        config_id: created.id,
        owner_type: 'leader',
        leader_id: LEAD_A,
        action: 'create',
        changed_by: ADMIN_ID,
        before: { mode: 'free', chapter_ids: ALL },
        after: { mode: 'sequential', chapter_ids: ['ch01', 'ch04'] },
      },
    ]);
    expect(auditActions(fake)).toEqual(['academy_config.create']);

    await expect(configs.create({ leader_id: LEAD_A, mode: 'free', chapter_ids: ALL }, audit)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMY_CONFIG_EXISTS' },
    });
    await expect(configs.create({ leader_id: LOOSE, mode: 'free', chapter_ids: ALL }, audit)).rejects.toMatchObject({
      status: 404,
      response: { code: 'ACADEMY_LEADER_NOT_FOUND' },
    });
    expect(fake.logRows).toHaveLength(1);
  });

  it('refuses a config without a chapter or with an unknown one (422), saving nothing', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    const own = await configs.create({ leader_id: LEAD_A, mode: 'free', chapter_ids: ['ch01'] }, audit);
    const logsBefore = fake.logRows.length;
    for (const chapterIds of [[], ['ch13'], ['ch01', 'ch99']]) {
      await expect(configs.update(own.id!, { mode: 'free', chapter_ids: chapterIds }, audit)).rejects.toMatchObject({
        status: 422,
        response: { code: 'ACADEMY_CONFIG_INVALID' },
      });
      await expect(configs.create({ leader_id: LEAD_B, mode: 'free', chapter_ids: chapterIds }, audit)).rejects.toMatchObject({
        status: 422,
      });
      expect(() => configs.preview({ mode: 'free', chapter_ids: chapterIds })).toThrow();
    }
    expect(fake.logRows).toHaveLength(logsBefore);
    expect(fake.configs.find((row) => row.id === own.id)?.chapter_ids).toEqual(['ch01']);
  });

  it('saves the default or an own config with before and after in the log and the audit; an unchanged save writes nothing', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    const saved = await configs.update(DEFAULT_ID, { mode: 'sequential', chapter_ids: GROUP_A }, audit);
    expect(saved).toMatchObject({ owner_type: 'default', mode: 'sequential', chapter_count: 11 });
    expect(fake.logRows).toEqual([
      {
        config_id: DEFAULT_ID,
        owner_type: 'default',
        leader_id: null,
        action: 'update',
        changed_by: ADMIN_ID,
        before: { mode: 'free', chapter_ids: ALL },
        after: { mode: 'sequential', chapter_ids: GROUP_A },
      },
    ]);
    expect(auditActions(fake)).toEqual(['academy_config.update']);

    // The same content again (chapters in any order) is a no-op: no log row, no audit row.
    await configs.update(DEFAULT_ID, { mode: 'sequential', chapter_ids: [...GROUP_A].reverse() }, audit);
    expect(fake.logRows).toHaveLength(1);
    expect(fake.auditCalls).toHaveLength(1);

    await expect(configs.update('00000000-0000-4000-8000-00000000ffff', { mode: 'free', chapter_ids: ALL }, audit)).rejects.toMatchObject({
      status: 404,
      response: { code: 'ACADEMY_CONFIG_NOT_FOUND' },
    });
  });

  it('"Về mặc định" deletes an own config and the group goes back to the default; the default itself is protected', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    const own = await configs.create({ leader_id: LEAD_A, mode: 'sequential', chapter_ids: GROUP_A }, audit);
    const back = await configs.remove(own.id!, audit);
    expect(back).toMatchObject({ id: null, inherits_default: true, mode: 'free', chapter_count: 12 });
    expect(fake.configs.map((row) => row.owner_type)).toEqual(['default']);
    expect(fake.logRows.at(-1)).toMatchObject({
      action: 'delete',
      leader_id: LEAD_A,
      before: { mode: 'sequential', chapter_ids: GROUP_A },
      after: { mode: 'free', chapter_ids: ALL },
    });
    expect(auditActions(fake)).toEqual(['academy_config.create', 'academy_config.delete']);
    expect(await configs.configOf(MEMBER_A)).toMatchObject({ source: 'default' });

    await expect(configs.remove(DEFAULT_ID, audit)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMY_CONFIG_DEFAULT_PROTECTED' },
    });
    await expect(configs.remove(own.id!, audit)).rejects.toMatchObject({ status: 404 });
    expect(fake.configs.some((row) => row.id === DEFAULT_ID)).toBe(true);
  });

  it('keeps the log of a lead across "Về mặc định" and a new config, newest first, with who changed it', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    const first = await configs.create({ leader_id: LEAD_A, mode: 'free', chapter_ids: GROUP_A }, audit);
    await configs.update(first.id!, { mode: 'sequential', chapter_ids: GROUP_A }, audit);
    await configs.remove(first.id!, audit);
    const second = await configs.create({ leader_id: LEAD_A, mode: 'free', chapter_ids: ['ch01'] }, audit);

    const logs = await configs.logs(second.id!, 50);
    expect(logs.items.map((entry) => entry.action)).toEqual(['create', 'delete', 'update', 'create']);
    expect(logs.items[0]).toMatchObject({
      changed_by: { id: ADMIN_ID, username: 'admin', full_name: 'Quản trị' },
      after: { mode: 'free', chapter_ids: ['ch01'] },
    });
    expect((await configs.logs(second.id!, 2)).items).toHaveLength(2);
    // The default's log is its own.
    expect((await configs.logs(DEFAULT_ID, 50)).items).toEqual([]);
    await expect(configs.logs('00000000-0000-4000-8000-00000000ffff', 5)).rejects.toMatchObject({ status: 404 });
  });

  it('previews a config as its group will see it: renumbered chapters, N and the Dashboard warnings (§1.4, §4)', () => {
    const configs = configService(new FakeConfigs());
    const a = configs.preview({ mode: 'sequential', chapter_ids: GROUP_A });
    expect(a).toMatchObject({ mode: 'sequential', chapter_count: 11, chapter_total: 12, required_total: 106 });
    expect(a.chapters.slice(0, 3).map((chapter) => [chapter.chapter_id, chapter.display_no, chapter.title])).toEqual([
      ['ch01', 1, 'Nền tảng'],
      ['ch03', 2, 'Thương hiệu cá nhân'],
      ['ch04', 3, 'Phương pháp kỹ thuật'],
    ]);
    expect(a.warnings).toEqual([]);

    // Dropping a chapter whose lessons teach Dashboard metrics warns, and still previews (the admin may save).
    const noBank = configs.preview({ mode: 'free', chapter_ids: ALL.filter((id) => id !== 'ch10') });
    expect(noBank.warnings).toEqual([
      {
        code: 'DASHBOARD_METRIC_CHAPTER_REMOVED',
        chapter_id: 'ch10',
        title: 'Phân tích ngân hàng',
        message: 'Nút Học ở Dashboard của các chỉ tiêu thuộc chương này sẽ không có bài.',
      },
    ]);
    expect(configs.preview({ mode: 'free', chapter_ids: ['ch01'] }).warnings.map((warning) => warning.chapter_id)).toEqual([
      'ch08',
      'ch09',
      'ch10',
      'ch11',
      'ch12',
    ]);
  });

  it('shows a team lead his own group config read only, or the default when he has none (§1.3)', async () => {
    const fake = new FakeConfigs();
    const configs = configService(fake);
    expect(await configs.teamConfig(LEAD_B)).toMatchObject({
      has_own_config: false,
      read_only: true,
      mode: 'free',
      chapter_count: 12,
      required_total: 116,
    });
    fake.own(LEAD_B, { mode: 'sequential', chapter_ids: GROUP_A });
    const own = await configs.teamConfig(LEAD_B);
    expect(own).toMatchObject({ has_own_config: true, read_only: true, mode: 'sequential', chapter_count: 11, required_total: 106 });
    expect(own.chapters[1]).toMatchObject({ chapter_id: 'ch03', display_no: 2, title: 'Thương hiệu cá nhân' });
  });
});

describe('academy config permissions (v4.1 §1.3, §10.1)', () => {
  it('the admin config API is admin only, class wide: a team lead calling a write is refused by the roles guard', () => {
    expect(Reflect.getMetadata(AUTH_ROLES_KEY, AdminAcademyConfigsController)).toEqual(['admin']);
    // No method relaxes it.
    for (const name of ['list', 'preview', 'create', 'save', 'remove', 'logs'] as const) {
      const handler = AdminAcademyConfigsController.prototype[name];
      expect(Reflect.getMetadata(AUTH_ROLES_KEY, handler), name).toBeUndefined();
    }
  });
});
