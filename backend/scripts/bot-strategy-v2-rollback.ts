/**
 * Rollback of `bot-strategy-v2-convert.ts` (PLAN §5.2): removes the Lịch phiên rows, the position
 * anchors and the conversion log written by the conversion. Converted user strategies are kept
 * (a later re-run reuses them, never duplicates). Bot v2 runs that already happened stay (their
 * receipts, executions and NAV are history). Dry-run by default.
 *
 *   BOT_STRATEGY_V2_CONVERSION_APPROVED=true JOB_BOT_SESSION_EOD_ENABLED=false \
 *     node dist/scripts/bot-strategy-v2-rollback.js --apply [--user <uuid>]
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

import { inBotWindow, parseArgs, requireSafeTarget, SCRIPT_LOCK } from './bot-strategy-v2-convert.js';

export type RollbackSummary = {
  mode: 'dry-run' | 'apply';
  accounts: number;
  schedule_rows: number;
  anchored_positions: number;
};

export async function runRollback(
  pool: Pool,
  options: { apply: boolean; userId?: string | null; now?: Date },
): Promise<RollbackSummary> {
  if (inBotWindow(options.now ?? new Date())) {
    throw new Error('Refusing to run between 18:30 and 19:40 ICT (Bot window)');
  }
  const client = await pool.connect();
  let locked = false;
  try {
    locked =
      (await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1)) as ok', [
        SCRIPT_LOCK,
      ])).rows[0]?.ok === true;
    if (!locked) throw new Error('Refusing to run: another bot-strategy-v2 script is running');
    const running = await client.query<{ n: number }>(
      `select count(*)::int as n from bot_run_receipts where status = 'running'`,
    );
    if ((running.rows[0]?.n ?? 0) > 0) throw new Error('Refusing to run: a Bot run is running');
    await client.query(options.apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const user = options.userId ?? null;
    const counts = (
      await client.query<{ accounts: number; schedule_rows: number; anchored_positions: number }>(
        `select
           (select count(*)::int from bot_strategy_conversion_log l
             where $1::uuid is null or l.user_id = $1::uuid) as accounts,
           (select count(*)::int from bot_strategy_schedule s
              join bot_instances i on i.id = s.bot_id
             where $1::uuid is null or i.user_id = $1::uuid) as schedule_rows,
           (select count(*)::int from bot_positions p
              join bot_instances i on i.bot_account_id = p.bot_account_id
             where p.anchor_reason = 'policy_cutover'
               and ($1::uuid is null or i.user_id = $1::uuid)) as anchored_positions`,
        [user],
      )
    ).rows[0]!;
    if (options.apply) {
      await client.query(
        `delete from bot_strategy_schedule s using bot_instances i
          where i.id = s.bot_id and ($1::uuid is null or i.user_id = $1::uuid)`,
        [user],
      );
      await client.query(
        `update bot_positions p
            set anchor_session = null, anchor_reason = null, sellable_from_session = null
           from bot_instances i
          where i.bot_account_id = p.bot_account_id and p.anchor_reason = 'policy_cutover'
            and ($1::uuid is null or i.user_id = $1::uuid)`,
        [user],
      );
      await client.query(
        `delete from bot_strategy_conversion_log where $1::uuid is null or user_id = $1::uuid`,
        [user],
      );
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
    return { mode: options.apply ? 'apply' : 'dry-run', ...counts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    if (locked) await client.query('select pg_advisory_unlock(hashtext($1))', [SCRIPT_LOCK]);
    client.release();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    application_name: 'iqx-bot-strategy-v2-rollback',
    connectionString: requireSafeTarget(options.apply),
    max: 2,
  });
  try {
    const summary = await runRollback(pool, options);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
