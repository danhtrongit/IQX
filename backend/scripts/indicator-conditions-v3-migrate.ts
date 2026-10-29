/**
 * Indicator conditions V3 data migration (SPEC V3 §6, design §3.4, owner decisions 1, 2 and 4).
 *
 *   node dist/scripts/indicator-conditions-v3-migrate.js            # dry run (default): never writes
 *   node dist/scripts/indicator-conditions-v3-migrate.js --apply    # writes
 *
 * Order: back up the database, deploy the V3 code, apply migration 0032 (backups +
 * `bot_config_pauses`), then run this script outside the Bot window (18:30-19:40 ICT).
 *
 * Per user, in one transaction under the same owner lock as `SharedConfigService.save`:
 * - Shared config: when the latest revision is not in the current format, append revision
 *   max+1 holding the V3 defaults with the user's switches (`master_enabled`, `buy.enabled`,
 *   `sell.enabled`; master ON with both tabs OFF becomes OFF) and Volume copied verbatim
 *   (`resetToCurrentFormat`). Idempotency key `indicator-conditions-v3`, `before_hash` = the
 *   previous hash, effective from the next session like any save. Older revisions are never
 *   updated or deleted (Backtest runs cascade from them).
 * - Bot (owner decision 1): `bot_accounts.status = 'active'`, a `bot_instances` row and active
 *   conditions in the pre-migration config the Bot runs on (the effective revision, or the
 *   pending latest one that would have become effective) → one silent `bot_config_pauses` row.
 *   No notification. Any other Bot is "đang tắt sẵn" and only gets the new defaults.
 * - Strategy alerts (owner decision 2): every live alert whose pinned config is not in the
 *   current format gets a new version pinned to the user's latest current revision (the one just
 *   written), keeping enabled/paused, scope, symbols and sides. Old versions and events stay.
 *
 * Then every Luyện tập draft not in the V3 shape is reset to the V3 defaults keeping
 * `buy.enabled`, `sell.enabled` and `hold_max_sessions`. `practice_runs`, `backtest_runs` and
 * alert events are never touched. Rows changed here are copied into the 0032 backup tables first
 * (ON CONFLICT DO NOTHING), so rows created after 0032 ran can be rolled back too.
 *
 * Re-running is a no-op: users whose latest revision is current, alerts pinned to a current
 * config and V3-shaped drafts are skipped. Writing needs BOTH `--apply` and
 * INDICATOR_V3_MIGRATION_APPROVED=true. Rollback: `indicator-conditions-v3-rollback.ts`.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';

import { definitionHash } from '../src/modules/alerts/strategy-alerts.evaluation.js';
import {
  BOT_CONFIG_PAUSE_REASON,
  botHasActiveConditions,
} from '../src/modules/bots/bot.config-pause.js';
import {
  currentDraft,
  isCurrentPracticeConfig,
  practiceEntry,
} from '../src/modules/practice/practice.config.js';
import type { PracticeConfig } from '../src/modules/practice/practice.types.js';
import {
  CALCULATION_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  configHash,
  isCurrentFormat,
  loadTechnicalRegistry,
  resetToCurrentFormat,
  validateConfig,
  type EngineValidationError,
  type RegistryEntry,
  type SharedConfig,
} from '../src/modules/quant/v2/index.js';
import {
  effectiveStatus,
  nextEffectiveSession,
  tradingDayPredicate,
  vnDate,
  type IsTradingDay,
} from '../src/modules/strategy-config/strategy-config.calendar.js';
import {
  SharedConfigSqlStore,
  type RevisionRow,
} from '../src/modules/strategy-config/strategy-config.repository.js';
import type { SqlClient } from '../src/platform/database/database.service.js';

export const MIGRATION_KEY = 'indicator-conditions-v3';
export const ROLLBACK_KEY = 'indicator-conditions-v3-rollback';
/** Session advisory lock shared by the migrate and rollback scripts: never both at once. */
export const SCRIPT_LOCK = 'indicator-conditions-v3-script';
/** Bot session job window (the EOD run at 19:00 ICT with its margins), in ICT minutes. */
export const BOT_WINDOW = { from: 18 * 60 + 30, to: 19 * 60 + 40 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATABASE_NAME = /^iqx_v2_[a-z0-9_]+$/;

// ------------------------------------------------------------------ arguments and safety

export interface ScriptOptions {
  readonly apply: boolean;
  readonly json: boolean;
  readonly userId: string | null;
}

export function parseArgs(argv: readonly string[]): ScriptOptions {
  let apply = false;
  let json = false;
  let userId: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--json') json = true;
    else if (arg === '--user') {
      userId = argv[(index += 1)] ?? '';
      if (!UUID.test(userId)) throw new Error('--user requires a user UUID');
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { apply, json, userId };
}

export function requireSafeTarget(
  apply: boolean,
  approvalVariable = 'INDICATOR_V3_MIGRATION_APPROVED',
): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Refusing to run: DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing to run: DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing to run: database name must match iqx_v2_*');
  }
  if (apply && process.env[approvalVariable] !== 'true') {
    throw new Error(`Refusing --apply: set ${approvalVariable}=true after approval`);
  }
  return databaseUrl;
}

/** Minutes since midnight in Asia/Ho_Chi_Minh (UTC+7, no daylight saving). */
export function vietnamMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % (24 * 60);
}

/** true inside 18:30-19:40 ICT, when the Bot session job may be running. */
export function inBotWindow(now: Date): boolean {
  const minutes = vietnamMinutes(now);
  return minutes >= BOT_WINDOW.from && minutes < BOT_WINDOW.to;
}

/**
 * Refuses to run inside the Bot window, while a Bot run receipt is `running`, or before
 * migration 0032 created its tables.
 */
export async function preflight(db: SqlClient, now: Date): Promise<void> {
  const [database] = await db.query<{ name: string }>('select current_database() as name');
  if (!DATABASE_NAME.test(String(database?.name ?? ''))) {
    throw new Error('Refusing to run: connected database name must match iqx_v2_*');
  }
  if (inBotWindow(now)) {
    throw new Error('Refusing to run between 18:30 and 19:40 ICT (Bot session window)');
  }
  const [tables] = await db.query<{ missing: string[] }>(
    `select array_remove(array[
       case when to_regclass('bot_config_pauses') is null then 'bot_config_pauses' end,
       case when to_regclass('backup_v3_practice_progress') is null then 'backup_v3_practice_progress' end,
       case when to_regclass('backup_v3_strategy_alerts') is null then 'backup_v3_strategy_alerts' end,
       case when to_regclass('backup_v3_strategy_alert_versions') is null then 'backup_v3_strategy_alert_versions' end
     ], null) as missing`,
  );
  if (tables?.missing.length) {
    throw new Error(
      `Refusing to run: migration 0032 is not applied (missing ${tables.missing.join(', ')})`,
    );
  }
  const [running] = await db.query<{ n: number }>(
    `select count(*)::int as n from bot_run_receipts where status = 'running'`,
  );
  if ((running?.n ?? 0) > 0) {
    throw new Error(`Refusing to run: ${running!.n} Bot run receipt(s) are still running`);
  }
}

// ------------------------------------------------------------------ pure builders

/**
 * The V3 document that replaces a stored one: defaults of every row, the user's switches, Volume
 * verbatim when valid, `revision` set to the new row. `errors` is `validateConfig` without
 * grants (a migrated config only keeps switches the user already had).
 */
export function migratedConfig(
  stored: unknown,
  revision: number,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): { config: SharedConfig; errors: EngineValidationError[] } {
  const config: SharedConfig = { ...resetToCurrentFormat(stored, registry), revision };
  return { config, errors: validateConfig(config, registry) };
}

export type BotFacts = { status: string; has_instance: boolean };

/**
 * Owner decision 1: the Bot is "đang chạy" when its account is active, it has an instance and
 * one of the pre-migration configs it runs on has an indicator with master ON, a tab ON and a
 * rule ON.
 */
export function botRunning(bot: BotFacts | null, configs: readonly unknown[]): boolean {
  if (!bot || bot.status !== 'active' || !bot.has_instance) return false;
  return configs.some((config) => botHasActiveConditions(config));
}

/** The V3 draft that replaces a stored Luyện tập draft, or null when it is already V3-shaped. */
export function practiceDraftReset(
  indicatorId: string,
  draft: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): PracticeConfig | null {
  const entry = practiceEntry(indicatorId, registry);
  if (!entry || isCurrentPracticeConfig(entry, draft)) return null;
  return currentDraft(entry, draft);
}

export type AlertScopeValue = { kind: string; list_id?: string; [key: string]: unknown };

export type RepinnedVersion = {
  source: { kind: 'shared_config'; revision: number; saved_at: string; stored_config_hash: string };
  config: SharedConfig;
  config_hash: string;
  schema_version: string;
  rule_version: string;
  calculation_version: string;
  scope: AlertScopeValue;
  symbols: string[];
  sides: string[];
  definition_hash: string;
};

/**
 * Owner decision 2: the alert version pinned to a shared-config revision, keeping the watched
 * scope, symbols and sides. The source and hashes are built as `StrategyAlertService` builds a
 * version from a shared-config source.
 */
export function repinnedVersion(
  current: { scope: AlertScopeValue; symbols: readonly string[]; sides: readonly string[] },
  revision: { revision: number; config: SharedConfig; config_hash: string; saved_at: Date },
): RepinnedVersion {
  const sides = [...new Set(current.sides)].sort();
  const symbols = [...current.symbols];
  const scope = current.scope;
  return {
    source: {
      kind: 'shared_config',
      revision: revision.revision,
      saved_at: revision.saved_at.toISOString(),
      stored_config_hash: revision.config_hash,
    },
    config: revision.config,
    config_hash: revision.config_hash,
    schema_version: SCHEMA_VERSION,
    rule_version: RULE_VERSION,
    calculation_version: CALCULATION_VERSION,
    scope,
    symbols,
    sides,
    definition_hash: definitionHash({
      config_hash: revision.config_hash,
      symbols,
      sides,
      scope:
        scope.kind === 'saved_list' ? { kind: scope.kind, list_id: String(scope.list_id) } : scope,
    }),
  };
}

/** `base` when unused by this owner, otherwise `base:2`, `base:3`… (a migrate/rollback cycle). */
export function freeIdempotencyKey(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}:${n}`)) return `${base}:${n}`;
}

// ------------------------------------------------------------------ shared SQL helpers

export async function usedIdempotencyKeys(
  db: SqlClient,
  userId: string,
  base: string,
): Promise<Set<string>> {
  const rows = await db.query<{ key: string }>(
    `select idempotency_key as key from shared_config_revisions
      where user_id = $1 and (idempotency_key = $2 or idempotency_key like $2 || ':%')`,
    [userId, base],
  );
  return new Set(rows.map((row) => row.key));
}

/**
 * Appends one revision written by a script and its effective session, computed like
 * `SharedConfigService.save` (first trading session after the save date, ICT).
 */
export async function appendScriptRevision(
  db: SqlClient,
  input: {
    userId: string;
    previous: RevisionRow;
    config: SharedConfig;
    configHash: string;
    schemaVersion: string;
    ruleVersion: string;
    calculationVersion: string;
    patch: Record<string, unknown>;
    keyBase: string;
    now: Date;
    isTradingDay: IsTradingDay | null;
  },
): Promise<{ revision: number; saved_at: Date; effective_session: string | null }> {
  const store = new SharedConfigSqlStore(db);
  const revision = input.previous.revision + 1;
  const key = freeIdempotencyKey(
    input.keyBase,
    await usedIdempotencyKeys(db, input.userId, input.keyBase),
  );
  const { saved_at: savedAt } = await store.insertRevision({
    user_id: input.userId,
    revision,
    schema_version: input.schemaVersion,
    rule_version: input.ruleVersion,
    calculation_version: input.calculationVersion,
    config: input.config,
    config_hash: input.configHash,
    before_hash: input.previous.config_hash,
    // The column is typed as an indicator patch; scripts record what wrote the revision.
    patch: input.patch as unknown as RevisionRow['patch'],
    requested_at: input.now,
    actor_id: input.userId,
    idempotency_key: key,
  });
  const effectiveSession = input.isTradingDay
    ? nextEffectiveSession(savedAt, input.isTradingDay)
    : null;
  await store.insertEffectiveSession({
    user_id: input.userId,
    revision,
    effective_session: effectiveSession,
    status: effectiveStatus(effectiveSession, input.now),
  });
  return { revision, saved_at: savedAt, effective_session: effectiveSession };
}

export async function activeTradingDay(db: SqlClient): Promise<IsTradingDay | null> {
  return tradingDayPredicate(await new SharedConfigSqlStore(db).activeCalendar());
}

// ------------------------------------------------------------------ per-user migration

export type BotOutcome = 'paused' | 'already_paused' | 'already_off' | 'no_bot';

export interface UserOutcome {
  readonly userId: string;
  readonly config: 'migrated' | 'already_current' | 'invalid' | 'no_revision';
  /** The revision alerts are pinned to: the one written, or the user's latest current one. */
  readonly revision: number | null;
  readonly bot: BotOutcome | null;
  readonly alertsRepinned: number;
  readonly alertsAlreadyCurrent: number;
  readonly alertsSkipped: number;
  readonly errors?: readonly EngineValidationError[];
}

export interface MigrationContext {
  readonly apply: boolean;
  readonly now: Date;
  readonly registry: readonly RegistryEntry[];
  readonly isTradingDay: IsTradingDay | null;
}

type AlertVersionFacts = {
  id: string;
  current_version: number;
  config: unknown;
  scope: AlertScopeValue;
  symbols: string[];
  sides: string[];
};

export async function migrateUser(
  db: SqlClient,
  userId: string,
  context: MigrationContext,
): Promise<UserOutcome> {
  const store = new SharedConfigSqlStore(db);
  if (context.apply) await store.lockOwner(userId);
  const latest = await store.latestRevision(userId);
  const empty = { alertsRepinned: 0, alertsAlreadyCurrent: 0, alertsSkipped: 0 };
  if (!latest) return { userId, config: 'no_revision', revision: null, bot: null, ...empty };

  let config: UserOutcome['config'];
  let bot: BotOutcome | null = null;
  // The current revision alerts are pinned to; null when none is usable.
  let target: {
    revision: number;
    config: SharedConfig;
    config_hash: string;
    saved_at: Date;
  } | null;

  if (isCurrentFormat(latest.config, context.registry)) {
    config = 'already_current';
    target = validateConfig(latest.config, context.registry).length
      ? null
      : {
          revision: latest.revision,
          config: latest.config,
          config_hash: latest.config_hash,
          saved_at: latest.saved_at,
        };
  } else {
    const revision = latest.revision + 1;
    const built = migratedConfig(latest.config, revision, context.registry);
    if (built.errors.length) {
      return {
        userId,
        config: 'invalid',
        revision: null,
        bot: null,
        ...empty,
        errors: built.errors,
      };
    }
    config = 'migrated';
    const hash = configHash(built.config);

    // Owner decision 1 is judged on the configs the Bot runs on BEFORE this revision exists.
    const effective = await store.effectiveRevision(userId, vnDate(context.now));
    const runsOn = [effective?.config];
    if (latest.revision !== effective?.revision) runsOn.push(latest.config);
    const facts = await db.query<BotFacts>(
      `select a.status,
              exists (select 1 from bot_instances i where i.user_id = a.user_id) as has_instance
         from bot_accounts a where a.user_id = $1`,
      [userId],
    );
    const running = botRunning(facts[0] ?? null, runsOn);

    let savedAt = context.now;
    if (context.apply) {
      ({ saved_at: savedAt } = await appendScriptRevision(db, {
        userId,
        previous: latest,
        config: built.config,
        configHash: hash,
        schemaVersion: SCHEMA_VERSION,
        ruleVersion: RULE_VERSION,
        calculationVersion: CALCULATION_VERSION,
        patch: { migration: MIGRATION_KEY },
        keyBase: MIGRATION_KEY,
        now: context.now,
        isTradingDay: context.isTradingDay,
      }));
    }
    target = { revision, config: built.config, config_hash: hash, saved_at: savedAt };

    if (!facts[0]) bot = 'no_bot';
    else if (!running) bot = 'already_off';
    else if (context.apply) {
      const inserted = await db.query(
        `insert into bot_config_pauses (user_id, reason, paused_revision)
         values ($1, $2, $3)
         on conflict (user_id) do nothing
         returning user_id`,
        [userId, BOT_CONFIG_PAUSE_REASON, revision],
      );
      bot = inserted.length ? 'paused' : 'already_paused';
    } else {
      const existing = await db.query('select 1 from bot_config_pauses where user_id = $1', [
        userId,
      ]);
      bot = existing.length ? 'already_paused' : 'paused';
    }
  }

  const alerts = await db.query<AlertVersionFacts>(
    `select a.id, a.current_version, v.config, v.scope, v.symbols, v.sides
       from strategy_alerts a
       join strategy_alert_versions v on v.alert_id = a.id and v.version = a.current_version
      where a.user_id = $1 and a.deleted_at is null
      order by a.created_at, a.id
      ${context.apply ? 'for update of a' : ''}`,
    [userId],
  );
  let alertsRepinned = 0;
  let alertsAlreadyCurrent = 0;
  let alertsSkipped = 0;
  for (const alert of alerts) {
    if (isCurrentFormat(alert.config, context.registry)) {
      alertsAlreadyCurrent += 1;
      continue;
    }
    if (!target) {
      alertsSkipped += 1;
      continue;
    }
    alertsRepinned += 1;
    if (!context.apply) continue;
    const version = repinnedVersion(alert, target);
    await db.query(
      `insert into backup_v3_strategy_alerts select * from strategy_alerts where id = $1
       on conflict (id) do nothing`,
      [alert.id],
    );
    await db.query(
      `insert into backup_v3_strategy_alert_versions
       select * from strategy_alert_versions where alert_id = $1
       on conflict (alert_id, version) do nothing`,
      [alert.id],
    );
    // max+1, not current+1: after a rollback the alert points back at an older version.
    const [next] = await db.query<{ version: number }>(
      `select coalesce(max(version), 0)::int + 1 as version
         from strategy_alert_versions where alert_id = $1`,
      [alert.id],
    );
    await db.query(
      `insert into strategy_alert_versions
         (alert_id, version, source, config, config_hash, schema_version, rule_version,
          calculation_version, scope, symbols, sides, definition_hash)
       values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9::jsonb, $10::text[], $11::text[], $12)`,
      [
        alert.id,
        next!.version,
        JSON.stringify(version.source),
        JSON.stringify(version.config),
        version.config_hash,
        version.schema_version,
        version.rule_version,
        version.calculation_version,
        JSON.stringify(version.scope),
        version.symbols,
        version.sides,
        version.definition_hash,
      ],
    );
    // enabled, paused_at and the observation epoch are kept: the alert goes on as it was.
    await db.query(
      `update strategy_alerts set current_version = $2, updated_at = now() where id = $1`,
      [alert.id, next!.version],
    );
  }

  return {
    userId,
    config,
    revision: target?.revision ?? null,
    bot,
    alertsRepinned,
    alertsAlreadyCurrent,
    alertsSkipped,
  };
}

// ------------------------------------------------------------------ Luyện tập drafts

export interface DraftsResult {
  reset: number;
  alreadyCurrent: number;
  /** Changed by the user between the read and the write; a re-run picks them up. */
  conflicts: number;
  unsupported: number;
}

type DraftRow = { id: string; indicator_id: string; draft: unknown; draft_revision: number };

export async function migrateDrafts(
  inTransaction: Transaction,
  read: SqlClient,
  context: MigrationContext,
  userId: string | null,
): Promise<DraftsResult> {
  const result: DraftsResult = { reset: 0, alreadyCurrent: 0, conflicts: 0, unsupported: 0 };
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await read.query<DraftRow>(
      `select id, indicator_id, draft, draft_revision from practice_progress
        where id > $1::uuid and ($2::uuid is null or user_id = $2::uuid)
        order by id limit 500`,
      [after, userId],
    );
    if (!rows.length) return result;
    after = rows.at(-1)!.id;
    for (const row of rows) {
      if (!practiceEntry(row.indicator_id, context.registry)) {
        result.unsupported += 1;
        continue;
      }
      const draft = practiceDraftReset(row.indicator_id, row.draft, context.registry);
      if (!draft) {
        result.alreadyCurrent += 1;
        continue;
      }
      if (!context.apply) {
        result.reset += 1;
        continue;
      }
      const updated = await inTransaction(async (tx) => {
        await tx.query(
          `insert into backup_v3_practice_progress
             (user_id, indicator_id, set_version, draft, draft_revision)
           select user_id, indicator_id, set_version, draft, draft_revision
             from practice_progress where id = $1 and draft_revision = $2
           on conflict (user_id, indicator_id, set_version) do nothing`,
          [row.id, row.draft_revision],
        );
        return tx.query(
          `update practice_progress
              set draft = $3::jsonb, draft_revision = draft_revision + 1, updated_at = now()
            where id = $1 and draft_revision = $2
            returning id`,
          [row.id, row.draft_revision, JSON.stringify(draft)],
        );
      });
      if (updated.length) result.reset += 1;
      else result.conflicts += 1;
    }
  }
}

// ------------------------------------------------------------------ run

export interface MigrationSummary {
  readonly apply: boolean;
  readonly configs_migrated: number;
  readonly configs_already_migrated: number;
  readonly configs_invalid: number;
  readonly bots_paused: number;
  readonly bots_already_paused: number;
  readonly bots_already_off: number;
  readonly drafts_reset: number;
  readonly drafts_already_current: number;
  readonly drafts_conflicts: number;
  readonly alerts_repinned: number;
  readonly alerts_already_current: number;
  readonly alerts_skipped: number;
  readonly failed: ReadonlyArray<{ userId: string; error: string }>;
  readonly invalid: ReadonlyArray<{ userId: string; errors: readonly EngineValidationError[] }>;
}

export function summarize(
  apply: boolean,
  users: readonly UserOutcome[],
  drafts: DraftsResult,
  failed: ReadonlyArray<{ userId: string; error: string }>,
): MigrationSummary {
  const count = (predicate: (user: UserOutcome) => boolean) => users.filter(predicate).length;
  const sum = (pick: (user: UserOutcome) => number) =>
    users.reduce((total, user) => total + pick(user), 0);
  return {
    apply,
    configs_migrated: count((user) => user.config === 'migrated'),
    configs_already_migrated: count((user) => user.config === 'already_current'),
    configs_invalid: count((user) => user.config === 'invalid'),
    bots_paused: count((user) => user.bot === 'paused'),
    bots_already_paused: count((user) => user.bot === 'already_paused'),
    bots_already_off: count((user) => user.bot === 'already_off'),
    drafts_reset: drafts.reset,
    drafts_already_current: drafts.alreadyCurrent,
    drafts_conflicts: drafts.conflicts,
    alerts_repinned: sum((user) => user.alertsRepinned),
    alerts_already_current: sum((user) => user.alertsAlreadyCurrent),
    alerts_skipped: sum((user) => user.alertsSkipped),
    failed,
    invalid: users
      .filter((user) => user.config === 'invalid')
      .map((user) => ({ userId: user.userId, errors: user.errors ?? [] })),
  };
}

export function formatSummary(summary: MigrationSummary): string {
  const lines = [
    summary.apply
      ? 'MODE: APPLY (writes)'
      : 'MODE: DRY RUN (no writes; counts are what --apply would do)',
    `configs migrated: ${summary.configs_migrated}`,
    `configs already migrated: ${summary.configs_already_migrated}`,
    `configs invalid (not written): ${summary.configs_invalid}`,
    `bots paused: ${summary.bots_paused}`,
    `bots already paused: ${summary.bots_already_paused}`,
    `bots already off: ${summary.bots_already_off}`,
    `drafts reset: ${summary.drafts_reset}`,
    `drafts already current: ${summary.drafts_already_current}`,
    `drafts changed concurrently (re-run): ${summary.drafts_conflicts}`,
    `alerts re-pinned: ${summary.alerts_repinned}`,
    `alerts already current: ${summary.alerts_already_current}`,
    `alerts skipped (no usable current revision): ${summary.alerts_skipped}`,
    `users failed: ${summary.failed.length}`,
  ];
  for (const item of summary.invalid) {
    lines.push(`invalid ${item.userId}: ${item.errors.map((error) => error.message).join(' | ')}`);
  }
  for (const item of summary.failed) lines.push(`failed ${item.userId}: ${item.error}`);
  return lines.join('\n');
}

export type Transaction = <T>(operation: (tx: SqlClient) => Promise<T>) => Promise<T>;

export function sqlClientOf(client: PoolClient): SqlClient {
  return {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<Row[]> => (await client.query(text, values ? [...values] : undefined)).rows as Row[],
  };
}

/** Autocommit reads straight on the pool (each statement sees the latest committed rows). */
export function poolClientOf(pool: Pool): SqlClient {
  return {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<Row[]> => (await pool.query(text, values ? [...values] : undefined)).rows as Row[],
  };
}

export function transactionOn(pool: Pool, readOnly = false): Transaction {
  return async (operation) => {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      const value = await operation(sqlClientOf(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
}

/**
 * Runs `operation` while holding the script's session advisory lock on a dedicated connection,
 * after the preflight checks. Throws when another migrate/rollback run holds the lock.
 */
export async function withScriptLock<T>(
  pool: Pool,
  now: Date,
  operation: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const db = sqlClientOf(client);
  let locked = false;
  try {
    const [lock] = await db.query<{ ok: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as ok',
      [SCRIPT_LOCK],
    );
    locked = lock?.ok === true;
    if (!locked)
      throw new Error('Refusing to run: another indicator-conditions-v3 script is running');
    await preflight(db, now);
    return await operation();
  } finally {
    if (locked) await client.query('select pg_advisory_unlock(hashtext($1))', [SCRIPT_LOCK]);
    client.release();
  }
}

export async function runMigration(
  pool: Pool,
  options: { apply: boolean; now?: Date; userId?: string | null },
): Promise<MigrationSummary> {
  const now = options.now ?? new Date();
  const userId = options.userId ?? null;
  return withScriptLock(pool, now, async () => {
    const write = transactionOn(pool);
    const run = options.apply ? write : transactionOn(pool, true);
    const read = poolClientOf(pool);
    const registry = loadTechnicalRegistry();
    const users = (
      await read.query<{ user_id: string }>(
        `select distinct user_id from shared_config_revisions
          where ($1::uuid is null or user_id = $1::uuid) order by user_id`,
        [userId],
      )
    ).map((row) => row.user_id);
    const isTradingDay = await activeTradingDay(read);
    const context: MigrationContext = { apply: options.apply, now, registry, isTradingDay };

    const outcomes: UserOutcome[] = [];
    const failed: Array<{ userId: string; error: string }> = [];
    for (const id of users) {
      try {
        outcomes.push(await run((tx) => migrateUser(tx, id, context)));
      } catch (error) {
        failed.push({ userId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const drafts = await migrateDrafts(write, read, context, userId);
    return summarize(options.apply, outcomes, drafts, failed);
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    application_name: 'iqx-indicator-conditions-v3-migrate',
    connectionString: requireSafeTarget(options.apply),
    max: 3,
  });
  try {
    const summary = await runMigration(pool, { apply: options.apply, userId: options.userId });
    process.stdout.write(
      options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatSummary(summary)}\n`,
    );
    if (summary.failed.length || summary.invalid.length || summary.drafts_conflicts) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
