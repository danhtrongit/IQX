import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../..');
const backendV2Root = resolve(projectRoot, 'backend-v2');
const migrationPath = resolve(backendV2Root, 'migrations/0001_initial_schema.sql');
const localPython = resolve(projectRoot, 'backend/.venv/bin/python');
const python = process.env.IQX_SCHEMA_PYTHON ?? (existsSync(localPython) ? localPython : 'python3');

describe('backend-v2 initial database schema', () => {
  it('is reproducible from the complete offline SQLAlchemy metadata', () => {
    expect(() =>
      execFileSync(python, ['scripts/generate-v2-schema.py', '--check'], {
        cwd: backendV2Root,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

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
