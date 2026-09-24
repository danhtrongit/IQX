import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient } from 'pg';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK = 'iqx-backend-v2-migrations';
const MIGRATIONS_TABLE = 'iqx_v2_migrations';

type Migration = { checksum: string; sql: string; version: string };

export function requireSafeTarget(): string {
  if (process.env.V2_MIGRATIONS_ALLOWED !== 'true') {
    throw new Error('Refusing migration: set V2_MIGRATIONS_ALLOWED=true explicitly');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Refusing migration: DATABASE_URL is required');

  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing migration: DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^iqx_v2_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error('Refusing migration: database name must match iqx_v2_*');
  }
  return databaseUrl;
}

export async function loadMigrations(): Promise<Migration[]> {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(scriptDirectory, '..', 'migrations'),
    join(scriptDirectory, '..', '..', 'migrations'),
  ];
  let directory: string | undefined;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      directory = candidate;
      break;
    } catch {
      // Try the compiled-script layout next.
    }
  }
  if (!directory) throw new Error('V2 migrations directory not found');
  const files = (await readdir(directory)).filter((file) => MIGRATION_FILE.test(file)).sort();
  if (files.length === 0) throw new Error('No v2 migration files found');

  return Promise.all(
    files.map(async (version) => {
      const sql = await readFile(join(directory, version), 'utf8');
      return { checksum: createHash('sha256').update(sql).digest('hex'), sql, version };
    }),
  );
}

async function assertConnectedDatabase(client: PoolClient): Promise<void> {
  const result = await client.query<{ database_name: string }>(
    'select current_database() as database_name',
  );
  if (!/^iqx_v2_[a-z0-9_]+$/.test(result.rows[0]?.database_name ?? '')) {
    throw new Error('Refusing migration: connected database name must match iqx_v2_*');
  }
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    create table if not exists ${MIGRATIONS_TABLE} (
      version text primary key,
      checksum char(64) not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function applyMigration(client: PoolClient, migration: Migration): Promise<boolean> {
  const existing = await client.query<{ checksum: string }>(
    `select checksum from ${MIGRATIONS_TABLE} where version = $1`,
    [migration.version],
  );
  if (existing.rowCount) {
    if (existing.rows[0]?.checksum !== migration.checksum) {
      throw new Error(`Checksum mismatch for applied migration ${migration.version}`);
    }
    return false;
  }

  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query(`insert into ${MIGRATIONS_TABLE} (version, checksum) values ($1, $2)`, [
      migration.version,
      migration.checksum,
    ]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const pool = new Pool({
    application_name: 'iqx-backend-v2-migrations',
    connectionString: requireSafeTarget(),
    max: 1,
  });
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await assertConnectedDatabase(client);
    await client.query('select pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK]);
    await ensureMigrationsTable(client);

    for (const migration of await loadMigrations()) {
      const applied = await applyMigration(client, migration);
      process.stdout.write(`${applied ? 'applied' : 'current'} ${basename(migration.version)}\n`);
    }
  } finally {
    if (client) {
      try {
        await client.query('select pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK]);
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
