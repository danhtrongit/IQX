import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { VciMarketProvider } from '../market-data/index.js';
import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { finite } from '../financials/financials.calculations.js';
import { canonicalJson, sha256Hex } from '../quant/v2/hash.js';
import {
  marketIssues,
  normalizeDefinition,
  notReadyMetrics,
  ruleIssues,
  type DefinitionColumn,
  type DefinitionRule,
  type LegacyScreenerDefinition,
  type ScreenerDefinitionV3,
  type ScreenerDefinitionV4,
  type TechnicalItem,
} from './screener.definition.js';
import {
  cheapVerdict,
  computeMarketValues,
  EMPTY_MARKET_VALUES,
  emptyMarketQuality,
  marketNeedsBars,
  valueVerdict,
  type BasketMembers,
  type MarketQuality,
} from './screener.market.js';
import { METRIC_REASONS, metricSupport, type MetricStatus } from './screener.metrics.js';
import { SCREENER_MARKET_DATA, type ScreenerMarketDataPort } from './screener.ports.js';
import {
  loadFundamentalRegistry,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  screenerCalculationVersion,
  SCREENER_REGISTRY_VERSION,
  screenerPeriodLabel,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from './screener.registry.js';
import { ScreenerRunRepository, type ScreenerRunStore } from './screener.repository.js';
import {
  SCREENER_FETCH_CONCURRENCY,
  SCREENER_MAX_UNIVERSE,
  type ScreenerMetricView,
  type ScreenerResultPage,
  type ScreenerResultQuery,
  type ScreenerRow,
  type ScreenerRunData,
  type ScreenerRunHeader,
  type ScreenerRunInput,
} from './screener.schemas.js';
import { shareEventsFromVci, withShareHistory, type ShareEvent } from './screener.shares.js';
import { sortRows } from './screener.sort.js';
import {
  EPS_METRICS,
  evaluateScreenerMetric,
  normalizeVciStatements,
  PRICE_METRICS,
  type MarketInputs,
  type NormalizedStatements,
  type ScreenerMetricResult,
  type VciStatementSections,
} from './screener.statements.js';
import {
  evaluateTechnical,
  technicalColumnLabels,
  technicalColumns,
  technicalIssues,
  toEngineBars,
  type TechnicalColumnSpec,
  type TechnicalEvaluation,
} from './screener.technical.js';

export const SCREENER_DATA_SOURCE = 'VCI';

const PRICE_BOARD_CHUNK = 100;
/** Symbols whose stored bars are read together in step 1 (bounded memory). */
const BAR_CHUNK = 200;
/** Step 1 is CPU work on the request thread: hand the event loop back this often. */
const YIELD_EVERY = 25;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Strict comparison; a null value never passes. A lower-bound streak (whole history positive)
 * can only confirm `>`: the true length is ≥ value, so `<` is never asserted from it.
 */
export function rulePasses(
  metric: Pick<ScreenerMetricResult, 'value' | 'status' | 'lower_bound'>,
  operator: '>' | '<',
  threshold: number,
): boolean {
  if (metric.status !== 'ok' || metric.value === null) return false;
  if (operator === '>') return metric.value > threshold;
  return metric.lower_bound !== true && metric.value < threshold;
}

/** Runs `worker` over `items` with at most `limit` in flight; preserves input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

type CellSpec = { metric_id: ScreenerMetricId; period: ScreenerPeriod };

const AVAILABILITY_RULE =
  'A report is used only from the VN day after its publication date; "latest" is resolved per company at this result\'s as_of.';

/**
 * Exception statistics (spec §7.6 and Bộ lọc 4.0 §3.4): per metric and role, and per technical row,
 * how many companies fall in each status and why. A missing/not-applicable required condition or a
 * NO_SIGNAL technical row is counted here, never as "did not pass". A company that failed Kỹ thuật
 * never reached the fundamental step (its `metrics` is empty): that is not an exception.
 */
export function summarizeRows(
  rows: readonly ScreenerRow[],
  rules: readonly DefinitionRule[],
  columns: readonly DefinitionColumn[],
  technical: ReadonlyArray<TechnicalColumnSpec & { label?: string }> = [],
): Pick<ScreenerRunHeader, 'counts'> & {
  data_quality: Pick<ScreenerRunHeader['data_quality'], 'metrics' | 'technical'>;
} {
  const required = rules.map((rule) => rule.metric_id);
  let passed = 0;
  let failedThreshold = 0;
  let withExceptions = 0;
  let withMissing = 0;
  for (const row of rows) {
    if (row.passed) passed += 1;
    const technicalCells = Object.values(row.technical);
    const technicalException = technicalCells.some((cell) => cell.status !== 'ok');
    const reachedFundamentals = Object.keys(row.metrics).length > 0;
    const fundamentalException =
      reachedFundamentals &&
      required.some((id) => {
        const cell = row.metrics[id];
        return !cell || cell.status !== 'ok';
      });
    if (technicalException || fundamentalException) withExceptions += 1;
    else if (!row.passed) failedThreshold += 1;
    if (
      Object.values(row.metrics).some((cell) => cell.status === 'missing') ||
      technicalCells.some((cell) => cell.status === 'missing')
    )
      withMissing += 1;
  }
  const specs = [
    ...rules.map((rule) => ({
      metric_id: rule.metric_id,
      period: rule.period,
      role: 'condition' as const,
    })),
    ...columns.map((column) => ({
      metric_id: column.metric_id,
      period: column.period,
      role: 'reference' as const,
    })),
  ];
  return {
    counts: {
      universe: rows.length,
      passed,
      failed_threshold: failedThreshold,
      with_required_exceptions: withExceptions,
      missing: withMissing,
    },
    data_quality: {
      metrics: specs.map((spec) => {
        const byStatus: Record<string, number> = {};
        const byReason: Record<string, number> = {};
        for (const row of rows) {
          const cell = row.metrics[spec.metric_id];
          if (!cell) continue;
          byStatus[cell.status] = (byStatus[cell.status] ?? 0) + 1;
          if (cell.status !== 'ok') {
            const code = cell.reason_code ?? cell.status;
            byReason[code] = (byReason[code] ?? 0) + 1;
          }
        }
        return {
          metric_id: spec.metric_id,
          period_mode: spec.period,
          role: spec.role,
          by_status: byStatus,
          by_reason: byReason,
        };
      }),
      technical: technical.map((spec) => {
        const byStatus: Record<string, number> = {};
        const byReason: Record<string, number> = {};
        for (const row of rows) {
          const cell = row.technical[spec.key];
          if (!cell) continue;
          byStatus[cell.status] = (byStatus[cell.status] ?? 0) + 1;
          if (cell.status !== 'ok') {
            const code = cell.reason_code ?? cell.status;
            byReason[code] = (byReason[code] ?? 0) + 1;
          }
        }
        return {
          key: spec.key,
          indicator: spec.indicator,
          row_id: spec.row_id,
          label: spec.label ?? spec.key,
          by_status: byStatus,
          by_reason: byReason,
        };
      }),
    },
  };
}

/** A company inside Thị trường with its Kỹ thuật verdict; the fundamental step fills `metrics`/`passed`. */
type Candidate = { row: ScreenerRow; technical: TechnicalEvaluation };

@Injectable()
export class ScreenerService {
  private readonly logger = new Logger(ScreenerService.name);

  constructor(
    private readonly vci: VciMarketProvider,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    @Inject(ScreenerRunRepository) private readonly runs: ScreenerRunStore,
    @Inject(SCREENER_MARKET_DATA) private readonly market: ScreenerMarketDataPort,
  ) {}

  async metrics(userId: string): Promise<ScreenerMetricView[]> {
    const granted = await this.grants.grantedCapabilities(userId);
    // Học viện v4 (spec §4.2): no metric is tied to a lesson any more, so every registry metric is listed
    // (`lesson_id` only says which lesson teaches it, for the "Học" link).
    return loadFundamentalRegistry().map((metric) => ({
      id: metric.id,
      name: metric.name,
      lesson_id: metric.lesson_id,
      unit: metric.unit,
      api_unit: metric.api_unit,
      period: metric.period,
      default_period: metric.default_period,
      allowed_periods: metric.allowed_periods.map((id) => ({
        id,
        label: screenerPeriodLabel(metric.id, id),
      })),
      readiness: metric.readiness,
      applicability: metric.applicability,
      operators: [...metric.operators],
      learned: granted.has(`metric:${metric.id}`),
      ...metricSupport(metric.id),
    }));
  }

  async run(userId: string, input: ScreenerRunInput, now = new Date()): Promise<ScreenerRunData> {
    const { definition, legacy, sector_review } = normalizeDefinition(
      input as ScreenerDefinitionV4 | ScreenerDefinitionV3 | LegacyScreenerDefinition,
    );
    if (legacy?.needs_review)
      throw new UnprocessableEntityException({
        code: 'PERIOD_REVIEW_REQUIRED',
        message:
          'Bộ lọc cũ dùng kỳ không còn được hỗ trợ cho một số điều kiện; hãy chọn lại kỳ tính, hệ thống không tự đổi sang kỳ khác.',
        details: legacy.rules.filter((rule) => rule.status === 'needs_review'),
      });
    if (sector_review)
      throw new UnprocessableEntityException({
        code: 'SECTOR_REVIEW_REQUIRED',
        message: `Chọn lại ngành: ngành ICB “${sector_review.sector}” của bộ lọc cũ không còn được hỗ trợ.`,
        details: [{ sector: sector_review.sector }],
      });
    const columns = definition.columns ?? [];
    const technicalItems = definition.technical ?? [];
    const issues = [
      ...marketIssues(definition.market),
      ...ruleIssues(definition.rules, columns),
      ...technicalIssues(technicalItems),
    ];
    if (issues.length)
      throw new UnprocessableEntityException({
        code: 'DEFINITION_INVALID',
        message: issues.map((issue) => issue.message).join('\n'),
        details: issues,
      });
    const specs: CellSpec[] = [
      ...definition.rules.map((rule) => ({ metric_id: rule.metric_id, period: rule.period })),
      ...columns,
    ];
    const notReady = notReadyMetrics(specs.map((spec) => spec.metric_id));
    if (notReady.length)
      throw new UnprocessableEntityException({
        code: 'METRIC_NOT_READY',
        message:
          'Có chỉ tiêu chưa có định nghĩa hoặc nguồn dữ liệu để tính; chỉ tiêu này chưa dùng được trong bộ lọc.',
        details: notReady,
      });
    // Kỹ thuật and Thị trường need no capability (Bộ lọc 4.0 §8): only the fundamental cells are checked.
    await this.assertLearned(userId, specs);

    // ---- Step 1 (Bộ lọc 4.0 §9): Thị trường + Kỹ thuật over the whole universe, from the stored bars.
    const technicalSpecs = technicalColumns(technicalItems);
    const needsBars = marketNeedsBars(definition.market) || technicalSpecs.length > 0;
    const needsSession = needsBars || definition.market.baskets.length > 0;
    const session = await this.market.resolveSession(now);
    if (needsSession && !session)
      throw new ServiceUnavailableException({
        code: 'MARKET_DATA_UNAVAILABLE',
        message:
          'Chưa có dữ liệu giá của phiên đã đóng cửa để lọc Thị trường và Kỹ thuật. Hãy thử lại sau ít phút.',
      });
    const stepOne = await this.stepOne(definition, session, now);
    let candidates = stepOne.candidates;

    // ---- Step 2: fundamentals (VCI) only for the survivors, capped.
    const needsFundamentals = specs.length > 0;
    const survivors = candidates.filter((candidate) => candidate.technical.passed);
    const truncated = needsFundamentals && survivors.length > SCREENER_MAX_UNIVERSE;
    if (needsFundamentals) {
      const computed = survivors.slice(0, SCREENER_MAX_UNIVERSE);
      const computedSymbols = new Set(computed.map((candidate) => candidate.row.symbol));
      const surviving = new Set(survivors.map((candidate) => candidate.row.symbol));
      // Companies beyond the cap are not evaluated, so they are not listed (spec §9: "giữ cơ chế cắt").
      candidates = candidates.filter(
        (candidate) =>
          computedSymbols.has(candidate.row.symbol) || !surviving.has(candidate.row.symbol),
      );
      const needsPrice = specs.some((spec) => PRICE_METRICS.has(spec.metric_id));
      const prices = needsPrice
        ? await this.prices(computed.map((candidate) => candidate.row.symbol))
        : new Map<string, number>();
      await mapWithConcurrency(computed, SCREENER_FETCH_CONCURRENCY, async (candidate) => {
        const metrics = await this.evaluateSymbol(
          candidate.row.symbol,
          specs,
          needsPrice,
          prices.get(candidate.row.symbol) ?? null,
          now,
        );
        candidate.row.metrics = metrics;
        candidate.row.passed = definition.rules.every((rule) =>
          rulePasses(metrics[rule.metric_id]!, rule.operator, rule.value),
        );
      });
    } else {
      for (const candidate of candidates) candidate.row.passed = candidate.technical.passed;
    }
    const results = candidates.map((candidate) => candidate.row);

    const labels = technicalColumnLabels(technicalItems);
    const summary = summarizeRows(
      results,
      definition.rules,
      columns,
      technicalSpecs.map((spec) => ({ ...spec, label: labels.get(spec.key) })),
    );
    const header: Omit<ScreenerRunHeader, 'result_id'> = {
      schema_version: SCREENER_DEFINITION_SCHEMA_VERSION,
      data_mode: 'latest_disclosed',
      as_of: now.toISOString(),
      session_date: session,
      definition: definition as ScreenerRunHeader['definition'],
      legacy_review: legacy,
      data_source: SCREENER_DATA_SOURCE,
      price_source: session ? this.market.priceSource : null,
      calculation_version: screenerCalculationVersion(),
      registry_version: SCREENER_REGISTRY_VERSION,
      universe_truncated: truncated,
      fundamental_candidates: needsFundamentals ? survivors.length : null,
      provenance_notes: {
        period_dates: 'not_provided_by_source',
        report_scope: 'not_provided_by_source',
        availability_rule: AVAILABILITY_RULE,
      },
      counts: summary.counts,
      data_quality: { ...summary.data_quality, market: stepOne.quality },
    };
    const resultId = await this.runs.insert({
      user_id: userId,
      definition_hash: sha256Hex(canonicalJson(header.definition)),
      header,
      results,
    });
    return { result_id: resultId, ...header, results };
  }

  /** One page of a stored run. Every page carries the same header and the same `as_of`. */
  async getResult(
    userId: string,
    resultId: string,
    query: ScreenerResultQuery,
  ): Promise<ScreenerResultPage> {
    const stored = await this.runs.find(userId, resultId);
    if (!stored)
      throw new NotFoundException({
        code: 'SCREENER_RESULT_NOT_FOUND',
        message: 'Không tìm thấy kết quả lọc (có thể đã hết hạn lưu); hãy chạy lại bộ lọc.',
      });
    const all = query.passed_only ? stored.results.filter((row) => row.passed) : stored.results;
    // The whole result is ordered before it is cut into pages (Bộ lọc 4.0 §4.3); the stored rows never change.
    const rows = sortRows(all, query.sort, query.order);
    return {
      ...stored.header,
      total: rows.length,
      offset: query.offset,
      limit: query.limit,
      results: rows.slice(query.offset, query.offset + query.limit),
    };
  }

  /**
   * Thị trường scope and Kỹ thuật verdicts for every active stock, from the stored closed bars of
   * session T. Sàn / Rổ / Ngành are applied first (no bars); bars are then read chunk by chunk for
   * the symbols still in play, so memory stays bounded and no provider is called.
   */
  private async stepOne(
    definition: ScreenerDefinitionV4,
    session: string | null,
    now: Date,
  ): Promise<{ candidates: Candidate[]; quality: MarketQuality }> {
    const { market } = definition;
    const technicalItems: TechnicalItem[] = definition.technical ?? [];
    const quality = emptyMarketQuality();
    const universe = await this.market.universe();
    quality.universe = universe.length;

    let baskets: BasketMembers = new Map();
    if (market.baskets.length && session) {
      baskets = await this.market.basketMembers(market.baskets, session, now);
      quality.baskets_unavailable = market.baskets.filter((code) => baskets.get(code) === null);
    }

    const inPlay = universe.filter((record) => {
      const verdict = cheapVerdict(record, market, baskets);
      if (!verdict.in_scope && verdict.missing) quality.excluded_missing[verdict.missing] += 1;
      return verdict.in_scope;
    });

    const candidates: Candidate[] = [];
    let processed = 0;
    for (let start = 0; start < inPlay.length; start += BAR_CHUNK) {
      const chunk = inPlay.slice(start, start + BAR_CHUNK);
      const bars = session
        ? await this.market.loadBars(
            chunk.map((record) => record.symbol),
            session,
          )
        : new Map();
      for (const record of chunk) {
        const columns = bars.get(record.symbol) ?? null;
        const values =
          session && columns
            ? computeMarketValues(columns, session, record.shares, market.avg_value.sessions)
            : EMPTY_MARKET_VALUES;
        const verdict = valueVerdict(values, market);
        if (!verdict.in_scope) {
          if (verdict.missing) quality.excluded_missing[verdict.missing] += 1;
          continue;
        }
        quality.in_scope += 1;
        const hasSessionBar = !!columns && columns.dates.at(-1) === session;
        if (session && !hasSessionBar) quality.without_session_bar += 1;
        const technical = evaluateTechnical(
          technicalItems,
          columns && hasSessionBar ? toEngineBars(columns) : null,
          session ?? '',
        );
        candidates.push({
          technical,
          row: {
            symbol: record.symbol,
            name: record.name,
            sector: record.sector,
            exchange: record.exchange,
            group: record.group,
            passed: false,
            market: values,
            technical: Object.fromEntries(technical.cells.map((cell) => [cell.key, cell])),
            metrics: {},
          },
        });
        processed += 1;
        if (processed % YIELD_EVERY === 0) await yieldToEventLoop();
      }
    }
    return { candidates, quality };
  }

  private async assertLearned(userId: string, specs: readonly CellSpec[]): Promise<void> {
    if (!specs.length) return;
    const granted = await this.grants.grantedCapabilities(userId);
    const locked = [
      ...new Set(specs.map((spec) => spec.metric_id).filter((id) => !granted.has(`metric:${id}`))),
    ];
    if (locked.length)
      throw new ForbiddenException({
        code: 'CAPABILITY_LOCKED',
        message: 'Bạn cần hoàn thành bài học của chỉ tiêu trước khi dùng trong bộ lọc.',
        capability: `metric:${locked[0]}`,
        reason: 'not_learned',
        capabilities: locked.map((id) => `metric:${id}`),
        // the v2 error filter forwards only `code`, `message` and array `details`
        details: locked.map((id) => ({ capability: `metric:${id}`, reason: 'not_learned' })),
      });
  }

  /** Observed price per symbol: last match, else reference price; null when the board fails. */
  private async prices(symbols: readonly string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    for (let start = 0; start < symbols.length; start += PRICE_BOARD_CHUNK) {
      const chunk = symbols.slice(start, start + PRICE_BOARD_CHUNK);
      try {
        const board = await this.vci.fetchPriceBoard([...chunk]);
        for (const item of board.data) {
          const symbol = typeof item.symbol === 'string' ? item.symbol.toUpperCase() : '';
          const price = finite(item.close_price) ?? finite(item.reference_price);
          if (symbol && price !== undefined && price > 0) prices.set(symbol, price);
        }
      } catch (error) {
        this.logger.warn(
          `Screener price board unavailable (${chunk.length} symbols): ${errorText(error)}`,
        );
      }
    }
    return prices;
  }

  private async evaluateSymbol(
    symbol: string,
    specs: readonly CellSpec[],
    needsMarket: boolean,
    price: number | null,
    now: Date,
  ): Promise<Record<string, ScreenerMetricResult>> {
    let statements: NormalizedStatements;
    try {
      statements = await this.statements(symbol, now);
    } catch (error) {
      this.logger.warn(`Screener statements unavailable for ${symbol}: ${errorText(error)}`);
      return this.providerFailure(specs);
    }
    if (specs.some((spec) => EPS_METRICS.has(spec.metric_id) || spec.metric_id === 'pe'))
      statements = withShareHistory(statements, await this.shareEvents(symbol, now));
    const market: MarketInputs = {
      price,
      shares: needsMarket ? await this.shares(symbol) : null,
    };
    return Object.fromEntries(
      specs.map((spec) => [
        spec.metric_id,
        evaluateScreenerMetric(spec.metric_id, statements, market, spec.period),
      ]),
    );
  }

  private async statements(symbol: string, now: Date): Promise<NormalizedStatements> {
    const [balance, income, cash] = await Promise.all(
      (['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'] as const).map((section) =>
        this.vci.fetchFinancialRaw(symbol, section),
      ),
    );
    const sections: VciStatementSections = {
      balance_sheet: balance!.data,
      income_statement: income!.data,
      cash_flow: cash!.data,
    };
    return normalizeVciStatements(sections, now);
  }

  /** Split/bonus share events (VCI `/v1/events` ISS); null when the source fails. */
  private async shareEvents(symbol: string, now: Date): Promise<ShareEvent[] | null> {
    try {
      const events = await this.vci.fetchShareEvents(symbol);
      return shareEventsFromVci(events.data, now);
    } catch (error) {
      this.logger.warn(`Screener share events unavailable for ${symbol}: ${errorText(error)}`);
      return null;
    }
  }

  /** Shares on VCI's current market-cap basis (latest statistics-financial row). */
  private async shares(symbol: string): Promise<number | null> {
    try {
      const report = await this.vci.fetchFinancialReport(symbol, 'ratio', { period: 'Q' });
      const rows = Array.isArray(report.data) ? (report.data as Record<string, unknown>[]) : [];
      const shares = finite(rows[0]?.number_of_shares_mkt_cap);
      return shares !== undefined && shares > 0 ? shares : null;
    } catch (error) {
      this.logger.warn(`Screener share count unavailable for ${symbol}: ${errorText(error)}`);
      return null;
    }
  }

  private providerFailure(specs: readonly CellSpec[]): Record<string, ScreenerMetricResult> {
    const empty: NormalizedStatements = { years: [], quarters: [], financial: false };
    return Object.fromEntries(
      specs.map((spec) => {
        const result = evaluateScreenerMetric(
          spec.metric_id,
          empty,
          { price: null, shares: null },
          spec.period,
        );
        const status: MetricStatus = 'missing';
        return [
          spec.metric_id,
          {
            ...result,
            status,
            value: null,
            actual_period_label: null,
            comparison_period_label: null,
            published_at: null,
            available_at: null,
            source_revision: null,
            components: [],
            reason: METRIC_REASONS.providerError,
            reason_code: 'provider_error',
          },
        ];
      }),
    );
  }
}
