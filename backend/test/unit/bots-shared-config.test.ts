import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import {
  BOT_RULE_HASH,
  BOT_RULE_SNAPSHOT,
  BotService,
  botRuleReceipt,
  canonicalHash,
  sharedConfigBuyBlock,
  sharedConfigExitReason,
  snapshotHash,
  verifyRuleReceipt,
  type BotMarketSnapshotInput,
  type BotSharedConfigSignals,
  type BotSnapshotProvider,
  type BotSnapshotSymbol,
} from '../../src/modules/bots/index.js';
import type { Environment } from '../../src/platform/config/environment.js';
import type { DatabaseService } from '../../src/platform/database/index.js';
import type { QuantMarketDataProvider } from '../../src/modules/quant/quant.types.js';
import { configHash, defaultConfig, type SharedConfig } from '../../src/modules/quant/v2/index.js';
import type {
  EffectiveSharedConfig,
  SharedConfigReaderPort,
} from '../../src/modules/strategy-config/strategy-config.ports.js';

/** Golden Bot v1 rule hash before bot-v2; flag-off receipts must keep it byte for byte. */
const GOLDEN_V1_RULE_HASH = '73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e';

const SESSION = '2026-09-23';
const USER = '00000000-0000-4000-8000-000000000001';
const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';

type Row = Record<string, unknown>;

/** In-memory stand-in for the SQL BotService issues during one account session. */
class FakeBotDatabase {
  cash = '95000000';
  receipts: Row[] = [];
  snapshots: Row[] = [];
  positions: Row[];
  executions: Row[] = [];
  decisions: Row[] = [];
  receiptInserts: unknown[][] = [];

  constructor(positions: Row[]) {
    this.positions = positions.map((row) => ({ ...row }));
  }

  transaction<T>(operation: (client: FakeBotDatabase) => Promise<T>): Promise<T> {
    return operation(this);
  }

  query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return Promise.resolve(this.handle(text.replace(/\s+/g, ' ').trim(), values) as T[]);
  }

  private context(): Row {
    return {
      id: 'instance-1',
      user_id: USER,
      bot_account_id: ACCOUNT,
      strategy_id: 'iqx_standard',
      strategy_version: 1,
      execution_model: 'same_session_close',
      cap6_graduated_at: '2026-01-01T00:00:00Z',
      activated_at: '2026-01-01T00:00:00Z',
      account_id: ACCOUNT,
      account_user_id: USER,
      initial_cash_vnd: '100000000',
      cash_vnd: this.cash,
      account_status: 'active',
      account_activated_at: '2026-01-01T00:00:00Z',
    };
  }

  private receipt(id: unknown): Row {
    const row = this.receipts.find((item) => item.id === id);
    if (!row) throw new Error(`unknown receipt ${String(id)}`);
    return row;
  }

  private handle(sql: string, v: readonly unknown[]): Row[] {
    if (sql.includes('from bot_instances i join bot_accounts a')) return [this.context()];
    if (sql.startsWith('select * from bot_run_receipts where user_id = $1')) {
      return this.receipts.filter((row) => row.user_id === v[0] && row.trading_date === v[1]);
    }
    if (sql.startsWith('select * from bot_run_receipts where id = $1')) return [this.receipt(v[0])];
    if (sql.startsWith('insert into bot_run_receipts')) {
      this.receiptInserts.push([...v]);
      const row: Row = {
        id: v[0],
        user_id: v[1],
        trading_date: v[2],
        status: 'running',
        started_at: v[3],
        completed_at: null,
        issues: [],
        bot_account_id: v[4],
        strategy_id: v[5],
        strategy_version: v[6],
        execution_model: v[7],
        rule_snapshot: JSON.parse(String(v[8])),
        rule_hash: v[9],
        blocked_symbols_at_start: JSON.parse(String(v[10])),
        source_snapshot_hash: null,
        nav_basis_vnd: null,
        buy_count: 0,
        sell_count: 0,
        reconciled_at: null,
      };
      this.receipts.push(row);
      return [row];
    }
    if (sql.startsWith('select symbol from bot_positions')) {
      return this.positions
        .filter((row) => row.status === 'open')
        .map((row) => ({ symbol: row.symbol }))
        .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    }
    if (sql.startsWith('select exists(select 1 from bot_market_snapshots')) {
      return [{ exists: this.snapshots.some((row) => row.bot_run_id === v[0]) }];
    }
    if (sql.startsWith('insert into bot_market_snapshots')) {
      if (this.snapshots.some((row) => row.bot_run_id === v[1])) return [];
      this.snapshots.push({
        id: v[0],
        bot_run_id: v[1],
        trading_date: v[2],
        buy_inputs_complete: v[6],
        snapshot_hash: v[7],
        payload: JSON.parse(String(v[8])),
      });
      return [{ snapshot_hash: v[7] }];
    }
    if (sql.startsWith('select snapshot_hash from bot_market_snapshots')) {
      return this.snapshots.filter((row) => row.bot_run_id === v[0]);
    }
    if (sql.startsWith('update bot_run_receipts set source_snapshot_hash')) {
      const row = this.receipt(v[0]);
      row.source_snapshot_hash ??= v[1];
      return [];
    }
    if (sql.startsWith('select * from bot_market_snapshots where bot_run_id')) {
      return this.snapshots.filter((row) => row.bot_run_id === v[0]);
    }
    if (sql.includes('from bot_accounts a where a.id = $1')) return [{ valid: true }];
    if (sql.startsWith('select * from bot_positions where bot_account_id = $1 and symbol = any')) {
      const symbols = v[1] as string[];
      return this.positions.filter(
        (row) =>
          symbols.includes(String(row.symbol)) &&
          (row.status === 'open' || row.closed_session === v[2]),
      );
    }
    if (sql.startsWith('update bot_run_receipts set nav_basis_vnd')) {
      this.receipt(v[0]).nav_basis_vnd = v[1];
      return [];
    }
    if (sql.startsWith('select net_cash_delta_vnd')) {
      return this.executions.filter((row) => row.idempotency_key === v[0]);
    }
    if (sql.startsWith('insert into bot_executions')) {
      const side = sql.includes("'sell'") ? 'sell' : 'buy';
      this.executions.push({
        id: v[0],
        bot_run_id: v[1],
        symbol: v[4],
        side,
        qty: v[5],
        price_vnd: v[6],
        fee_vnd: v[10],
        tax_vnd: side === 'sell' ? v[11] : '0',
        net_cash_delta_vnd: side === 'sell' ? v[12] : v[11],
        idempotency_key: side === 'sell' ? v[14] : v[13],
        reason: side === 'sell' ? v[16] : 'bought',
      });
      return [];
    }
    if (sql.startsWith('insert into bot_cash_ledger')) return [];
    if (sql.startsWith('update bot_positions set qty_open = 0')) {
      const row = this.positions.find((item) => item.id === v[0])!;
      Object.assign(row, { qty_open: 0, status: 'closed', closed_session: v[1] });
      return [];
    }
    if (sql.startsWith('insert into bot_decisions')) {
      if (!this.decisions.some((row) => row.key === v[2])) {
        this.decisions.push({
          key: v[2],
          symbol: v[3],
          action: v[4],
          reason_code: v[5],
          reason: v[6],
          threshold_vnd: v[12],
        });
      }
      return [];
    }
    if (sql.startsWith('select id, symbol, side, fee_vnd, tax_vnd from bot_executions')) {
      return this.executions.filter((row) => row.bot_run_id === v[0]);
    }
    if (sql.startsWith('select exists(select 1 from bot_positions')) {
      return [
        {
          exists: this.positions.some((row) => row.symbol === v[1] && row.status === 'open'),
        },
      ];
    }
    if (sql.startsWith('insert into bot_positions')) {
      this.positions.push({
        id: v[0],
        bot_account_id: v[1],
        symbol: v[2],
        qty_open: v[3],
        stop_loss_vnd: v[9],
        take_profit_vnd: v[10],
        status: 'open',
        closed_session: null,
        filter_ids: JSON.parse(String(v[13])),
        source_refs: JSON.parse(String(v[14])),
      });
      return [];
    }
    if (
      sql.startsWith("select * from bot_positions where bot_account_id = $1 and status = 'open'")
    ) {
      return this.positions.filter((row) => row.status === 'open');
    }
    if (sql.startsWith('insert into bot_nav_daily')) return [];
    if (sql.startsWith('update bot_accounts set cash_vnd')) {
      this.cash = String(v[1]);
      return [];
    }
    if (sql.startsWith('select count(*)::text as count from bot_executions')) {
      const count = this.executions.filter(
        (row) => row.bot_run_id === v[0] && row.side === 'sell',
      ).length;
      return [{ count: String(count) }];
    }
    if (sql.startsWith('update bot_run_receipts set status = $2')) {
      const row = this.receipt(v[0]);
      Object.assign(row, {
        status: v[1],
        completed_at: v[2],
        issues: JSON.parse(String(v[3])),
        buy_count: v[4],
        sell_count: v[5],
      });
      return [row];
    }
    if (sql.startsWith("update bot_run_receipts set status = 'failed'")) {
      const row = this.receipt(v[0]);
      Object.assign(row, {
        status: 'failed',
        completed_at: v[1],
        issues: JSON.parse(String(v[2])),
      });
      return [row];
    }
    throw new Error(`Unhandled SQL in fake: ${sql.slice(0, 120)}`);
  }
}

const HOLD_POSITION: Row = {
  id: 'position-hold',
  bot_account_id: ACCOUNT,
  symbol: 'HOLD',
  qty_open: 100,
  entry_price_vnd: '50000',
  entry_value_vnd: '5000000',
  entry_fee_vnd: '7500',
  amplitude_at_entry_vnd: '1000',
  amplitude_source_ref: 'l1:fixture',
  stop_loss_vnd: '48000',
  take_profit_vnd: '54000',
  opened_session: '2026-09-01',
  closed_session: null,
  status: 'open',
  filter_ids: ['f1'],
  source_refs: {},
};

function candidate(): BotSnapshotSymbol {
  return {
    close_vnd: '50000',
    close_is_official: true,
    trading_value_avg20_vnd: '1000000000',
    filter_ids: ['f1', 'f2'],
    security_status_verified: true,
    tradable_security_status: true,
    l1_amplitude_vnd: '1000.0000',
    l1_amplitude_source_ref: 'l1:fixture',
    layers: Object.fromEntries(
      ['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc'].map((key) => [
        key,
        { verdict: 'ok', raw_level: 'strong', is_very_negative: false, source_ref: `fx:${key}` },
      ]),
    ),
    source_refs: { fixture: true },
  };
}

function snapshotInput(holdClose = '50000'): BotMarketSnapshotInput {
  return {
    trading_date: SESSION,
    data_version: 'fixture-v1',
    close_is_official: true,
    buy_inputs_complete: true,
    symbols: {
      AAA: candidate(),
      HOLD: { close_vnd: holdClose, close_is_official: true },
    },
    fee_rules: {
      buy_fee_rate_bps: 15,
      sell_fee_rate_bps: 15,
      sell_tax_rate_bps: 10,
      board_lot_size: 100,
      source_ref: 'fixture:fees',
    },
    vnindex: '1250.5',
  };
}

type Trend = 'up' | 'down' | 'stale';

/** 60 daily bars ending on SESSION (or one day earlier for `stale`). */
function history(trend: Trend) {
  const end = new Date(`${SESSION}T00:00:00Z`);
  if (trend === 'stale') end.setUTCDate(end.getUTCDate() - 1);
  return Array.from({ length: 60 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (59 - index));
    const close = trend === 'down' ? 20_000 - index * 100 : 10_000 + index * 100;
    return {
      time: date.toISOString().slice(0, 10),
      open: close,
      high: close + 50,
      low: close - 50,
      close,
      volume: 1_000_000,
    };
  });
}

function marketData(trends: Record<string, Trend>) {
  const getHistoricalOhlcv = vi.fn((symbol: string) => {
    const trend = trends[symbol];
    if (!trend) return Promise.reject(new Error(`no data for ${symbol}`));
    const records = history(trend);
    return Promise.resolve({ records, startIndex: records.length - 1, source: 'fixture' });
  });
  return { getHistoricalOhlcv } satisfies QuantMarketDataProvider;
}

function sharedConfig(sides: { buy: boolean; sell: boolean }): SharedConfig {
  const config = defaultConfig();
  const ma = config.indicators.ma!;
  config.indicators.ma = {
    master_enabled: true,
    buy: { ...ma.buy, enabled: sides.buy },
    sell: { ...ma.sell, enabled: sides.sell },
  };
  return { ...config, revision: 3 };
}

function reader(config: SharedConfig | null, revision = 3) {
  const effective: EffectiveSharedConfig | null = config
    ? { revision, config, config_hash: configHash(config), effective_session: '2026-09-22' }
    : null;
  return {
    effectiveFor: vi.fn(() => Promise.resolve(effective)),
    getRevision: vi.fn(() =>
      Promise.resolve(effective ? { ...effective, saved_at: '2026-09-21T10:00:00.000Z' } : null),
    ),
  } satisfies SharedConfigReaderPort;
}

function flag(enabled: boolean): ConfigService<Environment, true> {
  return {
    get: (key: string) => (key === 'BOT_SHARED_CONFIG_ENABLED' ? enabled : undefined),
  } as unknown as ConfigService<Environment, true>;
}

function snapshotProvider(input: BotMarketSnapshotInput): BotSnapshotProvider {
  return { buildSnapshot: () => Promise.resolve(structuredClone(input)) };
}

async function runSession(options: {
  input?: BotMarketSnapshotInput;
  enabled?: boolean;
  reader?: SharedConfigReaderPort;
  market?: QuantMarketDataProvider;
  legacyConstructor?: boolean;
}) {
  const db = new FakeBotDatabase([HOLD_POSITION]);
  const provider = snapshotProvider(options.input ?? snapshotInput());
  const service = options.legacyConstructor
    ? new BotService(db as unknown as DatabaseService, provider)
    : new BotService(
        db as unknown as DatabaseService,
        provider,
        flag(options.enabled ?? false),
        options.reader,
        options.market,
      );
  const result = await service.runAccountSession(USER, SESSION);
  return { db, service, result, receipt: db.receipts[0]!, snapshot: db.snapshots[0]! };
}

/** Run-id independent view of what a session decided and executed. */
function outcome(db: FakeBotDatabase) {
  const runId = String(db.receipts[0]!.id);
  return {
    decisions: db.decisions.map((row) => ({
      ...row,
      key: String(row.key).replace(runId, '<run>'),
    })),
    executions: db.executions.map(({ symbol, side, qty, price_vnd, fee_vnd, tax_vnd, reason }) => ({
      symbol,
      side,
      qty,
      price_vnd,
      fee_vnd,
      tax_vnd,
      reason,
    })),
    cash: db.cash,
  };
}

function decision(db: FakeBotDatabase, symbol: string) {
  return db.decisions.find((row) => row.symbol === symbol);
}

describe('Bot shared config receipt helpers', () => {
  it('keeps the Bot v1 rule snapshot and golden hash when nothing is pinned', () => {
    expect(BOT_RULE_HASH).toBe(GOLDEN_V1_RULE_HASH);
    const receipt = botRuleReceipt(null);
    expect(receipt.snapshot).toBe(BOT_RULE_SNAPSHOT);
    expect(receipt.hash).toBe(GOLDEN_V1_RULE_HASH);
    expect(verifyRuleReceipt(JSON.parse(JSON.stringify(BOT_RULE_SNAPSHOT)), BOT_RULE_HASH)).toEqual(
      { valid: true, pin: null },
    );
  });

  it('covers a pinned revision with the rule hash and rejects tampering', () => {
    const pin = { revision: 3, config_hash: 'a'.repeat(64), effective_session: '2026-09-22' };
    const receipt = botRuleReceipt(pin);
    expect(receipt.hash).not.toBe(BOT_RULE_HASH);
    expect(receipt.hash).toBe(canonicalHash({ ...BOT_RULE_SNAPSHOT, shared_config: pin }));
    const stored = JSON.parse(JSON.stringify(receipt.snapshot)) as Record<string, unknown>;
    expect(verifyRuleReceipt(stored, receipt.hash)).toEqual({ valid: true, pin });
    expect(verifyRuleReceipt(stored, BOT_RULE_HASH).valid).toBe(false);
    const tampered = { ...stored, shared_config: { ...pin, revision: 4 } };
    expect(verifyRuleReceipt(tampered, receipt.hash).valid).toBe(false);
    const loosened = { ...stored, stop_loss_l1_multiplier: 3 };
    expect(verifyRuleReceipt(loosened, canonicalHash(loosened)).valid).toBe(false);
  });

  it('orders exits stop L1 / take-profit before the shared Sell signal', () => {
    const signals = {
      buy_active: true,
      sell_active: true,
      buy: { AAA: false, BBB: null },
      sell: { HOLD: true },
    } as unknown as BotSharedConfigSignals;
    expect(sharedConfigExitReason('stop_loss', signals, 'HOLD')).toBe('stop_loss');
    expect(sharedConfigExitReason('take_profit', signals, 'HOLD')).toBe('take_profit');
    expect(sharedConfigExitReason(null, signals, 'HOLD')).toBe('shared_config_sell');
    expect(sharedConfigExitReason(null, signals, 'OTHER')).toBeNull();
    expect(sharedConfigExitReason(null, null, 'HOLD')).toBeNull();
    expect(sharedConfigBuyBlock(signals, 'AAA')).toBe('shared_config_buy_false');
    expect(sharedConfigBuyBlock(signals, 'BBB')).toBe('shared_config_buy_missing');
    expect(sharedConfigBuyBlock({ ...signals, buy_active: false }, 'AAA')).toBeNull();
    expect(sharedConfigBuyBlock(null, 'AAA')).toBeNull();
  });
});

describe('BotService with BOT_SHARED_CONFIG_ENABLED', () => {
  it('flag off: receipt, rule hash, snapshot hash and decisions are byte-identical to Bot v1', async () => {
    const baseline = await runSession({ legacyConstructor: true });
    const config = sharedConfig({ buy: true, sell: true });
    const configReader = reader(config);
    const market = marketData({ AAA: 'down', HOLD: 'down' });
    const off = await runSession({ enabled: false, reader: configReader, market });

    expect(configReader.effectiveFor).not.toHaveBeenCalled();
    expect(market.getHistoricalOhlcv).not.toHaveBeenCalled();
    for (const run of [baseline, off]) {
      expect(run.result.status).toBe('succeeded');
      expect(run.db.receiptInserts[0]![8]).toBe(JSON.stringify(BOT_RULE_SNAPSHOT));
      expect(run.db.receiptInserts[0]![9]).toBe(GOLDEN_V1_RULE_HASH);
      expect(run.receipt.rule_hash).toBe(GOLDEN_V1_RULE_HASH);
      expect(run.snapshot.snapshot_hash).toBe(snapshotHash(snapshotInput()));
      expect(run.snapshot.payload).not.toHaveProperty('shared_config_signals');
    }
    expect(off.db.receiptInserts[0]!.slice(5)).toEqual(baseline.db.receiptInserts[0]!.slice(5));
    expect(outcome(off.db)).toEqual(outcome(baseline.db));
    expect(decision(off.db, 'AAA')?.reason_code).toBe('bought');
  });

  it('flag on + no effective revision keeps Bot v1 behaviour and receipt', async () => {
    const baseline = await runSession({ legacyConstructor: true });
    const configReader = reader(null);
    const market = marketData({ AAA: 'down', HOLD: 'down' });
    const on = await runSession({ enabled: true, reader: configReader, market });

    expect(configReader.effectiveFor).toHaveBeenCalledWith(USER, SESSION);
    expect(market.getHistoricalOhlcv).not.toHaveBeenCalled();
    expect(on.receipt.rule_hash).toBe(GOLDEN_V1_RULE_HASH);
    expect(on.snapshot.snapshot_hash).toBe(baseline.snapshot.snapshot_hash);
    expect(outcome(on.db)).toEqual(outcome(baseline.db));
  });

  it('flag on: pins revision, config hash and effective session in the run receipt', async () => {
    const config = sharedConfig({ buy: true, sell: true });
    const on = await runSession({
      enabled: true,
      reader: reader(config),
      market: marketData({ AAA: 'up', HOLD: 'up' }),
    });
    const pin = { revision: 3, config_hash: configHash(config), effective_session: '2026-09-22' };

    expect(on.result.status).toBe('succeeded');
    expect(on.receipt.rule_snapshot).toEqual({ ...BOT_RULE_SNAPSHOT, shared_config: pin });
    expect(on.receipt.rule_hash).toBe(canonicalHash({ ...BOT_RULE_SNAPSHOT, shared_config: pin }));
    expect(on.receipt.rule_hash).not.toBe(GOLDEN_V1_RULE_HASH);
    const frozen = (on.snapshot.payload as BotMarketSnapshotInput).shared_config_signals;
    expect(frozen).toMatchObject({ ...pin, buy_active: true, sell_active: true });
    expect(frozen?.buy).toEqual({ AAA: true });
    expect(frozen?.sell).toEqual({ HOLD: false });
    expect(on.snapshot.snapshot_hash).toBe(
      snapshotHash({ ...snapshotInput(), shared_config_signals: frozen! }),
    );
    expect(decision(on.db, 'AAA')?.reason_code).toBe('bought');
    expect(decision(on.db, 'HOLD')?.reason_code).toBe('hold_within_thresholds');
  });

  it('flag on: a retry reuses the pinned receipt even after a newer revision becomes effective', async () => {
    const first = await runSession({
      enabled: true,
      reader: reader(sharedConfig({ buy: true, sell: true })),
      market: marketData({ AAA: 'up', HOLD: 'up' }),
    });
    const newer = reader(sharedConfig({ buy: false, sell: true }), 4);
    const retry = new BotService(
      first.db as unknown as DatabaseService,
      snapshotProvider(snapshotInput()),
      flag(true),
      newer,
      marketData({ AAA: 'down', HOLD: 'down' }),
    );
    const again = await retry.runAccountSession(USER, SESSION);

    expect(again).toEqual(first.result);
    expect(first.db.receipts).toHaveLength(1);
    expect(first.db.receipts[0]!.rule_hash).toBe(first.receipt.rule_hash);
    expect(newer.getRevision).not.toHaveBeenCalled();
  });

  it('flag on: a false Buy signal blocks the entry', async () => {
    const on = await runSession({
      enabled: true,
      reader: reader(sharedConfig({ buy: true, sell: false })),
      market: marketData({ AAA: 'down' }),
    });

    expect(on.result.status).toBe('succeeded');
    expect(on.result.buyCount).toBe(0);
    expect(on.db.executions.filter((row) => row.side === 'buy')).toEqual([]);
    expect(decision(on.db, 'AAA')).toMatchObject({
      action: 'skip',
      reason_code: 'shared_config_buy_false',
    });
  });

  it('flag on: missing data on the session bar means no entry', async () => {
    const on = await runSession({
      enabled: true,
      reader: reader(sharedConfig({ buy: true, sell: false })),
      market: marketData({ AAA: 'stale' }),
    });

    expect(on.result.buyCount).toBe(0);
    expect(decision(on.db, 'AAA')?.reason_code).toBe('shared_config_buy_missing');
  });

  it('flag on: no enabled Buy indicator leaves Bot v1 entry unchanged', async () => {
    const baseline = await runSession({ legacyConstructor: true });
    const market = marketData({ AAA: 'down', HOLD: 'up' });
    const on = await runSession({
      enabled: true,
      reader: reader(sharedConfig({ buy: false, sell: true })),
      market,
    });

    expect(market.getHistoricalOhlcv).toHaveBeenCalledTimes(1);
    expect(market.getHistoricalOhlcv.mock.calls[0]![0]).toBe('HOLD');
    expect(on.result.buyCount).toBe(1);
    expect(outcome(on.db)).toEqual(outcome(baseline.db));
  });

  it('flag on: stop L1 still triggers first when the Sell signal is also true', async () => {
    const on = await runSession({
      input: snapshotInput('47000'),
      enabled: true,
      reader: reader(sharedConfig({ buy: true, sell: true })),
      market: marketData({ AAA: 'up', HOLD: 'down' }),
    });
    const sells = on.db.executions.filter((row) => row.side === 'sell');

    expect((on.snapshot.payload as BotMarketSnapshotInput).shared_config_signals?.sell.HOLD).toBe(
      true,
    );
    expect(sells).toHaveLength(1);
    expect(sells[0]).toMatchObject({ symbol: 'HOLD', reason: 'stop_loss', price_vnd: '47000' });
    expect(decision(on.db, 'HOLD')).toMatchObject({
      action: 'sell',
      reason_code: 'stop_loss',
      threshold_vnd: '48000',
    });
  });

  it('flag on: a true Sell signal exits a held position inside the stop/TP band', async () => {
    const on = await runSession({
      enabled: true,
      reader: reader(sharedConfig({ buy: true, sell: true })),
      market: marketData({ AAA: 'up', HOLD: 'down' }),
    });
    const sells = on.db.executions.filter((row) => row.side === 'sell');

    expect(on.result.status).toBe('succeeded');
    expect(on.result.sellCount).toBe(1);
    expect(sells[0]).toMatchObject({ symbol: 'HOLD', reason: 'shared_config_sell' });
    expect(decision(on.db, 'HOLD')).toMatchObject({
      action: 'sell',
      reason_code: 'shared_config_sell',
      threshold_vnd: null,
    });
    expect(String(decision(on.db, 'HOLD')?.reason)).toContain('cấu hình chung');
  });

  it('flag on: a pinned config whose hash drifted fails the run instead of trading', async () => {
    const config = sharedConfig({ buy: true, sell: true });
    const drifted = {
      effectiveFor: vi.fn(() =>
        Promise.resolve({
          revision: 3,
          config,
          config_hash: 'b'.repeat(64),
          effective_session: '2026-09-22',
        }),
      ),
      getRevision: vi.fn(() => Promise.resolve(null)),
    } satisfies SharedConfigReaderPort;
    const on = await runSession({
      enabled: true,
      reader: drifted,
      market: marketData({ AAA: 'up', HOLD: 'up' }),
    });

    expect(on.result.status).toBe('failed');
    expect(on.result.issues.map((row) => row.code)).toContain('shared_config_unavailable');
    expect(on.db.executions).toEqual([]);
  });
});
