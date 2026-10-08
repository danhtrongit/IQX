import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { StrategyAlertsEnabledGuard } from '../../src/modules/alerts/strategy-alerts-enabled.guard.js';
import { StrategyAlertsController } from '../../src/modules/alerts/strategy-alerts.controller.js';
import {
  strategyAlertCreateSchema,
  strategyAlertUpdateSchema,
  type StrategyAlertCreateInput,
} from '../../src/modules/alerts/strategy-alerts.schemas.js';
import { StrategyAlertsService } from '../../src/modules/alerts/strategy-alerts.service.js';
import { MAX_ALERTS_PER_USER } from '../../src/modules/alerts/strategy-alerts.store.js';
import { ApiAuthGuard, PremiumGuard } from '../../src/modules/auth/index.js';
import {
  configHash,
  defaultConfig,
  type IndicatorConfig,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import type { SharedConfigReaderPort } from '../../src/modules/strategy-config/strategy-config.ports.js';
import type { Environment } from '../../src/platform/config/environment.js';
import { MemoryAlertStore } from './helpers/strategy-alerts-memory.js';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const SAVED_AT = '2026-01-02T03:00:00.000Z';

const indicator = (config: SharedConfig, id: string): IndicatorConfig => config.indicators[id]!;

function maConfig(options: { buy?: boolean; sell?: boolean; period?: number } = {}): SharedConfig {
  const config = defaultConfig();
  const ma = indicator(config, 'ma');
  ma.master_enabled = true;
  ma.buy.enabled = options.buy ?? true;
  ma.sell.enabled = options.sell ?? true;
  ma.buy.params.period = options.period ?? 5;
  ma.sell.params.period = options.period ?? 5;
  return config;
}

function rsiConfig(): SharedConfig {
  const config = defaultConfig();
  const rsi = indicator(config, 'rsi');
  rsi.master_enabled = true;
  rsi.buy.enabled = true;
  rsi.sell.enabled = true;
  rsi.buy.params.period = 10;
  return config;
}

function setup() {
  const store = new MemoryAlertStore();
  store.catalog = new Set(['FPT', 'VNM', 'HPG', 'ACB']);
  const revisions = new Map<string, SharedConfig>();
  const reads: string[] = [];
  const reader: SharedConfigReaderPort = {
    effectiveFor: () => Promise.resolve(null),
    getRevision: (userId, revision) => {
      reads.push(`${userId}:${revision}`);
      if (revision === 99)
        return Promise.reject(
          new UnprocessableEntityException({
            code: 'LEGACY_CONFIG_NEEDS_REVIEW',
            message: 'legacy',
          }),
        );
      const config = revisions.get(`${userId}:${revision}`);
      return Promise.resolve(
        config
          ? { revision, config, config_hash: configHash(config), saved_at: SAVED_AT, legacy: null }
          : null,
      );
    },
  };
  let granted = new Set(['indicator:ma', 'indicator:rsi']);
  const grants: AcademyGrantsPort = { grantedCapabilities: () => Promise.resolve(granted) };
  const service = new StrategyAlertsService(store, reader, grants);
  return {
    store,
    service,
    revisions,
    reads,
    setGrants: (next: string[]) => (granted = new Set(next)),
  };
}

const create = (patch: Record<string, unknown> = {}): StrategyAlertCreateInput =>
  strategyAlertCreateSchema.parse({
    name: 'Cảnh báo MA',
    source: { kind: 'shared_config', revision: 3 },
    scope: { kind: 'symbols', symbols: ['fpt', 'VNM'] },
    sides: ['buy', 'sell'],
    ...patch,
  });

async function failure(promise: Promise<unknown>): Promise<HttpException> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpException))
    throw new Error(`expected HttpException, got ${String(error)}`);
  return error;
}

describe('StrategyAlertsService.create', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
    env.revisions.set(`${OWNER}:3`, maConfig());
  });

  it('A01 pins the saved revision and watches only Sell, without a position or a Buy side', async () => {
    const alert = await env.service.create(OWNER, create({ sides: ['sell'] }));
    expect(alert).toMatchObject({
      name: 'Cảnh báo MA',
      enabled: true,
      current_version: 1,
      status: 'unchecked',
      version: {
        version: 1,
        sides: ['sell'],
        symbols: ['FPT', 'VNM'],
        scope: { kind: 'symbols' },
        source: { kind: 'shared_config', revision: 3, saved_at: SAVED_AT },
        rule_version: 'iqx-rules-3.0',
        calculation_version: 'iqx-ta-2.0',
        config_hash: configHash(maConfig()),
        sides_detail: {
          buy: { valid: true, watched: false, indicator_ids: ['ma'] },
          sell: { valid: true, watched: true, indicator_ids: ['ma'] },
        },
      },
    });
    expect(alert.versions).toHaveLength(1);
    // Creating an alert only reads the shared config; it never writes one.
    expect(env.reads).toEqual([`${OWNER}:3`]);
  });

  it('A02 refuses a side that is empty in the pinned snapshot, and never enables it', async () => {
    env.revisions.set(`${OWNER}:4`, maConfig({ sell: false }));
    const error = await failure(
      env.service.create(
        OWNER,
        create({ source: { kind: 'shared_config', revision: 4 }, sides: ['sell'] }),
      ),
    );
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'SIDE_NOT_AVAILABLE',
      details: [{ side: 'sell', reason: 'no_valid_conditions' }],
    });
    expect(env.store.alerts.size).toBe(0);
    // Buy alone is fine for the same snapshot.
    await expect(
      env.service.create(
        OWNER,
        create({ source: { kind: 'shared_config', revision: 4 }, sides: ['buy'] }),
      ),
    ).resolves.toMatchObject({ version: { sides: ['buy'] } });
  });

  it('source-preview tells which sides a source can watch before saving', async () => {
    env.revisions.set(`${OWNER}:4`, maConfig({ sell: false }));
    const preview = await env.service.previewSource(OWNER, { kind: 'shared_config', revision: 4 });
    expect(preview.sides_detail.buy.valid).toBe(true);
    expect(preview.sides_detail.sell).toMatchObject({ valid: false, indicator_ids: [] });
    expect(preview.suggested_symbol).toBeNull();
  });

  it('A03 a run source pins the run config (RSI), not the current shared config (MA)', async () => {
    const runId = randomUUID();
    env.store.runs.set(runId, {
      user_id: OWNER,
      id: runId,
      shared_revision: 1,
      symbol: 'FPT',
      start: '2025-01-01',
      end: '2025-12-31',
      created_at: new Date('2026-01-01T00:00:00Z'),
      config: rsiConfig(),
    });
    const alert = await env.service.create(
      OWNER,
      create({
        source: { kind: 'backtest_run', run_id: runId },
        scope: { kind: 'symbols', symbols: ['FPT'] },
      }),
    );
    expect(alert.version.source).toMatchObject({
      kind: 'backtest_run',
      run_id: runId,
      symbol: 'FPT',
    });
    expect(alert.version.config_hash).toBe(configHash(rsiConfig()));
    expect(alert.version.sides_detail.buy.indicator_ids).toEqual(['rsi']);
    const stored = env.store.versionRows[0]!;
    expect(stored.config.indicators.rsi!.master_enabled).toBe(true);
    expect(stored.config.indicators.ma!.master_enabled).toBe(false);
    // The run of another account is not reachable.
    const foreign = await failure(
      env.service.create(
        OTHER,
        create({ source: { kind: 'backtest_run', run_id: runId }, name: 'Khác' }),
      ),
    );
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect(foreign.getResponse()).toMatchObject({ code: 'BACKTEST_RUN_NOT_FOUND' });
  });

  it('keeps the Mua and Bán rules, operators and series of the pinned config untouched (N06)', async () => {
    const config = maConfig();
    indicator(config, 'ma').buy.rules[0]!.op = '<';
    env.revisions.set(`${OWNER}:5`, config);
    await env.service.create(OWNER, create({ source: { kind: 'shared_config', revision: 5 } }));
    expect(env.store.versionRows[0]!.config).toEqual(config);
  });

  it('A04 an alert pinned to revision N is not moved by a newer revision N+1', async () => {
    const first = await env.service.create(OWNER, create());
    env.revisions.set(`${OWNER}:4`, maConfig({ period: 10 }));
    const reread = await env.service.get(OWNER, first.id);
    expect(reread.version.source).toMatchObject({ revision: 3 });
    expect(reread.current_version).toBe(1);
    expect(reread.version.config_hash).toBe(configHash(maConfig()));
    // Only an explicit update moves it, and that creates version 2 (version 1 stays as evidence).
    const moved = await env.service.update(OWNER, first.id, {
      source: { kind: 'shared_config', revision: 4 },
    });
    expect(moved.current_version).toBe(2);
    expect(moved.versions.map((item) => item.version)).toEqual([2, 1]);
    expect(moved.versions[1]!.config_hash).toBe(configHash(maConfig()));
  });

  it('A05 a saved list is pinned by id and the tickers chosen; deleting or editing it changes nothing', async () => {
    const listId = randomUUID();
    env.store.lists.set(listId, {
      user_id: OWNER,
      id: listId,
      name: 'Danh mục A',
      tickers: ['FPT', 'VNM', 'HPG'],
      as_of: '2026-01-02',
    });
    const alert = await env.service.create(
      OWNER,
      create({ scope: { kind: 'saved_list', list_id: listId } }),
    );
    expect(alert.version.scope).toMatchObject({
      kind: 'saved_list',
      list_id: listId,
      list_version: 1,
      list_name: 'Danh mục A',
      list_ticker_count: 3,
    });
    expect(alert.version.symbols).toEqual(['FPT', 'VNM', 'HPG']);
    // The list is deleted (or its source filter changes): the alert keeps its tickers.
    env.store.lists.delete(listId);
    const reread = await env.service.get(OWNER, alert.id);
    expect(reread.version.symbols).toEqual(['FPT', 'VNM', 'HPG']);
    expect(reread.version.scope).toMatchObject({ list_name: 'Danh mục A' });
  });

  it('a list scope can be narrowed to a subset but never widened, and is owner-only', async () => {
    const listId = randomUUID();
    env.store.lists.set(listId, {
      user_id: OWNER,
      id: listId,
      name: 'A',
      tickers: ['FPT', 'VNM'],
      as_of: '2026-01-02',
    });
    const subset = await env.service.create(
      OWNER,
      create({ scope: { kind: 'saved_list', list_id: listId, symbols: ['vnm'] } }),
    );
    expect(subset.version.symbols).toEqual(['VNM']);
    const outside = await failure(
      env.service.create(
        OWNER,
        create({ name: 'B', scope: { kind: 'saved_list', list_id: listId, symbols: ['HPG'] } }),
      ),
    );
    expect(outside.getResponse()).toMatchObject({
      code: 'SYMBOL_NOT_IN_LIST',
      details: [{ symbol: 'HPG' }],
    });
    env.revisions.set(`${OTHER}:3`, maConfig());
    const foreign = await failure(
      env.service.create(OTHER, create({ scope: { kind: 'saved_list', list_id: listId } })),
    );
    expect(foreign.getResponse()).toMatchObject({ code: 'LIST_NOT_FOUND' });
  });

  it('checks the indicator grants of the snapshot, the symbols and the owner of the revision', async () => {
    env.setGrants([]);
    const locked = await failure(env.service.create(OWNER, create()));
    expect(locked).toBeInstanceOf(ForbiddenException);
    expect(locked.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'indicator:ma',
      capabilities: ['indicator:ma'],
    });
    env.setGrants(['indicator:ma']);
    const badSymbol = await failure(
      env.service.create(OWNER, create({ scope: { kind: 'symbols', symbols: ['FPT', 'ZZZ'] } })),
    );
    expect(badSymbol.getResponse()).toMatchObject({
      code: 'SYMBOL_INVALID',
      details: [{ symbol: 'ZZZ' }],
    });
    // Someone else's revision does not exist for this user.
    const missing = await failure(
      env.service.create(OTHER, create({ source: { kind: 'shared_config', revision: 3 } })),
    );
    expect(missing).toBeInstanceOf(NotFoundException);
    expect(missing.getResponse()).toMatchObject({ code: 'REVISION_NOT_FOUND' });
    expect(env.store.alerts.size).toBe(0);
  });

  it('refuses a legacy revision that needs review instead of pinning a partial snapshot', async () => {
    const error = await failure(
      env.service.create(OWNER, create({ source: { kind: 'shared_config', revision: 99 } })),
    );
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'LEGACY_CONFIG_NEEDS_REVIEW' });
  });

  it('rejects an invalid pinned config and requires at least one side', async () => {
    const broken = maConfig();
    indicator(broken, 'ma').buy.params.period = 1; // below the registry minimum
    env.revisions.set(`${OWNER}:6`, broken);
    const error = await failure(
      env.service.create(OWNER, create({ source: { kind: 'shared_config', revision: 6 } })),
    );
    expect(error.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(strategyAlertCreateSchema.safeParse({ ...create(), sides: [] }).success).toBe(false);
  });

  it('A06/I08 names: not blank, unique per user without overwriting, markup kept verbatim', async () => {
    expect(strategyAlertCreateSchema.safeParse({ ...create(), name: '   ' }).success).toBe(false);
    const markup = '<img src=x onerror=alert(1)> & "q"';
    const first = await env.service.create(OWNER, create({ name: markup }));
    expect(first.name).toBe(markup);
    const duplicate = await failure(
      env.service.create(OWNER, create({ name: markup.toUpperCase() })),
    );
    expect(duplicate).toBeInstanceOf(ConflictException);
    expect(duplicate.getResponse()).toMatchObject({ code: 'ALERT_NAME_TAKEN' });
    expect(env.store.alerts.size).toBe(1);
    // Another user may reuse the name.
    env.revisions.set(`${OTHER}:3`, maConfig());
    await expect(env.service.create(OTHER, create({ name: markup }))).resolves.toBeDefined();
  });

  it('is idempotent per key and refuses the key for another payload; caps the number of alerts', async () => {
    const input = create({ idempotency_key: 'alert-key-0001' });
    const a = await env.service.create(OWNER, input);
    const b = await env.service.create(OWNER, input);
    expect(b.id).toBe(a.id);
    expect(env.store.alerts.size).toBe(1);
    const reused = await failure(env.service.create(OWNER, { ...input, name: 'Khác' }));
    expect(reused.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

    for (let i = 1; i < MAX_ALERTS_PER_USER; i += 1)
      await env.service.create(OWNER, create({ name: `Cảnh báo ${i}` }));
    const over = await failure(env.service.create(OWNER, create({ name: 'Một nữa' })));
    expect(over.getResponse()).toMatchObject({ code: 'ALERT_LIMIT_REACHED' });
  });
});

describe('StrategyAlertsService.update', () => {
  let env: ReturnType<typeof setup>;
  let alertId: string;
  beforeEach(async () => {
    env = setup();
    env.revisions.set(`${OWNER}:3`, maConfig());
    env.revisions.set(`${OWNER}:4`, maConfig({ period: 10 }));
    alertId = (await env.service.create(OWNER, create())).id;
  });

  it('A15/N15 renaming never creates a version, resets state or moves the snapshot', async () => {
    const before = env.store.versionRows[0]!;
    const renamed = await env.service.update(OWNER, alertId, {
      name: 'Tên mới',
      source: { kind: 'keep' },
    });
    expect(renamed).toMatchObject({ name: 'Tên mới', current_version: 1 });
    expect(env.store.versionRows).toHaveLength(1);
    expect(env.store.versionRows[0]).toEqual(before);
    expect(renamed.version.config_hash).toBe(configHash(maConfig()));
    // Keeping the same definition is a no-op for versions, even when restated explicitly.
    const same = await env.service.update(OWNER, alertId, {
      scope: { kind: 'symbols', symbols: ['VNM', 'FPT'] },
      sides: ['sell', 'buy'],
    });
    expect(same.current_version).toBe(1);
  });

  it('a changed scope, side set or source creates the next definition version', async () => {
    const scope = await env.service.update(OWNER, alertId, {
      scope: { kind: 'symbols', symbols: ['FPT', 'VNM', 'HPG'] },
    });
    expect(scope.current_version).toBe(2);
    expect(scope.version.symbols).toEqual(['FPT', 'VNM', 'HPG']);
    const sides = await env.service.update(OWNER, alertId, { sides: ['buy'] });
    expect(sides.current_version).toBe(3);
    expect(sides.version.sides).toEqual(['buy']);
    // The earlier versions are immutable evidence.
    expect(sides.versions.map((item) => [item.version, item.sides])).toEqual([
      [3, ['buy']],
      [2, ['buy', 'sell']],
      [1, ['buy', 'sell']],
    ]);
    expect(env.store.versionRows[0]!.symbols).toEqual(['FPT', 'VNM']);
  });

  it('expected_version protects against editing a stale definition', async () => {
    await env.service.update(OWNER, alertId, { scope: { kind: 'symbols', symbols: ['HPG'] } });
    const stale = await failure(
      env.service.update(OWNER, alertId, {
        sides: ['buy'],
        expected_version: 1,
      }),
    );
    expect(stale).toBeInstanceOf(ConflictException);
    expect(stale.getResponse()).toMatchObject({ code: 'ALERT_VERSION_CONFLICT' });
  });

  it('A06/A14 pause only stops this alert; resume starts a fresh observation epoch', async () => {
    const paused = await env.service.update(OWNER, alertId, { enabled: false });
    expect(paused).toMatchObject({ enabled: false, status: 'paused' });
    expect(paused.paused_at).not.toBeNull();
    expect(env.store.alerts.get(alertId)!.observation_epoch).toBe(1);
    const resumed = await env.service.update(OWNER, alertId, { enabled: true });
    expect(resumed).toMatchObject({ enabled: true, paused_at: null, current_version: 1 });
    expect(env.store.alerts.get(alertId)!.observation_epoch).toBe(2);
    // Re-sending the same state is not a resume.
    await env.service.update(OWNER, alertId, { enabled: true });
    expect(env.store.alerts.get(alertId)!.observation_epoch).toBe(2);
  });

  it('editing needs the grants again, but renaming and pausing do not', async () => {
    env.setGrants([]);
    await expect(
      env.service.update(OWNER, alertId, { name: 'Vẫn đổi tên được' }),
    ).resolves.toBeDefined();
    await expect(env.service.update(OWNER, alertId, { enabled: false })).resolves.toBeDefined();
    const edit = await failure(env.service.update(OWNER, alertId, { sides: ['buy'] }));
    expect(edit.getResponse()).toMatchObject({ code: 'CAPABILITY_LOCKED' });
  });

  it('is owner-scoped', async () => {
    const error = await failure(env.service.update(OTHER, alertId, { name: 'x' }));
    expect(error).toBeInstanceOf(NotFoundException);
    await expect(env.service.get(OTHER, alertId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await env.service.list(OTHER)).items).toEqual([]);
  });

  it('delete stops the alert and soft-deletes it, keeping its versions and events', async () => {
    env.store.events.push({
      id: randomUUID(),
      user_id: OWNER,
      alert_id: alertId,
      alert_version: 1,
      alert_name: 'Cảnh báo MA',
      symbol: 'FPT',
      side: 'buy',
      signal_session: '2026-01-05',
      event_kind: 'first_observation',
      message: 'Thỏa điều kiện Mua',
      evaluated_at: new Date('2026-01-05T09:00:00Z'),
      data_version: 'a'.repeat(64),
      config_hash: configHash(maConfig()),
      rule_version: 'iqx-rules-3.0',
      calculation_version: 'iqx-ta-2.0',
      previous_valid_result: null,
      previous_valid_session: null,
      evidence: {
        session: '2026-01-05',
        bar: null,
        indicator_ids: ['ma'],
        indicator_params: {},
        rules: [],
      },
      created_at: new Date('2026-01-05T09:00:01Z'),
    });
    await env.service.remove(OWNER, alertId);
    expect((await env.service.list(OWNER)).items).toEqual([]);
    await expect(env.service.get(OWNER, alertId)).rejects.toBeInstanceOf(NotFoundException);
    expect(env.store.versionRows).toHaveLength(1);
    // A16: history stays readable with its own name and evidence.
    const history = await env.service.listEvents(OWNER, { offset: 0, limit: 50 });
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({
      alert_name: 'Cảnh báo MA',
      side_label: 'Mua',
      message: 'Thỏa điều kiện Mua',
      event_kind_label: 'Đang thỏa ở lần kiểm tra đầu',
    });
    await expect(env.service.remove(OWNER, alertId)).rejects.toBeInstanceOf(NotFoundException);
    // Another account cannot read the event.
    await expect(env.service.getEvent(OTHER, history.items[0]!.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('strategy alert schemas and wiring', () => {
  it('update needs at least one field and rejects unknown keys (no client-side ids or grants)', () => {
    expect(strategyAlertUpdateSchema.safeParse({}).success).toBe(false);
    expect(strategyAlertUpdateSchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(strategyAlertUpdateSchema.safeParse({ name: 'x', user_id: OWNER }).success).toBe(false);
    expect(strategyAlertUpdateSchema.safeParse({ source: { kind: 'keep' } }).success).toBe(true);
    expect(
      strategyAlertCreateSchema.safeParse({ ...create(), allowed_indicators: ['ma'] }).success,
    ).toBe(false);
  });

  it('is Premium, behind the feature flag, and only touches the web history', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StrategyAlertsController)).toEqual([
      StrategyAlertsEnabledGuard,
      ApiAuthGuard,
      PremiumGuard,
    ]);
    const guard = (enabled: boolean) =>
      new StrategyAlertsEnabledGuard({
        get: (key: keyof Environment) => (key === 'STRATEGY_V2_ENABLED' ? enabled : undefined),
      } as unknown as ConfigService<Environment, true>);
    expect(guard(true).canActivate()).toBe(true);
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    // A18: the service has no delivery channel dependency at all (no Telegram/e-mail/push).
    const params = Reflect.getMetadata('design:paramtypes', StrategyAlertsService) as Array<{
      name: string;
    }>;
    expect(params.map((param) => param.name).join(',')).not.toMatch(/Telegram|Mail|Notification/i);
  });
});
