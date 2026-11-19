import { randomUUID } from 'node:crypto';

import type { HttpException } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IqxTemplatesService } from '../../src/modules/iqx-templates/iqx-templates.service.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

/**
 * Chạy SQL thật của Mẫu IQX (migration 0057 với dữ liệu khởi tạo) trên PostgreSQL dùng một lần.
 * Bỏ qua nếu không đặt IQX_TEMPLATES_PG_URL, ví dụ
 *   IQX_TEMPLATES_PG_URL=postgresql://postgres:pg@127.0.0.1:55457/iqx_v2_tmp npx vitest run \
 *     test/unit/iqx-templates.pg.test.ts
 * Các test chạy nối tiếp trên cùng trạng thái (spec Tab IQX §7.4).
 */
const URL = process.env.IQX_TEMPLATES_PG_URL;

class PgDatabase {
  constructor(readonly pool: pg.Pool) {}
  async query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await this.pool.query(text, [...values])).rows as T[];
  }
  async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work({
        query: async (text, values) =>
          (await client.query(text, [...(values ?? [])])).rows as never,
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const ADMIN = randomUUID();
const ADMIN_2 = randomUUID();
const USER = randomUUID();
const audit = (adminId = ADMIN): AuditContext => ({
  adminId,
  actorRole: 'admin',
  ip: null,
  userAgent: null,
  requestId: null,
});

async function rejection(
  promise: Promise<unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    const http = error as HttpException;
    return { status: http.getStatus(), body: http.getResponse() as Record<string, unknown> };
  }
  throw new Error('expected a rejection');
}

describe.skipIf(!URL)('IqxTemplatesService on PostgreSQL (§7.4)', () => {
  let pool: pg.Pool;
  let service: IqxTemplatesService;
  const auditCount = async (action: string, targetId?: string) =>
    Number(
      (
        await pool.query(
          `select count(*) from admin_audit_log where action = $1 and ($2::text is null or target_id = $2)`,
          [action, targetId ?? null],
        )
      ).rows[0].count,
    );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 4 });
    service = new IqxTemplatesService(new PgDatabase(pool) as unknown as DatabaseService);
    for (const [id, role, name] of [
      [ADMIN, 'admin', 'Quản trị A'],
      [ADMIN_2, 'admin', 'Quản trị B'],
      [USER, 'premium', 'Người dùng'],
    ] as const)
      await pool.query(
        `insert into users (id, email, username, hashed_password, full_name, role)
         values ($1, $2, left('u' || replace($1::uuid::text, '-', ''), 30), 'x', $3, $4)`,
        [id, `${id}@example.test`, name, role],
      );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('users see the 6 + 5 seeded items, version 1, in the spec order, paired when shown', async () => {
    const filters = await service.listPublished('filter');
    expect(filters.items.map((item) => [item.slug, item.version])).toEqual([
      ['giatri', 1],
      ['chatluong', 1],
      ['garp', 1],
      ['canslim', 1],
      ['phadinh', 1],
      ['hoiphuc', 1],
    ]);
    expect(filters.items[0]!.pair).toMatchObject({ slug: 'dongtien', name: 'Theo dòng tiền' });
    const strategies = await service.listPublished('strategy');
    expect(strategies.items.map((item) => item.content.name)).toEqual([
      'Theo xu hướng',
      'Phá đỉnh',
      'Động lượng MACD',
      'Hồi phục quá bán',
      'Theo dòng tiền',
    ]);
  });

  it('a draft of a shown item changes nothing for users and is flagged "Có bản nháp" (7.4.19)', async () => {
    const [giatri] = (await service.adminList('filter')).items;
    const detail = await service.adminDetail(giatri!.id);
    const draft = {
      ...(detail.current!.content as Record<string, unknown>),
      idea: 'Ý tưởng mới.',
    } as never;
    const saved = await service.saveDraft(giatri!.id, draft, null, audit());
    expect(saved.has_draft).toBe(true);
    expect((await service.listPublished('filter')).items[0]!.content.idea).toBe(
      'Doanh nghiệp có lãi đều, ít nợ, đang được định giá thấp.',
    );
    expect(await auditCount('iqx_template.draft_save', giatri!.id)).toBe(1);

    // A second admin that loaded the item before the draft cannot overwrite it (7.4.26).
    const stale = await rejection(service.saveDraft(giatri!.id, draft, null, audit(ADMIN_2)));
    expect(stale).toMatchObject({ status: 409, body: { code: 'IQX_TEMPLATE_CONFLICT' } });
    expect(await auditCount('iqx_template.draft_save', giatri!.id)).toBe(1);
  });

  it('publish validates on the server, then users see v2 at once; v1 stays as it was (7.4.20, 7.4.22)', async () => {
    const [giatri] = (await service.adminList('filter')).items;
    const detail = await service.adminDetail(giatri!.id);
    const content = detail.draft as Record<string, unknown>;

    const missing = await rejection(
      service.publish(
        giatri!.id,
        {
          content: { ...content, origin: '' },
          reason: 'Sửa',
          expected_version: 1,
          draft_updated_at: detail.draft_updated_at,
        },
        audit(),
      ),
    );
    expect(missing).toMatchObject({ status: 422, body: { code: 'IQX_TEMPLATE_INVALID' } });
    expect((missing.body.details as Array<{ field: string }>)[0]!.field).toBe('origin');

    const taken = await rejection(
      service.publish(
        giatri!.id,
        {
          content: { ...content, name: 'chất LƯỢNG' },
          reason: 'Sửa',
          expected_version: 1,
          draft_updated_at: detail.draft_updated_at,
        },
        audit(),
      ),
    );
    expect(taken).toMatchObject({ status: 409, body: { code: 'IQX_TEMPLATE_NAME_TAKEN' } });

    const wrongVersion = await rejection(
      service.publish(
        giatri!.id,
        {
          content,
          reason: 'Sửa',
          expected_version: null,
          draft_updated_at: detail.draft_updated_at,
        },
        audit(),
      ),
    );
    expect(wrongVersion).toMatchObject({ status: 409, body: { code: 'IQX_TEMPLATE_CONFLICT' } });

    const published = await service.publish(
      giatri!.id,
      {
        content,
        reason: 'Viết lại ý tưởng',
        expected_version: 1,
        draft_updated_at: detail.draft_updated_at,
      },
      audit(),
    );
    expect(published).toMatchObject({ current_version: 2, has_draft: false, status: 'shown' });
    const users = await service.listPublished('filter');
    expect(users.items[0]).toMatchObject({ version: 2, content: { idea: 'Ý tưởng mới.' } });
    expect(published.versions.map((item) => item.version)).toEqual([2, 1]);
    expect(published.versions[1]!.content.idea).toBe(
      'Doanh nghiệp có lãi đều, ít nợ, đang được định giá thấp.',
    );
    const row = (
      await pool.query(
        `select payload_before, payload_after, note from admin_audit_log
          where action = 'iqx_template.publish' and target_id = $1`,
        [giatri!.id],
      )
    ).rows;
    expect(row).toHaveLength(1);
    expect(row[0].payload_before.content.idea).toBe(
      'Doanh nghiệp có lãi đều, ít nợ, đang được định giá thấp.',
    );
    expect(row[0].payload_after).toMatchObject({ version: 2, content: { idea: 'Ý tưởng mới.' } });
    expect(row[0].note).toBe('Viết lại ý tưởng');
    await expect(
      pool.query(`update iqx_template_versions set reason = 'x' where template_id = $1`, [
        giatri!.id,
      ]),
    ).rejects.toThrow(/immutable/);
  });

  it('restore v1 makes a draft with v1 content; publishing it is v3 and v1 is untouched (7.4.25)', async () => {
    const [giatri] = (await service.adminList('filter')).items;
    const restored = await service.restore(giatri!.id, 1, audit());
    expect(restored.draft).toEqual(restored.versions.find((item) => item.version === 1)!.content);
    const published = await service.publish(
      giatri!.id,
      {
        content: restored.draft!,
        reason: 'Về v1',
        expected_version: 2,
        draft_updated_at: restored.draft_updated_at,
      },
      audit(),
    );
    expect(published.current_version).toBe(3);
    expect(published.current!.content).toEqual(
      published.versions.find((item) => item.version === 1)!.content,
    );
    expect(await auditCount('iqx_template.restore', giatri!.id)).toBe(1);
    expect(published.history.map((item) => item.action)).toEqual(
      expect.arrayContaining(['publish', 'restore', 'draft_save']),
    );
  });

  it('hide / show need a published item, are immediate for users and audited (7.4.23, 7.4.28)', async () => {
    const strategies = (await service.adminList('strategy')).items;
    const dongtien = strategies.find((item) => item.slug === 'dongtien')!;
    await service.setVisibility(dongtien.id, 'hidden', 'Tạm ẩn', audit());
    expect((await service.listPublished('strategy')).items.map((item) => item.slug)).not.toContain(
      'dongtien',
    );
    // The paired strategy is hidden: the Bộ lọc IQX no longer carries the pair.
    expect((await service.listPublished('filter')).items[0]!.pair).toBeNull();
    const again = await rejection(service.setVisibility(dongtien.id, 'hidden', 'x', audit()));
    expect(again.status).toBe(409);
    await service.setVisibility(dongtien.id, 'shown', 'Hiện lại', audit());
    expect((await service.listPublished('filter')).items[0]!.pair).toMatchObject({
      slug: 'dongtien',
    });
    expect(await auditCount('iqx_template.hide', dongtien.id)).toBe(1);
    expect(await auditCount('iqx_template.show', dongtien.id)).toBe(1);
  });

  it('reorder changes the user order at once (7.4.24)', async () => {
    const items = (await service.adminList('strategy')).items;
    const ids = items.map((item) => item.id);
    [ids[0], ids[1]] = [ids[1]!, ids[0]!];
    await service.reorder('strategy', ids, audit());
    expect(
      (await service.listPublished('strategy')).items.map((item) => item.slug).slice(0, 2),
    ).toEqual(['phadinh', 'xuhuong']);
    const partial = await rejection(service.reorder('strategy', ids.slice(1), audit()));
    expect(partial.status).toBe(409);
    expect(await auditCount('iqx_template.reorder')).toBe(1);
  });

  it('a new item: create (unpublished), delete only while never published (7.4.23)', async () => {
    const strategies = await service.listPublished('strategy');
    const base = strategies.items[0]!.content;
    const created = await service.create(
      'strategy',
      { ...base, name: 'Thử nghiệm' } as never,
      audit(),
    );
    expect(created).toMatchObject({
      status: 'unpublished',
      current_version: null,
      has_draft: true,
    });
    expect((await service.listPublished('strategy')).items).toHaveLength(5);
    const deleted = await service.deleteDraft(created.id, audit());
    expect(deleted).toEqual({ id: created.id, deleted: true });

    const second = await service.create('strategy', { ...base, name: 'Mục mới' } as never, audit());
    const published = await service.publish(
      second.id,
      {
        content: { ...base, name: 'Mục mới' } as never,
        reason: 'Thêm',
        expected_version: null,
        draft_updated_at: second.draft_updated_at,
      },
      audit(),
    );
    expect(published).toMatchObject({ current_version: 1, status: 'shown' });
    const users = (await service.listPublished('strategy')).items;
    expect(users[users.length - 1]!.content.name).toBe('Mục mới');
    const refused = await rejection(service.deleteDraft(second.id, audit()));
    expect(refused).toMatchObject({ status: 409, body: { code: 'IQX_TEMPLATE_PUBLISHED' } });
    expect(await auditCount('iqx_template.create')).toBe(2);
    expect(await auditCount('iqx_template.delete_draft')).toBe(1);
  });

  it('counts "Dùng" events over 30 days and refuses a hidden item', async () => {
    const [first] = (await service.listPublished('filter')).items;
    await service.recordUsed(USER, first!.id, first!.version);
    await service.recordUsed(USER, first!.id, first!.version);
    await pool.query(
      `insert into iqx_template_used (template_id, version, user_id, created_at)
       values ($1, $2, $3, now() - interval '31 days')`,
      [first!.id, first!.version, USER],
    );
    const listed = (await service.adminList('filter')).items.find((item) => item.id === first!.id)!;
    expect(listed.used_30d).toBe(2);
    const missing = await rejection(service.recordUsed(USER, first!.id, 99));
    expect(missing.status).toBe(404);
  });

  it('skips (and logs) an item that no longer passes the validators', async () => {
    const [first] = (await service.adminList('filter')).items;
    await pool.query(
      `alter table iqx_template_versions disable trigger tr_iqx_template_versions_immutable`,
    );
    await pool.query(
      `update iqx_template_versions set content = jsonb_set(content, '{definition,rules,0,metric_id}', '"gone"')
        where template_id = $1 and version = (select current_version from iqx_templates where id = $1)`,
      [first!.id],
    );
    await pool.query(
      `alter table iqx_template_versions enable trigger tr_iqx_template_versions_immutable`,
    );
    const items = (await service.listPublished('filter')).items;
    expect(items.map((item) => item.id)).not.toContain(first!.id);
    expect(items).toHaveLength(5);
  });
});
