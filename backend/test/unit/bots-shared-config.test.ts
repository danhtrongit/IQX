import { describe, expect, it, vi } from 'vitest';

import {
  BOT_DECISION_REASON_CODES,
  BOT_POLICY,
  BOT_POLICY_HASH,
  BOT_POLICY_SNAPSHOT,
  BotService,
  canonicalHash,
  verifyRuleReceipt,
  type BotMarketSnapshotInput,
  type BotSnapshotProvider,
  type BotSnapshotSymbol,
} from '../../src/modules/bots/index.js';
import {
  LEGACY_BOT_V1_RULE_HASH,
  LEGACY_BOT_V1_RULE_SNAPSHOT,
} from '../../src/modules/bots/bot.legacy.js';
import type { DatabaseService } from '../../src/platform/database/index.js';
import type { QuantMarketDataProvider } from '../../src/modules/quant/quant.types.js';
import { configHash, defaultConfig, type SharedConfig } from '../../src/modules/quant/v2/index.js';
import type {
  EffectiveSharedConfig,
  SharedConfigReaderPort,
} from '../../src/modules/strategy-config/strategy-config.ports.js';

const SESSION = '2026-09-23';
const USER = '00000000-0000-4000-8000-000000000001';
const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';

type Row = Record<string, unknown>;

/** In-memory stand-in for the SQL BotService issues during one account session. */
class FakeBotDatabase {
  cash = '95000000';
  graduatedAt: string | null = '2026-01-01T00:00:00Z';
  instanceId: string | null = 'instance-1';
  accountExists = true;
  fundingExists = true;
  receipts: Row[] = [];
  snapshots: Row[] = [];
  positions: Row[];
  executions: Row[] = [];
  decisions: Row[] = [];
  ledger: Row[] = [];
  nav: Row[] = [];
  receiptInserts: unknown[][] = [];
  failOnSql: ((sql: string) => boolean) | null = null;
  reconciliationValid = true;

  constructor(positions: Row[]) {
    this.positions = positions.map((row) => ({ ...row }));
  }

  async transaction<T>(operation: (client: FakeBotDatabase) => Promise<T>): Promise<T> {
    const before = structuredClone({
      cash: this.cash,
      graduatedAt: this.graduatedAt,
      instanceId: this.instanceId,
      accountExists: this.accountExists,
      fundingExists: this.fundingExists,
      receipts: this.receipts,
      snapshots: this.snapshots,
      positions: this.positions,
      executions: this.executions,
      decisions: this.decisions,
      ledger: this.ledger,
      nav: this.nav,
      receiptInserts: this.receiptInserts,
    });
    try {
      return await operation(this);
    } catch (error) {
      this.cash = before.cash;
      this.graduatedAt = before.graduatedAt;
      this.instanceId = before.instanceId;
      this.accountExists = before.accountExists;
      this.fundingExists = before.fundingExists;
      this.receipts = before.receipts;
      this.snapshots = before.snapshots;
      this.positions = before.positions;
      this.executions = before.executions;
      this.decisions = before.decisions;
      this.ledger = before.ledger;
      this.nav = before.nav;
      this.receiptInserts = before.receiptInserts;
      throw error;
    }
  }

  query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (this.failOnSql?.(normalized)) return Promise.reject(new Error('injected SQL failure'));
    return Promise.resolve(this.handle(normalized, values) as T[]);
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
    if (sql.startsWith('select graduated_at from cap6_progress')) {
      return [{ graduated_at: this.graduatedAt }];
    }
    if (sql.startsWith('select graduated_at, case when graduated_at')) {
      return [{ graduated_at: this.graduatedAt, current_level: this.graduatedAt ? 6 : 5 }];
    }
    if (sql.startsWith('select id from bot_instances where user_id = $1')) {
      return this.instanceId ? [{ id: this.instanceId }] : [];
    }
    if (sql.startsWith('insert into bot_accounts')) {
      if (this.accountExists) return [];
      this.accountExists = true;
      this.cash = String(v[2]);
      return [
        {
          id: v[0],
          user_id: v[1],
          initial_cash_vnd: v[2],
          cash_vnd: v[2],
          status: 'active',
          activated_at: v[3],
        },
      ];
    }
    if (sql.includes('from bot_accounts where user_id = $1 for update')) {
      return this.accountExists
        ? [
            {
              id: ACCOUNT,
              user_id: USER,
              initial_cash_vnd: '100000000',
              cash_vnd: this.cash,
              status: 'active',
              activated_at: this.graduatedAt,
            },
          ]
        : [];
    }
    if (sql.includes('from bot_cash_ledger where bot_account_id = $1')) {
      return [
        {
          entries: this.fundingExists ? '1' : '0',
          funding_exists: this.fundingExists,
        },
      ];
    }
    if (sql.startsWith('insert into bot_instances')) {
      this.instanceId = String(v[0]);
      return [{ id: this.instanceId }];
    }
    if (sql.includes('from bot_instances i join bot_accounts a')) return [this.context()];
    if (sql.startsWith('select * from bot_run_receipts where user_id = $1')) {
      return this.receipts.filter((row) => row.user_id === v[0] && row.trading_date === v[1]);
    }
    if (sql.startsWith('select * from bot_run_receipts where id = $1')) return [this.receipt(v[0])];
    if (sql.startsWith('select status from bot_run_receipts where id = $1')) {
      return [{ status: this.receipt(v[0]).status }];
    }
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
        policy_version: v[10],
        source_snapshot_hash: v[11],
        blocked_symbols_at_start: JSON.parse(String(v[12])),
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
    if (sql.startsWith('select exists( select 1 from bot_run_receipts other')) {
      return [
        {
          exists: this.receipts.some(
            (row) =>
              row.bot_account_id === v[0] &&
              row.id !== v[1] &&
              ((row.status === 'succeeded' && String(row.trading_date) > String(v[2])) ||
                row.status === 'running'),
          ),
        },
      ];
    }
    if (
      sql.startsWith('select exists( select 1 from bot_run_receipts') &&
      sql.includes("status = 'running'")
    ) {
      return [
        {
          exists: this.receipts.some(
            (row) =>
              row.bot_account_id === v[0] && row.status === 'running' && row.trading_date !== v[1],
          ),
        },
      ];
    }
    if (
      sql.startsWith('select exists( select 1 from bot_run_receipts') &&
      sql.includes("status = 'succeeded'")
    ) {
      return [
        {
          exists: this.receipts.some(
            (row) =>
              row.bot_account_id === v[0] &&
              row.status === 'succeeded' &&
              String(row.trading_date) > String(v[1]),
          ),
        },
      ];
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
    if (sql.startsWith('select count(*)::text as open_positions')) {
      const open = this.positions.filter((row) => row.status === 'open');
      return [
        {
          open_positions: String(open.length),
          policy_positions: String(open.filter((row) => row.entry_config_revision !== null).length),
        },
      ];
    }
    if (sql.startsWith('select trading_date, cash_vnd, market_value_vnd, nav_vnd')) {
      return this.nav.slice(-1);
    }
    if (sql.startsWith('select trading_date, nav_vnd, valuation_complete from bot_nav_daily')) {
      return this.nav.slice(-1);
    }
    if (sql.startsWith('select r.*, ui.last_animated_bot_run_id')) {
      return [...this.receipts]
        .reverse()
        .map((row) => ({ ...row, last_animated_bot_run_id: null }));
    }
    if (sql.startsWith('select p.*, s.icb_lv2 as sector')) {
      return this.positions
        .filter((row) => row.status === 'open')
        .map((row) => ({ ...row, sector: null }));
    }
    if (sql.startsWith('select s.* from bot_market_snapshots s')) {
      return this.snapshots.slice(-1);
    }
    if (sql.startsWith('select d.*, r.trading_date')) {
      return this.decisions.map((decision) => {
        const receipt = this.receipts.find((row) => row.id === decision.bot_run_id)!;
        const execution = this.executions.find((row) => row.id === decision.execution_id);
        return {
          ...decision,
          trading_date: receipt?.trading_date ?? SESSION,
          run_id: receipt?.id ?? decision.bot_run_id,
          policy_version: receipt?.policy_version ?? null,
          execution_id_joined: execution?.id ?? null,
          execution_side: execution?.side,
          execution_qty: execution?.qty,
          execution_price_vnd: execution?.price_vnd,
          execution_gross_value_vnd: execution?.gross_value_vnd,
          execution_fee_vnd: execution?.fee_vnd,
          execution_tax_vnd: execution?.tax_vnd,
          execution_net_cash_delta_vnd: execution?.net_cash_delta_vnd,
          execution_supporting_count: null,
        };
      });
    }
    if (sql.startsWith('select issues from bot_run_receipts where bot_account_id')) {
      const row = this.receipts.filter((item) => item.bot_account_id === v[0]).at(-1);
      return row ? [{ issues: row.issues }] : [];
    }
    if (sql.includes('from bot_accounts a where a.id = $1')) {
      return [{ valid: this.reconciliationValid }];
    }
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
        bot_account_id: v[2],
        position_id: v[3],
        symbol: v[4],
        side,
        qty: v[5],
        price_vnd: v[6],
        fee_vnd: v[10],
        gross_value_vnd: v[9],
        tax_vnd: side === 'sell' ? v[11] : '0',
        net_cash_delta_vnd: side === 'sell' ? v[12] : v[11],
        idempotency_key: side === 'sell' ? v[14] : v[13],
        reason: side === 'sell' ? v[16] : 'academy_buy',
      });
      return [];
    }
    if (sql.startsWith('insert into bot_cash_ledger')) {
      if (sql.includes("'initial_funding'")) this.fundingExists = true;
      this.ledger.push({ sql, values: [...v] });
      return [];
    }
    if (sql.startsWith('update bot_positions set qty_open = 0')) {
      const row = this.positions.find((item) => item.id === v[0])!;
      Object.assign(row, {
        qty_open: 0,
        status: 'closed',
        closed_session: v[1],
        closed_at: v[2],
        sell_execution_id: v[3],
      });
      return [];
    }
    if (sql.startsWith('insert into bot_decisions')) {
      if (!this.decisions.some((row) => row.key === v[2])) {
        this.decisions.push({
          id: v[0],
          bot_run_id: v[1],
          key: v[2],
          symbol: v[3],
          action: v[4],
          reason_code: v[5],
          reason: v[6],
          filter_ids: JSON.parse(String(v[7])),
          data_refs: JSON.parse(String(v[9])),
          threshold_vnd: v[12],
          execution_id: v[13],
          decision_config_revision: v[14],
          condition_snapshot: v[15] === null ? null : JSON.parse(String(v[15])),
          created_at: v[16],
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
        entry_price_vnd: v[4],
        entry_value_vnd: v[5],
        entry_fee_vnd: v[6],
        amplitude_at_entry_vnd: v[7],
        amplitude_source_ref: v[8],
        stop_loss_vnd: v[9],
        take_profit_vnd: null,
        entry_config_revision: v[10],
        opened_session: v[11],
        opened_at: v[12],
        status: 'open',
        closed_session: null,
        filter_ids: JSON.parse(String(v[13])),
        source_refs: JSON.parse(String(v[14])),
        buy_execution_id: v[15],
      });
      return [];
    }
    if (
      sql.startsWith("select * from bot_positions where bot_account_id = $1 and status = 'open'")
    ) {
      return this.positions.filter((row) => row.status === 'open');
    }
    if (sql.startsWith('insert into bot_nav_daily')) {
      const row = {
        id: v[0],
        bot_account_id: v[1],
        trading_date: v[2],
        cash_vnd: v[3],
        market_value_vnd: v[4],
        nav_vnd: v[5],
        valuation_complete: v[6],
        vnindex: v[7],
        source_refs: JSON.parse(String(v[8])),
        created_at: v[9],
      };
      const existing = this.nav.findIndex(
        (item) => item.bot_account_id === v[1] && item.trading_date === v[2],
      );
      if (existing >= 0) this.nav[existing] = row;
      else this.nav.push(row);
      return [];
    }
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

const allowedReasons = new Set<string>(BOT_DECISION_REASON_CODES);

function position(overrides: Row = {}): Row {
  return {
    id: `position-${String(overrides.symbol ?? 'HOLD').toLowerCase()}`,
    bot_account_id: ACCOUNT,
    symbol: 'HOLD',
    qty_open: 100,
    entry_price_vnd: '20000',
    entry_value_vnd: '2000000',
    entry_fee_vnd: '2000',
    amplitude_at_entry_vnd: '500',
    amplitude_source_ref: 'l1:entry',
    stop_loss_vnd: '19000',
    take_profit_vnd: '22000',
    entry_config_revision: null,
    opened_session: '2026-06-01',
    opened_at: '2026-06-01T08:00:00Z',
    closed_session: null,
    closed_at: null,
    status: 'open',
    filter_ids: ['khoi_ngoai_gom'],
    source_refs: {},
    ...overrides,
  };
}

function huntCandidate(overrides: BotSnapshotSymbol = {}): BotSnapshotSymbol {
  return {
    close_vnd: '20000',
    close_is_official: true,
    trading_value_avg20_vnd: '2000000000',
    filter_ids: ['khoi_ngoai_gom'],
    security_status_verified: true,
    tradable_security_status: true,
    l1_amplitude_vnd: '500.0000',
    l1_amplitude_source_ref: 'l1:fixture',
    source_refs: { hunt: true },
    ...overrides,
  };
}

function marketSnapshot(
  options: {
    symbols?: Record<string, BotSnapshotSymbol>;
    buyInputsComplete?: boolean;
    feeBps?: number;
    issues?: BotMarketSnapshotInput['issues'];
  } = {},
): BotMarketSnapshotInput {
  return {
    trading_date: SESSION,
    data_version: 'academy-fixture-v1',
    close_is_official: true,
    buy_inputs_complete: options.buyInputsComplete ?? true,
    symbols: options.symbols ?? { AAA: huntCandidate() },
    fee_rules: {
      buy_fee_rate_bps: options.feeBps ?? 10,
      sell_fee_rate_bps: 10,
      sell_tax_rate_bps: 10,
      board_lot_size: 100,
      source_ref: 'fixture:fees',
    },
    issues: options.issues,
    vnindex: '1250.5',
  };
}

type Trend = 'up' | 'down' | 'stale' | 'drop' | 'short';

function history(trend: Trend) {
  const length = trend === 'short' ? 5 : 80;
  const end = new Date(`${SESSION}T00:00:00Z`);
  if (trend === 'stale') end.setUTCDate(end.getUTCDate() - 1);
  return Array.from({ length }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (length - 1 - index));
    let close = trend === 'down' ? 30_000 - index * 100 : 10_000 + index * 100;
    if (trend === 'drop' && index === length - 1) close = 5_000;
    return {
      time: date.toISOString().slice(0, 10),
      open: close,
      high: close + 100,
      low: close - 100,
      close,
      volume: 1_000_000,
    };
  });
}

function marketData(trends: Record<string, Trend>): QuantMarketDataProvider {
  return {
    getHistoricalOhlcv: vi.fn((symbol: string) => {
      const trend = trends[symbol];
      if (!trend) return Promise.reject(new Error(`no history for ${symbol}`));
      const records = history(trend);
      return Promise.resolve({ records, startIndex: records.length - 1, source: 'fixture' });
    }),
  } as unknown as QuantMarketDataProvider;
}

function academyConfig(
  options: {
    buy?: string[];
    sell?: string[];
    buyOps?: Record<string, string>;
    sellOps?: Record<string, string>;
    revision?: number;
  } = {},
): SharedConfig {
  const config = defaultConfig();
  const buy = new Set(options.buy ?? []);
  const sell = new Set(options.sell ?? []);
  for (const id of new Set([...buy, ...sell])) {
    const item = config.indicators[id];
    if (!item) throw new Error(`unknown test indicator ${id}`);
    item.master_enabled = true;
    item.buy.enabled = buy.has(id);
    item.sell.enabled = sell.has(id);
    if (options.buyOps?.[id] && item.buy.rules[0]) {
      item.buy.rules[0].op = options.buyOps[id] as never;
    }
    if (options.sellOps?.[id] && item.sell.rules[0]) {
      item.sell.rules[0].op = options.sellOps[id] as never;
    }
  }
  return { ...config, revision: options.revision ?? 3 };
}

type AcademyReader = SharedConfigReaderPort & {
  current(userId: string): Promise<{
    saved_revision: number;
    effective_revision: number | null;
    effective_session: string | null;
    status: 'pending' | 'effective' | 'calendar_unavailable';
    config: SharedConfig;
    config_hash: string;
    registry_version: string;
    granted_indicators: string[];
  }>;
};

function reader(
  config: SharedConfig | null,
  options: {
    grants?: string[];
    revision?: number;
    hash?: string;
    throwRead?: boolean;
  } = {},
): AcademyReader {
  const revision = options.revision ?? config?.revision ?? 3;
  const hash = options.hash ?? (config ? configHash(config) : configHash(defaultConfig()));
  const effective: EffectiveSharedConfig | null = config
    ? { revision, config, config_hash: hash, effective_session: '2026-09-22' }
    : null;
  const grants =
    options.grants ??
    (config
      ? Object.entries(config.indicators)
          .filter(([, item]) => item.master_enabled)
          .map(([id]) => id)
      : []);
  return {
    current: vi.fn(() => {
      if (options.throwRead) return Promise.reject(new Error('reader unavailable'));
      const visible = config ?? defaultConfig();
      return Promise.resolve({
        saved_revision: config ? revision : 0,
        effective_revision: config ? revision : null,
        effective_session: config ? '2026-09-22' : null,
        status: config ? ('effective' as const) : ('pending' as const),
        config: visible,
        config_hash: hash,
        registry_version: 'iqx-ta-2.0',
        granted_indicators: grants,
      });
    }),
    effectiveFor: vi.fn(() => {
      if (options.throwRead) return Promise.reject(new Error('reader unavailable'));
      return Promise.resolve(effective);
    }),
    getRevision: vi.fn(() =>
      Promise.resolve(effective ? { ...effective, saved_at: '2026-09-21T10:00:00.000Z' } : null),
    ),
  };
}

function provider(input: BotMarketSnapshotInput): BotSnapshotProvider {
  return { buildSnapshot: vi.fn(() => Promise.resolve(structuredClone(input))) };
}

async function runAcademy(
  options: {
    config?: SharedConfig | null;
    configReader?: AcademyReader;
    snapshot?: BotMarketSnapshotInput;
    positions?: Row[];
    trends?: Record<string, Trend>;
    cash?: string;
    db?: FakeBotDatabase;
  } = {},
) {
  const db = options.db ?? new FakeBotDatabase(options.positions ?? []);
  db.cash = options.cash ?? '100000000';
  const input = options.snapshot ?? marketSnapshot();
  const configReader = options.configReader ?? reader(options.config ?? null);
  const service = new BotService(
    db as unknown as DatabaseService,
    provider(input),
    configReader,
    marketData(options.trends ?? {}),
  );
  const result = await service.runAccountSession(USER, SESSION);
  for (const row of db.decisions) {
    expect(allowedReasons.has(String(row.reason_code))).toBe(true);
  }
  return { db, result, service, configReader, receipt: db.receipts[0], input };
}

function decisions(db: FakeBotDatabase, reason: string): Row[] {
  return db.decisions.filter((row) => row.reason_code === reason);
}

function executions(db: FakeBotDatabase, side: 'buy' | 'sell'): Row[] {
  return db.executions.filter((row) => row.side === side);
}

describe('Bot academy policy receipt compatibility', () => {
  it('F10 preserves and verifies the frozen V1 receipt without rewriting history', () => {
    expect(LEGACY_BOT_V1_RULE_HASH).toBe(
      '73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e',
    );
    expect(verifyRuleReceipt(LEGACY_BOT_V1_RULE_SNAPSHOT, LEGACY_BOT_V1_RULE_HASH)).toMatchObject({
      valid: true,
      pin: null,
    });
    const legacyPinned = {
      ...LEGACY_BOT_V1_RULE_SNAPSHOT,
      shared_config: {
        revision: 2,
        config_hash: 'a'.repeat(64),
        effective_session: '2026-09-22',
      },
    };
    expect(verifyRuleReceipt(legacyPinned, canonicalHash(legacyPinned)).valid).toBe(true);
    expect(BOT_POLICY_HASH).toBe(canonicalHash(BOT_POLICY_SNAPSHOT));
  });
});

describe('BotService academy activation acceptance', () => {
  it('A02 initializes one 100m account and a no-config run waits without trading', async () => {
    const db = new FakeBotDatabase([]);
    Object.assign(db, {
      cash: '0',
      instanceId: null,
      accountExists: false,
      fundingExists: false,
    });
    const service = new BotService(
      db as unknown as DatabaseService,
      undefined,
      reader(null),
      undefined,
    );
    const initialized = await service.initializeAccount(USER);
    expect(initialized.initialized).toBe(true);
    expect(db.cash).toBe('100000000');
    expect(db.ledger).toHaveLength(1);

    const run = await runAcademy({ db, config: null, snapshot: marketSnapshot() });
    expect(run.result.status).toBe('succeeded');
    expect(db.executions).toEqual([]);
    expect(decisions(db, 'waiting_for_academy_conditions')).toHaveLength(1);
    const overview = (await run.service.overview(USER)) as {
      bot: { product_stage: string };
      conditions: { state: string; config_status: string };
    };
    expect(overview.bot.product_stage).toBe('bot_v1_waiting');
    expect(overview.conditions).toMatchObject({
      state: 'waiting_for_conditions',
      config_status: 'none',
    });
  });

  it('A04 repeated graduation initialization does not duplicate account or funding', async () => {
    const db = new FakeBotDatabase([]);
    Object.assign(db, {
      cash: '0',
      instanceId: null,
      accountExists: false,
      fundingExists: false,
    });
    const service = new BotService(db as unknown as DatabaseService, undefined, reader(null));
    const first = await service.initializeAccount(USER);
    const second = await service.initializeAccount(USER);
    expect(first.initialized).toBe(true);
    expect(second).toEqual({ initialized: false, instanceId: first.instanceId });
    expect(db.ledger).toHaveLength(1);
    expect(db.cash).toBe('100000000');
  });

  it('A05 Buy can open a position while Sell is inactive', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(decisions(run.db, 'academy_buy')).toHaveLength(1);
  });

  it('A06 Sell-only config with no position neither buys nor short-sells', async () => {
    const run = await runAcademy({
      config: academyConfig({ sell: ['ma'] }),
      trends: {},
    });
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'no_active_buy_conditions')).toHaveLength(1);
  });

  it('A07 stop protection remains active after every Academy side is disabled', async () => {
    const run = await runAcademy({
      config: null,
      positions: [position()],
      cash: '98000000',
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19000', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ symbol: 'HOLD', reason: 'stop_loss' }]);
  });

  it('A08 later Academy revisions reuse the same account and policy stage', async () => {
    const db = new FakeBotDatabase([]);
    const config = academyConfig({ buy: ['ma'], revision: 8 });
    const run = await runAcademy({ db, config, trends: { AAA: 'up' } });
    expect(run.receipt?.bot_account_id).toBe(ACCOUNT);
    expect(run.receipt?.policy_version).toBe(BOT_POLICY.policy_version);
    expect(run.receipt?.strategy_version).toBe(1);
    expect(db.ledger.some((row) => String(row.sql).includes("'initial_funding'"))).toBe(false);
  });

  it('B06 two active Buy indicators use AND and one false blocks entry', async () => {
    const config = academyConfig({
      buy: ['ma', 'macd'],
      buyOps: { ma: '<', macd: '>' },
    });
    const run = await runAcademy({ config, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_buy_not_met')).toHaveLength(1);
  });

  it('B07 empty Buy set never falls back to the legacy strategy', async () => {
    const run = await runAcademy({ config: null, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'waiting_for_academy_conditions')).toHaveLength(1);
  });

  it('B08 empty Sell set holds regardless of legacy target and age', async () => {
    const run = await runAcademy({
      positions: [position({ opened_session: '2025-01-01' })],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '25000', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(decisions(run.db, 'no_active_sell_conditions')).toHaveLength(1);
  });

  it('B09 missing Buy data does not block an independent Academy Sell', async () => {
    const config = academyConfig({ buy: ['ma', 'ma_cross'], sell: ['ma'] });
    const run = await runAcademy({
      config,
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: {
          AAA: huntCandidate(),
          HOLD: { close_vnd: '19500', close_is_official: true },
        },
      }),
      trends: { AAA: 'short', HOLD: 'down', VNINDEX: 'short' },
    });
    expect(decisions(run.db, 'academy_condition_missing').length).toBeGreaterThan(0);
    expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'academy_sell' }]);
  });

  it('B10 a condition true only before T is not carried into T', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'drop' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_buy_not_met')).toHaveLength(1);
  });

  it('B11 a position opened at T is not evaluated for same-run sale', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } });
    const run = await runAcademy({ config, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('B12 a starting position sold at T cannot be bought back at T', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } });
    const run = await runAcademy({
      config,
      positions: [position({ symbol: 'AAA' })],
      snapshot: marketSnapshot({ symbols: { AAA: huntCandidate({ close_vnd: '21000' }) } }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(executions(run.db, 'buy')).toEqual([]);
  });

  it('B13 membership with missing operands remains missing, never true by negation', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['bollinger'] }),
      trends: { AAA: 'short' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_condition_missing')).toHaveLength(1);
  });

  it('B14 Bot respects a saved less-than operator on the Buy side', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'], buyOps: { ma: '<' } }),
      trends: { AAA: 'down' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it('C01 missing AI layers do not block an otherwise valid Academy Buy', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: huntCandidate({ layers: undefined }) } }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it('C02 very-negative news or insider layers do not veto an Academy Buy', async () => {
    const veryNegative = {
      verdict: 'bad' as const,
      raw_level: 'very_negative',
      is_very_negative: true,
      source_ref: 'legacy-ai',
    };
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: {
          AAA: huntCandidate({ layers: { tin_tuc: veryNegative, noi_bo: veryNegative } }),
        },
      }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it('C03 AI deterioration alone does not sell a position', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: {
          HOLD: huntCandidate({
            close_vnd: '19500',
            filter_ids: [],
            layers: {
              tin_tuc: {
                verdict: 'bad',
                raw_level: 'very_negative',
                is_very_negative: true,
                source_ref: 'legacy-ai',
              },
            },
          }),
        },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('C07 exits do not require the symbol to remain in the Hunt candidate set', async () => {
    const run = await runAcademy({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19500', close_is_official: true } },
      }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'academy_sell' }]);
  });

  it('C08 missing L1 skips only that Buy candidate', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: { AAA: huntCandidate({ l1_amplitude_vnd: null }) },
      }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'invalid_or_missing_l1_amplitude')).toHaveLength(1);
  });

  it('D01 entry 20,000 with L1 500 stores stop 19,000 and no take-profit', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    const opened = run.db.positions.find((row) => row.symbol === 'AAA');
    expect(opened).toMatchObject({ stop_loss_vnd: '19000', take_profit_vnd: null });
    const response = (await run.service.positions(USER)) as {
      items: Array<{ legacy_take_profit_vnd: string | null; entry_config_revision: number | null }>;
    };
    expect(response.items[0]).toMatchObject({
      legacy_take_profit_vnd: null,
      entry_config_revision: 3,
    });
  });

  it('D02 close equal to stop sells all at close', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19000', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toMatchObject([
      { qty: 100, price_vnd: '19000', reason: 'stop_loss' },
    ]);
  });

  it('D03 close below stop sells at actual close rather than the threshold', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '18800', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ price_vnd: '18800', reason: 'stop_loss' }]);
  });

  it('D04 intraday low is irrelevant when official close remains above stop', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19500', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('D05 current L1 never moves the stored protective stop', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: huntCandidate({ close_vnd: '19500', l1_amplitude_vnd: '1200.0000' }) },
      }),
    });
    expect(run.db.positions[0]?.stop_loss_vnd).toBe('19000');
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('D06 missing current L1 does not disable a stored stop', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '18800', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'stop_loss' }]);
  });

  it('D07 an Academy Sell signal executes even while the position is at a loss', async () => {
    const run = await runAcademy({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19500', close_is_official: true } },
      }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toMatchObject([
      { price_vnd: '19500', reason: 'academy_sell' },
    ]);
  });

  it('D08 legacy take-profit 22,000 is non-operative at close 22,500', async () => {
    const legacy = position({ take_profit_vnd: '22000' });
    const run = await runAcademy({
      positions: [legacy],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '22500', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(run.db.positions[0]?.take_profit_vnd).toBe('22000');
  });

  it('D09 simultaneous stop and Sell signal creates one stop-loss execution', async () => {
    const run = await runAcademy({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '18800', close_is_official: true } },
      }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(executions(run.db, 'sell')[0]?.reason).toBe('stop_loss');
  });

  it('D10 holding more than 60 sessions never creates an implicit exit', async () => {
    const run = await runAcademy({
      positions: [position({ opened_session: '2025-01-01' })],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19500', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('D11 missing one close neither fakes its exit nor blocks another valid stop', async () => {
    const run = await runAcademy({
      positions: [position({ symbol: 'MISS' }), position({ symbol: 'STOP' })],
      snapshot: marketSnapshot({
        symbols: {
          MISS: { close_is_official: true },
          STOP: { close_vnd: '18800', close_is_official: true },
        },
      }),
      cash: '96000000',
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ symbol: 'STOP', reason: 'stop_loss' }]);
    expect(decisions(run.db, 'invalid_close')).toHaveLength(1);
    expect(run.result.issues.map((row) => row.code)).toContain('valuation_incomplete');
  });

  it('D12 Bot stop execution uses same-session close without user settlement mutation', async () => {
    const run = await runAcademy({
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '18800', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ price_vnd: '18800', reason: 'stop_loss' }]);
    expect(run.receipt?.execution_model).toBe('same_session_close');
  });

  it('E01 NAV 100m, price 20,000, lot 100 and 0.1% fee buys 500 shares', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ feeBps: 10 }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toMatchObject([
      { qty: 500, price_vnd: '20000', fee_vnd: '10000' },
    ]);
    expect(run.db.cash).toBe('89990000');
  });

  it('E02 the second Buy uses locked NAV basis and reduced current cash', async () => {
    const config = academyConfig({ buy: ['ma'] });
    const run = await runAcademy({
      config,
      snapshot: marketSnapshot({
        symbols: { AAA: huntCandidate(), BBB: huntCandidate() },
      }),
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(2);
    expect(run.receipt?.nav_basis_vnd).toBe('100000000');
    expect(run.db.cash).toBe('79980000');
  });

  it('E03 invalid candidates are skipped and the cap counts successful Buys only', async () => {
    const config = academyConfig({ buy: ['ma'] });
    const run = await runAcademy({
      config,
      snapshot: marketSnapshot({
        symbols: {
          BAD: huntCandidate({ filter_ids: ['a', 'b', 'c'], l1_amplitude_vnd: null }),
          AAA: huntCandidate({ filter_ids: ['a', 'b'] }),
          BBB: huntCandidate({ filter_ids: ['a'] }),
          CCC: huntCandidate({ filter_ids: ['a'] }),
        },
      }),
      trends: { BAD: 'up', AAA: 'up', BBB: 'up', CCC: 'up' },
    });
    expect(decisions(run.db, 'invalid_or_missing_l1_amplitude')).toHaveLength(1);
    expect(executions(run.db, 'buy')).toHaveLength(2);
    expect(decisions(run.db, 'session_buy_limit')).toHaveLength(1);
  });

  it('E04 Sell count is uncapped while new Buys remain capped at two', async () => {
    const symbols: Record<string, BotSnapshotSymbol> = {
      P1: { close_vnd: '18800', close_is_official: true },
      P2: { close_vnd: '18800', close_is_official: true },
      P3: { close_vnd: '18800', close_is_official: true },
      AAA: huntCandidate(),
      BBB: huntCandidate(),
      CCC: huntCandidate(),
    };
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      positions: [
        position({ symbol: 'P1' }),
        position({ symbol: 'P2' }),
        position({ symbol: 'P3' }),
      ],
      snapshot: marketSnapshot({ symbols }),
      trends: { AAA: 'up', BBB: 'up', CCC: 'up' },
      cash: '94000000',
    });
    expect(executions(run.db, 'sell')).toHaveLength(3);
    expect(executions(run.db, 'buy')).toHaveLength(2);
  });

  it('E05 a symbol held or sold in the run stays blocked across retry', async () => {
    const db = new FakeBotDatabase([position({ symbol: 'AAA' })]);
    db.cash = '98000000';
    const config = academyConfig({ buy: ['ma'] });
    const first = await runAcademy({
      db,
      config,
      snapshot: marketSnapshot({ symbols: { AAA: huntCandidate({ close_vnd: '18800' }) } }),
      trends: { AAA: 'up' },
    });
    const second = await first.service.runAccountSession(USER, SESSION);
    expect(second).toEqual(first.result);
    expect(executions(db, 'sell')).toHaveLength(1);
    expect(executions(db, 'buy')).toEqual([]);
    expect(first.receipt?.blocked_symbols_at_start).toEqual(['AAA']);
  });

  it('E06 a position above 30% is not automatically rebalanced', async () => {
    const run = await runAcademy({
      positions: [position({ qty_open: 2000, entry_value_vnd: '40000000' })],
      cash: '60000000',
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '30000', close_is_official: true } },
      }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('E07 failed sell ledger write rolls back sale and prevents buying with proceeds', async () => {
    const db = new FakeBotDatabase([position({ symbol: 'HOLD' })]);
    db.cash = '0';
    db.failOnSql = (sql) => sql.startsWith('insert into bot_cash_ledger');
    await expect(
      runAcademy({
        db,
        config: academyConfig({ buy: ['ma'] }),
        snapshot: marketSnapshot({
          symbols: {
            HOLD: { close_vnd: '18800', close_is_official: true },
            AAA: huntCandidate(),
          },
        }),
        trends: { AAA: 'up' },
        cash: '0',
      }),
    ).rejects.toThrow('injected SQL failure');
    expect(db.executions).toEqual([]);
    expect(db.positions.find((row) => row.symbol === 'HOLD')?.status).toBe('open');
    expect(db.receipts[0]?.status).toBe('failed');
    expect(decisions(db, 'ledger_error')).toHaveLength(1);
  });

  it('E08 reconciliation failure leaves no fake Buy committed', async () => {
    const db = new FakeBotDatabase([]);
    db.reconciliationValid = false;
    const run = await runAcademy({
      db,
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    expect(run.result.status).toBe('failed');
    expect(db.executions).toEqual([]);
    expect(run.result.issues.map((row) => row.code)).toContain('reconciliation_failed');
  });

  it('F02 retries reuse the pinned config and source snapshot', async () => {
    const firstReader = reader(academyConfig({ buy: ['ma'], revision: 3 }));
    const first = await runAcademy({ configReader: firstReader, trends: { AAA: 'up' } });
    const newer = reader(academyConfig({ buy: [], sell: ['ma'], revision: 4 }));
    const retry = new BotService(
      first.db as unknown as DatabaseService,
      provider(marketSnapshot()),
      newer,
      marketData({ AAA: 'down' }),
    );
    const again = await retry.runAccountSession(USER, SESSION);
    expect(again).toEqual(first.result);
    expect(first.db.receipts).toHaveLength(1);
    expect(newer.current).not.toHaveBeenCalled();
    expect(newer.getRevision).not.toHaveBeenCalled();
  });

  it('F05 legacy position fields remain unchanged and legacy TP is non-operative', async () => {
    const legacy = position({
      qty_open: 321,
      entry_price_vnd: '20000',
      stop_loss_vnd: '19000',
      take_profit_vnd: '22000',
    });
    const run = await runAcademy({
      positions: [legacy],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '22500', close_is_official: true } },
      }),
    });
    expect(run.db.positions[0]).toMatchObject({
      qty_open: 321,
      entry_price_vnd: '20000',
      stop_loss_vnd: '19000',
      take_profit_vnd: '22000',
      status: 'open',
    });
    const response = (await run.service.positions(USER)) as {
      items: Array<{ legacy_take_profit_vnd: string | null; entry_config_revision: number | null }>;
    };
    expect(response.items[0]).toMatchObject({
      legacy_take_profit_vnd: '22000',
      entry_config_revision: null,
    });
  });

  it('F06 no verified Academy selection cannot auto-activate legacy V1 Buy', async () => {
    const run = await runAcademy({ config: null, trends: { AAA: 'up' } });
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'waiting_for_academy_conditions')).toHaveLength(1);
  });

  it('F07 retry of a completed run writes no duplicate execution or extra Buy allowance', async () => {
    const first = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: huntCandidate(), BBB: huntCandidate() } }),
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(executions(first.db, 'buy')).toHaveLength(2);
    await first.service.runAccountSession(USER, SESSION);
    expect(executions(first.db, 'buy')).toHaveLength(2);
    expect(first.db.receipts).toHaveLength(1);
  });

  it('F07 refuses a second trading date while another account run is still running', async () => {
    const db = new FakeBotDatabase([]);
    db.receipts.push({
      id: '00000000-0000-4000-8000-000000000099',
      user_id: USER,
      bot_account_id: ACCOUNT,
      trading_date: '2026-09-22',
      status: 'running',
    });
    await expect(runAcademy({ db, config: null })).rejects.toThrow(
      'Another Bot session is already running',
    );
    expect(db.receipts).toHaveLength(1);
  });

  it('F07 refuses backdated processing after a later session succeeded', async () => {
    const db = new FakeBotDatabase([]);
    db.receipts.push({
      id: '00000000-0000-4000-8000-000000000098',
      user_id: USER,
      bot_account_id: ACCOUNT,
      trading_date: '2026-09-24',
      status: 'succeeded',
    });
    await expect(runAcademy({ db, config: null })).rejects.toThrow(
      'Bot sessions must be processed in trading-date order',
    );
    expect(db.receipts).toHaveLength(1);
  });

  it('waiting-only run ignores incomplete unused Hunt input and succeeds', async () => {
    const run = await runAcademy({
      config: null,
      snapshot: marketSnapshot({ buyInputsComplete: false, symbols: {} }),
    });
    expect(run.result.status).toBe('succeeded');
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'waiting_for_academy_conditions')).toHaveLength(1);
  });

  it('missing stored stop records a warning but a valid Academy Sell still executes', async () => {
    const run = await runAcademy({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position({ stop_loss_vnd: null })],
      snapshot: marketSnapshot({
        symbols: { HOLD: { close_vnd: '19500', close_is_official: true } },
      }),
      trends: { HOLD: 'down' },
    });
    expect(decisions(run.db, 'missing_stop')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'academy_sell' }]);
  });

  it.each([
    ['reader failure', () => reader(null, { throwRead: true })],
    [
      'hash drift',
      () => {
        const config = academyConfig({ buy: ['ma'] });
        return reader(config, { hash: 'b'.repeat(64) });
      },
    ],
    ['ungranted active indicator', () => reader(academyConfig({ buy: ['ma'] }), { grants: [] })],
    [
      'unknown indicator',
      () => {
        const config = academyConfig({ buy: ['ma'] });
        (config.indicators as Record<string, unknown>).unknown = structuredClone(
          config.indicators.ma,
        );
        return reader(config, { grants: ['ma', 'unknown'] });
      },
    ],
    [
      'enabled side with empty rules',
      () => {
        const config = academyConfig({ buy: ['ma'] });
        config.indicators.ma!.buy.rules = [];
        return reader(config);
      },
    ],
    [
      'invalid operator',
      () => {
        const config = academyConfig({ buy: ['ma'] });
        config.indicators.ma!.buy.rules[0]!.op = '∈';
        return reader(config);
      },
    ],
  ])(
    'config invalid or unauthorized: %s is stop-only and still finishes NAV',
    async (_name, makeReader) => {
      const run = await runAcademy({
        configReader: makeReader(),
        positions: [position()],
        snapshot: marketSnapshot({
          symbols: {
            HOLD: { close_vnd: '18800', close_is_official: true },
            AAA: huntCandidate(),
          },
        }),
        trends: { AAA: 'up' },
        cash: '98000000',
      });
      expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'stop_loss' }]);
      expect(executions(run.db, 'buy')).toEqual([]);
      expect(decisions(run.db, 'config_invalid_or_unauthorized')).toHaveLength(1);
      expect(run.db.nav).toHaveLength(1);
    },
  );

  it('academy condition decisions persist revision and trace operands', async () => {
    const run = await runAcademy({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    const decision = decisions(run.db, 'academy_buy')[0];
    expect(decision?.decision_config_revision).toBe(3);
    expect(decision?.condition_snapshot).toMatchObject({
      buy_active_ids: ['ma'],
      sell_active_ids: [],
    });
    expect((decision?.condition_snapshot as { rules: unknown[] }).rules.length).toBeGreaterThan(0);
    const journal = (await run.service.journal(USER, undefined, 20)) as {
      items: Array<{
        reason_code: string;
        policy_version: string | null;
        decision_config_revision: number | null;
        condition_snapshot: object | null;
      }>;
    };
    expect(journal.items.find((item) => item.reason_code === 'academy_buy')).toMatchObject({
      policy_version: BOT_POLICY.policy_version,
      decision_config_revision: 3,
      condition_snapshot: decision?.condition_snapshot,
    });
  });
});
