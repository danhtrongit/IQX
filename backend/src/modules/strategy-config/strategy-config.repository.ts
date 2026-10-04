import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { IndicatorConfig, SharedConfig } from '../quant/v2/index.js';
import type { EffectiveStatus } from './strategy-config.calendar.js';

/** One saved revision joined with its effective-session row. */
export type RevisionRow = {
  user_id: string;
  revision: number;
  config: SharedConfig;
  config_hash: string;
  before_hash: string | null;
  patch: Record<string, IndicatorConfig>;
  requested_at: Date;
  saved_at: Date;
  actor_id: string;
  idempotency_key: string;
  effective_session: string | null;
  session_status: EffectiveStatus;
};

export type NewRevision = {
  user_id: string;
  revision: number;
  schema_version: string;
  rule_version: string;
  calculation_version: string;
  config: SharedConfig;
  config_hash: string;
  before_hash: string | null;
  patch: Record<string, IndicatorConfig>;
  requested_at: Date;
  actor_id: string;
  idempotency_key: string;
};

export type NewEffectiveSession = {
  user_id: string;
  revision: number;
  effective_session: string | null;
  status: EffectiveStatus;
};

/** Persistence operations used by SharedConfigService; one instance per client/transaction. */
export interface SharedConfigStore {
  /** Serializes concurrent saves of one owner for the rest of the transaction. */
  lockOwner(userId: string): Promise<void>;
  latestRevision(userId: string): Promise<RevisionRow | null>;
  revision(userId: string, revision: number): Promise<RevisionRow | null>;
  revisionByIdempotencyKey(userId: string, idempotencyKey: string): Promise<RevisionRow | null>;
  /** Latest revision with a known effective_session <= sessionDate. */
  effectiveRevision(userId: string, sessionDate: string): Promise<RevisionRow | null>;
  listRevisions(userId: string, limit: number): Promise<RevisionRow[]>;
  /** Inserts the revision and returns its server `saved_at`. */
  insertRevision(revision: NewRevision): Promise<{ saved_at: Date }>;
  insertEffectiveSession(session: NewEffectiveSession): Promise<void>;
  /** Holidays of the active trading calendar row, or null when no row is active. */
  activeCalendar(): Promise<{ holidays: unknown } | null>;
}

export interface SharedConfigStoreProvider {
  store(): SharedConfigStore;
  transaction<T>(operation: (store: SharedConfigStore) => Promise<T>): Promise<T>;
}

const REVISION_SELECT = `select r.user_id, r.revision, r.config, r.config_hash, r.before_hash, r.patch,
    r.requested_at, r.saved_at, r.actor_id, r.idempotency_key,
    to_char(e.effective_session, 'YYYY-MM-DD') as effective_session,
    coalesce(e.status, 'calendar_unavailable') as session_status
  from shared_config_revisions r
  left join effective_config_sessions e on e.user_id = r.user_id and e.revision = r.revision`;

type RawRevisionRow = Omit<RevisionRow, 'revision' | 'requested_at' | 'saved_at'> & {
  revision: number | string;
  requested_at: Date | string;
  saved_at: Date | string;
};

const toRevisionRow = (row: RawRevisionRow): RevisionRow => ({
  ...row,
  revision: Number(row.revision),
  requested_at: new Date(row.requested_at),
  saved_at: new Date(row.saved_at),
});

export class SharedConfigSqlStore implements SharedConfigStore {
  constructor(private readonly client: SqlClient) {}

  async lockOwner(userId: string): Promise<void> {
    await this.client.query(
      `select pg_advisory_xact_lock(hashtext('shared_config_revisions:' || $1::text))`,
      [userId],
    );
  }

  latestRevision(userId: string) {
    return this.one(`${REVISION_SELECT} where r.user_id = $1 order by r.revision desc limit 1`, [
      userId,
    ]);
  }

  revision(userId: string, revision: number) {
    return this.one(`${REVISION_SELECT} where r.user_id = $1 and r.revision = $2`, [
      userId,
      revision,
    ]);
  }

  revisionByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.one(`${REVISION_SELECT} where r.user_id = $1 and r.idempotency_key = $2`, [
      userId,
      idempotencyKey,
    ]);
  }

  effectiveRevision(userId: string, sessionDate: string) {
    return this.one(
      `${REVISION_SELECT}
       where r.user_id = $1 and e.status <> 'calendar_unavailable'
         and e.effective_session is not null and e.effective_session <= $2::date
       order by r.revision desc limit 1`,
      [userId, sessionDate],
    );
  }

  async listRevisions(userId: string, limit: number) {
    const rows = await this.client.query<RawRevisionRow>(
      `${REVISION_SELECT} where r.user_id = $1 order by r.revision desc limit $2`,
      [userId, limit],
    );
    return rows.map(toRevisionRow);
  }

  async insertRevision(revision: NewRevision) {
    const rows = await this.client.query<{ saved_at: Date | string }>(
      `insert into shared_config_revisions
         (user_id, revision, schema_version, rule_version, calculation_version, config, config_hash,
          before_hash, patch, requested_at, saved_at, actor_id, idempotency_key)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, now(), $11, $12)
       returning saved_at`,
      [
        revision.user_id,
        revision.revision,
        revision.schema_version,
        revision.rule_version,
        revision.calculation_version,
        JSON.stringify(revision.config),
        revision.config_hash,
        revision.before_hash,
        JSON.stringify(revision.patch),
        revision.requested_at,
        revision.actor_id,
        revision.idempotency_key,
      ],
    );
    return { saved_at: new Date(rows[0]!.saved_at) };
  }

  async insertEffectiveSession(session: NewEffectiveSession) {
    await this.client.query(
      `insert into effective_config_sessions (user_id, revision, effective_session, status, computed_at)
       values ($1, $2, $3::date, $4, now())`,
      [session.user_id, session.revision, session.effective_session, session.status],
    );
  }

  async activeCalendar() {
    const rows = await this.client.query<{ holidays: unknown }>(
      'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
    );
    return rows[0] ?? null;
  }

  private async one(text: string, values: readonly unknown[]): Promise<RevisionRow | null> {
    const rows = await this.client.query<RawRevisionRow>(text, values);
    return rows[0] ? toRevisionRow(rows[0]) : null;
  }
}

@Injectable()
export class SharedConfigRepository implements SharedConfigStoreProvider {
  constructor(private readonly database: DatabaseService) {}

  store(): SharedConfigStore {
    return new SharedConfigSqlStore(this.database);
  }

  transaction<T>(operation: (store: SharedConfigStore) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => operation(new SharedConfigSqlStore(client)));
  }
}
