import { describe, expect, it, vi } from 'vitest';

import {
  BOT_DECISION_REASON_CODES,
  BOT_POLICY,
  BotService,
  LEGACY_ACADEMY_POLICY,
  canonicalHash,
  snapshotHash,
  verifyRuleReceipt,
  type BotMarketSnapshotInput,
  type BotSnapshotSymbol,
  type BotUniverseEvidence,
  type BotUniversePort,
} from '../../src/modules/bots/index.js';
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
  instanceInserts: unknown[][] = [];
  failOnSql: ((sql: string) => boolean) | null = null;
  reconciliationValid = true;
  executedSql: string[] = [];

  constructor(positions: Row[]) {
    this.positions = positions.map((row) => ({ ...row }));
  }

  async transaction<T>(operation: (client: FakeBotDatabase) => Promise<T>): Promise<T> {
    const before = structuredClone({
      cash: this.cash,
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
      instanceInserts: this.instanceInserts,
    });
    try {
      return await operation(this);
    } catch (error) {
      this.cash = before.cash;
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
      this.instanceInserts = before.instanceInserts;
      throw error;
    }
  }

  query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    this.executedSql.push(normalized);
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
      cap6_graduated_at: null,
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
    if (sql.startsWith('select id from bot_instances where user_id = $1')) {
      return this.instanceId ? [{ id: this.instanceId }] : [];
    }
    if (sql.startsWith('select i.user_id from bot_instances i join bot_accounts a')) {
      return [{ user_id: USER }];
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
              activated_at: '2026-01-01T00:00:00Z',
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
      this.instanceInserts.push([...v]);
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
        universe_revision: v[13],
        universe_kind: v[14],
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
    if (sql.startsWith('select * from bot_market_snapshots where bot_run_id')) {
      return this.snapshots.filter((row) => row.bot_run_id === v[0]);
    }
    if (sql.startsWith('select count(*)::text as open_positions')) {
      const open = this.positions.filter((row) => row.status === 'open');
      return [{ open_positions: String(open.length) }];
    }
    if (sql.startsWith('select trading_date, cash_vnd, market_value_vnd, nav_vnd')) {
      return this.nav.slice(-1);
    }
    if (sql.startsWith('select trading_date, nav_vnd, valuation_complete from bot_nav_daily')) {
      return this.nav.slice(-1);
    }
    if (sql.startsWith('select r.* from bot_run_receipts r where r.user_id = $1')) {
      return [...this.receipts].reverse().slice(0, 1);
    }
    if (sql.startsWith('select p.*, s.icb_lv2 as sector')) {
      return this.positions
        .filter((row) => row.status === 'open')
        .map((row) => ({ ...row, sector: null, holding_sessions: 3 }));
    }
    if (sql.startsWith('select distinct on (d.symbol)')) {
      const symbols = v[1] as string[];
      return symbols.flatMap((name) => {
        const last = this.decisions.filter((row) => row.symbol === name).at(-1);
        return last
          ? [
              {
                ...last,
                trading_date: SESSION,
                decision_config_revision: last.decision_config_revision,
              },
            ]
          : [];
      });
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
          universe_revision: receipt?.universe_revision ?? null,
          universe_kind: receipt?.universe_kind ?? null,
          execution_id_joined: execution?.id ?? null,
          execution_side: execution?.side,
          execution_qty: execution?.qty,
          execution_price_vnd: execution?.price_vnd,
          execution_gross_value_vnd: execution?.gross_value_vnd,
          execution_fee_vnd: execution?.fee_vnd,
          execution_tax_vnd: execution?.tax_vnd,
          execution_net_cash_delta_vnd: execution?.net_cash_delta_vnd,
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
          rank_tuple: v[8] === null ? null : JSON.parse(String(v[8])),
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
    if (sql.startsWith('insert into bot_positions')) {
      this.positions.push({
        id: v[0],
        bot_account_id: v[1],
        symbol: v[2],
        qty_open: v[3],
        entry_price_vnd: v[4],
        entry_value_vnd: v[5],
        entry_fee_vnd: v[6],
        amplitude_at_entry_vnd: null,
        amplitude_source_ref: null,
        stop_loss_vnd: null,
        take_profit_vnd: null,
        entry_config_revision: v[7],
        opened_session: v[8],
        opened_at: v[9],
        status: 'open',
        closed_session: null,
        filter_ids: [],
        source_refs: JSON.parse(String(v[10])),
        buy_execution_id: v[11],
        entry_source_snapshot: JSON.parse(String(v[12])),
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
    // Legacy stop evidence: stored for history, never executed.
    amplitude_at_entry_vnd: '500',
    amplitude_source_ref: 'l1:entry',
    stop_loss_vnd: '19000',
    take_profit_vnd: '22000',
    entry_config_revision: null,
    entry_source_snapshot: null,
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

/** A universe member with an official close, liquidity and a tradable status. */
function member(overrides: BotSnapshotSymbol = {}): BotSnapshotSymbol {
  return {
    close_vnd: '20000',
    close_is_official: true,
    trading_value_avg20_vnd: '2000000000',
    security_status_verified: true,
    tradable_security_status: true,
    source_refs: { fixture: true },
    ...overrides,
  };
}

/** A held position outside the buy universe: only a close is needed. */
function held(close: string): BotSnapshotSymbol {
  return { close_vnd: close, close_is_official: true };
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
    data_version: 'bot-v1-fixture',
    close_is_official: true,
    buy_inputs_complete: options.buyInputsComplete ?? true,
    symbols: options.symbols ?? { AAA: member() },
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
    /** Extra fields a legacy mapping may put on the effective revision / current state. */
    effectiveExtra?: Record<string, unknown>;
    savedRevision?: number;
    savedStatus?: 'pending' | 'effective' | 'calendar_unavailable';
  } = {},
): AcademyReader {
  const revision = options.revision ?? config?.revision ?? 3;
  const hash = options.hash ?? (config ? configHash(config) : configHash(defaultConfig()));
  const effective = (
    config
      ? {
          revision,
          config,
          config_hash: hash,
          effective_session: '2026-09-22',
          ...options.effectiveExtra,
        }
      : null
  ) as EffectiveSharedConfig | null;
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
        saved_revision: options.savedRevision ?? (config ? revision : 0),
        effective_revision: config ? revision : null,
        effective_session: config ? '2026-09-22' : null,
        status: options.savedStatus ?? (config ? ('effective' as const) : ('pending' as const)),
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

function provider(input: BotMarketSnapshotInput) {
  return { buildSnapshot: vi.fn(() => Promise.resolve(structuredClone(input))) };
}

function verifiedUniverse(
  symbols: string[],
  overrides: Partial<BotUniverseEvidence> = {},
): BotUniverseEvidence {
  const sorted = [...symbols].sort();
  return {
    status: 'verified',
    kind: 'vn30',
    revision: 0,
    name: 'VN30',
    saved_list_id: null,
    effective_session: null,
    symbols: sorted,
    symbols_hash: canonicalHash(sorted),
    membership: {
      index_code: 'VN30',
      session_date: SESSION,
      source: 'fixture',
      source_hash: 'f'.repeat(64),
      fetched_at: '2026-09-23T11:40:00.000Z',
    },
    unavailable_reason: null,
    ...overrides,
  };
}

function universePort(
  evidence: BotUniverseEvidence,
  options: { revisionId?: string | null; consume?: boolean[] } = {},
) {
  const consumeResults = [...(options.consume ?? [])];
  const port = {
    resolveForSession: vi.fn(() =>
      Promise.resolve({ evidence, revisionId: options.revisionId ?? null }),
    ),
    consume: vi.fn(() => Promise.resolve(consumeResults.length ? consumeResults.shift()! : true)),
    effectiveSymbols: vi.fn(() =>
      Promise.resolve(new Set(evidence.symbols) as ReadonlySet<string>),
    ),
  };
  return port satisfies BotUniversePort;
}

async function runBot(
  options: {
    config?: SharedConfig | null;
    configReader?: AcademyReader;
    snapshot?: BotMarketSnapshotInput;
    positions?: Row[];
    trends?: Record<string, Trend>;
    cash?: string;
    db?: FakeBotDatabase;
    universe?: string[] | BotUniverseEvidence;
    universeOptions?: { revisionId?: string | null; consume?: boolean[] };
  } = {},
) {
  const db = options.db ?? new FakeBotDatabase(options.positions ?? []);
  db.cash = options.cash ?? '100000000';
  const input = options.snapshot ?? marketSnapshot();
  const configReader = options.configReader ?? reader(options.config ?? null);
  const evidence = Array.isArray(options.universe)
    ? verifiedUniverse(options.universe)
    : (options.universe ?? verifiedUniverse(['AAA']));
  const universe = universePort(evidence, options.universeOptions);
  const snapshotProvider = provider(input);
  const service = new BotService(
    db as unknown as DatabaseService,
    snapshotProvider,
    configReader,
    marketData(options.trends ?? {}),
    universe,
  );
  const result = await service.runAccountSession(USER, SESSION);
  for (const row of db.decisions) {
    expect(allowedReasons.has(String(row.reason_code)), String(row.reason_code)).toBe(true);
  }
  return {
    db,
    result,
    service,
    configReader,
    receipt: db.receipts[0],
    input,
    universe,
    snapshotProvider,
  };
}

function decisions(db: FakeBotDatabase, reason: string): Row[] {
  return db.decisions.filter((row) => row.reason_code === reason);
}

function executions(db: FakeBotDatabase, side: 'buy' | 'sell'): Row[] {
  return db.executions.filter((row) => row.side === side);
}

function newAccountDb(): FakeBotDatabase {
  const db = new FakeBotDatabase([]);
  Object.assign(db, { cash: '0', instanceId: null, accountExists: false, fundingExists: false });
  return db;
}

describe('Bot account initialisation (workspace ensure)', () => {
  it('I01 initialises one 100m account without any graduation or level gate', async () => {
    const db = newAccountDb();
    const service = new BotService(db as unknown as DatabaseService, undefined, reader(null));

    const initialized = await service.initializeAccount(USER);

    expect(initialized.initialized).toBe(true);
    expect(db.cash).toBe('100000000');
    expect(db.ledger).toHaveLength(1);
    expect(String(db.ledger[0]?.sql)).toContain("'initial_funding'");
    expect((db.ledger[0]?.values as unknown[])[3]).toBe(`bot:v1:funding:${USER}`);
    expect(db.executedSql.some((sql) => sql.includes('cap6_progress'))).toBe(false);
    // The legacy graduation timestamp is NULL for gate-free accounts.
    expect(sqlOf(db, 'insert into bot_instances')).toContain('null');
  });

  it('I02 repeated or concurrent-looking initialisation never funds twice', async () => {
    const db = newAccountDb();
    const service = new BotService(db as unknown as DatabaseService, undefined, reader(null));

    const first = await service.initialize(USER);
    const second = await service.initializeUser(USER);
    const third = await service.initializeRunner(USER);

    expect(first.initialized).toBe(true);
    expect(second).toEqual({ initialized: false, instanceId: first.instanceId });
    expect(third).toEqual({ initialized: false, instanceId: first.instanceId });
    expect(db.ledger).toHaveLength(1);
    expect(db.cash).toBe('100000000');
    expect(db.instanceInserts).toHaveLength(1);
  });

  it('I03 an existing legacy account is reused: no new account, no new funding, no reset', async () => {
    const db = new FakeBotDatabase([]);
    db.cash = '87654321';
    const service = new BotService(db as unknown as DatabaseService, undefined, reader(null));

    const result = await service.initialize(USER);

    expect(result).toEqual({ initialized: false, instanceId: 'instance-1' });
    expect(db.cash).toBe('87654321');
    expect(db.ledger).toEqual([]);
    expect(db.executedSql.some((sql) => sql.startsWith('insert into bot_accounts'))).toBe(false);
  });

  it('I04 reconstructing funding for an account that lost its instance keeps the balance', async () => {
    const db = new FakeBotDatabase([]);
    Object.assign(db, { instanceId: null, fundingExists: false, cash: '100000000' });
    const service = new BotService(db as unknown as DatabaseService, undefined, reader(null));

    await expect(service.initialize(USER)).resolves.toMatchObject({ initialized: true });
    expect(db.ledger).toHaveLength(1);

    const changed = new FakeBotDatabase([]);
    Object.assign(changed, { instanceId: null, fundingExists: false, cash: '90000000' });
    await expect(
      new BotService(changed as unknown as DatabaseService, undefined, reader(null)).initialize(
        USER,
      ),
    ).rejects.toThrow('Cannot reconstruct Bot funding');
  });

  it('I05 the scheduled batch only runs existing accounts and never backfills or funds', async () => {
    const db = new FakeBotDatabase([]);
    const service = new BotService(
      db as unknown as DatabaseService,
      provider(marketSnapshot({ symbols: {} })),
      reader(null),
      undefined,
      universePort(verifiedUniverse(['AAA'])),
    );

    const batch = await service.runScheduledSession(SESSION);

    expect(batch).toEqual({
      initialized: 0,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skippedNotSession: 0,
    });
    expect(db.executedSql.some((sql) => sql.includes('cap6_progress'))).toBe(false);
    expect(db.executedSql.some((sql) => sql.startsWith('insert into bot_accounts'))).toBe(false);
    expect(db.ledger).toEqual([]);
  });
});

function sqlOf(db: FakeBotDatabase, prefix: string): string {
  return db.executedSql.find((sql) => sql.startsWith(prefix)) ?? '';
}

describe('Bot policy receipts and cutover', () => {
  it('F10 rejects empty, malformed or foreign receipts instead of trusting them', () => {
    expect(verifyRuleReceipt({}, null).valid).toBe(false);
    expect(verifyRuleReceipt({ policy_version: 'iqx-bot-v1.0' }, 'a'.repeat(64)).valid).toBe(false);
    expect(verifyRuleReceipt(null, 'a'.repeat(64)).valid).toBe(false);
  });

  it('F11 a new run is frozen under iqx-bot-v1.0 with config pin, grants and universe pin', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], revision: 8 }),
      trends: { AAA: 'up' },
      universe: verifiedUniverse(['AAA'], {
        kind: 'custom',
        revision: 4,
        name: 'Danh mục của tôi',
        saved_list_id: '10000000-0000-4000-8000-000000000001',
        effective_session: '2026-09-22',
      }),
      universeOptions: { revisionId: 'revision-row-4' },
    });
    expect(run.receipt?.policy_version).toBe('iqx-bot-v1.0');
    expect(run.receipt?.universe_revision).toBe(4);
    expect(run.receipt?.universe_kind).toBe('custom');
    const verified = verifyRuleReceipt(run.receipt?.rule_snapshot, String(run.receipt?.rule_hash));
    expect(verified).toMatchObject({
      valid: true,
      kind: 'bot',
      policyVersion: BOT_POLICY.policy_version,
      grantedCapabilities: ['indicator:ma'],
      universe: { kind: 'custom', revision: 4, status: 'verified' },
    });
    expect(verified.pin?.revision).toBe(8);
    expect(run.universe.consume).toHaveBeenCalledTimes(1);
    const payload = run.db.snapshots[0]?.payload as BotMarketSnapshotInput;
    expect(payload.universe).toMatchObject({ kind: 'custom', revision: 4, symbols: ['AAA'] });
  });

  it('F12 an old academy-activation succeeded receipt is returned read-only, never re-executed', async () => {
    const db = new FakeBotDatabase([position()]);
    const payload = marketSnapshot({ symbols: { HOLD: held('12000') } });
    const digest = snapshotHash(payload);
    const rule = {
      ...LEGACY_ACADEMY_POLICY,
      shared_config: null,
      granted_capabilities: [],
      data_hash: digest,
    };
    db.receipts.push({
      id: 'old-run',
      user_id: USER,
      bot_account_id: ACCOUNT,
      trading_date: SESSION,
      status: 'succeeded',
      started_at: '2026-09-23T12:00:00Z',
      completed_at: '2026-09-23T12:01:00Z',
      issues: [],
      rule_snapshot: rule,
      rule_hash: canonicalHash(rule),
      policy_version: 'iqx-bot-academy-activation-1',
      source_snapshot_hash: digest,
      buy_count: 0,
      sell_count: 0,
    });
    db.snapshots.push({
      id: 's1',
      bot_run_id: 'old-run',
      trading_date: SESSION,
      snapshot_hash: digest,
      payload,
    });
    const service = new BotService(
      db as unknown as DatabaseService,
      provider(marketSnapshot()),
      reader(null),
      undefined,
      universePort(verifiedUniverse(['AAA'])),
    );

    const result = await service.runAccountSession(USER, SESSION);

    // Close 12,000 is far below the stored 19,000 stop: the retired rule must not fire.
    expect(result).toMatchObject({ id: 'old-run', status: 'succeeded', sellCount: 0 });
    expect(db.executions).toEqual([]);
    expect(db.decisions).toEqual([]);
    expect(db.positions[0]?.status).toBe('open');
  });

  it('F13 a run left running under the retired policy is closed, not executed', async () => {
    const db = new FakeBotDatabase([position()]);
    const rule = {
      ...LEGACY_ACADEMY_POLICY,
      shared_config: null,
      granted_capabilities: [],
      data_hash: 'a'.repeat(64),
    };
    db.receipts.push({
      id: 'old-running',
      user_id: USER,
      bot_account_id: ACCOUNT,
      trading_date: SESSION,
      status: 'running',
      started_at: '2026-09-23T12:00:00Z',
      completed_at: null,
      issues: [],
      rule_snapshot: rule,
      rule_hash: canonicalHash(rule),
      policy_version: 'iqx-bot-academy-activation-1',
      source_snapshot_hash: 'a'.repeat(64),
      buy_count: 0,
      sell_count: 0,
    });
    const service = new BotService(
      db as unknown as DatabaseService,
      provider(marketSnapshot()),
      reader(null),
      undefined,
      universePort(verifiedUniverse(['AAA'])),
    );

    const result = await service.runAccountSession(USER, SESSION);

    expect(result.status).toBe('failed');
    expect(result.issues.map((row) => row.code)).toContain('unsupported_rule_version');
    expect(db.executions).toEqual([]);
  });
});

describe('BotService: sell step over every held position', () => {
  it('A02 a no-config run waits without trading and reports the waiting state', async () => {
    const run = await runBot({ config: null, snapshot: marketSnapshot() });
    expect(run.result.status).toBe('succeeded');
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'waiting_for_academy_conditions')).toHaveLength(1);
    const overview = (await run.service.overview(USER)) as {
      eligible: boolean;
      bot: Record<string, unknown>;
      conditions: { state: string; state_label: string; config_status: string };
    };
    expect(overview.eligible).toBe(true);
    expect(overview.bot).not.toHaveProperty('product_stage');
    expect(overview).not.toHaveProperty('current_level');
    expect(overview).not.toHaveProperty('cap6_graduated_at');
    expect(overview.conditions).toMatchObject({
      state: 'waiting_for_conditions',
      state_label: 'Chờ thiết lập điều kiện',
      config_status: 'none',
    });
  });

  it('B01 an empty Buy set never returns early: a valid Sell still sells the held position', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { HOLD: 'down' },
    });
    expect(decisions(run.db, 'no_active_buy_conditions')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toMatchObject([{ symbol: 'HOLD', reason: 'academy_sell' }]);
    expect(executions(run.db, 'buy')).toEqual([]);
  });

  it('B02 a Buy-only config buys and then keeps the position without needing a Sell', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(decisions(run.db, 'academy_buy')).toHaveLength(1);
    expect(run.db.positions.find((row) => row.symbol === 'AAA')?.status).toBe('open');
  });

  it('A06 a Sell-only config with no position neither buys nor short-sells', async () => {
    const run = await runBot({ config: academyConfig({ sell: ['ma'] }), trends: {} });
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'no_active_buy_conditions')).toHaveLength(1);
  });

  it('B03 no stop, target or holding-time exit: a deep loss held for ages stays open', async () => {
    const run = await runBot({
      positions: [position({ opened_session: '2025-01-01', stop_loss_vnd: '19000' })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('12000') } }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(run.db.positions[0]).toMatchObject({
      status: 'open',
      stop_loss_vnd: '19000',
      take_profit_vnd: '22000',
    });
    expect(decisions(run.db, 'no_active_sell_conditions')).toHaveLength(1);
    expect(run.db.decisions.some((row) => /stop|take_profit/.test(String(row.reason_code)))).toBe(
      false,
    );
  });

  it('B03b legacy take-profit 22,000 is non-operative at close 22,500', async () => {
    const run = await runBot({
      positions: [position({ take_profit_vnd: '22000' })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('22500') } }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(run.db.positions[0]?.take_profit_vnd).toBe('22000');
  });

  it('B04 buying needs no L1 amplitude, no AI layers and no filter ids', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member({ source_refs: {} }) } }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    const opened = run.db.positions.find((row) => row.symbol === 'AAA');
    expect(opened).toMatchObject({
      stop_loss_vnd: null,
      amplitude_at_entry_vnd: null,
      amplitude_source_ref: null,
      take_profit_vnd: null,
    });
  });

  it('B06 Buy and Sell both true on an empty symbol only opens a position, never sells it', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } });
    const run = await runBot({ config, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('B07 Buy and Sell both true on a held symbol sells it and does not buy it back', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } });
    const run = await runBot({
      config,
      positions: [position({ symbol: 'AAA' })],
      snapshot: marketSnapshot({ symbols: { AAA: member({ close_vnd: '21000' }) } }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'rebuy_same_session_blocked')).toHaveLength(1);
  });

  it('B07b a held symbol whose Sell is not met is never topped up', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'] });
    const run = await runBot({
      config,
      positions: [position({ symbol: 'AAA' })],
      snapshot: marketSnapshot({ symbols: { AAA: member({ close_vnd: '21000' }) } }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'already_holding')).toHaveLength(1);
    expect(decisions(run.db, 'academy_sell_not_met')).toHaveLength(1);
  });

  it('B09 missing Buy data does not block an independent Sell', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { AAA: 'short', HOLD: 'down' },
    });
    expect(decisions(run.db, 'academy_condition_missing').length).toBeGreaterThan(0);
    expect(executions(run.db, 'sell')).toMatchObject([{ reason: 'academy_sell' }]);
  });

  it('B10 two AND-ed Buy indicators: one false blocks entry', async () => {
    const config = academyConfig({ buy: ['ma', 'macd'], buyOps: { ma: '<', macd: '>' } });
    const run = await runBot({ config, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_buy_not_met')).toHaveLength(1);
  });

  it('B11 a condition true only before T is not carried into T', async () => {
    const run = await runBot({ config: academyConfig({ buy: ['ma'] }), trends: { AAA: 'drop' } });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_buy_not_met')).toHaveLength(1);
  });

  it('B12 a position opened at T is not evaluated for a same-run sale', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } });
    const run = await runBot({ config, trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('B13 membership with missing operands stays missing, never true by negation', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['bollinger'] }),
      trends: { AAA: 'short' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'academy_condition_missing')).toHaveLength(1);
  });

  it('B14 the saved less-than operator on the Buy side is respected', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], buyOps: { ma: '<' } }),
      trends: { AAA: 'down' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it('B15 a Sell condition executes at a loss, at the same-session close', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toMatchObject([
      { price_vnd: '19500', reason: 'academy_sell' },
    ]);
    expect(run.receipt?.execution_model).toBe('same_session_close');
  });

  it('B16 a missing close for one position neither fakes its exit nor blocks another Sell', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position({ symbol: 'MISS' }), position({ symbol: 'GONE' })],
      snapshot: marketSnapshot({
        symbols: { AAA: member(), MISS: { close_is_official: true }, GONE: held('19500') },
      }),
      trends: { MISS: 'down', GONE: 'down' },
      cash: '96000000',
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ symbol: 'GONE', reason: 'academy_sell' }]);
    expect(decisions(run.db, 'invalid_close')).toHaveLength(1);
    expect(run.result.issues.map((row) => row.code)).toContain('valuation_incomplete');
  });

  it('B17 Sell uses the config effective now, not the one in force when the position opened', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'], revision: 9 }),
      positions: [position({ entry_config_revision: 1 })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(decisions(run.db, 'academy_sell')[0]?.decision_config_revision).toBe(9);
  });
});

describe('BotService: buy universe', () => {
  it('U01 only universe members are considered; others in the snapshot are ignored', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), OUT: member() } }),
      universe: ['AAA'],
      trends: { AAA: 'up', OUT: 'up' },
    });
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['AAA']);
    expect(run.db.decisions.some((row) => row.symbol === 'OUT')).toBe(false);
  });

  it('U02 the provider is asked for the universe members only when Buy is usable', async () => {
    const active = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      universe: ['AAA', 'BBB'],
      snapshot: marketSnapshot({ symbols: { AAA: member(), BBB: member() } }),
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(active.snapshotProvider.buildSnapshot).toHaveBeenCalledWith(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA', 'BBB'],
    });
    const inactive = await runBot({ config: academyConfig({ sell: ['ma'] }), universe: ['AAA'] });
    expect(inactive.snapshotProvider.buildSnapshot).toHaveBeenCalledWith(SESSION, {
      openSymbols: [],
      universeSymbols: [],
    });
  });

  it('U10 a position outside the buy universe is sold when the effective Sell condition holds', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position({ symbol: 'OUTSIDE' })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), OUTSIDE: held('19500') } }),
      universe: ['AAA'],
      trends: { OUTSIDE: 'down' },
    });
    expect(executions(run.db, 'sell')).toMatchObject([{ symbol: 'OUTSIDE' }]);
    expect(decisions(run.db, 'academy_sell')[0]?.data_refs).toMatchObject({ in_universe: false });
  });

  it('U09 a position outside the universe with Sell not met is kept, flagged as watch-only', async () => {
    const run = await runBot({
      config: academyConfig({ sell: ['ma'] }),
      positions: [position({ symbol: 'OUTSIDE' })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), OUTSIDE: held('19500') } }),
      universe: ['AAA'],
      trends: { OUTSIDE: 'up' },
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(run.db.positions[0]?.status).toBe('open');
    const hold = decisions(run.db, 'academy_sell_not_met')[0];
    expect(hold?.data_refs).toMatchObject({ in_universe: false });
    expect(String(hold?.reason)).toContain('ngoài nguồn mua');
    const journal = (await run.service.journal(USER, undefined, 10)) as {
      items: Array<{ in_universe: boolean | null; reason_label: string | null }>;
    };
    expect(journal.items[0]).toMatchObject({ in_universe: false });
    expect(journal.items[0]?.reason_label).toMatch(/\S/);
  });

  it('U11 a symbol sold this run that is outside the universe is never bought back', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position({ symbol: 'OUTSIDE' })],
      snapshot: marketSnapshot({
        symbols: { AAA: member(), OUTSIDE: member({ close_vnd: '19500' }) },
      }),
      universe: ['AAA'],
      trends: { AAA: 'up', OUTSIDE: 'down' },
    });
    expect(executions(run.db, 'sell').map((row) => row.symbol)).toEqual(['OUTSIDE']);
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['AAA']);
  });

  it('U13 an unverifiable universe buys nothing but every held position is still sold', async () => {
    const unavailable = verifiedUniverse([], {
      status: 'unavailable',
      symbols_hash: null,
      membership: null,
      unavailable_reason: 'Chưa có thành phần VN30 của phiên 2026-09-23',
    });
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      universe: unavailable,
      trends: { AAA: 'up', HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'universe_unavailable')).toHaveLength(1);
    expect(run.result.status).toBe('succeeded');
    expect(run.result.issues.map((row) => row.code)).toContain('universe_unavailable');
    expect(run.snapshotProvider.buildSnapshot).toHaveBeenCalledWith(SESSION, {
      openSymbols: ['HOLD'],
      universeSymbols: [],
    });
  });

  it('U13b no universe port at all behaves as unavailable, never as "all symbols"', async () => {
    const db = new FakeBotDatabase([]);
    db.cash = '100000000';
    const service = new BotService(
      db as unknown as DatabaseService,
      provider(marketSnapshot()),
      reader(academyConfig({ buy: ['ma'] })),
      marketData({ AAA: 'up' }),
    );
    const result = await service.runAccountSession(USER, SESSION);
    expect(result.status).toBe('succeeded');
    expect(db.executions).toEqual([]);
    expect(decisions(db, 'universe_unavailable')).toHaveLength(1);
  });

  it('U14 a custom list replaces VN30: only its members, with the entry source recorded', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), CMG: member() } }),
      universe: verifiedUniverse(['CMG'], {
        kind: 'custom',
        revision: 2,
        name: 'FPT-CMG',
        saved_list_id: '10000000-0000-4000-8000-000000000002',
        effective_session: '2026-09-22',
      }),
      universeOptions: { revisionId: 'row-2' },
      trends: { AAA: 'up', CMG: 'up' },
    });
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['CMG']);
    expect(
      run.db.positions.find((row) => row.symbol === 'CMG')?.entry_source_snapshot,
    ).toMatchObject({
      kind: 'custom',
      name: 'FPT-CMG',
      revision: 2,
      saved_list_id: '10000000-0000-4000-8000-000000000002',
    });
  });

  it('U15 a revision cancelled between resolution and capture is re-resolved, not used', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
      universeOptions: { revisionId: 'row-3', consume: [false, true] },
    });
    expect(run.universe.consume).toHaveBeenCalledTimes(2);
    expect(run.snapshotProvider.buildSnapshot).toHaveBeenCalledTimes(2);
    expect(run.db.receipts).toHaveLength(1);
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it('U16 persistent capture conflicts fail the run attempt instead of looping', async () => {
    await expect(
      runBot({
        config: academyConfig({ buy: ['ma'] }),
        trends: { AAA: 'up' },
        universeOptions: { revisionId: 'row-3', consume: [false, false, false, false] },
      }),
    ).rejects.toThrow('could not be captured');
  });
});

describe('BotService: candidates, ranking and sizing', () => {
  it('C01 candidates are ranked by 20-session traded value, then symbol', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: {
          AAA: member({ trading_value_avg20_vnd: '1000000000' }),
          BBB: member({ trading_value_avg20_vnd: '3000000000' }),
          CCC: member({ trading_value_avg20_vnd: '3000000000' }),
          DDD: member({ trading_value_avg20_vnd: '2000000000' }),
        },
      }),
      universe: ['AAA', 'BBB', 'CCC', 'DDD'],
      trends: { AAA: 'up', BBB: 'up', CCC: 'up', DDD: 'up' },
    });
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['BBB', 'CCC']);
    expect(decisions(run.db, 'academy_buy')[0]?.rank_tuple).toEqual([
      BOT_POLICY.candidate_order,
      '3000000000',
      'BBB',
    ]);
    expect(decisions(run.db, 'session_buy_limit')).toHaveLength(1);
  });

  it('C02 a missing 20-session value is "missing_liquidity_data", not an invalid close', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: {
          AAA: member({ trading_value_avg20_vnd: undefined }),
          BBB: member(),
        },
      }),
      universe: ['AAA', 'BBB'],
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(decisions(run.db, 'missing_liquidity_data').map((row) => row.symbol)).toEqual(['AAA']);
    expect(decisions(run.db, 'invalid_close')).toEqual([]);
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['BBB']);
    expect(run.result.status).toBe('succeeded');
  });

  it('C03 one symbol without a close or with a blocked status never fails the others', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: {
          NOCLOSE: { close_is_official: false },
          RESTR: member({ tradable_security_status: false }),
          UNK: member({ security_status_verified: false, tradable_security_status: false }),
          GOOD: member(),
        },
      }),
      universe: ['NOCLOSE', 'RESTR', 'UNK', 'GOOD'],
      trends: { GOOD: 'up' },
    });
    expect(decisions(run.db, 'invalid_close').map((row) => row.symbol)).toEqual(['NOCLOSE']);
    expect(decisions(run.db, 'security_status_blocked').map((row) => row.symbol)).toEqual([
      'RESTR',
    ]);
    expect(decisions(run.db, 'missing_security_status').map((row) => row.symbol)).toEqual(['UNK']);
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['GOOD']);
    expect(run.result.status).toBe('succeeded');
  });

  it('C04 an empty eligible set records no_eligible_candidates and still sells', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({
        symbols: { AAA: { close_is_official: false }, HOLD: held('19500') },
      }),
      trends: { HOLD: 'down' },
    });
    expect(decisions(run.db, 'no_eligible_candidates')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toHaveLength(1);
  });

  it('E01 NAV 100m, price 20,000, lot 100 and 0.1% fee buys 500 shares', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ feeBps: 10 }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toMatchObject([
      { qty: 500, price_vnd: '20000', fee_vnd: '10000' },
    ]);
    expect(run.db.cash).toBe('89990000');
  });

  it('E02 the second Buy uses the locked NAV basis and reduced current cash', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), BBB: member() } }),
      universe: ['AAA', 'BBB'],
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(executions(run.db, 'buy')).toHaveLength(2);
    expect(run.receipt?.nav_basis_vnd).toBe('100000000');
    expect(run.db.cash).toBe('79980000');
  });

  it('E03 skipped candidates do not use up a slot and the cap counts successful Buys only', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({
        symbols: {
          BAD: member({ trading_value_avg20_vnd: '9000000000', close_vnd: '2000000000' }),
          AAA: member({ trading_value_avg20_vnd: '3000000000' }),
          BBB: member({ trading_value_avg20_vnd: '2000000000' }),
          CCC: member({ trading_value_avg20_vnd: '1000000000' }),
        },
      }),
      universe: ['BAD', 'AAA', 'BBB', 'CCC'],
      trends: { BAD: 'up', AAA: 'up', BBB: 'up', CCC: 'up' },
    });
    // BAD ranks first but one lot is unaffordable; it is skipped and AAA/BBB take the 2 slots.
    expect(decisions(run.db, 'insufficient_cash_or_lot').map((row) => row.symbol)).toEqual(['BAD']);
    expect(executions(run.db, 'buy').map((row) => row.symbol)).toEqual(['AAA', 'BBB']);
    expect(decisions(run.db, 'session_buy_limit')).toHaveLength(1);
  });

  it('E04 the Sell count is uncapped while new Buys remain capped at two', async () => {
    const symbols: Record<string, BotSnapshotSymbol> = {
      P1: held('18800'),
      P2: held('18800'),
      P3: held('18800'),
      AAA: member(),
      BBB: member(),
      CCC: member(),
    };
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [
        position({ symbol: 'P1' }),
        position({ symbol: 'P2' }),
        position({ symbol: 'P3' }),
      ],
      snapshot: marketSnapshot({ symbols }),
      universe: ['AAA', 'BBB', 'CCC'],
      trends: { AAA: 'up', BBB: 'up', CCC: 'up', P1: 'down', P2: 'down', P3: 'down' },
      cash: '94000000',
    });
    expect(executions(run.db, 'sell')).toHaveLength(3);
    expect(executions(run.db, 'buy')).toHaveLength(2);
  });

  it('E05 a symbol held or sold in the run stays blocked across retry', async () => {
    const db = new FakeBotDatabase([position({ symbol: 'AAA' })]);
    db.cash = '98000000';
    const first = await runBot({
      db,
      config: academyConfig({ buy: ['ma'], sell: ['ma'], sellOps: { ma: '>' } }),
      snapshot: marketSnapshot({ symbols: { AAA: member({ close_vnd: '18800' }) } }),
      trends: { AAA: 'up' },
    });
    const second = await first.service.runAccountSession(USER, SESSION);
    expect(second).toEqual(first.result);
    expect(executions(db, 'sell')).toHaveLength(1);
    expect(executions(db, 'buy')).toEqual([]);
    expect(first.receipt?.blocked_symbols_at_start).toEqual(['AAA']);
  });

  it('E06 a position above 30% is not rebalanced', async () => {
    const run = await runBot({
      positions: [position({ qty_open: 2000, entry_value_vnd: '40000000' })],
      cash: '60000000',
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('30000') } }),
    });
    expect(executions(run.db, 'sell')).toEqual([]);
  });

  it('E07 failed sell ledger write rolls back the sale and prevents buying with proceeds', async () => {
    const db = new FakeBotDatabase([position({ symbol: 'HOLD' })]);
    db.cash = '0';
    db.failOnSql = (sql) => sql.startsWith('insert into bot_cash_ledger');
    await expect(
      runBot({
        db,
        config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
        snapshot: marketSnapshot({ symbols: { HOLD: held('18800'), AAA: member() } }),
        trends: { AAA: 'up', HOLD: 'down' },
        cash: '0',
      }),
    ).rejects.toThrow('injected SQL failure');
    expect(db.executions).toEqual([]);
    expect(db.positions.find((row) => row.symbol === 'HOLD')?.status).toBe('open');
    expect(db.receipts[0]?.status).toBe('failed');
    expect(decisions(db, 'ledger_error')).toHaveLength(1);
  });

  it('E08 a reconciliation failure leaves no fake Buy committed', async () => {
    const db = new FakeBotDatabase([]);
    db.reconciliationValid = false;
    const run = await runBot({
      db,
      config: academyConfig({ buy: ['ma'] }),
      trends: { AAA: 'up' },
    });
    expect(run.result.status).toBe('failed');
    expect(db.executions).toEqual([]);
    expect(run.result.issues.map((row) => row.code)).toContain('reconciliation_failed');
  });

  it('E09 an incomplete NAV basis blocks new Buys but a Sell with data still runs', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position({ symbol: 'MISS' }), position({ symbol: 'GONE' })],
      snapshot: marketSnapshot({
        symbols: { AAA: member(), MISS: { close_is_official: true }, GONE: held('19500') },
      }),
      trends: { AAA: 'up', GONE: 'down', MISS: 'down' },
      cash: '96000000',
    });
    expect(executions(run.db, 'sell').map((row) => row.symbol)).toEqual(['GONE']);
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'ledger_error')).toHaveLength(1);
  });
});

describe('BotService: config sides are blocked, never silently narrowed', () => {
  it.each([
    ['reader failure', () => reader(null, { throwRead: true })],
    [
      'hash drift',
      () => reader(academyConfig({ buy: ['ma'], sell: ['ma'] }), { hash: 'b'.repeat(64) }),
    ],
    [
      'ungranted active indicator on both sides',
      () => reader(academyConfig({ buy: ['ma'], sell: ['ma'] }), { grants: [] }),
    ],
  ])(
    'C17 %s blocks both sides: nothing trades, positions are held, NAV is still written',
    async (_n, makeReader) => {
      const run = await runBot({
        configReader: makeReader(),
        positions: [position()],
        snapshot: marketSnapshot({ symbols: { HOLD: held('18800'), AAA: member() } }),
        trends: { AAA: 'up', HOLD: 'down' },
        cash: '98000000',
      });
      expect(executions(run.db, 'sell')).toEqual([]);
      expect(executions(run.db, 'buy')).toEqual([]);
      expect(decisions(run.db, 'config_invalid_or_unauthorized').length).toBeGreaterThanOrEqual(2);
      expect(run.db.nav).toHaveLength(1);
      expect(run.db.positions[0]?.status).toBe('open');
    },
  );

  it('C18 an unauthorized Sell indicator blocks only the Sell side; a valid Buy side still buys', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['macd'] });
    const run = await runBot({
      configReader: reader(config, { grants: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('18800') } }),
      trends: { AAA: 'up', HOLD: 'down' },
      cash: '98000000',
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    const hold = decisions(run.db, 'config_invalid_or_unauthorized')[0];
    expect(hold).toMatchObject({ symbol: 'HOLD', action: 'hold' });
    expect(executions(run.db, 'buy')).toHaveLength(1);
    expect(run.result.issues.map((row) => row.code)).toContain('config_invalid_or_unauthorized');
  });

  it('C19 an unauthorized Buy indicator blocks the Buy side; a valid Sell side still sells', async () => {
    const config = academyConfig({ buy: ['macd'], sell: ['ma'] });
    const run = await runBot({
      configReader: reader(config, { grants: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { AAA: 'up', HOLD: 'down' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(decisions(run.db, 'config_invalid_or_unauthorized')[0]?.symbol).toBeNull();
  });

  it('C20 an invalid indicator is not dropped so the remaining ones decide', async () => {
    // macd is invalid (ungranted); ma alone would be true, but the side must not trade.
    const config = academyConfig({ buy: ['ma', 'macd'] });
    const run = await runBot({
      configReader: reader(config, { grants: ['ma'] }),
      trends: { AAA: 'up' },
    });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'config_invalid_or_unauthorized')).toHaveLength(1);
    expect(decisions(run.db, 'academy_buy')).toEqual([]);
  });

  it('C21 an unsupported (legacy) indicator enabled on Sell blocks Sell as legacy_needs_review', async () => {
    const config = academyConfig({ sell: ['ma'] });
    (config.indicators as Record<string, unknown>).removed_indicator = structuredClone(
      config.indicators.ma,
    );
    const run = await runBot({
      configReader: reader(config, { grants: ['ma', 'removed_indicator'] }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(decisions(run.db, 'legacy_needs_review')).toMatchObject([
      { symbol: 'HOLD', action: 'hold' },
    ]);
  });

  it('C22 a legacy mapping flag on the effective revision blocks only that side', async () => {
    const config = academyConfig({ buy: ['ma'], sell: ['ma'] });
    const run = await runBot({
      configReader: reader(config, { effectiveExtra: { legacy_needs_review: { sell: true } } }),
      positions: [position()],
      snapshot: marketSnapshot({ symbols: { AAA: member(), HOLD: held('19500') } }),
      trends: { AAA: 'up', HOLD: 'down' },
    });
    expect(executions(run.db, 'sell')).toEqual([]);
    expect(decisions(run.db, 'legacy_needs_review')).toHaveLength(1);
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });

  it.each([
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
  ])('C23 %s blocks the Buy side with an explicit reason', async (_name, makeReader) => {
    const run = await runBot({ configReader: makeReader(), trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toEqual([]);
    expect(decisions(run.db, 'config_invalid_or_unauthorized')).toHaveLength(1);
  });

  it('C24 an inactive but structurally odd indicator does not block the active ones', async () => {
    const config = academyConfig({ buy: ['ma'] });
    (config.indicators as Record<string, unknown>).removed_off = {
      ...structuredClone(config.indicators.ma),
      master_enabled: false,
    };
    const run = await runBot({ configReader: reader(config), trends: { AAA: 'up' } });
    expect(executions(run.db, 'buy')).toHaveLength(1);
  });
});

describe('BotService: idempotency and retries', () => {
  it('F02 retries reuse the pinned config and source snapshot', async () => {
    const firstReader = reader(academyConfig({ buy: ['ma'], revision: 3 }));
    const first = await runBot({ configReader: firstReader, trends: { AAA: 'up' } });
    const newer = reader(academyConfig({ buy: [], sell: ['ma'], revision: 4 }));
    const retry = new BotService(
      first.db as unknown as DatabaseService,
      provider(marketSnapshot()),
      newer,
      marketData({ AAA: 'down' }),
      universePort(verifiedUniverse(['AAA'])),
    );
    const again = await retry.runAccountSession(USER, SESSION);
    expect(again).toEqual(first.result);
    expect(first.db.receipts).toHaveLength(1);
    expect(newer.current).not.toHaveBeenCalled();
    expect(newer.getRevision).not.toHaveBeenCalled();
  });

  it('F07 retry of a completed run writes no duplicate execution or extra Buy allowance', async () => {
    const first = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), BBB: member() } }),
      universe: ['AAA', 'BBB'],
      trends: { AAA: 'up', BBB: 'up' },
    });
    expect(executions(first.db, 'buy')).toHaveLength(2);
    await first.service.runAccountSession(USER, SESSION);
    expect(executions(first.db, 'buy')).toHaveLength(2);
    expect(first.db.receipts).toHaveLength(1);
  });

  it('F08 a changed config revision cannot grant a second pair of Buys for the same session', async () => {
    const first = await runBot({
      config: academyConfig({ buy: ['ma'], revision: 3 }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), BBB: member(), CCC: member() } }),
      universe: ['AAA', 'BBB', 'CCC'],
      trends: { AAA: 'up', BBB: 'up', CCC: 'up' },
    });
    expect(executions(first.db, 'buy')).toHaveLength(2);
    const changed = new BotService(
      first.db as unknown as DatabaseService,
      provider(marketSnapshot()),
      reader(academyConfig({ buy: ['ma'], revision: 4 })),
      marketData({ AAA: 'up', BBB: 'up', CCC: 'up' }),
      universePort(verifiedUniverse(['AAA', 'BBB', 'CCC'])),
    );
    await changed.runAccountSession(USER, SESSION);
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
    await expect(runBot({ db, config: null })).rejects.toThrow(
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
    await expect(runBot({ db, config: null })).rejects.toThrow(
      'Bot sessions must be processed in trading-date order',
    );
    expect(db.receipts).toHaveLength(1);
  });

  it('a waiting-only run ignores incomplete unused buy inputs and succeeds', async () => {
    const run = await runBot({
      config: null,
      snapshot: marketSnapshot({ buyInputsComplete: false, symbols: {} }),
    });
    expect(run.result.status).toBe('succeeded');
    expect(run.db.executions).toEqual([]);
    expect(decisions(run.db, 'waiting_for_academy_conditions')).toHaveLength(1);
  });

  it('Buy inputs incomplete is an explicit non-failing skip while Sells still run', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'], sell: ['ma'] }),
      positions: [position()],
      snapshot: marketSnapshot({
        buyInputsComplete: false,
        symbols: { AAA: member(), HOLD: held('19500') },
      }),
      trends: { AAA: 'up', HOLD: 'down' },
    });
    expect(decisions(run.db, 'buy_inputs_incomplete')).toHaveLength(1);
    expect(executions(run.db, 'sell')).toHaveLength(1);
    expect(run.result.status).toBe('succeeded');
  });
});

describe('BotService: read models', () => {
  it('R01 the overview derives the config state from the EFFECTIVE config', async () => {
    const cases: Array<[SharedConfig | null, string, string]> = [
      [null, 'waiting_for_conditions', 'Chờ thiết lập điều kiện'],
      [academyConfig({ buy: ['ma'] }), 'buy_only', 'Đã bật điều kiện Mua'],
      [academyConfig({ sell: ['ma'] }), 'sell_only', 'Chỉ xét điều kiện Bán'],
      [academyConfig({ buy: ['ma'], sell: ['macd'] }), 'buy_and_sell', 'Đã bật Mua và Bán'],
    ];
    for (const [config, state, label] of cases) {
      const db = new FakeBotDatabase([]);
      const service = new BotService(db as unknown as DatabaseService, undefined, reader(config));
      const overview = (await service.overview(USER)) as {
        conditions: Record<string, unknown>;
      };
      expect(overview.conditions).toMatchObject({ state, state_label: label });
    }
  });

  it('R02 an invalid or legacy-flagged side reads as an explicit error with its reason', async () => {
    const db = new FakeBotDatabase([]);
    const service = new BotService(
      db as unknown as DatabaseService,
      undefined,
      reader(academyConfig({ buy: ['ma'], sell: ['macd'] }), { grants: ['ma'] }),
    );
    const overview = (await service.overview(USER)) as {
      conditions: {
        state: string;
        buy_status: string;
        sell_status: string;
        errors: { buy: unknown; sell: { reason: string; indicator_ids: string[] } };
      };
    };
    expect(overview.conditions).toMatchObject({
      state: 'error',
      buy_status: 'active',
      sell_status: 'blocked',
    });
    expect(overview.conditions.errors.sell).toMatchObject({
      reason: 'config_invalid_or_unauthorized',
      indicator_ids: ['macd'],
    });

    const legacy = new BotService(
      db as unknown as DatabaseService,
      undefined,
      reader(academyConfig({ buy: ['ma'] }), { effectiveExtra: { legacy_needs_review: ['ma'] } }),
    );
    const legacyOverview = (await legacy.overview(USER)) as {
      conditions: { state: string; errors: { buy: { reason: string } } };
    };
    expect(legacyOverview.conditions.state).toBe('error');
    expect(legacyOverview.conditions.errors.buy.reason).toBe('legacy_needs_review');
  });

  it('R03 saved-but-pending revisions are shown separately from the effective one', async () => {
    const db = new FakeBotDatabase([]);
    const service = new BotService(
      db as unknown as DatabaseService,
      undefined,
      reader(academyConfig({ buy: ['ma'], revision: 3 }), {
        savedRevision: 5,
        savedStatus: 'pending',
      }),
    );
    const overview = (await service.overview(USER)) as {
      conditions: { saved_revision: number; effective_revision: number; pending: unknown };
    };
    expect(overview.conditions).toMatchObject({
      saved_revision: 5,
      effective_revision: 3,
      pending: { revision: 5, status: 'pending' },
    });
  });

  it('R04 the overview is gate-free: no account means not eligible, an account means eligible', async () => {
    const db = new FakeBotDatabase([]);
    Object.assign(db, { instanceId: null });
    const none = new BotService(db as unknown as DatabaseService, undefined, reader(null));
    // No bot_instances row: the join-based lookup is answered by the fake, so model "no account"
    // by making the context lookup empty.
    const original = db.query.bind(db);
    db.query = ((text: string, values?: readonly unknown[]) =>
      text.includes('from bot_instances i')
        ? Promise.resolve([])
        : original(text, values)) as never;
    const overview = (await none.overview(USER)) as { eligible: boolean; bot: unknown };
    expect(overview).toMatchObject({ eligible: false, bot: null });
    expect(db.executedSql.some((sql) => sql.includes('cap6_progress'))).toBe(false);
    expect(db.executedSql.some((sql) => sql.includes('journey_identity_ui'))).toBe(false);
  });

  it('R05 status reports the latest run without any journey/mascot cursor', async () => {
    const run = await runBot({ config: null });
    const status = await run.service.status(USER);
    expect(status).toMatchObject({
      status: 'succeeded',
      latest_run_id: run.result.id,
      processed_unseen_sessions: 0,
    });
    expect(run.db.executedSql.some((sql) => sql.includes('journey_identity_ui'))).toBe(false);
  });

  it('R06 positions expose buy-source membership, entry source, holding sessions and legacy stops', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      positions: [position({ symbol: 'OUTSIDE' })],
      snapshot: marketSnapshot({ symbols: { AAA: member(), OUTSIDE: held('19500') } }),
      universe: ['AAA'],
      trends: { AAA: 'up' },
    });
    const response = (await run.service.positions(USER)) as {
      items: Array<Record<string, unknown>>;
    };
    const outside = response.items.find((item) => item.symbol === 'OUTSIDE');
    const bought = response.items.find((item) => item.symbol === 'AAA');
    expect(outside).toMatchObject({
      in_universe: false,
      source_scope: 'sell_watch_only',
      entry_source_snapshot: null,
      entry_config_revision: null,
      holding_sessions: 3,
      legacy_stop_loss_vnd: '19000',
      legacy_take_profit_vnd: '22000',
    });
    expect(outside).not.toHaveProperty('stop_loss_vnd');
    expect(bought).toMatchObject({
      in_universe: true,
      source_scope: 'in_buy_source',
      entry_config_revision: 3,
      entry_source_snapshot: { kind: 'vn30', name: 'VN30', revision: 0 },
      legacy_stop_loss_vnd: null,
    });
    expect(outside?.last_decision).toMatchObject({
      action: 'hold',
      reason_code: 'no_active_sell_conditions',
    });
  });

  it('R07 the journal explains each outcome in Vietnamese and persists revision and operands', async () => {
    const run = await runBot({
      config: academyConfig({ buy: ['ma'] }),
      snapshot: marketSnapshot({ symbols: { AAA: member(), BBB: member() } }),
      universe: ['AAA', 'BBB'],
      trends: { AAA: 'up', BBB: 'drop' },
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
        reason_label: string | null;
        policy_version: string | null;
        universe_revision: number | null;
        universe_kind: string | null;
        decision_config_revision: number | null;
        condition_snapshot: object | null;
      }>;
    };
    expect(journal.items.find((item) => item.reason_code === 'academy_buy')).toMatchObject({
      policy_version: BOT_POLICY.policy_version,
      decision_config_revision: 3,
      universe_revision: 0,
      universe_kind: 'vn30',
      condition_snapshot: decision?.condition_snapshot,
    });
    expect(journal.items.every((item) => item.reason_label)).toBe(true);
    expect(journal.items.map((item) => item.reason_code)).toContain('academy_buy_not_met');
  });
});
