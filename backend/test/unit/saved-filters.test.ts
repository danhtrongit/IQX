import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import { SavedFiltersController } from '../../src/modules/saved-filters/saved-filters.controller.js';
import {
  filterDefinitionSchema,
  loadFilterJsonSchema,
  type FilterDefinition,
} from '../../src/modules/saved-filters/saved-filters.definition.js';
import { SavedFiltersFeatureGuard } from '../../src/modules/saved-filters/saved-filters.feature.guard.js';
import {
  canonicalHash,
  canonicalJson,
} from '../../src/modules/saved-filters/saved-filters.hash.js';
import {
  filterCreateSchema,
  filterUpdateSchema,
  listCreateSchema,
  type FilterCreateInput,
  type ListCreateInput,
} from '../../src/modules/saved-filters/saved-filters.schemas.js';
import { SavedFiltersService } from '../../src/modules/saved-filters/saved-filters.service.js';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

function definition(overrides: Partial<FilterDefinition> = {}): FilterDefinition {
  return {
    schema_version: '3.0',
    name: 'ROE cao',
    logic: 'AND',
    data_mode: 'latest_disclosed',
    rules: [
      { id: 'r1', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.15, api_unit: 'ratio' },
    ],
    scope: { market: 'HOSE', sector: '' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory fake of the SQL statements issued by SavedFiltersService.
// ---------------------------------------------------------------------------
type FilterRecord = {
  id: string;
  user_id: string;
  name: string;
  current_version: number;
  idempotency_key: string | null;
  request_hash: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type VersionRecord = {
  filter_id: string;
  version: number;
  definition: unknown;
  definition_hash: string;
  created_at: Date;
};
type ListRecord = {
  id: string;
  user_id: string;
  name: string;
  filter_id: string | null;
  filter_version: number | null;
  tickers: string[];
  as_of: string;
  data_source: string;
  scope: Record<string, unknown>;
  visibility?: 'saved' | 'internal';
  result_snapshot_id?: string | null;
  run_id?: string | null;
  provenance?: Record<string, unknown> | null;
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: Date;
  deleted_at: Date | null;
};
/** What the Bot-usage query would return (the SQL itself is exercised against Postgres). */
type BotUsageRecord = {
  user_id: string;
  saved_list_id: string;
  revision: number;
  role: 'effective' | 'pending';
  status: string;
  effective_session: string | null;
  source_name: string;
};
type BotUsageRow = BotUsageRecord;
type State = {
  filters: FilterRecord[];
  versions: VersionRecord[];
  lists: ListRecord[];
  botUsage: BotUsageRecord[];
  usageQueries: unknown[][];
  advisoryLocks: unknown[];
};

class FakeSavedFiltersDatabase {
  state: State = {
    filters: [],
    versions: [],
    lists: [],
    botUsage: [],
    usageQueries: [],
    advisoryLocks: [],
  };
  private tick = Date.parse('2026-01-02T03:04:05.000Z');

  private now(): Date {
    this.tick += 1000;
    return new Date(this.tick);
  }

  async query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return Promise.resolve(this.execute(text.replace(/\s+/g, ' ').trim(), values) as T[]);
  }

  async transaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.state);
    try {
      return await operation({ query: (text, values) => this.query(text, values) });
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  private filterJoin(filter: FilterRecord, version: number) {
    const row = this.state.versions.find(
      (item) => item.filter_id === filter.id && item.version === version,
    );
    return {
      id: filter.id,
      name: filter.name,
      current_version: filter.current_version,
      created_at: filter.created_at,
      updated_at: filter.updated_at,
      version: row?.version ?? null,
      definition: row ? structuredClone(row.definition) : null,
      definition_hash: row?.definition_hash ?? null,
    };
  }

  private listRow(list: ListRecord) {
    const {
      user_id: _user,
      idempotency_key: _key,
      request_hash: _hash,
      deleted_at: _deleted,
      ...row
    } = list;
    return structuredClone(row);
  }

  private execute(sql: string, v: readonly unknown[]): unknown[] {
    const { filters, versions, lists } = this.state;
    if (sql.startsWith('SELECT id, request_hash FROM strategy_filters')) {
      return filters
        .filter((item) => item.user_id === v[0] && item.idempotency_key === v[1])
        .map(({ id, request_hash }) => ({ id, request_hash }));
    }
    if (sql.startsWith('SELECT id, request_hash FROM list_snapshots')) {
      return lists
        .filter((item) => item.user_id === v[0] && item.idempotency_key === v[1])
        .map(({ id, request_hash }) => ({ id, request_hash }));
    }
    if (sql.startsWith('INSERT INTO strategy_filters')) {
      const [id, userId, name, key, hash] = v as [string, string, string, string | null, string];
      if (
        key !== null &&
        filters.some((item) => item.user_id === userId && item.idempotency_key === key)
      )
        return [];
      const now = this.now();
      filters.push({
        id,
        user_id: userId,
        name,
        current_version: 1,
        idempotency_key: key,
        request_hash: hash,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });
      return [{ id }];
    }
    if (sql.startsWith('INSERT INTO filter_versions')) {
      const hasVersionParam = sql.includes('VALUES ($1, $2,');
      const filterId = v[0] as string;
      const version = hasVersionParam ? (v[1] as number) : 1;
      const [definitionJson, hash] = (hasVersionParam ? v.slice(2) : v.slice(1)) as [
        string,
        string,
      ];
      if (versions.some((item) => item.filter_id === filterId && item.version === version))
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      versions.push({
        filter_id: filterId,
        version,
        definition: JSON.parse(definitionJson) as unknown,
        definition_hash: hash,
        created_at: this.now(),
      });
      return [];
    }
    if (sql.includes('FOR UPDATE OF f')) {
      const filter = filters.find(
        (item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null,
      );
      if (!filter) return [];
      const joined = this.filterJoin(filter, filter.current_version);
      return [
        {
          name: filter.name,
          current_version: filter.current_version,
          definition_hash: joined.definition_hash,
          definition: joined.definition,
        },
      ];
    }
    if (sql.startsWith('UPDATE strategy_filters SET current_version')) {
      const filter = filters.find((item) => item.id === v[0] && item.user_id === v[1])!;
      filter.current_version = v[2] as number;
      filter.name = v[3] as string;
      filter.updated_at = this.now();
      return [];
    }
    if (sql.startsWith('UPDATE strategy_filters SET name')) {
      const filter = filters.find((item) => item.id === v[0] && item.user_id === v[1])!;
      filter.name = v[2] as string;
      filter.updated_at = this.now();
      return [];
    }
    if (sql.startsWith('UPDATE strategy_filters SET deleted_at')) {
      const filter = filters.find(
        (item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null,
      );
      if (!filter) return [];
      filter.deleted_at = this.now();
      return [{ id: filter.id }];
    }
    if (sql.includes('LEFT JOIN filter_versions v')) {
      const filter = filters.find(
        (item) =>
          item.id === v[0] && item.user_id === v[1] && (v[3] === true || item.deleted_at === null),
      );
      if (!filter) return [];
      return [this.filterJoin(filter, (v[2] as number | null) ?? filter.current_version)];
    }
    if (sql.includes('FROM strategy_filters f JOIN filter_versions v')) {
      return filters
        .filter((item) => item.user_id === v[0] && item.deleted_at === null)
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .map((item) => this.filterJoin(item, item.current_version));
    }
    if (sql.startsWith('SELECT version, definition_hash, created_at FROM filter_versions')) {
      return versions
        .filter((item) => item.filter_id === v[0])
        .sort((a, b) => a.version - b.version)
        .map(({ version, definition_hash, created_at }) => ({
          version,
          definition_hash,
          created_at,
        }));
    }
    if (sql.startsWith('SELECT current_version FROM strategy_filters')) {
      return filters
        .filter((item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null)
        .map(({ current_version }) => ({ current_version }));
    }
    if (sql.startsWith('SELECT version FROM filter_versions')) {
      return versions
        .filter((item) => item.filter_id === v[0] && item.version === v[1])
        .map(({ version }) => ({ version }));
    }
    if (sql.startsWith('INSERT INTO list_snapshots')) {
      const [id, userId, name, filterId, filterVersion, tickers, asOf, source, scope, key, hash] =
        v as [
          string,
          string,
          string,
          string | null,
          number | null,
          string[],
          string,
          string,
          string,
          string | null,
          string,
        ];
      if (
        key !== null &&
        lists.some((item) => item.user_id === userId && item.idempotency_key === key)
      )
        return [];
      const record: ListRecord = {
        id,
        user_id: userId,
        name,
        filter_id: filterId,
        filter_version: filterVersion,
        tickers: [...tickers],
        as_of: asOf,
        data_source: source,
        scope: JSON.parse(scope) as Record<string, unknown>,
        idempotency_key: key,
        request_hash: hash,
        created_at: this.now(),
        deleted_at: null,
      };
      lists.push(record);
      return [this.listRow(record)];
    }
    if (sql.startsWith('UPDATE list_snapshots SET deleted_at')) {
      const list = lists.find(
        (item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null,
      );
      if (!list) return [];
      list.deleted_at = this.now();
      return [{ id: list.id }];
    }
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) {
      this.state.advisoryLocks.push(v[0]);
      return [];
    }
    if (sql.includes('FROM bot_universe_revisions r')) {
      this.state.usageQueries.push([...v]);
      const wanted = new Set(v[1] as string[]);
      return this.state.botUsage
        .filter((item) => item.user_id === v[0] && wanted.has(item.saved_list_id))
        .map(({ user_id: _user, ...row }) => row);
    }
    if (sql.includes('FROM list_snapshots WHERE user_id = $1 AND deleted_at IS NULL')) {
      return lists
        .filter(
          (item) =>
            item.user_id === v[0] &&
            item.deleted_at === null &&
            (v[1] === true || (item.visibility ?? 'saved') === 'saved'),
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((item) => this.listRow(item));
    }
    if (sql.includes('FROM list_snapshots WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL')) {
      return lists
        .filter((item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null)
        .map((item) => this.listRow(item));
    }
    if (sql.includes('FROM list_snapshots WHERE id = $1 AND user_id = $2')) {
      return lists
        .filter((item) => item.id === v[0] && item.user_id === v[1])
        .map((item) => this.listRow(item));
    }
    throw new Error(`Unexpected SQL in fake: ${sql}`);
  }
}

function setup() {
  const database = new FakeSavedFiltersDatabase();
  const service = new SavedFiltersService(database as unknown as DatabaseService);
  return { database, service };
}

function createInput(overrides: Partial<FilterCreateInput> = {}): FilterCreateInput {
  return filterCreateSchema.parse({ name: 'Bộ lọc ROE', definition: definition(), ...overrides });
}

function listInput(overrides: Record<string, unknown> = {}): ListCreateInput {
  return listCreateSchema.parse({
    name: 'Danh sách ROE',
    tickers: ['fpt', 'VNM'],
    as_of: '2026-01-02',
    data_source: 'iqx-screener',
    scope: { market: 'HOSE', sector: '', period: 'TTM' },
    ...overrides,
  });
}

async function expectHttpError(
  promise: Promise<unknown>,
  type: typeof NotFoundException | typeof ConflictException,
  code: string,
) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(type);
  expect((error as NotFoundException).getResponse()).toMatchObject({ code });
}

describe('saved filter definition schema mirrors filter.schema.json', () => {
  const json = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../../src/modules/screener/registry/filter.schema.json'),
      'utf8',
    ),
  ) as { properties: { rules: { items: { properties: { metric_id: { enum: string[] } } } } } };

  it('reads all metric ids, operators and periods from the screener JSON', () => {
    const loaded = loadFilterJsonSchema();
    expect(loaded.properties.rules.items.properties.metric_id.enum).toEqual(
      json.properties.rules.items.properties.metric_id.enum,
    );
    expect(loaded.properties.rules.items.properties.metric_id.enum).toHaveLength(42);
    expect(loaded.properties.rules.items.properties.operator.enum).toEqual(['>', '<']);
    expect(filterDefinitionSchema.parse(definition())).toEqual(definition());
    expect(filterDefinitionSchema.parse(definition({ rules: [] })).rules).toEqual([]);
  });

  const rule = (patch: Record<string, unknown>) => ({
    id: 'r',
    metric_id: 'roe',
    period: 'ttm',
    operator: '>',
    value: 1,
    api_unit: 'ratio',
    ...patch,
  });

  it.each([
    ['unknown metric', { rules: [rule({ metric_id: 'magic' })] }],
    ['non-strict operator', { rules: [rule({ operator: '>=' })] }],
    ['unknown unit', { rules: [rule({ api_unit: '%' })] }],
    ['non-finite value', { rules: [rule({ value: Number.NaN })] }],
    ['extra rule key', { rules: [rule({ x: 1 })] }],
    ['missing rule period', { rules: [rule({ period: undefined })] }],
    ['unknown rule period', { rules: [rule({ period: 'weekly' })] }],
    ['ROE quarter (not an allowed period of ROE)', { rules: [rule({ period: 'quarter' })] }],
    ['a repeated metric', { rules: [rule({}), rule({ id: 'r2', period: 'year' })] }],
    ['wrong schema version', { schema_version: '1.0' }],
    ['the retired schema version 2.0', { schema_version: '2.0' }],
    ['OR logic', { logic: 'OR' }],
    ['empty name', { name: '' }],
    ['long name', { name: 'x'.repeat(121) }],
    ['a filter-wide period in scope', { scope: { market: 'HOSE', sector: '', period: 'TTM' } }],
    ['missing sector', { scope: { market: 'HOSE' } }],
    ['a client date', { as_of: '2026-01-02' }],
  ])('rejects %s', (_label, overrides) => {
    expect(filterDefinitionSchema.safeParse({ ...definition(), ...overrides }).success).toBe(false);
  });

  it('accepts per-rule periods and display-only columns from the registry policy', () => {
    const parsed = filterDefinitionSchema.safeParse({
      ...definition(),
      rules: [
        rule({ metric_id: 'profit_yoy', period: 'quarter' }),
        rule({ id: 'r2', period: 'year' }),
      ],
      columns: [{ metric_id: 'gross_margin', period: 'ttm' }],
    });
    expect(parsed.success).toBe(true);
    // `data_mode` is optional on input and always present in the parsed definition.
    const { data_mode: _mode, ...withoutMode } = definition();
    expect(filterDefinitionSchema.parse(withoutMode).data_mode).toBe('latest_disclosed');
  });

  it('rejects unknown top-level keys in definitions and request bodies', () => {
    expect(filterDefinitionSchema.safeParse({ ...definition(), extra: true }).success).toBe(false);
    expect(
      filterCreateSchema.safeParse({ name: 'x', definition: definition(), user_id: USER_B })
        .success,
    ).toBe(false);
    expect(filterUpdateSchema.safeParse({ definition: definition(), owner: USER_B }).success).toBe(
      false,
    );
    expect(
      filterCreateSchema.safeParse({
        name: 'x',
        definition: definition(),
        idempotency_key: 'short',
      }).success,
    ).toBe(false);
  });
});

describe('saved list request schema', () => {
  it('uppercases and de-duplicates tickers in first-seen order', () => {
    expect(listInput({ tickers: [' fpt ', 'VNM', 'FPT', 'hpg'] }).tickers).toEqual([
      'FPT',
      'VNM',
      'HPG',
    ]);
  });

  it('caps tickers at 500 and validates as_of, data_source, scope and filter pairing', () => {
    const base = {
      name: 'L',
      tickers: ['FPT'],
      as_of: '2026-01-02',
      data_source: 'src',
      scope: {},
    };
    expect(listCreateSchema.safeParse(base).success).toBe(true);
    expect(
      listCreateSchema.safeParse({
        ...base,
        tickers: Array.from({ length: 501 }, (_, index) => `T${index}`),
      }).success,
    ).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, tickers: ['BAD TICKER'] }).success).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, as_of: '02/01/2026' }).success).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, data_source: ' ' }).success).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, scope: [] }).success).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, filter_version: 1 }).success).toBe(false);
    expect(listCreateSchema.safeParse({ ...base, filter_id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('canonical definition hash', () => {
  it('is independent of key order and stable across runs', () => {
    const reordered = {
      scope: { sector: '', market: 'HOSE' },
      rules: [
        {
          api_unit: 'ratio',
          value: 0.15,
          operator: '>',
          metric_id: 'roe',
          period: 'ttm',
          id: 'r1',
        },
      ],
      logic: 'AND',
      data_mode: 'latest_disclosed',
      name: 'ROE cao',
      schema_version: '3.0',
    };
    expect(canonicalJson(reordered)).toBe(canonicalJson(definition()));
    expect(canonicalHash(reordered)).toBe(canonicalHash(definition()));
    expect(canonicalHash(definition())).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalJson({ b: [2, { d: 1, c: 0 }], a: 1 })).toBe('{"a":1,"b":[2,{"c":0,"d":1}]}');
    expect(canonicalHash({ a: 1 })).toBe(
      '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    );
  });

  it('changes when rule order or values change', () => {
    const base = definition({
      rules: [
        { id: 'a', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.15, api_unit: 'ratio' },
        { id: 'b', metric_id: 'pe', period: 'ttm', operator: '<', value: 12, api_unit: 'lần' },
      ],
    });
    expect(canonicalHash({ ...base, rules: [...base.rules].reverse() })).not.toBe(
      canonicalHash(base),
    );
    expect(
      canonicalHash(definition({ rules: [{ ...definition().rules[0]!, value: 0.16 }] })),
    ).not.toBe(canonicalHash(definition()));
  });
});

describe('SavedFiltersService filters', () => {
  it('creates version 1 with the canonical definition hash and lists it', async () => {
    const { service } = setup();
    const created = await service.createFilter(USER_A, createInput());
    expect(created).toMatchObject({
      name: 'Bộ lọc ROE',
      current_version: 1,
      version: 1,
      definition: definition(),
      definition_hash: canonicalHash(definition()),
    });
    expect(created.versions).toEqual([
      { version: 1, definition_hash: canonicalHash(definition()), created_at: expect.any(String) },
    ]);
    expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const listed = await service.listFilters(USER_A);
    expect(listed.items.map((item) => item.id)).toEqual([created.id]);
    expect(await service.listFilters(USER_B)).toEqual({ items: [] });
  });

  it('PUT creates version n+1 only when the definition hash changes', async () => {
    const { service } = setup();
    const created = await service.createFilter(USER_A, createInput());
    const changedDefinition = definition({
      rules: [
        { id: 'r1', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.2, api_unit: 'ratio' },
      ],
    });
    const v2 = await service.updateFilter(USER_A, created.id, { definition: changedDefinition });
    expect(v2.current_version).toBe(2);
    expect(v2.definition).toEqual(changedDefinition);
    expect(v2.versions.map((item) => item.version)).toEqual([1, 2]);

    // Same definition with different key order: no new version, rename only.
    const { scope, ...rest } = changedDefinition;
    const reordered: FilterDefinition = { scope, ...rest };
    const same = await service.updateFilter(USER_A, created.id, {
      name: 'Đổi tên',
      definition: reordered,
    });
    expect(same.current_version).toBe(2);
    expect(same.name).toBe('Đổi tên');
    expect(same.versions).toHaveLength(2);

    // Returning to an older definition is still a new version (n+1).
    const v3 = await service.updateFilter(USER_A, created.id, { definition: definition() });
    expect(v3.current_version).toBe(3);
    expect(v3.definition_hash).toBe(created.definition_hash);

    const first = await service.getFilter(USER_A, created.id, 1);
    expect(first).toMatchObject({ version: 1, current_version: 3, definition: definition() });
    await expectHttpError(
      service.getFilter(USER_A, created.id, 9),
      NotFoundException,
      'FILTER_VERSION_NOT_FOUND',
    );
  });

  it('scopes get/update/delete to the owner and returns 404 for other users', async () => {
    const { service } = setup();
    const created = await service.createFilter(USER_A, createInput());
    await expectHttpError(
      service.getFilter(USER_B, created.id),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.updateFilter(USER_B, created.id, { definition: definition({ name: 'hack' }) }),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.deleteFilter(USER_B, created.id),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.getFilter(USER_A, MISSING_ID),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    expect((await service.getFilter(USER_A, created.id)).current_version).toBe(1);
  });

  it('soft-deletes: hidden from get/list/update and a second delete is 404', async () => {
    const { database, service } = setup();
    const created = await service.createFilter(USER_A, createInput());
    await service.deleteFilter(USER_A, created.id);
    expect(database.state.filters[0]?.deleted_at).toBeInstanceOf(Date);
    expect(database.state.versions).toHaveLength(1);
    expect(await service.listFilters(USER_A)).toEqual({ items: [] });
    await expectHttpError(
      service.getFilter(USER_A, created.id),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.updateFilter(USER_A, created.id, { definition: definition() }),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.deleteFilter(USER_A, created.id),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
  });

  it('replays an idempotency key and rejects reuse with another payload', async () => {
    const { database, service } = setup();
    const input = createInput({ idempotency_key: 'filter-key-0001' });
    const first = await service.createFilter(USER_A, input);
    const replay = await service.createFilter(USER_A, input);
    expect(replay).toEqual(first);
    expect(database.state.filters).toHaveLength(1);
    await expectHttpError(
      service.createFilter(USER_A, { ...input, name: 'Khác' }),
      ConflictException,
      'IDEMPOTENCY_KEY_CONFLICT',
    );
    // Keys are scoped per user.
    const other = await service.createFilter(USER_B, input);
    expect(other.id).not.toBe(first.id);
    expect(database.state.filters).toHaveLength(2);
  });
});

describe('SavedFiltersService lists', () => {
  it('creates static snapshots, defaults filter_version to the current version and lists them', async () => {
    const { service } = setup();
    const filter = await service.createFilter(USER_A, createInput());
    await service.updateFilter(USER_A, filter.id, { definition: definition({ name: 'v2' }) });
    const manual = await service.createList(USER_A, listInput());
    expect(manual).toMatchObject({
      name: 'Danh sách ROE',
      kind: 'static_retrospective',
      filter_id: null,
      filter_version: null,
      tickers: ['FPT', 'VNM'],
      as_of: '2026-01-02',
      data_source: 'iqx-screener',
      scope: { market: 'HOSE', sector: '', period: 'TTM' },
    });
    const linked = await service.createList(USER_A, listInput({ filter_id: filter.id }));
    expect(linked.filter_version).toBe(2);
    const pinned = await service.createList(
      USER_A,
      listInput({ filter_id: filter.id, filter_version: 1 }),
    );
    expect(pinned.filter_version).toBe(1);
    expect((await service.listLists(USER_A)).items.map((item) => item.id)).toEqual([
      pinned.id,
      linked.id,
      manual.id,
    ]);
    expect(await service.getList(USER_A, manual.id)).toEqual(manual);
  });

  it('rejects filter references the user does not own or versions that do not exist', async () => {
    const { database, service } = setup();
    const filter = await service.createFilter(USER_A, createInput());
    await expectHttpError(
      service.createList(USER_B, listInput({ filter_id: filter.id })),
      NotFoundException,
      'FILTER_NOT_FOUND',
    );
    await expectHttpError(
      service.createList(USER_A, listInput({ filter_id: filter.id, filter_version: 5 })),
      NotFoundException,
      'FILTER_VERSION_NOT_FOUND',
    );
    expect(database.state.lists).toHaveLength(0);
  });

  it('scopes lists to the owner and soft-deletes them', async () => {
    const { database, service } = setup();
    const list = await service.createList(USER_A, listInput());
    await expectHttpError(service.getList(USER_B, list.id), NotFoundException, 'LIST_NOT_FOUND');
    await expectHttpError(service.deleteList(USER_B, list.id), NotFoundException, 'LIST_NOT_FOUND');
    expect(await service.listLists(USER_B)).toEqual({ items: [] });
    await service.deleteList(USER_A, list.id);
    expect(database.state.lists[0]?.deleted_at).toBeInstanceOf(Date);
    await expectHttpError(service.getList(USER_A, list.id), NotFoundException, 'LIST_NOT_FOUND');
    await expectHttpError(service.deleteList(USER_A, list.id), NotFoundException, 'LIST_NOT_FOUND');
    expect(await service.listLists(USER_A)).toEqual({ items: [] });
  });

  it('replays list idempotency keys and rejects conflicting payloads', async () => {
    const { database, service } = setup();
    const input = listInput({ idempotency_key: 'list-key-00001' });
    const first = await service.createList(USER_A, input);
    expect(await service.createList(USER_A, input)).toEqual(first);
    expect(database.state.lists).toHaveLength(1);
    await expectHttpError(
      service.createList(USER_A, { ...input, tickers: ['HPG'] }),
      ConflictException,
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  });
});

describe('SavedFiltersService reads stored 2.0 definitions without rewriting them (I05 / I06)', () => {
  const legacy = (period: 'TTM' | 'annual' | 'quarter', metric = 'roe') => ({
    schema_version: '2.0',
    name: 'Bộ lọc cũ',
    logic: 'AND',
    rules: [{ id: 'r1', metric_id: metric, operator: '>', value: 0.15, api_unit: 'ratio' }],
    scope: { market: 'HOSE', sector: '', period },
  });

  function seedLegacy(
    database: FakeSavedFiltersDatabase,
    stored: unknown,
    userId = USER_A,
  ): string {
    const id = '00000000-0000-4000-8000-0000000000f1';
    const when = new Date('2026-01-01T00:00:00Z');
    database.state.filters.push({
      id,
      user_id: userId,
      name: 'Cũ',
      current_version: 1,
      idempotency_key: null,
      request_hash: null,
      deleted_at: null,
      created_at: when,
      updated_at: when,
    });
    database.state.versions.push({
      filter_id: id,
      version: 1,
      definition: stored,
      definition_hash: canonicalHash(stored),
      created_at: when,
    });
    return id;
  }

  it('maps the filter-wide period onto each rule on read and leaves the stored row alone', async () => {
    const { database, service } = setup();
    const stored = legacy('annual', 'revenue_yoy');
    const id = seedLegacy(database, stored);
    const filter = await service.getFilter(USER_A, id);
    expect(filter.stored_schema_version).toBe('2.0');
    expect(filter.definition).toMatchObject({
      schema_version: '3.0',
      data_mode: 'latest_disclosed',
      rules: [{ metric_id: 'revenue_yoy', period: 'year' }],
      scope: { market: 'HOSE', sector: '' },
    });
    expect(filter.definition.scope).not.toHaveProperty('period');
    expect(filter.legacy_review).toMatchObject({ needs_review: false, legacy_period: 'annual' });
    // The stored version is byte-for-byte what was saved, and so is its hash.
    expect(database.state.versions[0]?.definition).toEqual(stored);
    expect(filter.definition_hash).toBe(canonicalHash(stored));
    const listed = await service.listFilters(USER_A);
    expect(listed.items[0]?.definition.rules[0]?.period).toBe('year');
  });

  it('I06 flags a period that is no longer supported instead of turning ROE quarter into TTM', async () => {
    const { database, service } = setup();
    const id = seedLegacy(database, legacy('quarter', 'roe'));
    const filter = await service.getFilter(USER_A, id);
    expect(filter.definition.rules[0]).toMatchObject({ metric_id: 'roe', period: 'quarter' });
    expect(filter.legacy_review).toMatchObject({
      needs_review: true,
      rules: [{ rule_id: 'r1', status: 'needs_review', legacy_period: 'quarter' }],
    });
  });

  it('re-saving the mapped definition unchanged does not create a version; editing does (n+1, 3.0)', async () => {
    const { database, service } = setup();
    const id = seedLegacy(database, legacy('TTM', 'roe'));
    const mapped = (await service.getFilter(USER_A, id)).definition;
    const same = await service.updateFilter(USER_A, id, { name: 'Đổi tên', definition: mapped });
    expect(same.current_version).toBe(1);
    expect(database.state.versions).toHaveLength(1);
    const edited = await service.updateFilter(USER_A, id, {
      definition: { ...mapped, rules: [{ ...mapped.rules[0]!, period: 'year' }] },
    });
    expect(edited.current_version).toBe(2);
    expect(edited.stored_schema_version).toBe('3.0');
    expect(edited.legacy_review).toBeNull();
    // Version 1 is still the untouched 2.0 document.
    expect(
      (database.state.versions[0]?.definition as { schema_version: string }).schema_version,
    ).toBe('2.0');
    const first = await service.getFilter(USER_A, id, 1);
    expect(first.stored_schema_version).toBe('2.0');
  });
});

describe('SavedFiltersService.deleteList and the Bot buy source (Strategy spec §8.7)', () => {
  const usage = (listId: string, patch: Partial<BotUsageRow> = {}): BotUsageRow => ({
    user_id: USER_A,
    saved_list_id: listId,
    revision: 3,
    role: 'effective',
    status: 'effective',
    effective_session: '2026-01-05',
    source_name: 'Danh sách ROE',
    ...patch,
  });

  it('refuses with 409 LIST_IN_USE_BY_BOT while the list is the effective or pending source', async () => {
    const { database, service } = setup();
    const list = await service.createList(USER_A, listInput());
    for (const role of ['effective', 'pending'] as const) {
      database.state.botUsage = [
        usage(list.id, { role, status: role === 'effective' ? 'effective' : 'pending' }),
      ];
      const error = await service.deleteList(USER_A, list.id).then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as {
        code: string;
        message: string;
        details: Array<Record<string, unknown>>;
      };
      expect(body.code).toBe('LIST_IN_USE_BY_BOT');
      expect(body.message).toContain('VN30');
      expect(body.details).toEqual([
        expect.objectContaining({
          role,
          revision: 3,
          saved_list_id: list.id,
          source_name: 'Danh sách ROE',
          next_step:
            role === 'pending'
              ? 'cancel_pending_bot_source_or_wait_for_it_to_take_effect'
              : 'switch_bot_source_to_another_list_or_vn30_first',
        }),
      ]);
      // The list is untouched: still listed, not soft-deleted.
      expect(database.state.lists[0]?.deleted_at).toBeNull();
      expect((await service.listLists(USER_A)).items).toHaveLength(1);
    }
  });

  it('deletes once the Bot no longer uses the list, under the Bot per-user lock and VN date', async () => {
    const { database, service } = setup();
    const list = await service.createList(USER_A, listInput());
    // A cancelled / superseded / replaced revision does not come back from the usage query.
    database.state.botUsage = [];
    // 2026-01-02T18:30Z is already 2026-01-03 in Asia/Ho_Chi_Minh.
    await service.deleteList(USER_A, list.id, new Date('2026-01-02T18:30:00Z'));
    expect(database.state.lists[0]?.deleted_at).toBeInstanceOf(Date);
    expect(database.state.advisoryLocks).toEqual([USER_A]);
    expect(database.state.usageQueries).toEqual([[USER_A, [list.id], '2026-01-03']]);
  });

  it('only counts the Bot usage of the owner: another user list is simply not found', async () => {
    const { database, service } = setup();
    const list = await service.createList(USER_A, listInput());
    database.state.botUsage = [usage(list.id)];
    await expectHttpError(service.deleteList(USER_B, list.id), NotFoundException, 'LIST_NOT_FOUND');
    expect(database.state.lists[0]?.deleted_at).toBeNull();
  });

  it('internal lists (Bot apply from an unsaved result) are hidden unless asked for', async () => {
    const { database, service } = setup();
    const visible = await service.createList(USER_A, listInput({ name: 'Hiển thị' }));
    const created = await service.createList(USER_A, listInput({ name: 'Nội bộ' }));
    const hidden = database.state.lists.find((item) => item.id === created.id)!;
    hidden.visibility = 'internal';
    expect((await service.listLists(USER_A)).items.map((item) => item.id)).toEqual([visible.id]);
    const all = await service.listLists(USER_A, true);
    expect(all.items.map((item) => [item.id, item.visibility])).toEqual([
      [created.id, 'internal'],
      [visible.id, 'saved'],
    ]);
  });
});

describe('STRATEGY_V2_ENABLED guard', () => {
  function guard(enabled: boolean) {
    const config = {
      get: (key: keyof Environment) => (key === 'STRATEGY_V2_ENABLED' ? enabled : undefined),
    } as unknown as ConfigService<Environment, true>;
    return new SavedFiltersFeatureGuard(config);
  }

  it('returns 404 FEATURE_DISABLED when the flag is off and passes when on', () => {
    expect(guard(true).canActivate()).toBe(true);
    let error: unknown;
    try {
      guard(false).canActivate();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('runs before the auth and premium guards on the controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SavedFiltersController) as unknown[];
    expect(guards[0]).toBe(SavedFiltersFeatureGuard);
    expect(guards).toHaveLength(3);
  });
});
