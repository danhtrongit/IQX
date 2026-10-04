import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { FilterDefinition } from './saved-filters.definition.js';
import { canonicalHash } from './saved-filters.hash.js';
import type {
  FilterCreateInput,
  FilterUpdateInput,
  ListCreateInput,
  SavedFilter,
  SavedFilterSummary,
  SavedList,
} from './saved-filters.schemas.js';

type Timestamp = Date | string;

type FilterRow = {
  id: string;
  name: string;
  current_version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: number;
  definition: FilterDefinition;
  definition_hash: string;
};

type FilterVersionJoinRow = Omit<FilterRow, 'version' | 'definition' | 'definition_hash'> & {
  version: number | null;
  definition: FilterDefinition | null;
  definition_hash: string | null;
};

type FilterVersionRow = { version: number; definition_hash: string; created_at: Timestamp };

type ListRow = {
  id: string;
  name: string;
  filter_id: string | null;
  filter_version: number | null;
  tickers: string[];
  as_of: string;
  data_source: string;
  scope: SavedList['scope'];
  created_at: Timestamp;
};

type IdempotencyRow = { id: string; request_hash: string | null };

const FILTER_COLUMNS = `f.id, f.name, f.current_version, f.created_at, f.updated_at,
       v.version, v.definition, v.definition_hash`;
const LIST_COLUMNS = `id, name, filter_id, filter_version, tickers, as_of, data_source, scope, created_at`;

function filterNotFound(): NotFoundException {
  return new NotFoundException({ code: 'FILTER_NOT_FOUND', message: 'Không tìm thấy bộ lọc' });
}

function filterVersionNotFound(version: number): NotFoundException {
  return new NotFoundException({
    code: 'FILTER_VERSION_NOT_FOUND',
    message: 'Không tìm thấy phiên bản bộ lọc',
    version,
  });
}

function listNotFound(): NotFoundException {
  return new NotFoundException({ code: 'LIST_NOT_FOUND', message: 'Không tìm thấy danh sách' });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    message: 'Khóa idempotency đã được dùng cho một yêu cầu khác',
  });
}

function toIso(value: Timestamp): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toFilterSummary(row: FilterRow): SavedFilterSummary {
  return {
    id: row.id,
    name: row.name,
    current_version: row.current_version,
    version: row.version,
    definition: row.definition,
    definition_hash: row.definition_hash,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function toSavedList(row: ListRow): SavedList {
  return {
    id: row.id,
    name: row.name,
    kind: 'static_retrospective',
    filter_id: row.filter_id,
    filter_version: row.filter_version,
    tickers: row.tickers,
    as_of: row.as_of,
    data_source: row.data_source,
    scope: row.scope,
    created_at: toIso(row.created_at),
  };
}

/**
 * Owner-scoped saved filters (immutable versions, definition_hash = sha256 of
 * canonical JSON) and static list snapshots. Other users' ids and soft-deleted
 * rows behave as missing (404).
 */
@Injectable()
export class SavedFiltersService {
  constructor(private readonly database: DatabaseService) {}

  async listFilters(userId: string): Promise<{ items: SavedFilterSummary[] }> {
    const rows = await this.database.query<FilterRow>(
      `SELECT ${FILTER_COLUMNS}
         FROM strategy_filters f
         JOIN filter_versions v ON v.filter_id = f.id AND v.version = f.current_version
        WHERE f.user_id = $1 AND f.deleted_at IS NULL
        ORDER BY f.updated_at DESC, f.id`,
      [userId],
    );
    return { items: rows.map(toFilterSummary) };
  }

  getFilter(userId: string, filterId: string, version?: number): Promise<SavedFilter> {
    return this.loadFilter(this.database, userId, filterId, { version });
  }

  createFilter(userId: string, input: FilterCreateInput): Promise<SavedFilter> {
    const definitionHash = canonicalHash(input.definition);
    const requestHash = canonicalHash({ name: input.name, definition: input.definition });
    const key = input.idempotency_key ?? null;
    return this.database.transaction(async (client) => {
      const replay = await this.findIdempotent(
        client,
        'strategy_filters',
        userId,
        key,
        requestHash,
      );
      if (replay) return this.loadFilter(client, userId, replay, { includeDeleted: true });

      const [created] = await client.query<{ id: string }>(
        `INSERT INTO strategy_filters (id, user_id, name, current_version, idempotency_key, request_hash)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [randomUUID(), userId, input.name, key, requestHash],
      );
      if (!created) {
        // A concurrent request with the same key committed first.
        const raced = await this.findIdempotent(
          client,
          'strategy_filters',
          userId,
          key,
          requestHash,
        );
        if (!raced) throw new Error('Idempotent saved filter was not found after conflict');
        return this.loadFilter(client, userId, raced, { includeDeleted: true });
      }
      await client.query(
        `INSERT INTO filter_versions (filter_id, version, definition, definition_hash)
         VALUES ($1, 1, $2::jsonb, $3)`,
        [created.id, JSON.stringify(input.definition), definitionHash],
      );
      return this.loadFilter(client, userId, created.id);
    });
  }

  updateFilter(userId: string, filterId: string, input: FilterUpdateInput): Promise<SavedFilter> {
    const definitionHash = canonicalHash(input.definition);
    return this.database.transaction(async (client) => {
      const [current] = await client.query<{
        name: string;
        current_version: number;
        definition_hash: string;
      }>(
        `SELECT f.name, f.current_version, v.definition_hash
           FROM strategy_filters f
           JOIN filter_versions v ON v.filter_id = f.id AND v.version = f.current_version
          WHERE f.id = $1 AND f.user_id = $2 AND f.deleted_at IS NULL
          FOR UPDATE OF f`,
        [filterId, userId],
      );
      if (!current) throw filterNotFound();

      const name = input.name ?? current.name;
      if (current.definition_hash !== definitionHash) {
        const next = current.current_version + 1;
        await client.query(
          `INSERT INTO filter_versions (filter_id, version, definition, definition_hash)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [filterId, next, JSON.stringify(input.definition), definitionHash],
        );
        await client.query(
          `UPDATE strategy_filters
              SET current_version = $3, name = $4, updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [filterId, userId, next, name],
        );
      } else if (name !== current.name) {
        await client.query(
          `UPDATE strategy_filters SET name = $3, updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [filterId, userId, name],
        );
      }
      return this.loadFilter(client, userId, filterId);
    });
  }

  async deleteFilter(userId: string, filterId: string): Promise<void> {
    const rows = await this.database.transaction((client) =>
      client.query<{ id: string }>(
        `UPDATE strategy_filters SET deleted_at = now(), updated_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
          RETURNING id`,
        [filterId, userId],
      ),
    );
    if (rows.length === 0) throw filterNotFound();
  }

  async listLists(userId: string): Promise<{ items: SavedList[] }> {
    const rows = await this.database.query<ListRow>(
      `SELECT ${LIST_COLUMNS}
         FROM list_snapshots
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id`,
      [userId],
    );
    return { items: rows.map(toSavedList) };
  }

  async getList(userId: string, listId: string): Promise<SavedList> {
    const [row] = await this.database.query<ListRow>(
      `SELECT ${LIST_COLUMNS}
         FROM list_snapshots
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [listId, userId],
    );
    if (!row) throw listNotFound();
    return toSavedList(row);
  }

  createList(userId: string, input: ListCreateInput): Promise<SavedList> {
    const { idempotency_key: idempotencyKey, ...payload } = input;
    const requestHash = canonicalHash(payload);
    const key = idempotencyKey ?? null;
    return this.database.transaction(async (client) => {
      const replay = await this.findIdempotent(client, 'list_snapshots', userId, key, requestHash);
      if (replay) return this.loadList(client, userId, replay);

      let filterVersion: number | null = null;
      if (input.filter_id !== undefined) {
        const [filter] = await client.query<{ current_version: number }>(
          `SELECT current_version FROM strategy_filters
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
          [input.filter_id, userId],
        );
        if (!filter) throw filterNotFound();
        filterVersion = input.filter_version ?? filter.current_version;
        const [version] = await client.query<{ version: number }>(
          `SELECT version FROM filter_versions WHERE filter_id = $1 AND version = $2`,
          [input.filter_id, filterVersion],
        );
        if (!version) throw filterVersionNotFound(filterVersion);
      }

      const [created] = await client.query<ListRow>(
        `INSERT INTO list_snapshots
           (id, user_id, name, filter_id, filter_version, tickers, as_of, data_source, scope,
            idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7::date, $8, $9::jsonb, $10, $11)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING ${LIST_COLUMNS}`,
        [
          randomUUID(),
          userId,
          input.name,
          input.filter_id ?? null,
          filterVersion,
          input.tickers,
          input.as_of,
          input.data_source,
          JSON.stringify(input.scope),
          key,
          requestHash,
        ],
      );
      if (created) return toSavedList(created);
      const raced = await this.findIdempotent(client, 'list_snapshots', userId, key, requestHash);
      if (!raced) throw new Error('Idempotent saved list was not found after conflict');
      return this.loadList(client, userId, raced);
    });
  }

  async deleteList(userId: string, listId: string): Promise<void> {
    const rows = await this.database.transaction((client) =>
      client.query<{ id: string }>(
        `UPDATE list_snapshots SET deleted_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
          RETURNING id`,
        [listId, userId],
      ),
    );
    if (rows.length === 0) throw listNotFound();
  }

  /** Returns the id stored for a replayed key, or 409 when the key carried another payload. */
  private async findIdempotent(
    client: SqlClient,
    table: 'strategy_filters' | 'list_snapshots',
    userId: string,
    key: string | null,
    requestHash: string,
  ): Promise<string | undefined> {
    if (key === null) return undefined;
    const [row] = await client.query<IdempotencyRow>(
      `SELECT id, request_hash FROM ${table} WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    if (!row) return undefined;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    return row.id;
  }

  private async loadFilter(
    client: SqlClient,
    userId: string,
    filterId: string,
    options: { version?: number; includeDeleted?: boolean } = {},
  ): Promise<SavedFilter> {
    const [row] = await client.query<FilterVersionJoinRow>(
      `SELECT ${FILTER_COLUMNS}
         FROM strategy_filters f
         LEFT JOIN filter_versions v
           ON v.filter_id = f.id AND v.version = COALESCE($3::integer, f.current_version)
        WHERE f.id = $1 AND f.user_id = $2 AND ($4::boolean OR f.deleted_at IS NULL)`,
      [filterId, userId, options.version ?? null, options.includeDeleted === true],
    );
    if (!row) throw filterNotFound();
    const { version, definition, definition_hash: definitionHash } = row;
    if (version === null || definition === null || definitionHash === null)
      throw filterVersionNotFound(options.version ?? row.current_version);
    const versions = await client.query<FilterVersionRow>(
      `SELECT version, definition_hash, created_at
         FROM filter_versions
        WHERE filter_id = $1
        ORDER BY version`,
      [filterId],
    );
    return {
      ...toFilterSummary({ ...row, version, definition, definition_hash: definitionHash }),
      versions: versions.map((item) => ({
        version: item.version,
        definition_hash: item.definition_hash,
        created_at: toIso(item.created_at),
      })),
    };
  }

  private async loadList(client: SqlClient, userId: string, listId: string): Promise<SavedList> {
    const [row] = await client.query<ListRow>(
      `SELECT ${LIST_COLUMNS} FROM list_snapshots WHERE id = $1 AND user_id = $2`,
      [listId, userId],
    );
    if (!row) throw listNotFound();
    return toSavedList(row);
  }
}
