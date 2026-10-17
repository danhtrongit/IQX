import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { buildAcademyProgress } from '../../src/modules/academy/academy-progress-reader.service.js';
import {
  loadAcademyContent,
  type AcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { AdminMetricsService } from '../../src/modules/admin/admin-metrics.service.js';
import { TeamService } from '../../src/modules/team-leads/team.service.js';
import { teamUserListQuerySchema } from '../../src/modules/team-leads/team.schemas.js';

/** The real catalog with chapter 13 and lesson ch01-l06 marked not published. */
function partlyPublished(): AcademyContent {
  const content = loadAcademyContent();
  return {
    ...content,
    chapters: content.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) =>
        chapter.no === 13 || lesson.id === 'ch01-l06'
          ? { ...lesson, content_status: 'not_published' as const }
          : lesson,
      ),
    })),
  };
}

describe('academy progress for staff views (admin spec v1.1 §5.1.4)', () => {
  it('lists only published chapters and lessons, and has not started without any activity', () => {
    const content = partlyPublished();
    const view = buildAcademyProgress(content);
    expect(view.chapters.map((chapter) => chapter.no)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(view.chapters[0]?.lessons.map((lesson) => lesson.lesson_id)).not.toContain('ch01-l06');
    const published = content.chapters
      .flatMap((chapter) => chapter.lessons)
      .filter((lesson) => lesson.content_status === 'published').length;
    expect(view.total).toBe(published);
    expect(view).toMatchObject({
      started: false,
      completed: 0,
      all_done: false,
      current_lesson: null,
      last_completion: null,
      learning_coins: 0,
      chapter_exams: { total: 0, passed: 0 },
    });
  });

  it('ignores completions outside the published catalog and derives the current lesson', () => {
    const content = partlyPublished();
    const lesson = (id: string) => {
      const found = content.lessons.get(id);
      if (!found) throw new Error(id);
      return found;
    };
    const facts = {
      completions: [
        {
          lesson_key: lesson('ch01-l01').lesson_key,
          completed_at: '2026-10-01T00:00:00.000Z',
          reward: { status: 'credited', delta: 5 },
        },
        {
          lesson_key: lesson('ch01-l06').lesson_key, // not published here
          completed_at: '2026-10-05T00:00:00.000Z',
          reward: { status: 'credited', delta: 7 },
        },
        { lesson_key: 'guide:unknown', completed_at: '2026-10-02T00:00:00.000Z', reward: null },
      ],
      attempts: [
        { lesson_key: lesson('ch01-l02').lesson_key, attempts: 2, latest_score: 7, open_at: null },
      ],
    };
    const view = buildAcademyProgress(content, facts);
    expect(view.completed).toBe(1);
    // No open attempt: the first incomplete published lesson.
    expect(view.current_lesson).toMatchObject({
      lesson_id: 'ch01-l02',
      label: `Chương 1 · Bài 2: ${lesson('ch01-l02').name}`,
    });
    expect(view.last_completion).toMatchObject({ lesson_id: 'ch01-l01', reward_coins: 5 });
    expect(view.learning_coins).toBe(12);
    const second = view.chapters[0]?.lessons[1];
    expect(second).toMatchObject({
      status: 'failed',
      attempts: 2,
      latest_score: 7,
      max_score: 8,
      is_current: true,
    });

    // An open attempt on a later lesson wins over the first incomplete one.
    const open = buildAcademyProgress(content, {
      ...facts,
      attempts: [
        ...facts.attempts,
        {
          lesson_key: lesson('ch03-l02').lesson_key,
          attempts: 0,
          latest_score: null,
          open_at: '2026-10-06T00:00:00.000Z',
        },
      ],
    });
    expect(open.current_lesson?.lesson_id).toBe('ch03-l02');
    const guide = open.chapters[1]?.lessons[0];
    expect(guide).toMatchObject({ completion_mode: 'guide', max_score: null, latest_score: null });
  });

  it('reports all done once every published lesson is complete', () => {
    const content = partlyPublished();
    const completions = content.chapters
      .flatMap((chapter) => chapter.lessons)
      .filter((lesson) => lesson.content_status === 'published')
      .map((lesson) => ({
        lesson_key: lesson.lesson_key,
        completed_at: '2026-10-01T00:00:00.000Z',
        reward: null,
      }));
    const view = buildAcademyProgress(content, { completions, attempts: [] });
    expect(view).toMatchObject({ all_done: true, current_lesson: null, started: true });
    expect(view.completed).toBe(view.total);
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
