/**
 * Retroactive xu for lessons completed before the Shop existed (Shop spec 10.2).
 *
 *   node dist/scripts/shop-reward-backfill.js            # dry run (default): prints, never writes
 *   node dist/scripts/shop-reward-backfill.js --apply    # credits through the same service
 *
 * Candidates are rows of `academy_completions` that have no `lesson_rewards` row: quiz and guide
 * completions plus the `legacy_migration` ones (lessons completed before the Shop that map to the
 * current catalog, Shop spec 10.2). Lessons that did not map were never written to
 * `academy_completions`, so they cannot be rewarded. Credits go
 * through LessonRewardService, i.e. the same `(user_id, lesson_key)` gate and ledger unique key
 * `lesson_first_completion:<user>:<lesson_key>` as the realtime Academy hook, so running it
 * twice, or while users keep completing lessons, can never pay a lesson twice.
 *
 * Writing needs BOTH `--apply` and V2_SHOP_BACKFILL_APPROVED=true. The ledger row is stamped
 * with the time of the write; the old completion time is kept in `lesson_rewards.completed_at`.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';

import {
  LessonRewardService,
  type RewardSource,
} from '../src/modules/shop/lesson-reward.service.js';
import { LESSON_REWARD_XU } from '../src/modules/shop/shop.catalog.js';
import { PgShopRepository } from '../src/modules/shop/shop.repository.js';
import type { SqlClient } from '../src/platform/database/database.service.js';

const STABLE_LESSON_KEY = /^(technical|fundamental|concept|guide):[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Completion methods that earn xu. `legacy_migration` rows are the lessons completed before the
 * Shop that map to the current catalog (migration 0014), which Shop spec 10.2 pays retroactively.
 */
export type RewardableMethod = 'quiz' | 'guide' | 'legacy_migration';

export function isRewardableMethod(method: string): method is RewardableMethod {
  return method === 'quiz' || method === 'guide' || method === 'legacy_migration';
}

export interface CandidateRow {
  readonly userId: string;
  readonly lessonKey: string;
  readonly lessonId: string;
  readonly catalogVersion: string;
  readonly completionMethod: string;
  readonly completedAt: Date;
}

export interface BackfillOptions {
  readonly apply: boolean;
  readonly json: boolean;
  readonly userId: string | null;
  readonly limit: number | null;
}

export interface PlannedCredit extends CandidateRow {
  readonly rewardKey: string;
  readonly xu: number;
}

export interface SkippedCandidate {
  readonly row: CandidateRow;
  readonly reason: 'invalid_lesson_key' | 'invalid_completion_method';
}

export interface UserPlan {
  readonly userId: string;
  readonly lessons: number;
  readonly xu: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
}

export interface BackfillPlan {
  readonly credits: readonly PlannedCredit[];
  readonly skipped: readonly SkippedCandidate[];
  readonly users: readonly UserPlan[];
  readonly totalXu: number;
}

export function parseArgs(argv: readonly string[]): BackfillOptions {
  let apply = false;
  let json = false;
  let userId: string | null = null;
  let limit: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--json') json = true;
    else if (arg === '--user') {
      userId = argv[(index += 1)] ?? '';
      if (!UUID.test(userId)) throw new Error('--user requires a user UUID');
    } else if (arg === '--limit') {
      limit = Number(argv[(index += 1)]);
      if (!Number.isInteger(limit) || limit < 1)
        throw new Error('--limit requires an integer >= 1');
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { apply, json, userId, limit };
}

export function requireSafeTarget(apply: boolean): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Refusing to run: DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing to run: DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^iqx_v2_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error('Refusing to run: database name must match iqx_v2_*');
  }
  if (apply && process.env.V2_SHOP_BACKFILL_APPROVED !== 'true') {
    throw new Error('Refusing --apply: set V2_SHOP_BACKFILL_APPROVED=true after approval');
  }
  return databaseUrl;
}

export function planBackfill(
  rows: readonly CandidateRow[],
  balances: ReadonlyMap<string, number>,
): BackfillPlan {
  const credits: PlannedCredit[] = [];
  const skipped: SkippedCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!STABLE_LESSON_KEY.test(row.lessonKey)) {
      skipped.push({ row, reason: 'invalid_lesson_key' });
      continue;
    }
    if (!isRewardableMethod(row.completionMethod)) {
      skipped.push({ row, reason: 'invalid_completion_method' });
      continue;
    }
    const rewardKey = `lesson_first_completion:${row.userId}:${row.lessonKey}`;
    if (seen.has(rewardKey)) continue;
    seen.add(rewardKey);
    credits.push({ ...row, rewardKey, xu: LESSON_REWARD_XU });
  }
  const perUser = new Map<string, { lessons: number; xu: number }>();
  for (const credit of credits) {
    const entry = perUser.get(credit.userId) ?? { lessons: 0, xu: 0 };
    entry.lessons += 1;
    entry.xu += credit.xu;
    perUser.set(credit.userId, entry);
  }
  const users: UserPlan[] = [...perUser.entries()].map(([userId, entry]) => {
    const balanceBefore = balances.get(userId) ?? 0;
    return {
      userId,
      lessons: entry.lessons,
      xu: entry.xu,
      balanceBefore,
      balanceAfter: balanceBefore + entry.xu,
    };
  });
  return {
    credits,
    skipped,
    users,
    totalXu: credits.reduce((sum, credit) => sum + credit.xu, 0),
  };
}

export async function loadCandidates(
  db: SqlClient,
  options: Pick<BackfillOptions, 'userId' | 'limit'>,
): Promise<CandidateRow[]> {
  const rows = await db.query(
    `select c.user_id, c.lesson_key, c.lesson_id, c.catalog_version, c.completion_method,
            c.completed_at
     from academy_completions c
     left join lesson_rewards r on r.user_id = c.user_id and r.lesson_key = c.lesson_key
     where r.user_id is null and ($1::uuid is null or c.user_id = $1::uuid)
     order by c.user_id, c.completed_at, c.lesson_key
     limit $2`,
    [options.userId, options.limit],
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    lessonKey: String(row.lesson_key),
    lessonId: String(row.lesson_id),
    catalogVersion: String(row.catalog_version),
    completionMethod: String(row.completion_method),
    completedAt:
      row.completed_at instanceof Date ? row.completed_at : new Date(String(row.completed_at)),
  }));
}

export async function loadBalances(
  db: SqlClient,
  userIds: readonly string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.query(
    `select user_id, balance::text as balance from coin_wallets where user_id = any($1::uuid[])`,
    [[...new Set(userIds)]],
  );
  return new Map(rows.map((row) => [String(row.user_id), Number(row.balance)]));
}

export interface ApplyResult {
  credited: number;
  alreadyRewarded: number;
  failed: Array<{ userId: string; lessonKey: string; error: string }>;
  xuCredited: number;
}

/** One transaction per (user, lesson): a failure never blocks or undoes the others. */
export async function applyBackfill(
  plan: BackfillPlan,
  inTransaction: <T>(operation: (tx: SqlClient) => Promise<T>) => Promise<T>,
  service: Pick<LessonRewardService, 'creditFirstCompletion'>,
): Promise<ApplyResult> {
  const result: ApplyResult = { credited: 0, alreadyRewarded: 0, failed: [], xuCredited: 0 };
  const source: RewardSource = 'backfill';
  for (const credit of plan.credits) {
    try {
      const outcome = await inTransaction((tx) =>
        service.creditFirstCompletion(
          tx,
          {
            userId: credit.userId,
            lessonKey: credit.lessonKey,
            lessonId: credit.lessonId,
            catalogVersion: credit.catalogVersion,
            completionMethod: credit.completionMethod as RewardableMethod,
            completedAt: credit.completedAt.toISOString(),
          },
          { source },
        ),
      );
      if (outcome.status === 'credited') {
        result.credited += 1;
        result.xuCredited += outcome.delta;
      } else {
        result.alreadyRewarded += 1;
      }
    } catch (error) {
      result.failed.push({
        userId: credit.userId,
        lessonKey: credit.lessonKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

export function formatPlan(plan: BackfillPlan, apply: boolean): string {
  const lines = [
    apply ? 'MODE: APPLY (writes)' : 'MODE: DRY RUN (no writes)',
    `users: ${plan.users.length}  lessons: ${plan.credits.length}  total xu: ${plan.totalXu}`,
    `skipped (unmapped / invalid): ${plan.skipped.length}`,
    '',
    'user_id\tlessons\txu\tbalance_before\tbalance_after',
    ...plan.users.map(
      (u) => `${u.userId}\t${u.lessons}\t${u.xu}\t${u.balanceBefore}\t${u.balanceAfter}`,
    ),
  ];
  if (plan.skipped.length > 0) {
    lines.push('', 'skipped:');
    for (const item of plan.skipped) {
      lines.push(`${item.row.userId}\t${item.row.lessonKey}\t${item.reason}`);
    }
  }
  lines.push(
    '',
    'candidates:',
    'user_id\tlesson_key\tlesson_id\tcatalog_version\tmethod\tcompleted_at\treward_key',
  );
  for (const c of plan.credits) {
    lines.push(
      `${c.userId}\t${c.lessonKey}\t${c.lessonId}\t${c.catalogVersion}\t${c.completionMethod}\t${c.completedAt.toISOString()}\t${c.rewardKey}`,
    );
  }
  return lines.join('\n');
}

async function inTransaction<T>(
  pool: Pool,
  operation: (tx: SqlClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  const tx: SqlClient = {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<Row[]> => (await client.query(text, values ? [...values] : undefined)).rows as Row[],
  };
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    const value = await operation(tx);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    application_name: 'iqx-shop-reward-backfill',
    connectionString: requireSafeTarget(options.apply),
    max: 2,
  });
  try {
    const plan = await inTransaction(
      pool,
      async (tx) => {
        const database = await tx.query('select current_database() as name');
        if (!/^iqx_v2_[a-z0-9_]+$/.test(String(database[0]?.name ?? ''))) {
          throw new Error('Refusing to run: connected database name must match iqx_v2_*');
        }
        const rows = await loadCandidates(tx, options);
        const balances = await loadBalances(
          tx,
          rows.map((row) => row.userId),
        );
        return planBackfill(rows, balances);
      },
      true,
    );
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ apply: options.apply, plan }, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatPlan(plan, options.apply)}\n`);
    }
    if (!options.apply) return;

    const service = new LessonRewardService(new PgShopRepository());
    const result = await applyBackfill(
      plan,
      (operation) => inTransaction(pool, operation),
      service,
    );
    process.stdout.write(`${JSON.stringify({ applied: result }, null, 2)}\n`);
    if (result.failed.length > 0) process.exitCode = 1;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') {
      process.stderr.write(
        'academy_completions (migration 0014) or the shop tables (migration 0015) are missing.\n',
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
