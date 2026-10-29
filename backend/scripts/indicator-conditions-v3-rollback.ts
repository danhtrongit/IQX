/**
 * Rollback of the indicator conditions V3 data migration (design §3.4 "Rollback").
 *
 *   node dist/scripts/indicator-conditions-v3-rollback.js            # dry run (default)
 *   node dist/scripts/indicator-conditions-v3-rollback.js --apply    # writes
 *
 * Run AFTER redeploying the previous release (it reads the pre-V3 documents). Writing needs BOTH
 * `--apply` and INDICATOR_V3_ROLLBACK_APPROVED=true. Same safety as the migration: advisory lock
 * shared with it, refused inside 18:30-19:40 ICT or while a Bot run receipt is `running`.
 *
 * Per user, in one transaction under the owner lock of `SharedConfigService.save`:
 * - Shared config: when the latest revision is in the V3 format, append revision max+1 holding a
 *   copy of the latest pre-V3 document (its schema/rule/calculation versions, `revision` set to
 *   the new row, hash recomputed) with idempotency key `indicator-conditions-v3-rollback`.
 *   V3 revisions are NEVER deleted: `backtest_runs` cascade from them. A user with no pre-V3
 *   revision (first saved under V3) is left as is and reported.
 * - The Bot pause row is deleted.
 * - Each alert re-pinned since migration 0032 points back at its backed-up `current_version`
 *   (the V3 versions and their events stay as history). enabled/paused are not touched.
 * Then each Luyện tập draft in the V3 shape whose backup is pre-V3 gets the backup draft again
 * (draft_revision + 1). `practice_runs` are never touched.
 *
 * Re-running is a no-op. Last resort: restore the `pg_dump` taken before the deploy.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { Pool } from 'pg';

import { isCurrentPracticeConfig, practiceEntry } from '../src/modules/practice/practice.config.js';
import {
  configHash,
  isCurrentFormat,
  loadTechnicalRegistry,
  type RegistryEntry,
  type SharedConfig,
} from '../src/modules/quant/v2/index.js';
import { SharedConfigSqlStore } from '../src/modules/strategy-config/strategy-config.repository.js';
import type { IsTradingDay } from '../src/modules/strategy-config/strategy-config.calendar.js';
import type { SqlClient } from '../src/platform/database/database.service.js';

import {
  MIGRATION_KEY,
  ROLLBACK_KEY,
  activeTradingDay,
  appendScriptRevision,
  parseArgs,
  poolClientOf,
  requireSafeTarget,
  transactionOn,
  withScriptLock,
  type Transaction,
} from './indicator-conditions-v3-migrate.js';

export interface RollbackContext {
  readonly apply: boolean;
  readonly now: Date;
  readonly registry: readonly RegistryEntry[];
  readonly isTradingDay: IsTradingDay | null;
}

export interface UserRollback {
  readonly userId: string;
  /** `no_previous`: the latest revision is V3 but the user has no pre-V3 one to restore. */
  readonly config: 'restored' | 'not_needed' | 'no_previous';
  readonly revision: number | null;
  readonly pauseDeleted: boolean;
  readonly alertsRestored: number;
}

/** The pre-V3 document to append: a copy of `stored` carrying the new revision number. */
export function restoredConfig(stored: unknown, revision: number): SharedConfig {
  return { ...(structuredClone(stored) as SharedConfig), revision };
}

type PreviousRow = {
  revision: number;
  config: unknown;
  schema_version: string;
  rule_version: string;
  calculation_version: string;
};

export async function rollbackUser(
  db: SqlClient,
  userId: string,
  context: RollbackContext,
): Promise<UserRollback> {
  const store = new SharedConfigSqlStore(db);
  if (context.apply) await store.lockOwner(userId);
  const latest = await store.latestRevision(userId);

  let config: UserRollback['config'] = 'not_needed';
  let revision: number | null = null;
  if (latest && isCurrentFormat(latest.config, context.registry)) {
    const candidates = await db.query<PreviousRow>(
      `select revision, config, schema_version, rule_version, calculation_version
         from shared_config_revisions where user_id = $1 order by revision desc`,
      [userId],
    );
    const previous = candidates.find((row) => !isCurrentFormat(row.config, context.registry));
    if (!previous) config = 'no_previous';
    else {
      config = 'restored';
      revision = latest.revision + 1;
      if (context.apply) {
        const document = restoredConfig(previous.config, revision);
        await appendScriptRevision(db, {
          userId,
          previous: latest,
          config: document,
          configHash: configHash(document),
          schemaVersion: previous.schema_version,
          ruleVersion: previous.rule_version,
          calculationVersion: previous.calculation_version,
          patch: { rollback: MIGRATION_KEY, restored_revision: previous.revision },
          keyBase: ROLLBACK_KEY,
          now: context.now,
          isTradingDay: context.isTradingDay,
        });
      }
    }
  }

  const pause = context.apply
    ? await db.query('delete from bot_config_pauses where user_id = $1 returning user_id', [userId])
    : await db.query('select 1 from bot_config_pauses where user_id = $1', [userId]);

  const alerts = await db.query<{ id: string; config: unknown; backup_version: number }>(
    `select a.id, v.config, b.current_version as backup_version
       from strategy_alerts a
       join backup_v3_strategy_alerts b on b.id = a.id
       join strategy_alert_versions v on v.alert_id = a.id and v.version = a.current_version
      where a.user_id = $1 and a.current_version <> b.current_version
        and exists (select 1 from strategy_alert_versions o
                     where o.alert_id = a.id and o.version = b.current_version)
      order by a.id
      ${context.apply ? 'for update of a' : ''}`,
    [userId],
  );
  let alertsRestored = 0;
  for (const alert of alerts) {
    // Only versions pinned to a V3 config go back; an older user edit is left alone.
    if (!isCurrentFormat(alert.config, context.registry)) continue;
    alertsRestored += 1;
    if (context.apply) {
      await db.query(
        `update strategy_alerts set current_version = $2, updated_at = now() where id = $1`,
        [alert.id, alert.backup_version],
      );
    }
  }

  return { userId, config, revision, pauseDeleted: pause.length > 0, alertsRestored };
}

export interface DraftsRollback {
  restored: number;
  conflicts: number;
}

type BackupDraftRow = {
  id: string;
  indicator_id: string;
  draft: unknown;
  draft_revision: number;
  backup_draft: unknown;
};

export async function rollbackDrafts(
  inTransaction: Transaction,
  read: SqlClient,
  context: RollbackContext,
  userId: string | null,
): Promise<DraftsRollback> {
  const result: DraftsRollback = { restored: 0, conflicts: 0 };
  const rows = await read.query<BackupDraftRow>(
    `select p.id, p.indicator_id, p.draft, p.draft_revision, b.draft as backup_draft
       from practice_progress p
       join backup_v3_practice_progress b
         on b.user_id = p.user_id and b.indicator_id = p.indicator_id
        and b.set_version = p.set_version
      where ($1::uuid is null or p.user_id = $1::uuid)
      order by p.id`,
    [userId],
  );
  for (const row of rows) {
    const entry = practiceEntry(row.indicator_id, context.registry);
    // Volume never changed shape; only V3 drafts whose backup is pre-V3 go back.
    if (
      !entry ||
      !isCurrentPracticeConfig(entry, row.draft) ||
      isCurrentPracticeConfig(entry, row.backup_draft)
    )
      continue;
    if (!context.apply) {
      result.restored += 1;
      continue;
    }
    const updated = await inTransaction((tx) =>
      tx.query(
        `update practice_progress
            set draft = $3::jsonb, draft_revision = draft_revision + 1, updated_at = now()
          where id = $1 and draft_revision = $2
          returning id`,
        [row.id, row.draft_revision, JSON.stringify(row.backup_draft)],
      ),
    );
    if (updated.length) result.restored += 1;
    else result.conflicts += 1;
  }
  return result;
}

export interface RollbackSummary {
  readonly apply: boolean;
  readonly configs_restored: number;
  readonly configs_not_needed: number;
  readonly configs_without_previous: number;
  readonly pauses_deleted: number;
  readonly alerts_restored: number;
  readonly drafts_restored: number;
  readonly drafts_conflicts: number;
  readonly failed: ReadonlyArray<{ userId: string; error: string }>;
}

export function formatRollback(summary: RollbackSummary): string {
  return [
    summary.apply
      ? 'MODE: APPLY (writes)'
      : 'MODE: DRY RUN (no writes; counts are what --apply would do)',
    `configs restored: ${summary.configs_restored}`,
    `configs not needed: ${summary.configs_not_needed}`,
    `configs without a pre-V3 revision (left as is): ${summary.configs_without_previous}`,
    `bot pauses deleted: ${summary.pauses_deleted}`,
    `alerts restored: ${summary.alerts_restored}`,
    `drafts restored: ${summary.drafts_restored}`,
    `drafts changed concurrently (re-run): ${summary.drafts_conflicts}`,
    `users failed: ${summary.failed.length}`,
    ...summary.failed.map((item) => `failed ${item.userId}: ${item.error}`),
  ].join('\n');
}

export async function runRollback(
  pool: Pool,
  options: { apply: boolean; now?: Date; userId?: string | null },
): Promise<RollbackSummary> {
  const now = options.now ?? new Date();
  const userId = options.userId ?? null;
  return withScriptLock(pool, now, async () => {
    const write = transactionOn(pool);
    const run = options.apply ? write : transactionOn(pool, true);
    const read = poolClientOf(pool);
    const context: RollbackContext = {
      apply: options.apply,
      now,
      registry: loadTechnicalRegistry(),
      isTradingDay: await activeTradingDay(read),
    };
    const users = (
      await read.query<{ user_id: string }>(
        `select user_id from shared_config_revisions where ($1::uuid is null or user_id = $1::uuid)
         union
         select user_id from bot_config_pauses where ($1::uuid is null or user_id = $1::uuid)
         order by user_id`,
        [userId],
      )
    ).map((row) => row.user_id);

    const outcomes: UserRollback[] = [];
    const failed: Array<{ userId: string; error: string }> = [];
    for (const id of users) {
      try {
        outcomes.push(await run((tx) => rollbackUser(tx, id, context)));
      } catch (error) {
        failed.push({ userId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const drafts = await rollbackDrafts(write, read, context, userId);
    const count = (state: UserRollback['config']) =>
      outcomes.filter((item) => item.config === state).length;
    return {
      apply: options.apply,
      configs_restored: count('restored'),
      configs_not_needed: count('not_needed'),
      configs_without_previous: count('no_previous'),
      pauses_deleted: outcomes.filter((item) => item.pauseDeleted).length,
      alerts_restored: outcomes.reduce((total, item) => total + item.alertsRestored, 0),
      drafts_restored: drafts.restored,
      drafts_conflicts: drafts.conflicts,
      failed,
    };
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    application_name: 'iqx-indicator-conditions-v3-rollback',
    connectionString: requireSafeTarget(options.apply, 'INDICATOR_V3_ROLLBACK_APPROVED'),
    max: 3,
  });
  try {
    const summary = await runRollback(pool, { apply: options.apply, userId: options.userId });
    process.stdout.write(
      options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatRollback(summary)}\n`,
    );
    if (summary.failed.length || summary.drafts_conflicts) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
