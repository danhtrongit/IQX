import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { buildAcademyProgress } from '../../src/modules/academy/academy-progress-reader.service.js';
import { AdminMetricsService } from '../../src/modules/admin/admin-metrics.service.js';
import { TeamService } from '../../src/modules/team-leads/team.service.js';
import { teamUserListQuerySchema } from '../../src/modules/team-leads/team.schemas.js';
import { academyV3Fixture } from './academy-v3-fixture.js';

/* Interim cases on the v3.2 stopgap reader (P1); P3 rewrites them per design §8. */
describe('academy progress for staff views (admin spec v1.1 §5.1.4)', () => {
  const content = academyV3Fixture();
  const item = (id: string) => {
    const found = content.items.get(id);
    if (!found) throw new Error(id);
    return found;
  };

  it('lists the published chapters and their required lessons, not started without activity', () => {
    const view = buildAcademyProgress(content);
    expect(view.chapters.map((chapter) => chapter.no)).toEqual([1, 2, 3, 4, 5]);
    expect(view.total).toBe(43);
    expect(view).toMatchObject({
      started: false,
      completed: 0,
      all_done: false,
      current_lesson: null,
      last_completion: null,
      learning_coins: 0,
      chapter_exams: { total: 5, passed: 0 },
    });
  });

  it('ignores completions outside the catalog and derives the current lesson', () => {
    const facts = {
      completions: [
        {
          lesson_key: item('ch01-l01').lesson_key,
          completed_at: '2026-10-01T00:00:00.000Z',
          reward: { status: 'credited', delta: 5 },
        },
        {
          lesson_key: 'concept:hop_luu', // retired key
          completed_at: '2026-10-05T00:00:00.000Z',
          reward: { status: 'credited', delta: 7 },
        },
        { lesson_key: 'guide:unknown', completed_at: '2026-10-02T00:00:00.000Z', reward: null },
      ],
      attempts: [
        { lesson_key: item('ch01-l02').lesson_key, attempts: 2, latest_score: 2, open_at: null },
      ],
    };
    const view = buildAcademyProgress(content, facts);
    expect(view.completed).toBe(1);
    expect(view.current_lesson).toMatchObject({
      lesson_id: 'ch01-l02',
      label: `Chương 1 · Bài 2: ${item('ch01-l02').name}`,
    });
    expect(view.last_completion).toMatchObject({ lesson_id: 'ch01-l01', reward_coins: 5 });
    expect(view.learning_coins).toBe(12);
    expect(view.chapters[0]?.lessons[1]).toMatchObject({
      status: 'failed',
      attempts: 2,
      latest_score: 2,
      max_score: 3,
      is_current: true,
    });
  });

  it('reports all done once every required lesson is complete', () => {
    const completions = [...content.items.values()]
      .filter((entry) => entry.kind === 'lesson')
      .map((entry) => ({
        lesson_key: entry.lesson_key,
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
