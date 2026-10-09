import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient } from 'pg';

import { loadAcademyContent } from '../src/modules/academy/academy.content.js';
import {
  legacyMappingRows,
  loadRemovedLegacyLessons,
  unmappedReason,
  type LegacyMappingRow,
  type RemovedLegacyLesson,
} from '../src/modules/academy/academy.legacy-mapping.js';

/**
 * Read-only dry run of the legacy backfill in migration 0014: prints, per mapping, how many
 * legacy `academy_grants` would become `legacy_migration` completions, plus the grants that map
 * to nothing. It never writes: the whole run is one `READ ONLY` transaction.
 *
 *   DATABASE_URL=postgresql://.../iqx_v2_<env> node dist/scripts/academy-legacy-mapping-report.js [--json]
 */

export type MappingReportLine = LegacyMappingRow & {
  legacy_grants: number;
  /** Completions of that lesson key that already exist (0 before the migration). */
  existing_completions: number;
  would_insert: number;
};

export type UnmappedReportLine = {
  legacy_lesson_id: string;
  name: string;
  reason: string;
  legacy_grants: number;
};

export type LegacyMappingReport = {
  catalog_version: string;
  completions_table_exists: boolean;
  mapped: MappingReportLine[];
  unmapped: UnmappedReportLine[];
  /** Grants whose legacy lesson id is neither mapped nor a known removed lesson. */
  unknown: Array<{ legacy_lesson_id: string; legacy_grants: number }>;
  totals: {
    users_with_grants: number;
    legacy_grants: number;
    mapped_grants: number;
    unmapped_grants: number;
    would_insert: number;
  };
};

type Counts = ReadonlyMap<string, number>;

/** Pure report builder; the database only supplies the counts. */
export function buildLegacyMappingReport(input: {
  catalogVersion: string;
  rows: readonly LegacyMappingRow[];
  removed: readonly RemovedLegacyLesson[];
  grantsByLegacyLesson: Counts;
  completionsByKey: Counts;
  newCompletionsFromLegacy: Counts;
  usersWithGrants: number;
  completionsTableExists: boolean;
}): LegacyMappingReport {
  const mapped = input.rows.map((row): MappingReportLine => {
    const grants = input.grantsByLegacyLesson.get(row.legacy_lesson_id) ?? 0;
    const existing = input.completionsByKey.get(row.lesson_key) ?? 0;
    // Users that hold the legacy grant but no completion for the key yet.
    const missing = input.newCompletionsFromLegacy.get(row.legacy_lesson_id) ?? grants;
    return { ...row, legacy_grants: grants, existing_completions: existing, would_insert: missing };
  });
  const unmapped = input.removed.map((lesson): UnmappedReportLine => ({
    legacy_lesson_id: lesson.legacy_lesson_id,
    name: lesson.name,
    reason: unmappedReason(lesson),
    legacy_grants: input.grantsByLegacyLesson.get(lesson.legacy_lesson_id) ?? 0,
  }));
  const known = new Set([
    ...input.rows.map((row) => row.legacy_lesson_id),
    ...input.removed.map((lesson) => lesson.legacy_lesson_id),
  ]);
  const unknown = [...input.grantsByLegacyLesson.entries()]
    .filter(([id]) => !known.has(id))
    .map(([legacy_lesson_id, legacy_grants]) => ({ legacy_lesson_id, legacy_grants }));
  const sum = (lines: ReadonlyArray<{ legacy_grants: number }>) =>
    lines.reduce((total, line) => total + line.legacy_grants, 0);
  return {
    catalog_version: input.catalogVersion,
    completions_table_exists: input.completionsTableExists,
    mapped,
    unmapped,
    unknown,
    totals: {
      users_with_grants: input.usersWithGrants,
      legacy_grants: sum(mapped) + sum(unmapped) + sum(unknown),
      mapped_grants: sum(mapped),
      unmapped_grants: sum(unmapped) + sum(unknown),
      would_insert: mapped.reduce((total, line) => total + line.would_insert, 0),
    },
  };
}

function formatReport(report: LegacyMappingReport): string {
  const lines: string[] = [
    `Academy legacy mapping dry run -> ${report.catalog_version}`,
    `academy_completions exists: ${report.completions_table_exists ? 'yes' : 'no (before migration 0014)'}`,
    '',
    'MAPPED  legacy -> new lesson  | lesson key | legacy grants | existing completions | would insert',
  ];
  for (const line of report.mapped)
    lines.push(
      `  ${line.legacy_lesson_id} -> ${line.lesson_id}  ${line.lesson_key}  grants=${line.legacy_grants}  existing=${line.existing_completions}  insert=${line.would_insert}`,
    );
  lines.push('', 'NOT MAPPED (kept as legacy history, no completion, no capability):');
  for (const line of report.unmapped)
    lines.push(
      `  ${line.legacy_lesson_id}  ${line.name}  grants=${line.legacy_grants}  ${line.reason}`,
    );
  for (const line of report.unknown)
    lines.push(`  ${line.legacy_lesson_id}  UNKNOWN legacy lesson  grants=${line.legacy_grants}`);
  const totals = report.totals;
  lines.push(
    '',
    `users with grants: ${totals.users_with_grants}`,
    `legacy grants: ${totals.legacy_grants} (mapped ${totals.mapped_grants}, not mapped ${totals.unmapped_grants})`,
    `completions the migration would insert: ${totals.would_insert}`,
  );
  return lines.join('\n');
}

function requireReadTarget(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL');
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^iqx_v2_[a-z0-9_]+$/.test(name)) throw new Error('database name must match iqx_v2_*');
  return databaseUrl;
}

async function counts(client: PoolClient, text: string): Promise<Counts> {
  const result = await client.query<{ key: string; total: string }>(text);
  return new Map(result.rows.map((row) => [row.key, Number(row.total)]));
}

async function collect(client: PoolClient): Promise<LegacyMappingReport> {
  const content = loadAcademyContent();
  const rows = legacyMappingRows(content);
  const tableExists =
    (
      await client.query<{ exists: boolean }>(
        `select to_regclass('public.academy_completions') is not null as exists`,
      )
    ).rows[0]?.exists === true;
  const grantsByLegacyLesson = await counts(
    client,
    'select lesson_id as key, count(*)::text as total from academy_grants group by lesson_id',
  );
  const users = await client.query<{ total: string }>(
    'select count(distinct user_id)::text as total from academy_grants',
  );
  const completionsByKey = tableExists
    ? await counts(
        client,
        'select lesson_key as key, count(*)::text as total from academy_completions group by lesson_key',
      )
    : new Map<string, number>();
  const newCompletionsFromLegacy = new Map<string, number>();
  if (tableExists) {
    // Per mapping: legacy grants whose user has no completion for the mapped key yet.
    for (const row of rows) {
      const missing = await client.query<{ total: string }>(
        `select count(*)::text as total
         from academy_grants g
         where g.lesson_id = $1
           and not exists (
             select 1 from academy_completions c
             where c.user_id = g.user_id and c.lesson_key = $2
           )`,
        [row.legacy_lesson_id, row.lesson_key],
      );
      newCompletionsFromLegacy.set(row.legacy_lesson_id, Number(missing.rows[0]?.total ?? 0));
    }
  }
  return buildLegacyMappingReport({
    catalogVersion: content.catalog_version,
    rows,
    removed: loadRemovedLegacyLessons(),
    grantsByLegacyLesson,
    completionsByKey,
    newCompletionsFromLegacy,
    usersWithGrants: Number(users.rows[0]?.total ?? 0),
    completionsTableExists: tableExists,
  });
}

async function main(): Promise<void> {
  const pool = new Pool({
    application_name: 'iqx-academy-legacy-mapping-report',
    connectionString: requireReadTarget(),
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const report = await collect(client);
    await client.query('ROLLBACK');
    process.stdout.write(
      `${process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report)}\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
