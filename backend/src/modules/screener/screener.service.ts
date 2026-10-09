import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { VciMarketProvider } from '../market-data/index.js';
import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { finite } from '../financials/financials.calculations.js';
import { canonicalJson, sha256Hex } from '../quant/v2/hash.js';
import {
  normalizeDefinition,
  notReadyMetrics,
  ruleIssues,
  type DefinitionColumn,
  type DefinitionRule,
  type LegacyScreenerDefinition,
  type ScreenerDefinitionV3,
} from './screener.definition.js';
import { METRIC_REASONS, metricSupport, type MetricStatus } from './screener.metrics.js';
import {
  loadFundamentalRegistry,
  SCREENER_CALCULATION_VERSION,
  SCREENER_DEFINITION_SCHEMA_VERSION,
  SCREENER_REGISTRY_VERSION,
  screenerPeriodLabel,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from './screener.registry.js';
import { ScreenerRunRepository, type ScreenerRunStore } from './screener.repository.js';
import {
  normalizeScreenerScope,
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
import {
  evaluateScreenerMetric,
  normalizeVciStatements,
  PRICE_METRICS,
  type MarketInputs,
  type NormalizedStatements,
  type ScreenerMetricResult,
  type VciStatementSections,
} from './screener.statements.js';

export const SCREENER_DATA_SOURCE = 'VCI';

interface UniverseRow extends Record<string, unknown> {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
}

const PRICE_BOARD_CHUNK = 100;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
 * Exception statistics (spec §7.6): per metric and role, how many companies fall in each status
 * and why. A missing/not-applicable required condition is counted here, never as "did not pass".
 */
export function summarizeRows(
  rows: readonly ScreenerRow[],
  rules: readonly DefinitionRule[],
  columns: readonly DefinitionColumn[],
): Pick<ScreenerRunHeader, 'counts' | 'data_quality'> {
  const required = rules.map((rule) => rule.metric_id);
  let passed = 0;
  let failedThreshold = 0;
  let withExceptions = 0;
  let withMissing = 0;
  for (const row of rows) {
    if (row.passed) passed += 1;
    const requiredCells = required.map((id) => row.metrics[id]);
    const exception = requiredCells.some((cell) => !cell || cell.status !== 'ok');
    if (exception) withExceptions += 1;
    else if (!row.passed) failedThreshold += 1;
    if (Object.values(row.metrics).some((cell) => cell.status === 'missing')) withMissing += 1;
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
    },
  };
}

@Injectable()
export class ScreenerService {
  private readonly logger = new Logger(ScreenerService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly vci: VciMarketProvider,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    @Inject(ScreenerRunRepository) private readonly runs: ScreenerRunStore,
  ) {}

  async metrics(userId: string): Promise<ScreenerMetricView[]> {
    const granted = await this.grants.grantedCapabilities(userId);
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
    const { definition, legacy } = normalizeDefinition(
      input as ScreenerDefinitionV3 | LegacyScreenerDefinition,
    );
    if (legacy?.needs_review)
      throw new UnprocessableEntityException({
        code: 'PERIOD_REVIEW_REQUIRED',
        message:
          'Bộ lọc cũ dùng kỳ không còn được hỗ trợ cho một số điều kiện; hãy chọn lại kỳ tính, hệ thống không tự đổi sang kỳ khác.',
        details: legacy.rules.filter((rule) => rule.status === 'needs_review'),
      });
    const columns = definition.columns ?? [];
    const issues = ruleIssues(definition.rules, columns);
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
    await this.assertLearned(userId, specs);

    const scope = normalizeScreenerScope(definition.scope);
    const universeRows = await this.universe(scope.market, scope.sector);
    const truncated = universeRows.length > SCREENER_MAX_UNIVERSE;
    const universe = universeRows.slice(0, SCREENER_MAX_UNIVERSE);

    const needsMarket = specs.some((spec) => PRICE_METRICS.has(spec.metric_id));
    const prices = needsMarket ? await this.prices(universe.map((row) => row.symbol)) : new Map();

    const results = await mapWithConcurrency(universe, SCREENER_FETCH_CONCURRENCY, async (row) => {
      // No condition and no column: a scope-only listing, no provider call.
      const metrics = specs.length
        ? await this.evaluateSymbol(
            row.symbol,
            specs,
            needsMarket,
            prices.get(row.symbol) ?? null,
            now,
          )
        : {};
      const passed = definition.rules.every((rule) =>
        rulePasses(metrics[rule.metric_id]!, rule.operator, rule.value),
      );
      return {
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        exchange: row.exchange,
        passed,
        metrics,
      } satisfies ScreenerRow;
    });

    const header: Omit<ScreenerRunHeader, 'result_id'> = {
      schema_version: SCREENER_DEFINITION_SCHEMA_VERSION,
      data_mode: 'latest_disclosed',
      as_of: now.toISOString(),
      definition: definition as ScreenerRunHeader['definition'],
      legacy_review: legacy,
      data_source: SCREENER_DATA_SOURCE,
      calculation_version: SCREENER_CALCULATION_VERSION,
      registry_version: SCREENER_REGISTRY_VERSION,
      universe_truncated: truncated,
      provenance_notes: {
        period_dates: 'not_provided_by_source',
        report_scope: 'not_provided_by_source',
        availability_rule: AVAILABILITY_RULE,
      },
      ...summarizeRows(results, definition.rules, columns),
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
    const rows = query.passed_only ? stored.results.filter((row) => row.passed) : stored.results;
    return {
      ...stored.header,
      total: rows.length,
      offset: query.offset,
      limit: query.limit,
      results: rows.slice(query.offset, query.offset + query.limit),
    };
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

  private async universe(market: string, sector: string | null): Promise<UniverseRow[]> {
    return this.database.query<UniverseRow>(
      `select upper(symbol) as symbol,
              coalesce(nullif(trim(name), ''), nullif(trim(short_name), '')) as name,
              case when upper(exchange) = 'HSX' then 'HOSE' else upper(exchange) end as exchange,
              coalesce(nullif(trim(icb_lv2), ''), nullif(trim(icb_lv1), '')) as sector
         from symbols
        where is_active = true
          and coalesce(is_index, false) = false
          and lower(asset_type) = 'stock'
          and ($1::text = 'ALL' or upper(exchange) = $1 or ($1 = 'HOSE' and upper(exchange) = 'HSX'))
          and ($2::text is null
               or lower(coalesce(nullif(trim(icb_lv2), ''), nullif(trim(icb_lv1), ''))) = lower($2)
               or lower(trim(icb_lv1)) = lower($2))
        order by upper(symbol)
        limit $3`,
      [market, sector, SCREENER_MAX_UNIVERSE + 1],
    );
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
