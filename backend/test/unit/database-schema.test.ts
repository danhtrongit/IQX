import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const backendRoot = resolve(import.meta.dirname, '../..');
const migrationPath = resolve(backendRoot, 'migrations/0001_initial_schema.sql');

describe('backend initial database schema', () => {
  it('contains all 65 tables and standalone v2 defaults', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql.match(/^CREATE TABLE /gm)).toHaveLength(65);
    expect(sql).toContain('CREATE TYPE user_role AS ENUM');
    expect(sql).toContain('CREATE TABLE premium_plans');
    expect(sql).toContain('CREATE TABLE refresh_tokens');
    expect(sql).toContain('CREATE TABLE symbols');
    expect(sql).toContain('DEFAULT gen_random_uuid()');
    expect(sql).toContain("DEFAULT '[]'::jsonb");
    expect(sql).not.toContain('alembic_version');
    expect(sql).not.toMatch(/^INSERT INTO /im);
  });
});
