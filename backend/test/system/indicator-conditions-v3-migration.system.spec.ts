import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MIGRATION_KEY,
  ROLLBACK_KEY,
  SCRIPT_LOCK,
  repinnedVersion,
  runMigration,
  type MigrationSummary,
} from '../../scripts/indicator-conditions-v3-migrate.js';
import { runRollback } from '../../scripts/indicator-conditions-v3-rollback.js';
import { currentDraft, practiceEntry } from '../../src/modules/practice/practice.config.js';
import {
  configHash,
  defaultConfigV4,
  isCurrentFormat,
  validateConfig,
  type RowSideConfig,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import {
  nextEffectiveSession,
  tradingDayPredicate,
} from '../../src/modules/strategy-config/strategy-config.calendar.js';
import { preV3Config } from '../unit/helpers/strategy-pre-v3.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// SPEC V3 §6 / design §3.4 (owner decisions 1, 2, 4): the stack migrates an empty database, so
// the test seeds pre-V3 data, runs the 0032 body again to back it up (it is safe to re-run),
// then drives the migrate and rollback scripts through their exported entry points.
const MIGRATION_SQL = new URL('../../migrations/0032_indicator_conditions_v3.sql', import.meta.url);
const HEX = (char: string) => char.repeat(64);
const PAST_SESSION = '2026-01-05';
const FUTURE_SESSION = '2099-01-02';

type Json = Record<string, unknown>;
type Session = Awaited<ReturnType<typeof registerAndLogin>>;

/** 10:00 ICT today: outside the Bot window whenever the suite runs. */
const morning = () => {
  const now = new Date();
  now.setUTCHours(3, 0, 0, 0);
  return now;
};

/** A pre-V3 document with every indicator OFF except the ones `mutate` turns on. */
function oldConfig(revision: number, mutate: (indicators: Json) => void = () => undefined): Json {
  const config = preV3Config(revision);
  const indicators = config.indicators as Json;
  indicators.ma = { ...(indicators.ma as Json), master_enabled: false };
  // Volume kept its params+rules shape (owner decision 4): a valid one is copied verbatim.
  const volume = structuredClone(defaultConfigV4().indicators.volume!) as unknown as Json;
  (volume.buy as Json).params = { lookback: 30, mult: 2 };
  indicators.volume = volume;
  mutate(indicators);
  return config;
}

const maOn = (indicators: Json) => {
  indicators.ma = { ...(indicators.ma as Json), master_enabled: true };
};

describe('system acceptance: indicator conditions V3 data migration (SPEC V3 §6)', () => {
  let stack: SystemStack;
  let pool: Pool;
  const users: Record<'running' | 'suspended' | 'idle' | 'pending' | 'current', Session> =
    {} as never;
  const alerts = {
    shared: randomUUID(),
    run: randomUUID(),
    deleted: randomUUID(),
    own: randomUUID(),
  };
  let runningBefore: Json;

  beforeAll(async () => {
    stack = await startSystemStack({ STRATEGY_V2_ENABLED: 'true' });
    pool = new Pool({ connectionString: stack.databaseUrl, max: 4 });
    for (const key of ['running', 'suspended', 'idle', 'pending', 'current'] as const) {
      users[key] = await registerAndLogin(stack.app, `v3m-${key}`);
    }

    runningBefore = oldConfig(1, maOn);
    await revision(users.running.id, 1, runningBefore, PAST_SESSION);
    await bot(users.running.id, 'active');

    await revision(users.suspended.id, 1, oldConfig(1, maOn), PAST_SESSION);
    await bot(users.suspended.id, 'suspended');

    // Master ON with both tabs OFF: not running, and the reset turns the master OFF.
    await revision(
      users.idle.id,
      1,
      oldConfig(1, (indicators) => {
        indicators.rsi = { ...(indicators.rsi as Json), master_enabled: true };
      }),
      PAST_SESSION,
    );
    await bot(users.idle.id, 'active');

    // Nothing in force yet, but the pending revision would have run from the next session.
    await revision(users.pending.id, 1, oldConfig(1), PAST_SESSION);
    await revision(users.pending.id, 2, oldConfig(2, maOn), FUTURE_SESSION);
    await bot(users.pending.id, 'active');

    // Saved under V3 already: never reset, but its pre-V3 alert is re-pinned to it.
    const own = { ...defaultConfigV4(), revision: 1 };
    await revision(users.current.id, 1, own as unknown as Json, PAST_SESSION);
    await alert(users.current.id, alerts.own, { kind: 'shared_config', revision: 1 });

    await alert(users.running.id, alerts.shared, { kind: 'shared_config', revision: 1 });
    await alert(
      users.running.id,
      alerts.run,
      { kind: 'backtest_run', run_id: randomUUID(), shared_revision: 1 },
      { enabled: false },
    );
    await alert(
      users.running.id,
      alerts.deleted,
      { kind: 'shared_config', revision: 1 },
      {
        deleted: true,
      },
    );
    await stack.query(
      `insert into strategy_alert_events
         (user_id, alert_id, alert_version, alert_name, symbol, side, signal_session, event_kind,
          message, evaluated_at, data_version, config_hash, rule_version, calculation_version,
          evidence)
       values ($1, $2, 1, 'MA', 'FPT', 'buy', '2026-01-05', 'new_signal', 'Tín hiệu Mua',
               now(), $3, $3, 'iqx-rules-3.0', 'iqx-ta-2.0', '{"indicator_params":{}}')`,
      [users.running.id, alerts.shared, HEX('d')],
    );

    await draft(users.running.id, 'rsi', {
      buy: { enabled: false, params: { period: 14 }, ops: { r1: '<' } },
      sell: { enabled: true, params: { period: 14 }, ops: { r1: '>' } },
      hold_max_sessions: 7,
    });
    const volume = practiceEntry('volume')!;
    await draft(users.running.id, 'volume', currentDraft(volume, null));

    // Back up the seeded rows the way 0032 does on a real database.
    await stack.query(await readFile(MIGRATION_SQL, 'utf8'));
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await stack?.close();
  });

  async function revision(userId: string, rev: number, config: Json, session: string) {
    await stack.query(
      `insert into shared_config_revisions
         (user_id, revision, schema_version, rule_version, calculation_version, config,
          config_hash, before_hash, patch, requested_at, actor_id, idempotency_key)
       values ($1, $2, $3, $4, 'iqx-ta-2.0', $5::jsonb, $6, null, '{}', now(), $1, $7)`,
      [
        userId,
        rev,
        config.schema_version,
        config.rule_version,
        JSON.stringify(config),
        configHash(config as unknown as SharedConfig),
        `seed-${rev}`,
      ],
    );
    await stack.query(
      `insert into effective_config_sessions (user_id, revision, effective_session, status)
       values ($1, $2, $3::date, $4)`,
      [userId, rev, session, session === PAST_SESSION ? 'effective' : 'pending'],
    );
  }

  async function bot(userId: string, status: 'active' | 'suspended') {
    const [account] = await stack.query<{ id: string }>(
      `insert into bot_accounts (user_id, initial_cash_vnd, cash_vnd, status, activated_at)
       values ($1, 100000000, 100000000, $2, now()) returning id`,
      [userId, status],
    );
    await stack.query(
      `insert into bot_instances
         (user_id, bot_account_id, strategy_id, strategy_version, execution_model, activated_at)
       values ($1, $2, 'iqx-bot', 1, 'same_session_close', now())`,
      [userId, account!.id],
    );
  }

  async function alert(
    userId: string,
    id: string,
    source: Json,
    options: { enabled?: boolean; deleted?: boolean } = {},
  ) {
    const enabled = options.enabled ?? true;
    await stack.query(
      `insert into strategy_alerts (id, user_id, name, enabled, current_version, paused_at, deleted_at)
       values ($1, $2, $3, $4, 1, $5, $6)`,
      [
        id,
        userId,
        `MA ${id.slice(0, 8)}`,
        enabled,
        enabled ? null : new Date('2026-02-01T00:00:00Z'),
        options.deleted ? new Date('2026-02-02T00:00:00Z') : null,
      ],
    );
    await stack.query(
      `insert into strategy_alert_versions
         (alert_id, version, source, config, config_hash, schema_version, rule_version,
          calculation_version, scope, symbols, sides, definition_hash)
       values ($1, 1, $2::jsonb, $3::jsonb, $4, '2.0', 'iqx-rules-3.0', 'iqx-ta-2.0',
               '{"kind":"symbols"}', array['FPT','VNM'], array['buy','sell'], $5)`,
      [id, JSON.stringify(source), JSON.stringify(oldConfig(1, maOn)), HEX('a'), HEX('b')],
    );
  }

  async function draft(userId: string, indicatorId: string, value: unknown) {
    await stack.query(
      `insert into practice_progress (user_id, indicator_id, set_version, draft)
       values ($1, $2, 'v3-migration-set', $3::jsonb)`,
      [userId, indicatorId, JSON.stringify(value)],
    );
  }

  const counts = async () =>
    (
      await stack.query(
        `select
           (select count(*)::int from shared_config_revisions) as revisions,
           (select count(*)::int from effective_config_sessions) as sessions,
           (select count(*)::int from bot_config_pauses) as pauses,
           (select count(*)::int from strategy_alert_versions) as alert_versions,
           (select count(*)::int from strategy_alert_events) as events,
           (select sum(draft_revision)::int from practice_progress) as draft_revisions,
           (select string_agg(id::text || ':' || current_version, ',' order by id)
              from strategy_alerts) as alert_pins`,
      )
    )[0];

  const revisions = (userId: string) =>
    stack.query<{
      revision: number;
      config: SharedConfig;
      config_hash: string;
      before_hash: string | null;
      patch: Json;
      idempotency_key: string;
      schema_version: string;
      rule_version: string;
      saved_at: Date;
      effective_session: string | null;
      status: string;
    }>(
      `select r.revision, r.config, r.config_hash, r.before_hash, r.patch, r.idempotency_key,
              r.schema_version, r.rule_version, r.saved_at,
              to_char(e.effective_session, 'YYYY-MM-DD') as effective_session, e.status
         from shared_config_revisions r
         left join effective_config_sessions e on e.user_id = r.user_id and e.revision = r.revision
        where r.user_id = $1 order by r.revision`,
      [userId],
    );

  const migrated = {
    configs_migrated: 4,
    configs_already_migrated: 1,
    configs_invalid: 0,
    bots_paused: 2,
    bots_already_paused: 0,
    bots_already_off: 2,
    drafts_reset: 1,
    drafts_already_current: 1,
    drafts_conflicts: 0,
    alerts_repinned: 3,
    alerts_already_current: 0,
    alerts_skipped: 0,
    failed: [],
    invalid: [],
  } satisfies Omit<MigrationSummary, 'apply'>;

  it('M01 refuses inside the Bot window, while a Bot run is running, and while locked', async () => {
    await expect(
      runMigration(pool, { apply: false, now: new Date('2026-10-29T12:00:00Z') }),
    ).rejects.toThrow('between 18:30 and 19:40 ICT');

    await stack.query(
      `insert into bot_run_receipts (user_id, trading_date, status, started_at)
       values ($1, '2026-01-06', 'running', now())`,
      [users.running.id],
    );
    await expect(runMigration(pool, { apply: true, now: morning() })).rejects.toThrow(
      '1 Bot run receipt(s) are still running',
    );
    await expect(runRollback(pool, { apply: true, now: morning() })).rejects.toThrow(
      'still running',
    );
    await stack.query(`delete from bot_run_receipts where user_id = $1`, [users.running.id]);

    const holder = await pool.connect();
    try {
      await holder.query('select pg_advisory_lock(hashtext($1))', [SCRIPT_LOCK]);
      await expect(runMigration(pool, { apply: true, now: morning() })).rejects.toThrow(
        'another indicator-conditions-v3 script is running',
      );
    } finally {
      await holder.query('select pg_advisory_unlock(hashtext($1))', [SCRIPT_LOCK]);
      holder.release();
    }
  });

  it('M02 the dry run reports what --apply does and writes nothing', async () => {
    const before = await counts();
    const summary = await runMigration(pool, { apply: false, now: morning() });
    expect(summary).toEqual({ apply: false, ...migrated });
    expect(await counts()).toEqual(before);
  });

  it('M03 resets every config to the V3 defaults keeping the switches, pauses running Bots, re-pins alerts and resets drafts', async () => {
    const before = await counts();
    const summary = await runMigration(pool, { apply: true, now: morning() });
    expect(summary).toEqual({ apply: true, ...migrated });

    // Running user: one revision appended with the new defaults, switches and Volume kept.
    const [first, second, ...rest] = await revisions(users.running.id);
    expect(rest).toEqual([]);
    expect(second).toMatchObject({
      revision: 2,
      before_hash: first!.config_hash,
      patch: { migration: MIGRATION_KEY },
      idempotency_key: MIGRATION_KEY,
      schema_version: '3.0',
      rule_version: 'iqx-rules-4.0',
    });
    const config = second!.config;
    expect(config.revision).toBe(2);
    expect(isCurrentFormat(config)).toBe(true);
    expect(validateConfig(config)).toEqual([]);
    expect(second!.config_hash).toBe(configHash(config));
    const defaults = defaultConfigV4();
    expect(config.indicators.ma).toEqual({
      master_enabled: true,
      buy: { ...defaults.indicators.ma!.buy, enabled: true },
      sell: { ...defaults.indicators.ma!.sell, enabled: true },
    });
    expect((config.indicators.ma!.buy as RowSideConfig).rules[0]).toMatchObject({
      id: 'ma.price_cross',
      op: 'cross_up',
      period: 20,
    });
    expect(config.indicators.volume).toEqual((runningBefore.indicators as Json).volume);
    expect(config.indicators.rsi).toEqual(defaults.indicators.rsi);
    // Effective from the next session, like any save.
    const weekdays = tradingDayPredicate({ holidays: [] })!;
    expect(second).toMatchObject({
      effective_session: nextEffectiveSession(new Date(second!.saved_at), weekdays),
      status: 'pending',
    });

    // Master ON with both tabs OFF becomes OFF.
    const idle = (await revisions(users.idle.id)).at(-1)!;
    expect(idle.config.indicators.rsi!.master_enabled).toBe(false);
    // The user who already saved under V3 is untouched.
    expect(await revisions(users.current.id)).toHaveLength(1);

    // Owner decision 1: only active Bots with an instance and active conditions are paused.
    const pauses = await stack.query<{ user_id: string }>(
      `select user_id, reason, paused_revision, resume_revision, resumed_at
         from bot_config_pauses order by user_id`,
    );
    expect(pauses).toEqual(
      expect.arrayContaining([
        {
          user_id: users.running.id,
          reason: 'indicator_conditions_v3',
          paused_revision: 2,
          resume_revision: null,
          resumed_at: null,
        },
        {
          user_id: users.pending.id,
          reason: 'indicator_conditions_v3',
          paused_revision: 3,
          resume_revision: null,
          resumed_at: null,
        },
      ]),
    );
    expect(pauses).toHaveLength(2);

    // Owner decision 2: a new version pinned to the migrated revision, state kept.
    const pins = await stack.query<{
      id: string;
      enabled: boolean;
      paused_at: Date | null;
      current_version: number;
      observation_epoch: number;
    }>(`select id, enabled, paused_at, current_version, observation_epoch from strategy_alerts`);
    const pin = (id: string) => pins.find((row) => row.id === id)!;
    expect(pin(alerts.shared)).toMatchObject({
      enabled: true,
      paused_at: null,
      current_version: 2,
    });
    expect(pin(alerts.run)).toMatchObject({
      enabled: false,
      paused_at: new Date('2026-02-01T00:00:00Z'),
      current_version: 2,
    });
    expect(pin(alerts.deleted).current_version).toBe(1);
    expect(pin(alerts.own).current_version).toBe(2);
    expect(pins.every((row) => row.observation_epoch === 1)).toBe(true);

    const [version] = await stack.query<Json>(
      `select source, config, config_hash, schema_version, rule_version, scope, symbols, sides,
              definition_hash
         from strategy_alert_versions where alert_id = $1 and version = 2`,
      [alerts.run],
    );
    const expected = repinnedVersion(
      { scope: { kind: 'symbols' }, symbols: ['FPT', 'VNM'], sides: ['buy', 'sell'] },
      {
        revision: 2,
        config,
        config_hash: second!.config_hash,
        saved_at: new Date(second!.saved_at),
      },
    );
    expect(version).toEqual({
      source: {
        kind: 'shared_config',
        revision: 2,
        saved_at: new Date(second!.saved_at).toISOString(),
        stored_config_hash: second!.config_hash,
      },
      config,
      config_hash: second!.config_hash,
      schema_version: '3.0',
      rule_version: 'iqx-rules-4.0',
      scope: { kind: 'symbols' },
      symbols: ['FPT', 'VNM'],
      sides: ['buy', 'sell'],
      definition_hash: expected.definition_hash,
    });
    const [own] = await stack.query<{ source: Json }>(
      `select source from strategy_alert_versions where alert_id = $1 and version = 2`,
      [alerts.own],
    );
    expect(own!.source).toMatchObject({ kind: 'shared_config', revision: 1 });
    // History: the old versions and events stay as they were.
    const after = await counts();
    expect(after).toMatchObject({
      events: before!.events,
      alert_versions: Number(before!.alert_versions) + 3,
    });
    const [old] = await stack.query<{ rule_version: string }>(
      `select rule_version from strategy_alert_versions where alert_id = $1 and version = 1`,
      [alerts.shared],
    );
    expect(old!.rule_version).toBe('iqx-rules-3.0');

    // Luyện tập: the pre-V3 draft gets the V3 defaults with its switches and hold; Volume stays.
    const drafts = await stack.query<{ indicator_id: string; draft: Json; draft_revision: number }>(
      `select indicator_id, draft, draft_revision from practice_progress where user_id = $1
        order by indicator_id`,
      [users.running.id],
    );
    const rsi = drafts.find((row) => row.indicator_id === 'rsi')!;
    expect(rsi.draft_revision).toBe(2);
    expect(rsi.draft).toEqual(
      currentDraft(practiceEntry('rsi')!, {
        buy: { enabled: false },
        sell: { enabled: true },
        hold_max_sessions: 7,
      }),
    );
    expect(rsi.draft).toMatchObject({
      buy: { enabled: false },
      sell: { enabled: true },
      hold_max_sessions: 7,
    });
    expect(drafts.find((row) => row.indicator_id === 'volume')!.draft_revision).toBe(1);

    // The API reads the migrated document as current.
    const state = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/strategy/shared-config',
      headers: authHeader(users.running.accessToken),
    });
    expect(state.statusCode, state.body).toBe(200);
    expect(state.json()).toMatchObject({ saved_revision: 2, outdated: false });
  });

  it('M04 running the migration again writes nothing', async () => {
    const before = await counts();
    const summary = await runMigration(pool, { apply: true, now: morning() });
    expect(summary).toEqual({
      ...migrated,
      apply: true,
      configs_migrated: 0,
      configs_already_migrated: 5,
      bots_paused: 0,
      bots_already_off: 0,
      drafts_reset: 0,
      drafts_already_current: 2,
      alerts_repinned: 0,
      alerts_already_current: 3,
    });
    expect(await counts()).toEqual(before);
  });

  it('M05 rollback appends the pre-V3 documents, drops the pauses, re-points alerts and restores drafts; twice is a no-op', async () => {
    const dry = await runRollback(pool, { apply: false, now: morning() });
    const restored = {
      configs_restored: 4,
      configs_not_needed: 0,
      configs_without_previous: 1,
      pauses_deleted: 2,
      alerts_restored: 3,
      drafts_restored: 1,
      drafts_conflicts: 0,
      failed: [],
    };
    expect(dry).toEqual({ apply: false, ...restored });

    const summary = await runRollback(pool, { apply: true, now: morning() });
    expect(summary).toEqual({ apply: true, ...restored });

    const rows = await revisions(users.running.id);
    expect(rows).toHaveLength(3);
    const copy = rows[2]!;
    expect(copy).toMatchObject({
      revision: 3,
      before_hash: rows[1]!.config_hash,
      idempotency_key: ROLLBACK_KEY,
      schema_version: '2.0',
      rule_version: 'iqx-rules-3.0',
      patch: { rollback: MIGRATION_KEY, restored_revision: 1 },
    });
    expect(copy.config).toEqual({ ...runningBefore, revision: 3 });
    expect(copy.config_hash).toBe(configHash(copy.config));
    // V3 revisions are never deleted (Backtest runs cascade from them).
    expect(rows[1]!.rule_version).toBe('iqx-rules-4.0');
    expect(await stack.query('select 1 from bot_config_pauses')).toEqual([]);
    const pins = await stack.query<{ current_version: number }>(
      `select current_version from strategy_alerts where id = any($1::uuid[])`,
      [[alerts.shared, alerts.run, alerts.own]],
    );
    expect(pins.map((row) => row.current_version)).toEqual([1, 1, 1]);
    const [rsi] = await stack.query<{ draft: Json; draft_revision: number }>(
      `select draft, draft_revision from practice_progress where user_id = $1 and indicator_id = 'rsi'`,
      [users.running.id],
    );
    expect(rsi).toEqual({
      draft: {
        buy: { enabled: false, params: { period: 14 }, ops: { r1: '<' } },
        sell: { enabled: true, params: { period: 14 }, ops: { r1: '>' } },
        hold_max_sessions: 7,
      },
      draft_revision: 3,
    });

    const before = await counts();
    expect(await runRollback(pool, { apply: true, now: morning() })).toEqual({
      ...restored,
      apply: true,
      configs_restored: 0,
      configs_not_needed: 4,
      pauses_deleted: 0,
      alerts_restored: 0,
      drafts_restored: 0,
    });
    expect(await counts()).toEqual(before);
  });

  it('M06 migrating again after a rollback appends a fresh V3 revision under a new key', async () => {
    const summary = await runMigration(pool, { apply: true, now: morning() });
    expect(summary).toEqual({ apply: true, ...migrated });

    const latest = (await revisions(users.running.id)).at(-1)!;
    expect(latest).toMatchObject({
      revision: 4,
      idempotency_key: `${MIGRATION_KEY}:2`,
      rule_version: 'iqx-rules-4.0',
    });
    // Versions are numbered after the highest one, not after the restored pin.
    const [pin] = await stack.query<{ current_version: number }>(
      `select current_version from strategy_alerts where id = $1`,
      [alerts.shared],
    );
    expect(pin!.current_version).toBe(3);
    const [pause] = await stack.query<{ paused_revision: number }>(
      `select paused_revision from bot_config_pauses where user_id = $1`,
      [users.running.id],
    );
    expect(pause!.paused_revision).toBe(4);
  });
});
