import { randomUUID } from 'node:crypto';

import type { HttpException } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iqxReasonBodySchema } from '../../src/modules/iqx-templates/iqx-templates.schemas.js';
import { IqxTemplatesService } from '../../src/modules/iqx-templates/iqx-templates.service.js';
import { filterDefinitionSchema } from '../../src/modules/saved-filters/saved-filters.definition.js';
import { SavedFiltersService } from '../../src/modules/saved-filters/saved-filters.service.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

/**
 * Update 19-11 QA, spec Tab IQX §7.4 items 20 and 22–23: cases not covered by
 * iqx-templates.pg.test.ts. Needs a FRESH throwaway database migrated through 0057, e.g.
 *   IQX_TEMPLATES_EXTRA_PG_URL=postgresql://postgres:qa@127.0.0.1:55xxx/iqx_v2_qa2 \
 *     npx vitest run test/unit/u1911-iqx-templates-extra.pg.test.ts
 */
const URL = process.env.IQX_TEMPLATES_EXTRA_PG_URL;

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
const USER = randomUUID();
const audit: AuditContext = {
  adminId: ADMIN,
  actorRole: 'admin',
  ip: null,
  userAgent: null,
  requestId: null,
};

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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe.skipIf(!URL)('IQX templates extra acceptance on PostgreSQL (update 19-11 QA)', () => {
  let pool: pg.Pool;
  let service: IqxTemplatesService;
  const count = async (sql: string, values: unknown[]) =>
    Number((await pool.query(sql, values)).rows[0].count);
  const publishAudits = (id: string) =>
    count(
      `select count(*) from admin_audit_log where action = 'iqx_template.publish' and target_id = $1`,
      [id],
    );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 4 });
    const db = new PgDatabase(pool) as unknown as DatabaseService;
    service = new IqxTemplatesService(db);
    for (const [id, role] of [
      [ADMIN, 'admin'],
      [USER, 'premium'],
    ] as const)
      await pool.query(
        `insert into users (id, email, username, hashed_password, full_name, role)
         values ($1, $2, left('q' || replace($1::uuid::text, '-', ''), 30), 'x', 'QA', $3)`,
        [id, `${id}@example.test`, role],
      );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('7.4.22 publish via the service (direct API) refuses a filter without any condition', async () => {
    const [item] = (await service.listPublished('filter')).items;
    const content = clone(item!.content) as Record<string, unknown> & {
      definition: Record<string, unknown>;
    };
    content.definition.rules = [];
    content.definition.technical = [];
    const refused = await rejection(
      service.publish(item!.id, { content, reason: 'QA', expected_version: 1 }, audit),
    );
    expect(refused).toMatchObject({ status: 422, body: { code: 'IQX_TEMPLATE_INVALID' } });
    expect(refused.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'definition' })]),
    );
    expect((await service.adminDetail(item!.id)).current_version).toBe(1);
    expect(await publishAudits(item!.id)).toBe(0);
  });

  it('7.4.22 publish refuses a Chiến lược with no switched-on Bán row', async () => {
    const [item] = (await service.listPublished('strategy')).items;
    const content = clone(item!.content) as Record<string, unknown> & {
      definition: { indicators: Record<string, { sell: { enabled: boolean } }> };
    };
    for (const indicator of Object.values(content.definition.indicators))
      indicator.sell.enabled = false;
    const refused = await rejection(
      service.publish(item!.id, { content, reason: 'QA', expected_version: item!.version }, audit),
    );
    expect(refused).toMatchObject({ status: 422, body: { code: 'IQX_TEMPLATE_INVALID' } });
    expect(refused.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'definition.sell' })]),
    );
    expect((await service.adminDetail(item!.id)).current_version).toBe(item!.version);
    expect(await publishAudits(item!.id)).toBe(0);
  });

  it('7.4.22 publish refuses an empty info field and a duplicate strategy name', async () => {
    const [first, second] = (await service.listPublished('strategy')).items;
    const content = clone(second!.content) as Record<string, unknown>;
    const missing = await rejection(
      service.publish(
        second!.id,
        { content: { ...content, when_wrong: '  ' }, reason: 'QA', expected_version: second!.version },
        audit,
      ),
    );
    expect(missing).toMatchObject({ status: 422, body: { code: 'IQX_TEMPLATE_INVALID' } });
    const dup = await rejection(
      service.publish(
        second!.id,
        {
          content: { ...content, name: String(first!.content.name).toUpperCase() },
          reason: 'QA',
          expected_version: second!.version,
        },
        audit,
      ),
    );
    expect(dup).toMatchObject({ status: 409, body: { code: 'IQX_TEMPLATE_NAME_TAKEN' } });
    expect(await publishAudits(second!.id)).toBe(0);
  });

  it('7.4.23 hide / show body requires a non-blank reason (server schema)', () => {
    expect(iqxReasonBodySchema.safeParse({}).success).toBe(false);
    expect(iqxReasonBodySchema.safeParse({ reason: '' }).success).toBe(false);
    expect(iqxReasonBodySchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(iqxReasonBodySchema.safeParse({ reason: 'Tạm ẩn' }).success).toBe(true);
  });

  it('7.4.20 a filter saved from v1 keeps its values and origin.version 1 after v2 is published', async () => {
    const saved = new SavedFiltersService(new PgDatabase(pool) as unknown as DatabaseService);
    const [item] = (await service.listPublished('filter')).items;
    expect(item!.version).toBe(1);
    const definition = filterDefinitionSchema.parse({
      ...clone(item!.content.definition as Record<string, unknown>),
      origin: { type: 'iqx_filter', id: item!.id, version: 1 },
    });
    const created = await saved.createFilter(USER, { name: 'Lọc của tôi', definition });

    const next = clone(item!.content) as Record<string, unknown> & {
      definition: Record<string, unknown>;
    };
    next.idea = 'Ý tưởng phiên bản hai.';
    next.definition.name = 'Tên định nghĩa v2';
    const published = await service.publish(
      item!.id,
      { content: next, reason: 'v2', expected_version: 1 },
      audit,
    );
    expect(published.current_version).toBe(2);
    expect((await service.listPublished('filter')).items[0]).toMatchObject({ version: 2 });

    const reopened = await saved.getFilter(USER, created.id);
    expect(reopened.definition).toEqual(created.definition);
    expect((reopened.definition as { origin?: { version: number } }).origin).toEqual({
      type: 'iqx_filter',
      id: item!.id,
      version: 1,
    });
    expect(await publishAudits(item!.id)).toBe(1);
  });
});
