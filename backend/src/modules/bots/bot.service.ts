import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { QUANT_MARKET_DATA, type QuantMarketDataProvider } from '../quant/quant.types.js';
import {
  configHash,
  indicatorCapability,
  loadTechnicalRegistry,
  sideSignalsWithEvidence,
  validateConfig,
  type Bar,
  type SharedConfig,
} from '../quant/v2/index.js';
import {
  SHARED_CONFIG_READER,
  type EffectiveSharedConfig,
  type SharedConfigReaderPort,
} from '../strategy-config/strategy-config.ports.js';
import {
  BOT_POLICY,
  candidateFromSnapshot,
  candidateRank,
  canonicalHash,
  computeBuyQuantity,
  computeProtectiveStop,
  feeRulesFromSnapshot,
  formatDecimal4,
  parseDecimal4,
  parseInteger,
  rankCandidates,
  ratioString,
  roundBasisPoints,
  sanitizeSnapshot,
  snapshotHash,
  stopLossSignal,
  type Candidate,
  type FeeRules,
} from './bot.domain.js';
import {
  activeSideIndicators,
  BOT_SHARED_CONFIG_MARKET_SYMBOL,
  BOT_SHARED_CONFIG_WARMUP_SESSIONS,
  botRuleReceipt,
  needsMarketContext,
  parseSharedConfigSignals,
  sharedConfigBuySymbols,
  verifyRuleReceipt,
  type BotSharedConfigPin,
} from './bot.shared-config.js';
import {
  BOT_SNAPSHOT_PROVIDER,
  type BotAccountRow,
  type BotBatchResult,
  type BotInstanceRow,
  type BotIssue,
  type BotMarketSnapshotInput,
  type BotPositionRow,
  type BotRunResult,
  type BotRunRow,
  type BotSharedConfigSignals,
  type BotSnapshotProvider,
} from './bot.types.js';
import type { SharedConfigState } from '../strategy-config/strategy-config.schemas.js';

const DISCLOSURE =
  'Bot demo IQX mô phỏng mua và bán theo giá đóng cửa của chính phiên tạo tín hiệu. ' +
  'Kết quả không tái hiện đầy đủ khả năng khớp lệnh, thanh khoản và thời gian thanh ' +
  'toán của giao dịch thực tế. Đây không phải cam kết lợi nhuận hoặc khuyến nghị ' +
  'giao dịch tiền thật.';

const BOT_STRATEGY_ID = 'iqx_standard';
const BOT_STRATEGY_VERSION = 1;
const INITIAL_CASH_VND = BigInt(BOT_POLICY.initial_cash_vnd);

const CRITICAL_ISSUES = new Set([
  'filter_data_incomplete',
  'source_error',
  'reconciliation_failed',
  'snapshot_hash_mismatch',
  'unsupported_rule_version',
]);

type AcademyConfigReader = SharedConfigReaderPort & {
  current(userId: string): Promise<SharedConfigState>;
};

type ConfigResolution = {
  effective: EffectiveSharedConfig | null;
  grants: string[];
  invalid: boolean;
  detail: string | null;
};

type ConditionRule = {
  id: string;
  indicator: string;
  side: 'buy' | 'sell';
  op: string;
  lhs: number | null;
  rhs: number | null;
  rhs_lower?: number | null;
  rhs_upper?: number | null;
  result: boolean | null;
  missing: boolean;
};

type ConditionSnapshot = {
  buy_active_ids: string[];
  sell_active_ids: string[];
  rules: ConditionRule[];
};

type FrozenAcademySignals = BotSharedConfigSignals & {
  buy_active_ids?: string[];
  sell_active_ids?: string[];
  buy_evidence?: Record<string, ConditionSnapshot>;
  sell_evidence?: Record<string, ConditionSnapshot>;
};

type InstanceAccountRow = BotInstanceRow & {
  account_id: string;
  account_user_id: string;
  initial_cash_vnd: string;
  cash_vnd: string;
  account_status: 'active' | 'suspended';
  account_activated_at: Date | string;
};

type SnapshotRow = {
  id: string;
  bot_run_id: string;
  trading_date: Date | string;
  snapshot_hash: string;
  payload: unknown;
  buy_inputs_complete: boolean;
};

type ExecutionRow = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  fee_vnd: string;
  tax_vnd: string;
};

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function issues(value: unknown): BotIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = objectValue(item);
    if (typeof row.code !== 'string') return [];
    return [
      {
        code: row.code,
        symbol: typeof row.symbol === 'string' ? row.symbol : null,
        detail: typeof row.detail === 'string' ? row.detail : null,
      },
    ];
  });
}

function issue(code: string, detail: string, symbol: string | null = null): BotIssue {
  return { code, detail, symbol };
}

function dedupeIssues(rows: readonly BotIssue[]): BotIssue[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.code}\0${row.symbol ?? ''}\0${row.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function configuredOperand(
  operand: { kind: string; key?: string; value?: number },
  params: Readonly<Record<string, number>>,
): number | null {
  if (operand.kind === 'param') return params[operand.key ?? ''] ?? null;
  if (operand.kind === 'constant') return operand.value ?? null;
  return null;
}

function uuidRank(candidate: Candidate): [number, string, string] {
  const rank = candidateRank(candidate);
  return [rank[0], rank[1].toString(), rank[2]];
}

function validateTradingDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequestException({
      code: 'INVALID_TRADING_DATE',
      message: 'Ngày giao dịch không hợp lệ',
    });
  }
}

/** Upper bound for one account's market snapshot; a stalled upstream must fail the run. */
export const BOT_SNAPSHOT_DEADLINE_MS = 20 * 60_000;

/** Shared-config bars: a stalled symbol becomes missing data (no entry, no shared exit). */
const SHARED_CONFIG_BARS_DEADLINE_MS = 60_000;
const SHARED_CONFIG_BARS_TTL_MS = 10 * 60_000;
const SHARED_CONFIG_BARS_CONCURRENCY = 4;

type SessionBars = { bars: Bar[]; source: string | null; hash: string };

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly sessionBarsCache = new Map<
    string,
    { expiresAt: number; pending: Promise<SessionBars | null> }
  >();

  constructor(
    private readonly database: DatabaseService,
    @Optional()
    @Inject(BOT_SNAPSHOT_PROVIDER)
    private readonly defaultSnapshotProvider: BotSnapshotProvider | undefined,
    @Inject(SHARED_CONFIG_READER)
    private readonly sharedConfigReader: AcademyConfigReader,
    @Optional()
    @Inject(QUANT_MARKET_DATA)
    private readonly marketData?: QuantMarketDataProvider,
  ) {}

  /** Stable integration aliases used by Journey/Cap-6 hooks. */
  initializeAccount(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.initialize(userId);
  }

  initializeUser(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.initialize(userId);
  }

  initializeRunner(
    userId: string,
    tradingDate?: string,
  ): Promise<{ initialized: boolean; instanceId: string | null } | BotRunResult> {
    return tradingDate === undefined
      ? this.initialize(userId)
      : this.runAccountSession(userId, tradingDate);
  }

  /** Cap-6 graduation hook. It is the only path that grants the initial 100m VND. */
  async initialize(userId: string): Promise<{ initialized: boolean; instanceId: string | null }> {
    return this.database.transaction(async (tx) => {
      const progress = await tx.query<{ graduated_at: Date | string | null }>(
        'select graduated_at from cap6_progress where user_id = $1 for update',
        [userId],
      );
      const graduatedAt = progress[0]?.graduated_at;
      if (!graduatedAt) return { initialized: false, instanceId: null };

      const existing = await tx.query<{ id: string }>(
        'select id from bot_instances where user_id = $1',
        [userId],
      );
      if (existing[0]) return { initialized: false, instanceId: existing[0].id };

      const now = new Date();
      const accountId = randomUUID();
      const accountRows = await tx.query<BotAccountRow>(
        `insert into bot_accounts
           (id, user_id, initial_cash_vnd, cash_vnd, status, activated_at, created_at, updated_at)
         values ($1, $2, $3, $3, 'active', $4::timestamptz,
                 $4::timestamptz at time zone 'UTC', $4::timestamptz at time zone 'UTC')
         on conflict (user_id) do nothing
         returning id, user_id, initial_cash_vnd, cash_vnd, status, activated_at`,
        [accountId, userId, INITIAL_CASH_VND.toString(), now],
      );
      const account =
        accountRows[0] ??
        (
          await tx.query<BotAccountRow>(
            `select id, user_id, initial_cash_vnd, cash_vnd, status, activated_at
           from bot_accounts where user_id = $1 for update`,
            [userId],
          )
        )[0];
      if (!account) throw new Error('Bot account conflict could not be resolved');

      const fundingKey = `bot:v1:funding:${userId}`;
      const ledger = await tx.query<{ entries: string; funding_exists: boolean }>(
        `select count(*)::text as entries,
                bool_or(idempotency_key = $2) as funding_exists
         from bot_cash_ledger where bot_account_id = $1`,
        [account.id, fundingKey],
      );
      if (!ledger[0]?.funding_exists) {
        if (ledger[0]?.entries !== '0' || parseInteger(account.cash_vnd) !== INITIAL_CASH_VND) {
          throw new Error('Cannot reconstruct Bot funding without changing balance');
        }
        await tx.query(
          `insert into bot_cash_ledger
             (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
              idempotency_key, note, created_at)
           values ($1, $2, null, 'initial_funding', $3, $3, $4, $5, $6)
           on conflict (idempotency_key) do nothing`,
          [
            randomUUID(),
            account.id,
            INITIAL_CASH_VND.toString(),
            fundingKey,
            'Vốn demo Bot IQX, cấp đúng một lần',
            now,
          ],
        );
      }

      const instanceId = randomUUID();
      const inserted = await tx.query<{ id: string }>(
        `insert into bot_instances
           (id, user_id, bot_account_id, strategy_id, strategy_version, execution_model,
            cap6_graduated_at, activated_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz,
                 $8::timestamptz at time zone 'UTC', $8::timestamptz at time zone 'UTC')
         on conflict (user_id) do nothing returning id`,
        [
          instanceId,
          userId,
          account.id,
          BOT_STRATEGY_ID,
          BOT_STRATEGY_VERSION,
          BOT_POLICY.execution_model,
          graduatedAt,
          now,
        ],
      );
      const winner =
        inserted[0]?.id ??
        (
          await tx.query<{ id: string }>('select id from bot_instances where user_id = $1', [
            userId,
          ])
        )[0]?.id;
      if (!winner) throw new Error('Bot instance conflict could not be resolved');
      return { initialized: Boolean(inserted[0]), instanceId: winner };
    });
  }

  /** Run every active account for one EOD session. No historical prices are synthesized. */
  async runSession(
    tradingDate: string,
    provider: BotSnapshotProvider | undefined = this.defaultSnapshotProvider,
  ): Promise<BotBatchResult> {
    validateTradingDate(tradingDate);
    if (!provider) {
      throw new ServiceUnavailableException({
        code: 'BOT_SNAPSHOT_PROVIDER_UNAVAILABLE',
        message: 'Nguồn snapshot Bot chưa được cấu hình',
      });
    }
    const result: BotBatchResult = {
      initialized: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skippedNotSession: 0,
    };

    const missing = await this.database.query<{ user_id: string }>(
      `select p.user_id
       from cap6_progress p
       left join bot_instances i on i.user_id = p.user_id
       where p.graduated_at is not null and i.id is null
       order by p.user_id`,
    );
    for (const row of missing) {
      try {
        const initialized = await this.initialize(row.user_id);
        result.initialized += Number(initialized.initialized);
      } catch {
        // One broken account must not prevent other owners from running.
      }
    }

    const owners = await this.database.query<{ user_id: string }>(
      `select i.user_id
       from bot_instances i
       join bot_accounts a on a.id = i.bot_account_id
       where a.status = 'active'
       order by i.user_id`,
    );
    for (const owner of owners) {
      try {
        const run = await this.runAccountSession(owner.user_id, tradingDate, provider);
        result.processed += 1;
        if (run.status === 'succeeded') result.succeeded += 1;
        else result.failed += 1;
      } catch {
        result.processed += 1;
        result.failed += 1;
      }
    }
    return result;
  }

  runScheduledSession(
    tradingDate: string,
    provider?: BotSnapshotProvider,
  ): Promise<BotBatchResult> {
    return this.runSession(tradingDate, provider);
  }

  async runAccountSession(
    userId: string,
    tradingDate: string,
    provider: BotSnapshotProvider | undefined = this.defaultSnapshotProvider,
  ): Promise<BotRunResult> {
    validateTradingDate(tradingDate);
    if (!provider) throw new Error('Bot snapshot provider is required');

    const existing = (
      await this.database.query<BotRunRow>(
        `select * from bot_run_receipts
         where user_id = $1 and trading_date = $2::date
         order by started_at desc limit 1`,
        [userId, tradingDate],
      )
    )[0];
    if (existing) return this.resumeExistingRun(existing, userId, tradingDate);

    const context = await this.instanceAccount(this.database, userId);
    if (!context) throw new Error('Bot chưa được khởi tạo');
    if (context.account_status !== 'active') throw new Error('Tài khoản Bot đang tạm dừng');
    this.assertActivated(context, tradingDate);
    const openSymbols = (
      await this.database.query<{ symbol: string }>(
        `select symbol from bot_positions
         where bot_account_id = $1 and status = 'open' order by symbol`,
        [context.account_id],
      )
    ).map((row) => row.symbol);

    const resolution = await this.resolveConfig(userId, tradingDate);
    const startedAt = Date.now();
    this.logger.log(`Bot snapshot started for ${userId} (${tradingDate})`);
    let timer: NodeJS.Timeout | undefined;
    let input: BotMarketSnapshotInput;
    try {
      input = await Promise.race([
        provider.buildSnapshot(tradingDate, { openSymbols }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error('Bot snapshot deadline exceeded');
            error.name = 'SnapshotDeadlineExceeded';
            reject(error);
          }, BOT_SNAPSHOT_DEADLINE_MS);
          timer.unref?.();
        }),
      ]);
      this.logger.log(`Bot snapshot built in ${Date.now() - startedAt}ms`);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      this.logger.warn(`Bot snapshot failed for ${userId}: ${name}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (input.trading_date !== tradingDate) {
      throw new Error('Snapshot không thuộc đúng phiên Bot');
    }
    if (resolution.effective && !resolution.invalid) {
      try {
        input = await this.withSharedConfigSignals(
          userId,
          tradingDate,
          input,
          {
            revision: resolution.effective.revision,
            config_hash: resolution.effective.config_hash,
            effective_session: resolution.effective.effective_session,
          },
          resolution.effective,
          openSymbols,
          resolution.grants,
        );
      } catch (error) {
        resolution.invalid = true;
        resolution.detail = error instanceof Error ? error.message : 'Unknown config error';
      }
    }
    if (resolution.invalid) {
      input = {
        ...input,
        issues: [
          ...(input.issues ?? []),
          issue(
            'config_invalid_or_unauthorized',
            resolution.detail ?? 'Không thể thực thi cấu hình Học viện an toàn',
          ),
        ],
      };
    }
    const runId = await this.captureFrozenRun(
      userId,
      tradingDate,
      context,
      openSymbols,
      resolution,
      input,
    );
    if (runId === null) return this.runAccountSession(userId, tradingDate, provider);
    return this.executeFrozenRun(runId, userId, tradingDate);
  }

  private assertActivated(context: InstanceAccountRow, tradingDate: string): void {
    const activatedDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(context.activated_at));
    if (activatedDate > tradingDate) throw new Error('Không chạy Bot trước ngày kích hoạt');
  }

  private async resolveConfig(userId: string, tradingDate: string): Promise<ConfigResolution> {
    try {
      const [current, effective] = await Promise.all([
        this.sharedConfigReader.current(userId),
        this.sharedConfigReader.effectiveFor(userId, tradingDate),
      ]);
      const grants = [...new Set(current.granted_indicators.map(indicatorCapability))].sort();
      if (!effective || effective.effective_session > tradingDate) {
        return { effective: null, grants, invalid: false, detail: null };
      }
      const registry = loadTechnicalRegistry();
      const errors = validateConfig(effective.config, registry, new Set(grants));
      if (
        errors.length ||
        effective.config.revision !== effective.revision ||
        configHash(effective.config) !== effective.config_hash
      ) {
        return {
          effective,
          grants,
          invalid: true,
          detail: errors[0]?.message ?? 'Revision hoặc hash cấu hình không khớp',
        };
      }
      return { effective, grants, invalid: false, detail: null };
    } catch (error) {
      return {
        effective: null,
        grants: [],
        invalid: true,
        detail: error instanceof Error ? error.message : 'Không đọc được cấu hình Học viện',
      };
    }
  }

  /** Exact pinned config; any revision/hash drift fails the run instead of trading on it. */
  private async pinnedSharedConfig(
    userId: string,
    pin: BotSharedConfigPin,
    effective: EffectiveSharedConfig | null,
  ): Promise<SharedConfig> {
    const source =
      effective?.revision === pin.revision
        ? effective
        : await this.sharedConfigReader.getRevision(userId, pin.revision);
    if (
      !source ||
      source.config_hash !== pin.config_hash ||
      configHash(source.config) !== pin.config_hash
    ) {
      const error = new Error('Pinned shared config is unavailable');
      error.name = 'SharedConfigUnavailable';
      throw error;
    }
    return source.config;
  }

  /** Read-only daily history ending on the session (adapter never fabricates bars). */
  private sessionBars(symbol: string, session: string): Promise<SessionBars | null> {
    const market = this.marketData;
    if (!market) return Promise.resolve(null);
    const key = `${session}:${symbol}`;
    const now = Date.now();
    for (const [cachedKey, entry] of this.sessionBarsCache) {
      if (entry.expiresAt <= now) this.sessionBarsCache.delete(cachedKey);
    }
    const cached = this.sessionBarsCache.get(key);
    if (cached) return cached.pending;
    const pending = withDeadline(
      market
        .getHistoricalOhlcv(symbol, session, session, {
          warmupSessions: BOT_SHARED_CONFIG_WARMUP_SESSIONS,
        })
        .then((history): SessionBars => {
          const bars = history.records.map((record) => ({
            date: record.time,
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            volume: record.volume,
          }));
          return { bars, source: history.source ?? null, hash: canonicalHash(bars) };
        }),
      SHARED_CONFIG_BARS_DEADLINE_MS,
    ).catch(() => null);
    this.sessionBarsCache.set(key, { expiresAt: now + SHARED_CONFIG_BARS_TTL_MS, pending });
    void pending.then((value) => {
      if (value === null) this.sessionBarsCache.delete(key);
    });
    return pending;
  }

  /**
   * Evaluates the pinned config once per run and freezes the result into the market
   * snapshot (and so into its hash): retries never re-read config or bars.
   */
  private async withSharedConfigSignals(
    userId: string,
    tradingDate: string,
    input: BotMarketSnapshotInput,
    pin: BotSharedConfigPin,
    effective: EffectiveSharedConfig | null,
    openSymbols: readonly string[],
    grants: readonly string[],
  ): Promise<BotMarketSnapshotInput> {
    const config = await this.pinnedSharedConfig(userId, pin, effective);
    const registry = loadTechnicalRegistry();
    const validation = validateConfig(config, registry, new Set(grants));
    if (validation.length) throw new Error(validation[0]!.message);
    const buyEntries = activeSideIndicators(config, 'buy', registry);
    const sellEntries = activeSideIndicators(config, 'sell', registry);
    const buyActive = buyEntries.length > 0;
    const sellActive = sellEntries.length > 0;
    const buySymbols = buyActive ? sharedConfigBuySymbols(input) : [];
    const sellSymbols = sellActive ? [...new Set(openSymbols)].sort() : [];
    const symbols = [...new Set([...buySymbols, ...sellSymbols])].sort();
    const marketSymbol =
      symbols.length && needsMarketContext(config, registry)
        ? BOT_SHARED_CONFIG_MARKET_SYMBOL
        : null;
    const market = marketSymbol ? await this.sessionBars(marketSymbol, tradingDate) : null;
    const marketClose = new Map(market?.bars.map((bar) => [bar.date, bar.close]) ?? []);
    const histories = await mapLimit(symbols, SHARED_CONFIG_BARS_CONCURRENCY, (symbol) =>
      this.sessionBars(symbol, tradingDate),
    );
    const bySymbol = new Map(symbols.map((symbol, index) => [symbol, histories[index] ?? null]));
    const barsFor = (symbol: string): Bar[] | null => {
      const history = bySymbol.get(symbol);
      if (!history) return null;
      if (!marketSymbol) return history.bars;
      return history.bars.map((bar) => ({ ...bar, market: marketClose.get(bar.date) ?? null }));
    };
    const fallbackEvidence = (side: 'buy' | 'sell'): ConditionSnapshot => {
      const entries = side === 'buy' ? buyEntries : sellEntries;
      return {
        buy_active_ids: buyEntries.map((entry) => entry.id),
        sell_active_ids: sellEntries.map((entry) => entry.id),
        rules: entries.flatMap((entry) =>
          config.indicators[entry.id]![side].rules.map((rule) => {
            const params = config.indicators[entry.id]![side].params;
            const rhs = rule.kind === 'membership' ? null : configuredOperand(rule.rhs, params);
            return {
              id: rule.id,
              indicator: entry.id,
              side,
              op: rule.op,
              lhs: configuredOperand(rule.lhs, params),
              rhs,
              ...(rule.kind === 'membership'
                ? {
                    rhs_lower: configuredOperand(rule.rhs.lower, params),
                    rhs_upper: configuredOperand(rule.rhs.upper, params),
                  }
                : {}),
              result: null,
              missing: true,
            };
          }),
        ),
      };
    };
    const evaluate = (symbol: string, side: 'buy' | 'sell') => {
      const bars = barsFor(symbol);
      if (!bars?.length || bars.at(-1)?.date !== tradingDate) {
        return { signal: null, evidence: fallbackEvidence(side) };
      }
      const traced = sideSignalsWithEvidence(config, bars, side, registry).at(-1);
      if (!traced) return { signal: null, evidence: fallbackEvidence(side) };
      return {
        signal: traced.result,
        evidence: {
          buy_active_ids: buyEntries.map((entry) => entry.id),
          sell_active_ids: sellEntries.map((entry) => entry.id),
          rules: traced.rules.map((rule) => ({ ...rule, side })),
        } satisfies ConditionSnapshot,
      };
    };
    const buyEvaluations = new Map(buySymbols.map((symbol) => [symbol, evaluate(symbol, 'buy')]));
    const sellEvaluations = new Map(
      sellSymbols.map((symbol) => [symbol, evaluate(symbol, 'sell')]),
    );
    const signals: FrozenAcademySignals = {
      revision: pin.revision,
      config_hash: pin.config_hash,
      effective_session: pin.effective_session,
      buy_active: buyActive,
      sell_active: sellActive,
      buy_active_ids: buyEntries.map((entry) => entry.id),
      sell_active_ids: sellEntries.map((entry) => entry.id),
      buy: Object.fromEntries(
        buySymbols.map((symbol) => [symbol, buyEvaluations.get(symbol)?.signal ?? null]),
      ),
      sell: Object.fromEntries(
        sellSymbols.map((symbol) => [symbol, sellEvaluations.get(symbol)?.signal ?? null]),
      ),
      buy_evidence: Object.fromEntries(
        buySymbols.map((symbol) => [symbol, buyEvaluations.get(symbol)!.evidence]),
      ),
      sell_evidence: Object.fromEntries(
        sellSymbols.map((symbol) => [symbol, sellEvaluations.get(symbol)!.evidence]),
      ),
      data: {
        source: histories.find((history) => history?.source)?.source ?? null,
        hash: canonicalHash({
          market: market?.hash ?? null,
          symbols: Object.fromEntries(
            symbols.map((symbol) => [symbol, bySymbol.get(symbol)?.hash ?? null]),
          ),
        }),
        warmup_sessions: BOT_SHARED_CONFIG_WARMUP_SESSIONS,
        market_symbol: marketSymbol,
      },
    };
    return { ...input, shared_config_signals: signals };
  }

  private async instanceAccount(
    client: SqlClient,
    userId: string,
    lock = false,
  ): Promise<InstanceAccountRow | null> {
    const rows = await client.query<InstanceAccountRow>(
      `select i.*, a.id as account_id, a.user_id as account_user_id,
              a.initial_cash_vnd, a.cash_vnd, a.status as account_status,
              a.activated_at as account_activated_at
       from bot_instances i
       join bot_accounts a on a.id = i.bot_account_id
       where i.user_id = $1 and a.user_id = $1${lock ? ' for update of i, a' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async resumeExistingRun(
    run: BotRunRow,
    userId: string,
    tradingDate: string,
  ): Promise<BotRunResult> {
    const verified = verifyRuleReceipt(run.rule_snapshot, run.rule_hash);
    if (verified.policyVersion !== BOT_POLICY.policy_version && run.status !== 'succeeded') {
      return this.runResult(run);
    }
    return this.executeFrozenRun(run.id, userId, tradingDate);
  }

  private async captureFrozenRun(
    userId: string,
    tradingDate: string,
    expectedContext: InstanceAccountRow,
    expectedOpenSymbols: readonly string[],
    resolution: ConfigResolution,
    input: BotMarketSnapshotInput,
  ): Promise<string | null> {
    const payload = sanitizeSnapshot(input);
    const digest = snapshotHash(input);
    const pin = resolution.effective
      ? {
          revision: resolution.effective.revision,
          config_hash: resolution.effective.config_hash,
          effective_session: resolution.effective.effective_session,
        }
      : null;
    const receipt = botRuleReceipt(pin, resolution.grants, digest);
    return this.database.transaction(async (tx) => {
      const context = await this.instanceAccount(tx, userId, true);
      if (!context || context.account_status !== 'active')
        throw new Error('Bot account unavailable');
      if (context.account_id !== expectedContext.account_id) throw new Error('Bot account changed');
      if (context.cash_vnd !== expectedContext.cash_vnd) return null;
      this.assertActivated(context, tradingDate);
      const existing = (
        await tx.query<BotRunRow>(
          `select * from bot_run_receipts
           where user_id = $1 and trading_date = $2::date for update`,
          [userId, tradingDate],
        )
      )[0];
      if (existing) return existing.id;
      const otherRunning = (
        await tx.query<{ exists: boolean }>(
          `select exists(
             select 1 from bot_run_receipts
             where bot_account_id = $1 and status = 'running'
               and trading_date <> $2::date
           ) as exists`,
          [context.account_id, tradingDate],
        )
      )[0]?.exists;
      if (otherRunning) throw new Error('Another Bot session is already running for this account');
      const laterRun = (
        await tx.query<{ exists: boolean }>(
          `select exists(
             select 1 from bot_run_receipts
             where bot_account_id = $1 and status = 'succeeded'
               and trading_date > $2::date
           ) as exists`,
          [context.account_id, tradingDate],
        )
      )[0]?.exists;
      if (laterRun) throw new Error('Bot sessions must be processed in trading-date order');
      const lockedSymbols = (
        await tx.query<{ symbol: string }>(
          `select symbol from bot_positions
           where bot_account_id = $1 and status = 'open' order by symbol for update`,
          [context.account_id],
        )
      ).map((row) => row.symbol);
      if (json(lockedSymbols) !== json([...expectedOpenSymbols])) return null;

      const runId = randomUUID();
      const now = new Date();
      const inserted = (
        await tx.query<BotRunRow>(
          `insert into bot_run_receipts
             (id, user_id, trading_date, status, started_at, completed_at, issues,
              bot_account_id, strategy_id, strategy_version, execution_model,
              rule_snapshot, rule_hash, policy_version, source_snapshot_hash,
              blocked_symbols_at_start, buy_count, sell_count)
           values ($1,$2,$3::date,'running',$4,null,'[]'::jsonb,$5,$6,$7,$8,
                   $9::jsonb,$10,$11,$12,$13::jsonb,0,0)
           returning *`,
          [
            runId,
            userId,
            tradingDate,
            now,
            context.account_id,
            context.strategy_id,
            context.strategy_version,
            BOT_POLICY.execution_model,
            json(receipt.snapshot),
            receipt.hash,
            BOT_POLICY.policy_version,
            digest,
            json(lockedSymbols),
          ],
        )
      )[0];
      if (!inserted) throw new Error('Failed to create Bot run');
      await tx.query(
        `insert into bot_market_snapshots
           (id, bot_run_id, trading_date, data_version, observed_at, close_is_official,
            buy_inputs_complete, snapshot_hash, payload, source_refs)
         values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
        [
          randomUUID(),
          runId,
          tradingDate,
          input.data_version,
          now,
          input.close_is_official,
          input.buy_inputs_complete,
          digest,
          json(payload),
          json(input.source_refs ?? {}),
        ],
      );
      return runId;
    });
  }

  private async validateCompletedRun(tx: SqlClient, run: BotRunRow): Promise<boolean> {
    if (!verifyRuleReceipt(run.rule_snapshot, run.rule_hash).valid) {
      await this.markFailed(tx, run.id, [
        issue('unsupported_rule_version', 'Worker không hỗ trợ rule snapshot'),
      ]);
      return false;
    }
    const snapshot = (
      await tx.query<SnapshotRow>('select * from bot_market_snapshots where bot_run_id = $1', [
        run.id,
      ])
    )[0];
    if (!snapshot || !this.snapshotValid(run, snapshot)) {
      await this.markFailed(tx, run.id, [
        issue('snapshot_hash_mismatch', 'Snapshot run không hợp lệ'),
      ]);
      return false;
    }
    if (run.bot_account_id && !(await this.reconcile(tx, run.bot_account_id))) {
      await this.markFailed(tx, run.id, [
        issue('reconciliation_failed', 'Sổ Bot không còn đối soát được'),
      ]);
      return false;
    }
    return true;
  }

  private snapshotValid(run: BotRunRow, snapshot: SnapshotRow): boolean {
    const payload = objectValue(snapshot.payload) as BotMarketSnapshotInput;
    const receipt = verifyRuleReceipt(run.rule_snapshot, run.rule_hash);
    return (
      receipt.valid &&
      snapshotHash(payload) === snapshot.snapshot_hash &&
      run.source_snapshot_hash === snapshot.snapshot_hash &&
      (receipt.kind !== 'academy' || receipt.dataHash === snapshot.snapshot_hash) &&
      payload.trading_date === isoDate(run.trading_date)
    );
  }

  private async executeFrozenRun(
    runId: string,
    userId: string,
    tradingDate: string,
  ): Promise<BotRunResult> {
    try {
      return await this.database.transaction(async (tx) => {
        const context = await this.instanceAccount(tx, userId, true);
        if (!context || context.account_status !== 'active')
          throw new Error('Bot account unavailable');
        const run = (
          await tx.query<BotRunRow>('select * from bot_run_receipts where id = $1 for update', [
            runId,
          ])
        )[0];
        if (!run || run.user_id !== userId || isoDate(run.trading_date) !== tradingDate) {
          throw new Error('Bot run ownership mismatch');
        }
        const earlyReceipt = verifyRuleReceipt(run.rule_snapshot, run.rule_hash);
        if (earlyReceipt.kind === 'legacy-v1') return this.runResult(run);
        if (run.status === 'succeeded' && (await this.validateCompletedRun(tx, run))) {
          return this.runResult(run);
        }
        const outOfOrder = (
          await tx.query<{ exists: boolean }>(
            `select exists(
               select 1 from bot_run_receipts other
               where other.bot_account_id = $1 and other.id <> $2
                 and (
                   (other.status = 'succeeded' and other.trading_date > $3::date)
                   or other.status = 'running'
                 )
             ) as exists`,
            [context.account_id, run.id, tradingDate],
          )
        )[0]?.exists;
        if (outOfOrder) {
          const error = new Error('Bot sessions must execute in trading-date order');
          error.name = 'BotRunOrderingError';
          throw error;
        }
        const ruleReceipt = verifyRuleReceipt(run.rule_snapshot, run.rule_hash);
        if (!ruleReceipt.valid) {
          const failed = await this.markFailed(tx, run.id, [
            issue('unsupported_rule_version', 'Worker không hỗ trợ rule snapshot'),
          ]);
          return this.runResult(failed);
        }
        if (!(await this.reconcile(tx, context.account_id))) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:ledger-error`,
            symbol: null,
            action: 'skip',
            reasonCode: 'ledger_error',
            reason: 'Sổ tiền Bot không đối soát trước phiên; không ghi giao dịch.',
          });
          const failed = await this.markFailed(tx, run.id, [
            issue('reconciliation_failed', 'Sổ Bot không hợp lệ trước phiên'),
          ]);
          return this.runResult(failed);
        }
        const snapshot = (
          await tx.query<SnapshotRow>('select * from bot_market_snapshots where bot_run_id = $1', [
            run.id,
          ])
        )[0];
        if (!snapshot || !this.snapshotValid(run, snapshot)) {
          const failed = await this.markFailed(tx, run.id, [
            issue('snapshot_hash_mismatch', 'Snapshot Bot đã thay đổi'),
          ]);
          return this.runResult(failed);
        }
        const payload = objectValue(snapshot.payload) as BotMarketSnapshotInput;
        let feeRules: FeeRules | null = null;
        try {
          feeRules = feeRulesFromSnapshot(payload);
        } catch {
          // A waiting-only run does not consume fees. Trade paths record ledger_error below.
        }
        const shared = ruleReceipt.pin
          ? parseSharedConfigSignals(payload.shared_config_signals, ruleReceipt.pin)
          : null;
        const configInvalid =
          issues(payload.issues).some((row) => row.code === 'config_invalid_or_unauthorized') ||
          Boolean(ruleReceipt.pin && !shared);
        const result = await this.applyStrategy(
          tx,
          context,
          run,
          snapshot,
          payload,
          feeRules,
          shared,
          configInvalid,
          ruleReceipt.pin?.revision ?? null,
        );
        return this.runResult(result);
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'BotRunOrderingError') throw error;
      try {
        await this.database.transaction(async (tx) => {
          const current = (
            await tx.query<Pick<BotRunRow, 'status'>>(
              'select status from bot_run_receipts where id = $1 for update',
              [runId],
            )
          )[0];
          if (!current || current.status !== 'running') return;
          await this.insertDecision(tx, runId, {
            key: `bot:academy:${runId}:ledger-error-rollback`,
            symbol: null,
            action: 'skip',
            reasonCode: 'ledger_error',
            reason: 'Giao dịch hoặc đối soát thất bại; toàn bộ thay đổi của lượt đã rollback.',
          });
          await this.markFailed(tx, runId, [
            issue('reconciliation_failed', 'Giao dịch hoặc đối soát thất bại; lượt đã rollback'),
          ]);
        });
      } catch {
        // Preserve the original transaction failure when even failure recording is unavailable.
      }
      throw error;
    }
  }

  private async applyStrategy(
    tx: SqlClient,
    context: InstanceAccountRow,
    run: BotRunRow,
    snapshot: SnapshotRow,
    payload: BotMarketSnapshotInput,
    feeRules: FeeRules | null,
    shared: BotSharedConfigSignals | null = null,
    configInvalid = false,
    pinnedRevision: number | null = null,
  ): Promise<BotRunRow> {
    let cash = parseInteger(context.cash_vnd, 'cash_vnd');
    const blocked = stringList(run.blocked_symbols_at_start);
    const startingPositions = await tx.query<BotPositionRow>(
      `select * from bot_positions
       where bot_account_id = $1 and symbol = any($2::varchar[])
         and (status = 'open' or closed_session = $3::date)
       order by symbol for update`,
      [context.account_id, blocked.length ? blocked : [''], isoDate(run.trading_date)],
    );
    let runIssues = [...issues(payload.issues)];
    if (!shared?.buy_active && startingPositions.length === 0) {
      runIssues = runIssues.filter(
        (row) =>
          !['filter_data_incomplete', 'source_error', 'missing_security_status'].includes(row.code),
      );
    }
    const revision = pinnedRevision;
    const conditionFor = (symbol: string, side: 'buy' | 'sell'): ConditionSnapshot => {
      const frozen = shared as FrozenAcademySignals | null;
      const evidence =
        side === 'buy' ? frozen?.buy_evidence?.[symbol] : frozen?.sell_evidence?.[symbol];
      return (
        evidence ?? {
          buy_active_ids: frozen?.buy_active_ids ?? [],
          sell_active_ids: frozen?.sell_active_ids ?? [],
          rules: [],
        }
      );
    };

    if (configInvalid) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:config-invalid`,
        symbol: null,
        action: 'skip',
        reasonCode: 'config_invalid_or_unauthorized',
        reason: 'Cấu hình Học viện đã ghim không thể thực thi an toàn; phiên chỉ kiểm tra stop.',
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor('', 'buy'),
      });
    }

    let navBasis = run.nav_basis_vnd === null ? null : parseInteger(run.nav_basis_vnd);
    if (navBasis === null) {
      let marketValue = 0n;
      let complete = true;
      for (const position of startingPositions) {
        const symbol = payload.symbols[position.symbol];
        const close = this.officialClose(symbol);
        if (close === null) {
          complete = false;
          runIssues.push(
            issue('valuation_incomplete', 'Thiếu đóng cửa để khóa NAV nền', position.symbol),
          );
        } else {
          marketValue += BigInt(position.qty_open) * close;
        }
      }
      if (complete) {
        navBasis = cash + marketValue;
        await tx.query('update bot_run_receipts set nav_basis_vnd = $2 where id = $1', [
          run.id,
          navBasis.toString(),
        ]);
      }
    }

    for (const position of startingPositions) {
      if (position.status !== 'open') continue;
      const close = this.officialClose(payload.symbols[position.symbol]);
      if (close === null) {
        await this.insertDecision(tx, run.id, {
          key: `bot:academy:${run.id}:${position.symbol}:invalid-close`,
          symbol: position.symbol,
          action: 'hold',
          reasonCode: 'invalid_close',
          reason: 'Thiếu giá đóng cửa chính thức; không bán và không dựng giá thay thế.',
          filterIds: stringList(position.filter_ids),
          dataRefs: objectValue(position.source_refs),
          decisionConfigRevision: revision,
          conditionSnapshot: conditionFor(position.symbol, 'sell'),
        });
        continue;
      }
      const stop4 = parseDecimal4(position.stop_loss_vnd);
      const entry4 = parseDecimal4(position.entry_price_vnd);
      const validStop = stop4 !== null && entry4 !== null && stop4 > 0n && stop4 < entry4;
      if (!validStop) {
        runIssues.push(issue('missing_stop', 'Vị thế thiếu stop gốc hợp lệ', position.symbol));
        await this.insertDecision(tx, run.id, {
          key: `bot:academy:${run.id}:${position.symbol}:missing-stop`,
          symbol: position.symbol,
          action: 'hold',
          reasonCode: 'missing_stop',
          reason: 'Không có stop gốc hợp lệ; Bot không dựng stop từ L1 hiện tại.',
          filterIds: stringList(position.filter_ids),
          dataRefs: objectValue(position.source_refs),
          decisionConfigRevision: revision,
          conditionSnapshot: conditionFor(position.symbol, 'sell'),
        });
      }
      const stopHit = validStop && stopLossSignal(close, stop4) === 'stop_loss';
      const academySell =
        !configInvalid && shared?.sell_active ? shared.sell[position.symbol] : null;
      if (stopHit || academySell === true) {
        if (!feeRules) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:${position.symbol}:ledger-error`,
            symbol: position.symbol,
            action: 'hold',
            reasonCode: 'ledger_error',
            reason: 'Thiếu quy tắc phí/thuế hợp lệ; không thể ghi bán an toàn.',
          });
          runIssues.push(issue('source_error', 'Thiếu snapshot phí/thuế/lô', position.symbol));
          continue;
        }
        const execution = await this.sell(
          tx,
          run,
          context.account_id,
          position,
          close,
          stopHit ? 'stop_loss' : 'academy_sell',
          feeRules,
          snapshot.snapshot_hash,
          cash,
          revision,
          conditionFor(position.symbol, 'sell'),
        );
        if (execution.applied) cash += execution.netCashDeltaVnd;
        continue;
      }
      if (configInvalid) continue;
      const reasonCode = !shared?.sell_active
        ? 'no_active_sell_conditions'
        : academySell === false
          ? 'academy_sell_not_met'
          : 'academy_condition_missing';
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:${position.symbol}:hold`,
        symbol: position.symbol,
        action: 'hold',
        reasonCode,
        reason: `Giữ ${position.symbol}: ${reasonCode}.`,
        filterIds: stringList(position.filter_ids),
        dataRefs: objectValue(position.source_refs),
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor(position.symbol, 'sell'),
      });
    }

    const rawCandidates: Candidate[] = [];
    if (!configInvalid && shared?.buy_active && payload.buy_inputs_complete) {
      for (const [symbol, row] of Object.entries(payload.symbols)) {
        if (!row.filter_ids?.length) continue;
        if (this.officialClose(row) === null) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:${symbol}:invalid-close`,
            symbol,
            action: 'skip',
            reasonCode: 'invalid_close',
            reason: 'Ứng viên thiếu giá đóng cửa chính thức hợp lệ.',
            filterIds: row.filter_ids,
            dataRefs: row.source_refs ?? {},
            decisionConfigRevision: revision,
            conditionSnapshot: conditionFor(symbol, 'buy'),
          });
          continue;
        }
        if (row.security_status_verified !== true || row.tradable_security_status !== true) {
          const reasonCode =
            row.security_status_verified === true
              ? 'security_status_blocked'
              : 'missing_security_status';
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:${symbol}:security`,
            symbol,
            action: 'skip',
            reasonCode,
            reason:
              reasonCode === 'security_status_blocked'
                ? 'Mã thuộc trạng thái không được phép mua.'
                : 'Không xác minh được trạng thái giao dịch an toàn của mã.',
            filterIds: row.filter_ids,
            dataRefs: row.source_refs ?? {},
            decisionConfigRevision: revision,
            conditionSnapshot: conditionFor(symbol, 'buy'),
          });
          continue;
        }
        const candidate = candidateFromSnapshot(symbol, row);
        if (!candidate) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:${symbol}:invalid-close`,
            symbol,
            action: 'skip',
            reasonCode: 'invalid_close',
            reason: 'Ứng viên thiếu giá đóng cửa chính thức hợp lệ.',
            filterIds: row.filter_ids,
            dataRefs: row.source_refs ?? {},
            decisionConfigRevision: revision,
            conditionSnapshot: conditionFor(symbol, 'buy'),
          });
          continue;
        }
        rawCandidates.push(candidate);
      }
    }

    const ranked = rankCandidates(rawCandidates);
    const executions = await tx.query<ExecutionRow>(
      'select id, symbol, side, fee_vnd, tax_vnd from bot_executions where bot_run_id = $1',
      [run.id],
    );
    const traded = new Set(executions.map((row) => row.symbol));
    let feesPaid = executions.reduce(
      (total, row) => total + parseInteger(row.fee_vnd) + parseInteger(row.tax_vnd),
      0n,
    );
    let buyCount = executions.filter((row) => row.side === 'buy').length;
    if (configInvalid) {
      // Stop-only mode already recorded above.
    } else if (!shared) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:waiting`,
        symbol: null,
        action: 'skip',
        reasonCode: 'waiting_for_academy_conditions',
        reason: 'Chưa có cấu hình Học viện hiệu lực; Bot chờ điều kiện.',
        conditionSnapshot: { buy_active_ids: [], sell_active_ids: [], rules: [] },
      });
    } else if (!shared.buy_active) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:no-active-buy`,
        symbol: null,
        action: 'skip',
        reasonCode: 'no_active_buy_conditions',
        reason: 'Cấu hình hiệu lực không có điều kiện Mua đang hoạt động.',
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor('', 'buy'),
      });
    } else if (!payload.buy_inputs_complete) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:buy-inputs-incomplete`,
        symbol: null,
        action: 'skip',
        reasonCode: 'buy_inputs_incomplete',
        reason: 'Nguồn Săn mã, trạng thái mã hoặc phí/lô chưa đầy đủ.',
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor('', 'buy'),
      });
    } else if (navBasis === null || !feeRules) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:ledger-error-buy`,
        symbol: null,
        action: 'skip',
        reasonCode: 'ledger_error',
        reason: 'Không khóa được NAV hoặc phí/lô hợp lệ; không mở mua.',
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor('', 'buy'),
      });
    } else {
      for (let index = 0; index < ranked.length; index += 1) {
        const candidate = ranked[index]!;
        if (buyCount >= BOT_POLICY.max_new_buys_per_session) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:session-buy-limit`,
            symbol: null,
            action: 'skip',
            reasonCode: 'session_buy_limit',
            reason: 'Phiên đã có hai lệnh mua thành công.',
            decisionConfigRevision: revision,
            conditionSnapshot: conditionFor(candidate.symbol, 'buy'),
          });
          break;
        }
        let reasonCode: string | null = null;
        const open = await tx.query<{ exists: boolean }>(
          `select exists(select 1 from bot_positions
           where bot_account_id = $1 and symbol = $2 and status = 'open') as exists`,
          [context.account_id, candidate.symbol],
        );
        if (open[0]?.exists) reasonCode = 'already_holding';
        else if (blocked.includes(candidate.symbol) || traded.has(candidate.symbol)) {
          reasonCode = 'rebuy_same_session_blocked';
        }
        const buySignal = shared.buy[candidate.symbol];
        if (!reasonCode && buySignal !== true) {
          reasonCode = buySignal === false ? 'academy_buy_not_met' : 'academy_condition_missing';
        }
        const stop = computeProtectiveStop(candidate.closeVnd, candidate.amplitude4);
        if (!reasonCode && (!stop || !candidate.amplitudeSourceRef)) {
          reasonCode = 'invalid_or_missing_l1_amplitude';
        }
        const sizing = reasonCode
          ? null
          : computeBuyQuantity({
              navBasisVnd: navBasis,
              cashAvailableVnd: cash,
              priceVnd: candidate.closeVnd,
              feesPaidInBatchVnd: feesPaid,
              feeRules,
            });
        reasonCode ??= sizing?.reasonCode ?? null;
        if (reasonCode || !sizing || !stop) {
          await this.insertDecision(tx, run.id, {
            key: `bot:academy:${run.id}:${candidate.symbol}:skip`,
            symbol: candidate.symbol,
            action: 'skip',
            reasonCode: reasonCode ?? 'insufficient_cash_or_lot',
            reason: `Không mua ${candidate.symbol}: ${reasonCode ?? 'insufficient_cash_or_lot'}.`,
            filterIds: candidate.filterIds,
            rankTuple: uuidRank(candidate),
            dataRefs: candidate.sourceRefs,
            budgetVnd: (navBasis * 12n) / 100n,
            decisionConfigRevision: revision,
            conditionSnapshot: conditionFor(candidate.symbol, 'buy'),
          });
          continue;
        }
        const execution = await this.buy(
          tx,
          run,
          context.account_id,
          candidate,
          sizing,
          stop,
          snapshot.snapshot_hash,
          cash,
          navBasis,
          revision,
          conditionFor(candidate.symbol, 'buy'),
        );
        if (execution.applied) {
          cash += execution.netCashDeltaVnd;
          feesPaid += execution.feeVnd;
        }
        traded.add(candidate.symbol);
        if (execution.applied) buyCount += 1;
      }
    }

    const openPositions = await tx.query<BotPositionRow>(
      `select * from bot_positions where bot_account_id = $1 and status = 'open'`,
      [context.account_id],
    );
    let marketValue = 0n;
    let valuationComplete = true;
    for (const position of openPositions) {
      const close = this.officialClose(payload.symbols[position.symbol]);
      if (close === null) {
        valuationComplete = false;
        runIssues.push(
          issue('valuation_incomplete', 'Thiếu giá đóng cửa để tính NAV', position.symbol),
        );
      } else {
        marketValue += BigInt(position.qty_open) * close;
      }
    }
    const nav = valuationComplete ? cash + marketValue : null;
    await tx.query(
      `insert into bot_nav_daily
         (id, bot_account_id, trading_date, cash_vnd, market_value_vnd, nav_vnd,
          valuation_complete, vnindex, source_refs, created_at)
       values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9::jsonb, $10)
       on conflict (bot_account_id, trading_date) do update set
         cash_vnd = excluded.cash_vnd,
         market_value_vnd = excluded.market_value_vnd,
         nav_vnd = excluded.nav_vnd,
         valuation_complete = excluded.valuation_complete,
         vnindex = excluded.vnindex,
         source_refs = excluded.source_refs`,
      [
        randomUUID(),
        context.account_id,
        isoDate(run.trading_date),
        cash.toString(),
        valuationComplete ? marketValue.toString() : null,
        nav?.toString() ?? null,
        valuationComplete,
        payload.vnindex ?? null,
        json({ snapshot_hash: snapshot.snapshot_hash }),
        new Date(),
      ],
    );
    await tx.query('update bot_accounts set cash_vnd = $2, updated_at = $3 where id = $1', [
      context.account_id,
      cash.toString(),
      new Date(),
    ]);

    if (shared?.buy_active && payload.buy_inputs_complete && ranked.length === 0) {
      await this.insertDecision(tx, run.id, {
        key: `bot:academy:${run.id}:no-eligible-candidates`,
        symbol: null,
        action: 'skip',
        reasonCode: 'no_eligible_candidates',
        reason: 'Đã xử lý đủ nguồn nhưng không có ứng viên Săn mã hợp lệ.',
        decisionConfigRevision: revision,
        conditionSnapshot: conditionFor('', 'buy'),
      });
    }
    if (!(await this.reconcile(tx, context.account_id))) {
      throw new Error('Bot reconciliation failed after strategy application');
    }
    const finalIssues = dedupeIssues(runIssues);
    const failed =
      (Boolean(shared?.buy_active) && !payload.buy_inputs_complete) ||
      finalIssues.some((row) => CRITICAL_ISSUES.has(row.code));
    const sellCount =
      (
        await tx.query<{ count: string }>(
          `select count(*)::text as count from bot_executions where bot_run_id = $1 and side = 'sell'`,
          [run.id],
        )
      )[0]?.count ?? '0';
    const updated = (
      await tx.query<BotRunRow>(
        `update bot_run_receipts set
           status = $2, completed_at = $3::timestamptz, issues = $4::jsonb,
           buy_count = $5, sell_count = $6,
           reconciled_at = case when $7 then $3::timestamptz else null end
         where id = $1 returning *`,
        [
          run.id,
          failed ? 'failed' : 'succeeded',
          new Date(),
          json(finalIssues),
          buyCount,
          Number(sellCount),
          !finalIssues.some((row) => row.code === 'reconciliation_failed'),
        ],
      )
    )[0];
    if (!updated) throw new Error('Bot run disappeared');
    return updated;
  }

  private officialClose(row: BotMarketSnapshotInput['symbols'][string] | undefined): bigint | null {
    if (!row || row.close_is_official !== true) return null;
    try {
      const close = parseInteger(row.close_vnd ?? '', 'close_vnd');
      return close > 0n ? close : null;
    } catch {
      return null;
    }
  }

  private async sell(
    tx: SqlClient,
    run: BotRunRow,
    accountId: string,
    position: BotPositionRow,
    close: bigint,
    reasonCode: 'stop_loss' | 'academy_sell',
    feeRules: FeeRules,
    sourceHash: string,
    cashBefore: bigint,
    decisionConfigRevision: number | null,
    conditionSnapshot: ConditionSnapshot,
  ): Promise<{ netCashDeltaVnd: bigint; applied: boolean }> {
    const key = `bot:academy:${accountId}:${isoDate(run.trading_date)}:${position.symbol}:sell`;
    const existing = await tx.query<{ net_cash_delta_vnd: string }>(
      'select net_cash_delta_vnd from bot_executions where idempotency_key = $1',
      [key],
    );
    if (existing[0]) return { netCashDeltaVnd: 0n, applied: false };
    const gross = BigInt(position.qty_open) * close;
    const fee = roundBasisPoints(gross, feeRules.sellFeeRateBps);
    const tax = roundBasisPoints(gross, feeRules.sellTaxRateBps);
    const net = gross - fee - tax;
    const id = randomUUID();
    const now = new Date();
    await tx.query(
      `insert into bot_executions
         (id, bot_run_id, bot_account_id, position_id, symbol, side, qty, price_vnd,
          signal_session, price_session, trading_date, executed_at, gross_value_vnd,
          fee_vnd, tax_vnd, net_cash_delta_vnd, execution_model, idempotency_key,
          filter_ids, supporting_count, layer_snapshot, reason, source_snapshot_id)
       values ($1,$2,$3,$4,$5,'sell',$6,$7,$8::date,$8::date,$8::date,$9,$10,$11,$12,
               $13,$14,$15,$16::jsonb,null,'{}'::jsonb,$17,$18)`,
      [
        id,
        run.id,
        accountId,
        position.id,
        position.symbol,
        position.qty_open,
        close.toString(),
        isoDate(run.trading_date),
        now,
        gross.toString(),
        fee.toString(),
        tax.toString(),
        net.toString(),
        BOT_POLICY.execution_model,
        key,
        json(stringList(position.filter_ids)),
        reasonCode,
        sourceHash,
      ],
    );
    const balance = cashBefore + net;
    await tx.query(
      `insert into bot_cash_ledger
         (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
          idempotency_key, note, created_at)
       values ($1,$2,$3,'sell',$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        accountId,
        id,
        net.toString(),
        balance.toString(),
        `${key}:cash`,
        `Bán mô phỏng ${position.qty_open} ${position.symbol} tại đóng cửa ${isoDate(run.trading_date)}`,
        now,
      ],
    );
    await tx.query(
      `update bot_positions set qty_open = 0, status = 'closed', closed_session = $2::date,
              closed_at = $3::timestamptz, sell_execution_id = $4,
              updated_at = $3::timestamptz at time zone 'UTC'
       where id = $1`,
      [position.id, isoDate(run.trading_date), now, id],
    );
    await this.insertDecision(tx, run.id, {
      key: `${key}:decision`,
      symbol: position.symbol,
      action: 'sell',
      reasonCode,
      reason:
        reasonCode === 'academy_sell'
          ? `Điều kiện Bán Học viện đạt tại ${close}; Bot bán toàn bộ ${position.qty_open} cổ phiếu.`
          : `Giá đóng cửa ${close} chạm stop đã lưu; Bot bán toàn bộ ${position.qty_open} cổ phiếu.`,
      filterIds: stringList(position.filter_ids),
      dataRefs: objectValue(position.source_refs),
      thresholdVnd: reasonCode === 'stop_loss' ? position.stop_loss_vnd : undefined,
      executionId: id,
      decisionConfigRevision,
      conditionSnapshot,
    });
    return { netCashDeltaVnd: net, applied: true };
  }

  private async buy(
    tx: SqlClient,
    run: BotRunRow,
    accountId: string,
    candidate: Candidate,
    sizing: ReturnType<typeof computeBuyQuantity>,
    stop: NonNullable<ReturnType<typeof computeProtectiveStop>>,
    sourceHash: string,
    cashBefore: bigint,
    navBasis: bigint,
    decisionConfigRevision: number | null,
    conditionSnapshot: ConditionSnapshot,
  ): Promise<{ netCashDeltaVnd: bigint; feeVnd: bigint; applied: boolean }> {
    const key = `bot:academy:${accountId}:${isoDate(run.trading_date)}:${candidate.symbol}:buy`;
    const existing = await tx.query<{ net_cash_delta_vnd: string; fee_vnd: string }>(
      'select net_cash_delta_vnd, fee_vnd from bot_executions where idempotency_key = $1',
      [key],
    );
    if (existing[0])
      return {
        netCashDeltaVnd: 0n,
        feeVnd: 0n,
        applied: false,
      };
    const positionId = randomUUID();
    const executionId = randomUUID();
    const now = new Date();
    await tx.query(
      `insert into bot_positions
         (id, bot_account_id, symbol, qty_open, entry_price_vnd, entry_value_vnd,
          entry_fee_vnd, amplitude_at_entry_vnd, amplitude_source_ref, stop_loss_vnd,
          take_profit_vnd, entry_config_revision, opened_session, opened_at, status, filter_ids, source_refs,
          buy_execution_id, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,$11,$12::date,$13::timestamptz,'open',$14::jsonb,
               $15::jsonb,$16,$13::timestamptz at time zone 'UTC',$13::timestamptz at time zone 'UTC')`,
      [
        positionId,
        accountId,
        candidate.symbol,
        sizing.quantity,
        candidate.closeVnd.toString(),
        sizing.grossVnd.toString(),
        sizing.feeVnd.toString(),
        formatDecimal4(candidate.amplitude4!),
        candidate.amplitudeSourceRef,
        formatDecimal4(stop.stop4),
        decisionConfigRevision,
        isoDate(run.trading_date),
        now,
        json(candidate.filterIds),
        json(candidate.sourceRefs),
        executionId,
      ],
    );
    const net = -sizing.totalVnd;
    await tx.query(
      `insert into bot_executions
         (id, bot_run_id, bot_account_id, position_id, symbol, side, qty, price_vnd,
          signal_session, price_session, trading_date, executed_at, gross_value_vnd,
          fee_vnd, tax_vnd, net_cash_delta_vnd, execution_model, idempotency_key,
          filter_ids, supporting_count, layer_snapshot, reason, source_snapshot_id)
       values ($1,$2,$3,$4,$5,'buy',$6,$7,$8::date,$8::date,$8::date,$9,$10,$11,0,$12,
               $13,$14,$15::jsonb,null,'{}'::jsonb,'academy_buy',$16)`,
      [
        executionId,
        run.id,
        accountId,
        positionId,
        candidate.symbol,
        sizing.quantity,
        candidate.closeVnd.toString(),
        isoDate(run.trading_date),
        now,
        sizing.grossVnd.toString(),
        sizing.feeVnd.toString(),
        net.toString(),
        BOT_POLICY.execution_model,
        key,
        json(candidate.filterIds),
        sourceHash,
      ],
    );
    const balance = cashBefore + net;
    if (balance < 0n) throw new Error('Bot cash would become negative');
    await tx.query(
      `insert into bot_cash_ledger
         (id, bot_account_id, execution_id, kind, amount_vnd, balance_after_vnd,
          idempotency_key, note, created_at)
       values ($1,$2,$3,'buy',$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        accountId,
        executionId,
        net.toString(),
        balance.toString(),
        `${key}:cash`,
        `Mua mô phỏng ${sizing.quantity} ${candidate.symbol} tại đóng cửa ${isoDate(run.trading_date)}`,
        now,
      ],
    );
    await this.insertDecision(tx, run.id, {
      key: `${key}:decision`,
      symbol: candidate.symbol,
      action: 'buy',
      reasonCode: 'academy_buy',
      reason: `Bot mua ${sizing.quantity} ${candidate.symbol} theo điều kiện Học viện tại đóng cửa ${isoDate(run.trading_date)}.`,
      filterIds: candidate.filterIds,
      rankTuple: uuidRank(candidate),
      dataRefs: candidate.sourceRefs,
      budgetVnd: (navBasis * 12n) / 100n,
      proposedQty: sizing.quantity,
      executionId,
      decisionConfigRevision,
      conditionSnapshot,
    });
    return { netCashDeltaVnd: net, feeVnd: sizing.feeVnd, applied: true };
  }

  private async insertDecision(
    tx: SqlClient,
    runId: string,
    values: {
      key: string;
      symbol: string | null;
      action: 'buy' | 'sell' | 'hold' | 'skip';
      reasonCode: string;
      reason: string;
      filterIds?: string[];
      rankTuple?: unknown;
      dataRefs?: Record<string, unknown>;
      budgetVnd?: bigint;
      proposedQty?: number;
      thresholdVnd?: string;
      executionId?: string;
      decisionConfigRevision?: number | null;
      conditionSnapshot?: ConditionSnapshot;
    },
  ): Promise<void> {
    await tx.query(
      `insert into bot_decisions
         (id, bot_run_id, idempotency_key, symbol, action, reason_code, reason,
          filter_ids, rank_tuple, data_refs, budget_vnd, proposed_qty, threshold_vnd,
          execution_id, decision_config_revision, condition_snapshot, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,$17)
       on conflict (idempotency_key) do nothing`,
      [
        randomUUID(),
        runId,
        values.key,
        values.symbol,
        values.action,
        values.reasonCode,
        values.reason,
        json(values.filterIds ?? []),
        values.rankTuple ? json(values.rankTuple) : null,
        json(values.dataRefs ?? {}),
        values.budgetVnd?.toString() ?? null,
        values.proposedQty ?? null,
        values.thresholdVnd ?? null,
        values.executionId ?? null,
        values.decisionConfigRevision ?? null,
        values.conditionSnapshot ? json(values.conditionSnapshot) : null,
        new Date(),
      ],
    );
  }

  private async reconcile(tx: SqlClient, accountId: string): Promise<boolean> {
    const rows = await tx.query<{ valid: boolean }>(
      `select
         coalesce((select sum(l.amount_vnd) from bot_cash_ledger l where l.bot_account_id = a.id), 0) = a.cash_vnd
         and (select count(*) from bot_cash_ledger l where l.bot_account_id = a.id
              and l.kind = 'initial_funding' and l.execution_id is null
              and l.amount_vnd = $2) = 1
         and not exists (
           select 1 from bot_executions e
           left join bot_cash_ledger l on l.execution_id = e.id
           where e.bot_account_id = a.id and (
             l.id is null or l.amount_vnd <> e.net_cash_delta_vnd or l.kind <> e.side
             or e.gross_value_vnd <> e.qty::bigint * e.price_vnd
             or e.net_cash_delta_vnd <> case when e.side = 'buy'
                  then -(e.gross_value_vnd + e.fee_vnd)
                  else e.gross_value_vnd - e.fee_vnd - e.tax_vnd end
           )
         )
         and not exists (
           select 1 from bot_positions p
           where p.bot_account_id = a.id and not (
             (p.status = 'open' and p.qty_open > 0) or
             (p.status = 'closed' and p.qty_open = 0)
           )
         ) as valid
       from bot_accounts a where a.id = $1`,
      [accountId, INITIAL_CASH_VND.toString()],
    );
    return rows[0]?.valid ?? false;
  }

  private async markFailed(
    tx: SqlClient,
    runId: string,
    failureIssues: BotIssue[],
  ): Promise<BotRunRow> {
    const row = (
      await tx.query<BotRunRow>(
        `update bot_run_receipts
         set status = 'failed', completed_at = $2, issues = $3::jsonb
         where id = $1 returning *`,
        [runId, new Date(), json(dedupeIssues(failureIssues))],
      )
    )[0];
    if (!row) throw new Error('Bot run not found');
    return row;
  }

  private async failRun(runId: string, failureIssues: BotIssue[]): Promise<BotRunResult> {
    return this.database.transaction(async (tx) =>
      this.runResult(await this.markFailed(tx, runId, failureIssues)),
    );
  }

  private runResult(run: BotRunRow): BotRunResult {
    return {
      id: run.id,
      userId: run.user_id,
      tradingDate: isoDate(run.trading_date),
      status: run.status,
      buyCount: run.buy_count,
      sellCount: run.sell_count,
      issues: issues(run.issues),
      inputHash: run.source_snapshot_hash,
    };
  }

  private async conditionState(
    userId: string,
    accountId: string,
  ): Promise<{
    conditions: Record<string, unknown>;
    productStage: 'bot_v1_waiting' | 'bot_v2_academy';
  }> {
    const position = (
      await this.database.query<{ open_positions: string; policy_positions: string }>(
        `select count(*)::text as open_positions,
                count(*) filter (where entry_config_revision is not null)::text as policy_positions
         from bot_positions where bot_account_id = $1 and status = 'open'`,
        [accountId],
      )
    )[0] ?? { open_positions: '0', policy_positions: '0' };
    const openPositions = Number(position.open_positions);
    try {
      const current = await this.sharedConfigReader.current(userId);
      const effective = current.effective_revision
        ? await this.sharedConfigReader.getRevision(userId, current.effective_revision)
        : null;
      const registry = loadTechnicalRegistry();
      const grants = new Set(current.granted_indicators.map(indicatorCapability));
      const valid = Boolean(
        effective &&
        effective.revision === current.effective_revision &&
        configHash(effective.config) === effective.config_hash &&
        validateConfig(effective.config, registry, grants).length === 0,
      );
      const buyCount =
        valid && effective ? activeSideIndicators(effective.config, 'buy', registry).length : 0;
      const sellCount =
        valid && effective ? activeSideIndicators(effective.config, 'sell', registry).length : 0;
      const hasBuy = buyCount > 0;
      const hasSell = sellCount > 0;
      const state = hasBuy
        ? 'entry_enabled'
        : hasSell
          ? 'exit_only'
          : openPositions > 0
            ? 'protection_only'
            : 'waiting_for_conditions';
      return {
        conditions: {
          state,
          has_active_buy: hasBuy,
          has_active_sell: hasSell,
          buy_condition_count: buyCount,
          sell_condition_count: sellCount,
          saved_revision: current.saved_revision || null,
          effective_revision: current.effective_revision,
          effective_session: current.effective_session,
          config_status: current.saved_revision === 0 ? 'none' : current.status,
          open_positions: openPositions,
        },
        productStage:
          hasBuy || hasSell || Number(position.policy_positions) > 0
            ? 'bot_v2_academy'
            : 'bot_v1_waiting',
      };
    } catch {
      return {
        conditions: {
          state: openPositions > 0 ? 'protection_only' : 'waiting_for_conditions',
          has_active_buy: false,
          has_active_sell: false,
          buy_condition_count: 0,
          sell_condition_count: 0,
          saved_revision: null,
          effective_revision: null,
          effective_session: null,
          config_status: 'calendar_unavailable',
          open_positions: openPositions,
        },
        productStage: Number(position.policy_positions) > 0 ? 'bot_v2_academy' : 'bot_v1_waiting',
      };
    }
  }

  async overview(userId: string): Promise<Record<string, unknown>> {
    const progress = await this.database.query<{
      current_level: number | null;
      graduated_at: Date | string | null;
    }>(
      `select graduated_at,
              case when graduated_at is not null then 6 else 5 end as current_level
       from cap6_progress where user_id = $1`,
      [userId],
    );
    const context = await this.instanceAccount(this.database, userId);
    const conditionState = context ? await this.conditionState(userId, context.account_id) : null;
    const runStatus = await this.status(userId);
    if (progress[0]?.graduated_at && !context) {
      runStatus.issues.push(
        issue(
          'not_initialized',
          'Bot chưa được service tốt nghiệp khởi tạo; GET không tự cấp vốn.',
        ),
      );
    }
    const nav = context
      ? (
          await this.database.query<{
            trading_date: Date | string;
            cash_vnd: string;
            market_value_vnd: string | null;
            nav_vnd: string | null;
            valuation_complete: boolean;
          }>(
            `select trading_date, cash_vnd, market_value_vnd, nav_vnd, valuation_complete
         from bot_nav_daily where bot_account_id = $1
         order by trading_date desc limit 1`,
            [context.account_id],
          )
        )[0]
      : undefined;
    const navValue = nav?.valuation_complete
      ? nav.nav_vnd
      : nav
        ? null
        : (context?.cash_vnd ?? null);
    return {
      eligible: Boolean(progress[0]?.graduated_at),
      current_level: progress[0]?.current_level ?? 0,
      cap6_graduated_at: isoTimestamp(progress[0]?.graduated_at ?? null),
      disclosure: DISCLOSURE,
      bot: context
        ? {
            strategy_id: context.strategy_id,
            strategy_version: context.strategy_version,
            execution_model: context.execution_model,
            initial_cash_vnd: context.initial_cash_vnd,
            activated_at: isoTimestamp(context.activated_at),
            policy_version: BOT_POLICY.policy_version,
            product_stage: conditionState!.productStage,
          }
        : null,
      conditions: conditionState?.conditions ?? null,
      account: context
        ? {
            cash_vnd: nav?.cash_vnd ?? context.cash_vnd,
            market_value_vnd: nav ? nav.market_value_vnd : '0',
            nav_vnd: navValue,
            pnl_total_net_vnd:
              navValue === null ? null : (parseInteger(navValue) - INITIAL_CASH_VND).toString(),
            return_total:
              navValue === null ? null : ratioString(parseInteger(navValue), INITIAL_CASH_VND),
            valuation_complete: nav?.valuation_complete ?? true,
            as_of_session: nav ? isoDate(nav.trading_date) : null,
          }
        : null,
      bot_run: runStatus,
    };
  }

  async status(userId: string): Promise<{
    status: 'idle' | 'running' | 'succeeded' | 'failed';
    latest_run_id: string | null;
    last_updated_at: string | null;
    processed_unseen_sessions: number;
    issues: BotIssue[];
  }> {
    const rows = await this.database.query<BotRunRow & { last_animated_bot_run_id: string | null }>(
      `select r.*, ui.last_animated_bot_run_id
       from bot_run_receipts r
       left join journey_identity_ui ui on ui.user_id = r.user_id
       where r.user_id = $1
       order by r.trading_date desc, r.started_at desc`,
      [userId],
    );
    const latest = rows[0];
    const cursorId = latest?.last_animated_bot_run_id;
    const cursor = cursorId ? rows.find((row) => row.id === cursorId) : undefined;
    const unseen = rows.filter(
      (row) =>
        row.status === 'succeeded' &&
        (!cursor || isoDate(row.trading_date) > isoDate(cursor.trading_date)),
    ).length;
    return {
      status: latest?.status ?? 'idle',
      latest_run_id: latest?.id ?? null,
      last_updated_at: latest ? isoTimestamp(latest.completed_at ?? latest.started_at) : null,
      processed_unseen_sessions: unseen,
      issues: issues(latest?.issues),
    };
  }

  async positions(userId: string): Promise<Record<string, unknown>> {
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { items: [], valuation_complete: false, as_of_session: null };
    const rows = await this.database.query<BotPositionRow & { sector: string | null }>(
      `select p.*, s.icb_lv2 as sector
       from bot_positions p left join symbols s on s.symbol = p.symbol
       where p.bot_account_id = $1 and p.status = 'open' order by p.symbol`,
      [context.account_id],
    );
    const snapshots = await this.database.query<SnapshotRow>(
      `select s.* from bot_market_snapshots s
       join bot_run_receipts r on r.id = s.bot_run_id
       where r.bot_account_id = $1
       order by r.trading_date desc, r.started_at desc limit 1`,
      [context.account_id],
    );
    const snapshot = snapshots[0];
    const payload = snapshot ? (objectValue(snapshot.payload) as BotMarketSnapshotInput) : null;
    const nav = (
      await this.database.query<{
        trading_date: Date | string;
        nav_vnd: string | null;
        valuation_complete: boolean;
      }>(
        `select trading_date, nav_vnd, valuation_complete from bot_nav_daily
         where bot_account_id = $1 order by trading_date desc limit 1`,
        [context.account_id],
      )
    )[0];
    let complete = Boolean(snapshot);
    const items = rows.map((row) => {
      const close = this.officialClose(payload?.symbols[row.symbol]);
      if (close === null) complete = false;
      const marketValue = close === null ? null : BigInt(row.qty_open) * close;
      const navValue =
        snapshot &&
        nav?.valuation_complete &&
        isoDate(nav.trading_date) === isoDate(snapshot.trading_date)
          ? nav.nav_vnd
          : null;
      const weight =
        marketValue !== null && navValue && parseInteger(navValue) > 0n
          ? ratioString(marketValue * 100n + parseInteger(navValue), parseInteger(navValue))
          : null;
      const pnl =
        marketValue === null
          ? null
          : marketValue - parseInteger(row.entry_value_vnd) - parseInteger(row.entry_fee_vnd);
      return {
        id: row.id,
        symbol: row.symbol,
        qty: row.qty_open,
        entry_price_vnd: row.entry_price_vnd,
        current_close_vnd: close?.toString() ?? null,
        market_value_vnd: marketValue?.toString() ?? null,
        weight_pct: weight,
        amplitude_at_entry_vnd: row.amplitude_at_entry_vnd,
        amplitude_source_ref: row.amplitude_source_ref,
        stop_loss_vnd: row.stop_loss_vnd,
        legacy_take_profit_vnd: row.take_profit_vnd,
        entry_config_revision: row.entry_config_revision ?? null,
        unrealized_pnl_net_vnd: pnl?.toString() ?? null,
        filter_ids: stringList(row.filter_ids),
        opened_session: isoDate(row.opened_session),
        opened_at: isoTimestamp(row.opened_at),
        sector: row.sector,
        source_refs: objectValue(row.source_refs),
      };
    });
    return {
      items,
      valuation_complete:
        complete &&
        Boolean(
          nav?.valuation_complete &&
          snapshot &&
          isoDate(nav.trading_date) === isoDate(snapshot.trading_date),
        ),
      as_of_session: snapshot ? isoDate(snapshot.trading_date) : null,
    };
  }

  async journal(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Record<string, unknown>> {
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { items: [], next_cursor: null, issues: [] };
    let cursorCondition = '';
    const values: unknown[] = [userId, context.account_id, limit + 1];
    if (cursor) {
      const cursorRows = await this.database.query<{ created_at: Date | string; id: string }>(
        `select d.created_at, d.id from bot_decisions d
         join bot_run_receipts r on r.id = d.bot_run_id
         where d.id = $1 and r.user_id = $2`,
        [cursor, userId],
      );
      if (!cursorRows[0]) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Cursor nhật ký không hợp lệ',
        });
      }
      values.push(cursorRows[0].created_at, cursorRows[0].id);
      cursorCondition = 'and (d.created_at, d.id) < ($4, $5::uuid)';
    }
    const rows = await this.database.query<Record<string, unknown>>(
      `select d.*, r.trading_date, r.id as run_id, r.policy_version,
              e.id as execution_id_joined, e.side as execution_side, e.qty as execution_qty,
              e.price_vnd as execution_price_vnd, e.gross_value_vnd as execution_gross_value_vnd,
              e.fee_vnd as execution_fee_vnd, e.tax_vnd as execution_tax_vnd,
              e.net_cash_delta_vnd as execution_net_cash_delta_vnd,
              e.supporting_count as execution_supporting_count
       from bot_decisions d
       join bot_run_receipts r on r.id = d.bot_run_id
       left join bot_executions e on e.id = d.execution_id
       where r.user_id = $1 and r.bot_account_id = $2 ${cursorCondition}
       order by d.created_at desc, d.id desc limit $3`,
      values,
    );
    const page = rows.slice(0, limit);
    const latest = (
      await this.database.query<{ issues: unknown }>(
        `select issues from bot_run_receipts where bot_account_id = $1
         order by trading_date desc, started_at desc limit 1`,
        [context.account_id],
      )
    )[0];
    return {
      items: page.map((row) => ({
        id: row.id,
        run_id: row.run_id,
        trading_date: isoDate(row.trading_date as Date | string),
        action: row.action,
        reason_code: row.reason_code,
        reason: row.reason,
        execution: row.execution_id_joined
          ? {
              id: row.execution_id_joined,
              side: row.execution_side,
              qty: row.execution_qty,
              price_vnd: String(row.execution_price_vnd),
              gross_value_vnd: String(row.execution_gross_value_vnd),
              fee_vnd: String(row.execution_fee_vnd),
              tax_vnd: String(row.execution_tax_vnd),
              net_cash_delta_vnd: String(row.execution_net_cash_delta_vnd),
            }
          : null,
        symbol: row.symbol,
        filter_ids: stringList(row.filter_ids),
        supporting_count: row.execution_supporting_count ?? null,
        policy_version:
          row.policy_version === null || row.policy_version === undefined
            ? null
            : String(row.policy_version),
        decision_config_revision:
          row.decision_config_revision === null || row.decision_config_revision === undefined
            ? null
            : Number(row.decision_config_revision),
        condition_snapshot:
          row.condition_snapshot === null || row.condition_snapshot === undefined
            ? null
            : objectValue(row.condition_snapshot),
        threshold_vnd: row.threshold_vnd === null ? null : String(row.threshold_vnd),
        source_refs: objectValue(row.data_refs),
        created_at: isoTimestamp(row.created_at as Date | string),
      })),
      next_cursor: rows.length > limit ? String(page.at(-1)?.id ?? '') || null : null,
      issues: issues(latest?.issues),
    };
  }

  async performance(userId: string, from?: string, to?: string): Promise<Record<string, unknown>> {
    if (from) validateTradingDate(from);
    if (to) validateTradingDate(to);
    if (from && to && from > to) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'Khoảng ngày hiệu suất không hợp lệ',
      });
    }
    const context = await this.instanceAccount(this.database, userId);
    if (!context) return { base: null, series: [], comparison_available: false };
    const values: unknown[] = [context.account_id];
    const conditions: string[] = [];
    if (from) {
      values.push(from);
      conditions.push(`trading_date >= $${values.length}::date`);
    }
    if (to) {
      values.push(to);
      conditions.push(`trading_date <= $${values.length}::date`);
    }
    const rows = await this.database.query<{
      trading_date: Date | string;
      cash_vnd: string;
      market_value_vnd: string | null;
      nav_vnd: string | null;
      valuation_complete: boolean;
      vnindex: string | null;
    }>(
      `select trading_date, cash_vnd, market_value_vnd, nav_vnd, valuation_complete, vnindex
       from bot_nav_daily where bot_account_id = $1
       ${conditions.length ? `and ${conditions.join(' and ')}` : ''}
       order by trading_date`,
      values,
    );
    const complete = rows.filter(
      (row) => row.valuation_complete && row.nav_vnd && parseInteger(row.nav_vnd) > 0n,
    );
    const common = complete.filter((row) => row.vnindex && Number(row.vnindex) > 0);
    const base = common[0] ?? complete[0];
    return {
      base: base
        ? {
            trading_date: isoDate(base.trading_date),
            bot_nav_vnd: base.nav_vnd,
            vnindex_value: base.vnindex,
          }
        : null,
      series: rows.map((row) => ({
        trading_date: isoDate(row.trading_date),
        cash_vnd: row.cash_vnd,
        market_value_vnd: row.market_value_vnd,
        nav_vnd: row.nav_vnd,
        valuation_complete: row.valuation_complete,
        bot_return_since_base:
          base?.nav_vnd && row.valuation_complete && row.nav_vnd
            ? ratioString(parseInteger(row.nav_vnd), parseInteger(base.nav_vnd))
            : null,
        vnindex_value: row.vnindex,
        vnindex_return_since_base:
          base?.vnindex && row.vnindex ? this.decimalRatio(row.vnindex, base.vnindex) : null,
      })),
      comparison_available: common.length > 0,
    };
  }

  private decimalRatio(value: string, base: string): string | null {
    const scale = Math.max((value.split('.')[1] ?? '').length, (base.split('.')[1] ?? '').length);
    const multiplier = 10n ** BigInt(scale);
    const toScaled = (input: string): bigint => {
      const [whole = '0', fraction = ''] = input.split('.');
      return BigInt(whole) * multiplier + BigInt((fraction + '0'.repeat(scale)).slice(0, scale));
    };
    return ratioString(toScaled(value), toScaled(base));
  }
}
