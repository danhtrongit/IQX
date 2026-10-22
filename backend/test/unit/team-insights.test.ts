import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  AcademyProgressReader,
  buildAcademyProgress,
  type AcademyCompletionFact,
} from '../../src/modules/academy/academy-progress-reader.service.js';
import { ACADEMY_V3_CATALOG_VERSION } from '../../src/modules/academy/content/v3/schema.js';
import { AdminMetricsService } from '../../src/modules/admin/admin-metrics.service.js';
import { TeamService } from '../../src/modules/team-leads/team.service.js';
import { teamUserListQuerySchema } from '../../src/modules/team-leads/team.schemas.js';
import { academyV3Fixture, academyV3Source } from './academy-v3-fixture.js';

const content = academyV3Fixture();
const AT = '2026-10-01T00:00:00.000Z';

function keyOf(id: string): string {
  const item = content.items.get(id);
  if (!item) throw new Error(id);
  return item.lesson_key;
}

function done(ids: readonly string[], completedAt = AT): AcademyCompletionFact[] {
  return ids.map((id) => ({ lesson_key: keyOf(id), completed_at: completedAt, reward: null }));
}

/** Item ids of published chapters, filtered by kind. */
function ids(filter: (id: string) => boolean = () => true): string[] {
  return content.sequence.map((item) => item.id).filter(filter);
}
const isLesson = (id: string) => /-l\d{2}$/.test(id);
const isExam = (id: string) => id.endsWith('-exam');

function row(view: ReturnType<typeof buildAcademyProgress>, id: string) {
  const found = view.chapters.flatMap((chapter) => chapter.lessons).find((l) => l.lesson_id === id);
  if (!found) throw new Error(id);
  return found;
}

describe('academy progress for staff views (admin spec v1.1 §5.1.4, Học viện v3.3)', () => {
  it('lists the 13 published chapters with lessons, exam and practice; totals count 87 required lessons', () => {
    const view = buildAcademyProgress(content);
    expect(view.catalog_version).toBe(ACADEMY_V3_CATALOG_VERSION);
    expect(view.chapters.map((chapter) => [chapter.no, chapter.total])).toEqual([
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
    expect(view.total).toBe(87);
    expect(view).toMatchObject({
      started: false,
      completed: 0,
      all_done: false,
      current_lesson: null,
      last_completion: null,
      learning_coins: 0,
      chapter_exams: { total: 13, passed: 0 },
    });
    const ch3 = view.chapters[2]?.lessons ?? [];
    expect(ch3.map((l) => [l.lesson_id, l.kind, l.optional]).slice(-2)).toEqual([
      ['ch03-exam', 'chapter_exam', false],
      ['ch03-practice', 'practice', true],
    ]);
    expect(view.chapters.every((chapter) => chapter.exam_passed === false)).toBe(true);
    // Only the first lesson is open for a new user; everything else is locked.
    expect(row(view, 'ch01-l01')).toMatchObject({ status: 'not_started', is_current: false });
    const statuses = new Set(
      view.chapters
        .flatMap((chapter) => chapter.lessons)
        .filter((l) => l.lesson_id !== 'ch01-l01')
        .map((l) => l.status),
    );
    expect([...statuses]).toEqual(['locked']);
    expect(
      ['ch01-l01', 'ch01-exam', 'ch03-practice', 'ch04-l01', 'ch04-exam'].map(
        (id) => row(view, id).max_score,
      ),
    ).toEqual([3, 20, 3, 5, 30]);
  });

  it('keeps a carried indicator completion passed out of order and ignores keys outside the catalog', () => {
    const view = buildAcademyProgress(content, {
      completions: [
        {
          lesson_key: 'technical:rsi',
          completed_at: '2026-09-01T00:00:00.000Z',
          reward: { status: 'credited', delta: 100 },
        },
        // Retired keys: never listed, but their coins stay in the total.
        {
          lesson_key: 'concept:hop_luu',
          completed_at: '2026-09-05T00:00:00.000Z',
          reward: { status: 'credited', delta: 100 },
        },
        { lesson_key: 'guide:ch02-l01', completed_at: '2026-09-06T00:00:00.000Z', reward: null },
      ],
      attempts: [
        // An attempt key outside the catalog is ignored.
        { lesson_key: 'concept:hop_luu', attempts: 3, latest_score: 7, open_at: null },
      ],
    });
    expect(view).toMatchObject({ started: true, completed: 1, total: 87, learning_coins: 200 });
    expect(row(view, 'ch04-l06')).toMatchObject({ status: 'completed', kind: 'lesson' });
    expect(row(view, 'ch04-l05').status).toBe('locked');
    expect(view.current_lesson).toEqual({
      lesson_id: 'ch01-l01',
      chapter: 1,
      order: 1,
      name: 'Đầu tư chứng khoán',
      label: 'Chương 1 · Bài 1: Đầu tư chứng khoán',
      kind: 'lesson',
    });
    expect(view.last_completion).toMatchObject({
      lesson_id: 'ch04-l06',
      label: 'Chương 4 · Bài 6: RSI',
      reward_coins: 100,
    });
    expect(view.chapters[3]?.completed).toBe(1);
  });

  it('points at the chapter exam once the chapter lessons are passed, with exam scores out of 20', () => {
    const view = buildAcademyProgress(content, {
      completions: done(ids((id) => id.startsWith('ch01-l'))),
      attempts: [
        { lesson_key: keyOf('ch01-exam'), attempts: 2, latest_score: 18, open_at: null },
        { lesson_key: keyOf('ch01-l03'), attempts: 4, latest_score: 3, open_at: null },
      ],
    });
    expect(view.completed).toBe(10);
    expect(view.chapters[0]).toMatchObject({ completed: 10, total: 10, exam_passed: false });
    expect(view.current_lesson).toMatchObject({
      lesson_id: 'ch01-exam',
      kind: 'chapter_exam',
      order: 11,
      label: 'Bài thi Chương 1',
    });
    expect(row(view, 'ch01-exam')).toMatchObject({
      status: 'failed',
      attempts: 2,
      latest_score: 18,
      max_score: 20,
      is_current: true,
    });
    expect(row(view, 'ch01-l03')).toMatchObject({ status: 'completed', latest_score: 3 });
    expect(row(view, 'ch02-l01').status).toBe('locked');

    const open = buildAcademyProgress(content, {
      completions: done(ids((id) => id.startsWith('ch01-l'))),
      attempts: [{ lesson_key: keyOf('ch01-exam'), attempts: 0, latest_score: null, open_at: AT }],
    });
    expect(row(open, 'ch01-exam').status).toBe('in_progress');
  });

  it('opens the practice next to chapter 4 without counting it, and never makes it current', () => {
    const throughCh3 = ids((id) => /^ch0[1-3]-/.test(id) && !id.endsWith('practice'));
    const view = buildAcademyProgress(content, { completions: done(throughCh3), attempts: [] });
    expect(view.completed).toBe(29);
    expect(view.chapter_exams).toEqual({ total: 13, passed: 3 });
    expect(row(view, 'ch03-practice')).toMatchObject({ status: 'not_started', is_current: false });
    expect(row(view, 'ch04-l01')).toMatchObject({ status: 'not_started', is_current: true });
    expect(view.current_lesson?.lesson_id).toBe('ch04-l01');

    const withPractice = buildAcademyProgress(content, {
      completions: [...done(throughCh3), ...done(['ch03-practice'], '2026-10-02T00:00:00.000Z')],
      attempts: [],
    });
    expect(withPractice.completed).toBe(29);
    expect(withPractice.chapters[2]).toMatchObject({ completed: 9, total: 9, exam_passed: true });
    expect(row(withPractice, 'ch03-practice').status).toBe('completed');
    expect(withPractice.last_completion?.label).toBe('Chương 3 · Phòng tập thực chiến');
  });

  it('reports all done only once every required lesson and chapter exam is passed', () => {
    const lessonsOnly = buildAcademyProgress(content, {
      completions: done(ids((id) => isLesson(id) || (isExam(id) && id !== 'ch05-exam'))),
      attempts: [],
    });
    expect(lessonsOnly).toMatchObject({ completed: 87, total: 87, all_done: false });
    expect(lessonsOnly.current_lesson).toMatchObject({
      lesson_id: 'ch05-exam',
      label: 'Bài thi Chương 5',
    });

    const all = buildAcademyProgress(content, {
      completions: done(ids((id) => isLesson(id) || isExam(id))),
      attempts: [],
    });
    expect(all).toMatchObject({
      started: true,
      completed: 87,
      all_done: true,
      current_lesson: null,
      chapter_exams: { total: 13, passed: 13 },
    });
    expect(all.chapters.every((chapter) => chapter.exam_passed)).toBe(true);
  });

  it('reads attempts of the current catalog only, through the injected content source', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const database = {
      query: vi.fn((sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('academy_completions'))
          return Promise.resolve([{ user_id: userId, ...done(['ch01-l01'])[0] }]);
        return Promise.resolve([
          {
            user_id: userId,
            lesson_key: keyOf('ch01-l02'),
            attempts: '1',
            latest_score: '2',
            open_at: null,
          },
        ]);
      }),
    };
    const reader = new AcademyProgressReader(database as never, academyV3Source);
    const summaries = await reader.summaries([userId, '00000000-0000-4000-8000-000000000002']);
    expect(summaries.get(userId)).toEqual({
      started: true,
      completed: 1,
      total: 87,
      all_done: false,
      current_lesson: expect.objectContaining({ lesson_id: 'ch01-l02', kind: 'lesson' }),
    });
    expect(summaries.get('00000000-0000-4000-8000-000000000002')).toMatchObject({
      started: false,
      current_lesson: null,
    });
    const attemptsQuery = calls.find((call) => call.sql.includes('academy_attempts'));
    expect(attemptsQuery?.sql).toMatch(/catalog_version = \$2/);
    expect(attemptsQuery?.params[1]).toBe(ACADEMY_V3_CATALOG_VERSION);
    const detail = await reader.detail(userId);
    expect(row(detail, 'ch01-l02')).toMatchObject({ status: 'failed', latest_score: 2 });
    await expect(reader.summaries([])).resolves.toEqual(new Map());
  });
});

describe('group-scoped admin metrics (admin spec v1.1 §6)', () => {
  function recordingDatabase() {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const database = {
      query: vi.fn((sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        return Promise.resolve([]);
      }),
    };
    return { calls, service: new AdminMetricsService(database as never) };
  }

  it('keeps the admin overview unscoped', async () => {
    const { calls, service } = recordingDatabase();
    await service.overview();
    for (const call of calls) {
      expect(call.sql).not.toMatch(/group_lead_id|team_lead_id =|order_lead_id =/);
    }
  });

  it('scopes users to members and money to orders snapshotted to the lead', async () => {
    const { calls, service } = recordingDatabase();
    const leadId = '00000000-0000-4000-8000-0000000000aa';
    await service.overview({ leadId });
    await service.dailyRevenue(30, { leadId });
    const sql = calls.map((call) => call.sql);
    expect(sql.find((text) => text.includes('total_users'))).toMatch(/group_lead_id = \$1/);
    const subscriptions = sql.find((text) => text.includes('mrr_vnd')) ?? '';
    expect(subscriptions).toMatch(/c\.order_lead_id = \$1/);
    expect(subscriptions).toMatch(/kind <> 'referral_offer'/);
    expect(sql.find((text) => text.includes('revenue_today_vnd'))).toMatch(/team_lead_id = \$1/);
    const vt = sql.find((text) => text.includes('vt_orders_today')) ?? '';
    expect(vt.match(/group_lead_id = \$1/g)).toHaveLength(2);
    expect(sql.find((text) => text.includes('plan_code'))).toMatch(/c\.order_lead_id = \$2/);
    expect(sql.find((text) => text.includes('generate_series'))).toMatch(/team_lead_id = \$2/);
    for (const call of calls) expect(call.params).toContain(leadId);
  });
});

describe('team service (admin spec v1.1 §4.3)', () => {
  it('maps NOT_IN_GROUP to USER_NOT_FOUND when a lead removes someone outside its group', async () => {
    const teamLeads = {
      removeMember: vi
        .fn()
        .mockRejectedValue(new NotFoundException({ code: 'NOT_IN_GROUP', message: 'x' })),
    };
    const service = new TeamService(
      {} as never,
      teamLeads as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const error = await service
      .removeMember('lead', 'user', 'reason', {} as never)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'USER_NOT_FOUND' });

    teamLeads.removeMember.mockRejectedValue(
      new UnprocessableEntityException({ code: 'OTHER', message: 'x' }),
    );
    await expect(
      service.removeMember('lead', 'user', 'reason', {} as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('accepts only the documented list filters and sorts', () => {
    expect(teamUserListQuerySchema.parse({})).toMatchObject({
      page: 1,
      page_size: 20,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    for (const invalid of [
      { page_size: 101 },
      { page_size: 0 },
      { role: 'team_lead' },
      { role: 'admin' },
      { sort_by: 'email' },
      { segment: 'paid' },
    ]) {
      expect(teamUserListQuerySchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(
        false,
      );
    }
    // Unknown keys never reach the service: the scope is the caller's own group.
    expect(teamUserListQuerySchema.parse({ lead_id: 'x' })).not.toHaveProperty('lead_id');
  });
});
