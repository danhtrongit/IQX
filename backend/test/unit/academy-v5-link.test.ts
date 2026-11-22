import { describe, expect, it } from 'vitest';

import { ACADEMY_V4_CATALOG_VERSION } from '../../src/modules/academy/content/v5/schema.js';
import { linkQuerySchema, linkResponseSchema } from '../../src/modules/academy/academy.schemas.js';
import type { AttemptRow } from '../../src/modules/academy/academy.repository.js';
import { USER, item, setup } from './academy-test-kit.js';
import { academyV4Fixture } from './academy-v4-fixture.js';

// Học viện v5 · runtime of the link API (spec v5 §6, §9; plan HV v5 §7, D5, D13) and the v4 → v5 carry-over (§5.2).

const content = academyV4Fixture();
const ALL = content.catalog.chapters.map((chapter) => `ch${String(chapter.no).padStart(2, '0')}`);
const without = (...ids: string[]) => ALL.filter((id) => !ids.includes(id));

describe('academy link by metric and industry (spec v5 §6.2)', () => {
  it('resolves the five rows of the spec table', async () => {
    const { service } = setup();
    const roeNh = await service.link(USER, 'ROE', 'nh');
    expect(linkResponseSchema.parse(roeNh)).toEqual(roeNh);
    expect(roeNh).toMatchObject({
      found: true,
      lesson_id: 'ch10-l13',
      lesson_key: 'fundamental:roe-nh',
      metric_key: 'roe',
      nganh: 'nh',
      chapter_id: 'ch10',
      title: 'ROE · ở ngân hàng',
      matched_by: 'metric_key',
      url: '/hoc-vien/ch10-l13',
    });
    // Chương 9 does not teach ROE again: Chương 8.
    expect(await service.link(USER, 'ROE', 'thuong')).toMatchObject({
      lesson_id: 'ch08-l11',
      nganh: 'chung',
      matched_by: 'metric_key',
    });
    // By name: the industry chapter first (title "Tăng trưởng doanh thu · ở bất động sản"), not the Chương 8 title.
    expect(await service.link(USER, 'Tăng trưởng doanh thu', 'bds')).toMatchObject({
      lesson_id: 'ch13-l01',
      nganh: 'bds',
      matched_by: 'title_prefix',
    });
    expect(await service.link(USER, 'Revenue CAGR 3Y', 'dien')).toMatchObject({
      lesson_id: 'ch08-l04',
      nganh: 'chung',
      matched_by: 'title_prefix',
    });
    expect(await service.link(USER, 'NIM')).toMatchObject({
      lesson_id: 'ch10-l01',
      nganh: 'nh',
      chapter_display_no: 10,
      matched_by: 'metric_key',
    });
  });

  it('without nganh goes to Chương 8 first, then program order', async () => {
    const { service } = setup();
    expect(await service.link(USER, 'roe')).toMatchObject({ lesson_id: 'ch08-l11' });
    expect(await service.link(USER, 'pb')).toMatchObject({ lesson_id: 'ch08-l15' });
    // A metric taught only in industry chapters: the first in catalog order.
    expect(await service.link(USER, 'inventory_days')).toMatchObject({ lesson_id: 'ch14-l04', nganh: 'dk' });
    expect(await service.link(USER, 'inventory_days', 'bl')).toMatchObject({ lesson_id: 'ch15-l05', nganh: 'bl' });
  });

  it('ignores an unknown or malformed nganh (never a 400)', async () => {
    const { service } = setup();
    expect(await service.link(USER, 'roe', 'xx')).toMatchObject({ found: true, lesson_id: 'ch08-l11' });
    expect(await service.link(USER, 'roe', '  NH ')).toMatchObject({ lesson_id: 'ch10-l13' });
    expect(await service.link(USER, 'Tăng trưởng doanh thu', 'zz')).toMatchObject({
      lesson_id: 'ch08-l01',
      matched_by: 'title',
    });
    expect(linkQuerySchema.parse({ metric: 'roe', nganh: 'xx' })).toEqual({ metric: 'roe', nganh: 'xx' });
    expect(linkQuerySchema.parse({ metric: 'roe' })).toEqual({ metric: 'roe' });
    expect(linkQuerySchema.safeParse({ metric: 'roe', nganh: 'x'.repeat(17) }).success).toBe(false);
  });

  it('falls back to Chương 8 when the group lacks the industry chapter (spec v5 §9, D5)', async () => {
    const { service } = setup({ chapters: without('ch13') });
    expect(await service.link(USER, 'pe', 'bds')).toMatchObject({
      found: true,
      lesson_id: 'ch08-l14',
      nganh: 'chung',
      matched_by: 'metric_key',
    });
    expect(await service.link(USER, 'Tăng trưởng doanh thu', 'bds')).toMatchObject({
      lesson_id: 'ch08-l01',
      matched_by: 'title',
    });
    // A metric only chapter 13 teaches: not found, the learner's current lesson opens (v4.1 rule).
    const miss = await service.link(USER, 'inventory_years', 'bds');
    expect(miss).toMatchObject({
      found: false,
      lesson_id: 'ch01-l01',
      nganh: null,
      metric_key: null,
      url: '/hoc-vien/ch01-l01',
    });
  });

  it('falls back to another chapter teaching the key when Chương 8 is also missing', async () => {
    const { service } = setup({ chapters: without('ch08', 'ch10') });
    expect(await service.link(USER, 'roe', 'nh')).toMatchObject({ lesson_id: 'ch11-l13', nganh: 'ck' });
    const none = setup({ chapters: without('ch08', 'ch10', 'ch11', 'ch12') });
    expect((await none.service.link(USER, 'roe', 'nh')).found).toBe(false);
  });

  it('reaches every (metric_key, nganh) pair of the catalog', async () => {
    const { service } = setup();
    const metricItems = [...content.items.values()].filter((entry) => entry.metric_key !== null);
    expect(metricItems).toHaveLength(149);
    for (const entry of metricItems)
      expect(await service.link(USER, entry.metric_key!, entry.nganh), entry.id).toMatchObject({
        found: true,
        lesson_id: entry.id,
      });
  });
});

describe('academy v4 → v5 carry-over (spec v5 §5.2)', () => {
  const v4Keys = [...content.items.values()]
    .filter((entry) => entry.kind === 'lesson' && !/-[a-z]+$/.test(entry.lesson_key))
    .map((entry) => entry.lesson_key);

  it('keeps the 116 lessons passed under v4 passed and shows the 87 new ones open', async () => {
    expect(v4Keys).toHaveLength(116);
    const { service, memory } = setup();
    memory.complete(USER, v4Keys);
    for (const row of memory.completionRows) row.catalog_version = ACADEMY_V4_CATALOG_VERSION;
    const progress = await service.progress(USER);
    expect(progress).toMatchObject({ course_done: 116, course_total: 203 });
    const lessonStates = progress.items.filter((entry) => item(entry.id).kind === 'lesson');
    expect(lessonStates.filter((entry) => entry.state === 'passed')).toHaveLength(116);
    expect(lessonStates.filter((entry) => entry.state === 'open')).toHaveLength(87);
  });

  it('NIM passed in v4 is passed at its new place, Chương 10 position 2; ch10-12 exams stay passed', async () => {
    const { service, memory } = setup();
    memory.complete(USER, ['fundamental:nim', 'exam:ch10-v4']);
    const catalog = await service.catalog(USER);
    const nim = catalog.chapters.flatMap((chapter) => chapter.items).find((entry) => entry.id === 'ch10-l01');
    expect(nim).toMatchObject({ position: 2, nganh: 'nh', metric_key: 'nim' });
    const progress = await service.progress(USER);
    expect(progress.items.find((entry) => entry.id === 'ch10-l01')?.state).toBe('passed');
    expect(progress.items.find((entry) => entry.id === 'ch10-exam')?.state).toBe('passed');
    expect(progress.chapters.find((chapter) => chapter.chapter_id === 'ch10')).toMatchObject({
      done: 1,
      total: 15,
      exam_passed: true,
    });
  });

  it('counts submitted v4 attempts in the stats of the same key, never older catalogs (D13)', async () => {
    const { service, memory } = setup();
    const attempt = (catalog_version: string, score: number, idempotency_key: string): AttemptRow => ({
      id: `00000000-0000-4000-8000-${idempotency_key.padStart(12, '0')}`,
      user_id: USER,
      lesson_id: 'ch10-l01',
      lesson_key: 'fundamental:nim',
      kind: 'lesson',
      catalog_version,
      content_version: null,
      questions_version: 'a'.repeat(64),
      question_ids: ['q1', 'q2', 'q3', 'q4', 'q5'],
      option_orders: {},
      status: 'submitted',
      idempotency_key,
      created_at: new Date(Date.UTC(2026, 9, 1)),
      submitted_at: new Date(Date.UTC(2026, 9, 1)),
      score,
      passed: score >= 4,
    });
    memory.attempts.push(
      attempt(ACADEMY_V4_CATALOG_VERSION, 3, '1'),
      attempt(ACADEMY_V4_CATALOG_VERSION, 4, '2'),
      attempt('iqx-academy-v3.3-13ch-87lessons', 5, '3'),
    );
    const progress = await service.progress(USER);
    expect(progress.items.find((entry) => entry.id === 'ch10-l01')).toMatchObject({
      best_score: 4,
      attempts_submitted: 2,
    });
  });
});
