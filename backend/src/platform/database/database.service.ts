import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, types as postgresTypes, type PoolClient, type QueryResultRow } from 'pg';

import type { Environment } from '../config/environment.js';
import * as schema from './schema.js';

type ReadTransactionCallback = Parameters<NodePgDatabase<typeof schema>['transaction']>[0];

/** Exact transaction handle passed by the node-postgres Drizzle driver. */
export type ReadDatabase = Parameters<ReadTransactionCallback>[0];

/** Minimal SQL contract exposed to application repositories. */
export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
}

export type DatabaseHealth = {
  status: 'up' | 'down' | 'disabled';
};

const DATABASE_UNAVAILABLE = {
  code: 'DATABASE_UNAVAILABLE',
  message: 'Database is unavailable',
} as const;

const TRANSIENT_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '57014',
]);

const DRIVER_TIMEOUT_MESSAGES = new Set([
  'Connection terminated due to connection timeout',
  'Query read timeout',
  'timeout exceeded when trying to connect',
  'timeout expired',
]);

type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
};

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

function isTransientDatabaseError(error: unknown): boolean {
  let current: unknown = error;

  // Drizzle wraps driver failures in DrizzleQueryError. Limit traversal in
  // case a third-party error exposes a cyclic cause chain.
  for (let depth = 0; depth < 4 && isErrorLike(current); depth += 1) {
    const code = typeof current.code === 'string' ? current.code : undefined;
    if (code && (TRANSIENT_DATABASE_CODES.has(code) || /^08[A-Z0-9]{3}$/.test(code))) {
      return true;
    }

    const message = typeof current.message === 'string' ? current.message : undefined;
    if (message && DRIVER_TIMEOUT_MESSAGES.has(message)) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | undefined;
  private database: NodePgDatabase<typeof schema> | undefined;
  private closed = false;

  constructor(private readonly config: ConfigService<Environment, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('DATABASE_URL', { infer: true }));
  }

  async read<T>(operation: (database: ReadDatabase) => Promise<T>): Promise<T> {
    const database = this.getDatabase();

    try {
      return await database.transaction(operation, {
        accessMode: 'read only',
        isolationLevel: 'repeatable read',
      });
    } catch (error) {
      if (isTransientDatabaseError(error)) {
        throw new ServiceUnavailableException(DATABASE_UNAVAILABLE);
      }
      throw error;
    }
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]> {
    try {
      const result = await this.getPool().query<T & QueryResultRow>(
        text,
        values ? [...values] : undefined,
      );
      return result.rows;
    } catch (error) {
      return this.rethrowDatabaseError(error);
    }
  }

  async transaction<T>(operation: (transaction: SqlClient) => Promise<T>): Promise<T> {
    if (this.config.get('DB_READ_ONLY', { infer: true })) {
      throw new Error('Database writes are disabled by DB_READ_ONLY');
    }

    let client: PoolClient | undefined;
    try {
      client = await this.getPool().connect();
      await client.query('BEGIN');

      const transaction: SqlClient = {
        query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<Row[]> => {
          const result = await client!.query<Row & QueryResultRow>(
            text,
            values ? [...values] : undefined,
          );
          return result.rows;
        },
      };

      const result = await operation(transaction);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          this.logger.error('Failed to roll back a database transaction');
        }
      }
      return this.rethrowDatabaseError(error);
    } finally {
      client?.release();
    }
  }

  async health(): Promise<DatabaseHealth> {
    if (!this.isConfigured()) {
      return { status: 'disabled' };
    }
    if (this.closed) {
      return { status: 'down' };
    }

    try {
      await this.getDatabase().execute(
        sql`
          select
            id,
            symbol,
            name,
            short_name,
            exchange,
            asset_type,
            is_index,
            current_price_vnd,
            target_price_vnd,
            upside_pct,
            logo_url,
            logo_source,
            icb_lv1,
            icb_lv2,
            source,
            source_url,
            last_synced_at,
            is_active,
            created_at,
            updated_at
          from public.symbols
          limit 0
        `,
      );
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const pool = this.pool;
    this.pool = undefined;
    this.database = undefined;

    if (pool) {
      await pool.end();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private getDatabase(): NodePgDatabase<typeof schema> {
    if (this.closed) {
      throw new ServiceUnavailableException(DATABASE_UNAVAILABLE);
    }

    const databaseUrl = this.config.get('DATABASE_URL', { infer: true });
    if (!databaseUrl) {
      throw new ServiceUnavailableException(DATABASE_UNAVAILABLE);
    }

    if (!this.database) {
      const statementTimeout = this.config.get('DB_STATEMENT_TIMEOUT_MS', {
        infer: true,
      });

      this.pool = new Pool({
        application_name: 'iqx-backend-v2',
        connectionString: databaseUrl,
        max: this.config.get('DB_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: this.config.get('DB_CONNECT_TIMEOUT_MS', {
          infer: true,
        }),
        query_timeout: statementTimeout,
        statement_timeout: statementTimeout,
        options: `${this.config.get('DB_READ_ONLY', { infer: true }) ? '-c default_transaction_read_only=on ' : ''}-c timezone=UTC`,
        types: {
          getTypeParser: (oid, format) => {
            if (format !== 'binary' && oid === 1082) return (value: string) => value;
            if (format !== 'binary' && oid === 1114)
              return (value: string) => new Date(`${value.replace(' ', 'T')}Z`);
            return postgresTypes.getTypeParser(oid, format);
          },
        },
      });
      this.pool.on('error', () => {
        // Never include the error object: driver messages can contain a DSN.
        this.logger.error('Unexpected error from an idle database client');
      });
      this.database = drizzle(this.pool, { schema });
    }

    return this.database;
  }

  private getPool(): Pool {
    this.getDatabase();
    return this.pool!;
  }

  private rethrowDatabaseError(error: unknown): never {
    if (isTransientDatabaseError(error)) {
      throw new ServiceUnavailableException(DATABASE_UNAVAILABLE);
    }
    throw error;
  }
}
