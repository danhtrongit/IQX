import { afterEach, describe, expect, it } from 'vitest';

import { loadMigrations, requireSafeTarget } from '../../scripts/migrate.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalAllowed = process.env.V2_MIGRATIONS_ALLOWED;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalAllowed === undefined) delete process.env.V2_MIGRATIONS_ALLOWED;
  else process.env.V2_MIGRATIONS_ALLOWED = originalAllowed;
});

describe('v2 migration safety', () => {
  it('requires an explicit migration opt-in', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/iqx_v2_test';
    delete process.env.V2_MIGRATIONS_ALLOWED;

    expect(() => requireSafeTarget()).toThrow('V2_MIGRATIONS_ALLOWED=true');
  });

  it.each(['postgresql://localhost/iqx', 'postgresql://localhost/iqx_v1_test'])(
    'rejects non-v2 database target %s',
    (databaseUrl) => {
      process.env.V2_MIGRATIONS_ALLOWED = 'true';
      process.env.DATABASE_URL = databaseUrl;

      expect(() => requireSafeTarget()).toThrow('database name must match iqx_v2_*');
    },
  );

  it('accepts only an explicitly enabled v2 PostgreSQL database', () => {
    process.env.V2_MIGRATIONS_ALLOWED = 'true';
    process.env.DATABASE_URL = 'postgresql://localhost/iqx_v2_local';

    expect(requireSafeTarget()).toBe('postgresql://localhost/iqx_v2_local');
  });

  it('loads ordered migration SQL with stable SHA-256 checksums', async () => {
    const migrations = await loadMigrations();

    const versions = migrations.map(({ version }) => version);
    expect(versions[0]).toBe('0001_initial_schema.sql');
    expect(versions).toEqual([...versions].sort());
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.sql).toContain('CREATE TABLE users');
  });
});
