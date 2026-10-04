import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { VciMarketProvider } from '../market-data/index.js';
import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { finite } from '../financials/financials.calculations.js';
import { METRIC_REASONS, metricSupport } from './screener.metrics.js';
import {
  loadFundamentalRegistry,
  SCREENER_CALCULATION_VERSION,
  type ScreenerMetricId,
} from './screener.registry.js';
import {
  normalizeScreenerScope,
  SCREENER_FETCH_CONCURRENCY,
  SCREENER_MAX_UNIVERSE,
  type ScreenerDefinition,
  type ScreenerMetricView,
  type ScreenerRunData,
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

@Injectable()
export class ScreenerService {
  private readonly logger = new Logger(ScreenerService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly vci: VciMarketProvider,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
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
      applicability: metric.applicability,
      operators: [...metric.operators],
      learned: granted.has(`metric:${metric.id}`),
      ...metricSupport(metric.id),
    }));
  }

  async run(
    userId: string,
    definition: ScreenerDefinition,
    now = new Date(),
  ): Promise<ScreenerRunData> {
    await this.assertLearned(userId, definition);
    const scope = normalizeScreenerScope(definition.scope);
    const period = definition.scope.period;
    const metricIds = [...new Set(definition.rules.map((rule) => rule.metric_id))];
    const universeRows = await this.universe(scope.market, scope.sector);
    const truncated = universeRows.length > SCREENER_MAX_UNIVERSE;
    const universe = universeRows.slice(0, SCREENER_MAX_UNIVERSE);

    const needsStatements = metricIds.some((id) => metricSupport(id).supported);
    const needsMarket = metricIds.some(
      (id) => PRICE_METRICS.has(id) && metricSupport(id).supported,
    );
    const prices = needsMarket ? await this.prices(universe.map((row) => row.symbol)) : new Map();

    const results = await mapWithConcurrency(universe, SCREENER_FETCH_CONCURRENCY, async (row) => {
      const metrics = needsStatements
        ? await this.evaluateSymbol(
            row.symbol,
            metricIds,
            period,
            needsMarket,
            prices.get(row.symbol) ?? null,
            now,
          )
        : this.unsupportedOnly(metricIds, period);
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
      };
    });

    return {
      as_of: now.toISOString(),
      scope: { ...definition.scope },
      period,
      data_source: SCREENER_DATA_SOURCE,
      calculation_version: SCREENER_CALCULATION_VERSION,
      universe_truncated: truncated,
      results,
      counts: {
        universe: results.length,
        passed: results.filter((result) => result.passed).length,
        missing: results.filter((result) =>
          Object.values(result.metrics).some((metric) => metric.status === 'missing'),
        ).length,
      },
    };
  }

  private async assertLearned(userId: string, definition: ScreenerDefinition): Promise<void> {
    if (!definition.rules.length) return;
    const granted = await this.grants.grantedCapabilities(userId);
    const locked = [
      ...new Set(
        definition.rules.map((rule) => rule.metric_id).filter((id) => !granted.has(`metric:${id}`)),
      ),
    ];
    if (locked.length)
      throw new ForbiddenException({
        code: 'CAPABILITY_LOCKED',
        message: 'Bạn cần hoàn thành bài học của chỉ tiêu trước khi dùng trong bộ lọc.',
        capability: `metric:${locked[0]}`,
        reason: 'not_learned',
        capabilities: locked.map((id) => `metric:${id}`),
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
    metricIds: readonly ScreenerMetricId[],
    period: ScreenerDefinition['scope']['period'],
    needsMarket: boolean,
    price: number | null,
    now: Date,
  ): Promise<Record<string, ScreenerMetricResult>> {
    let statements: NormalizedStatements;
    try {
      statements = await this.statements(symbol, now);
    } catch (error) {
      this.logger.warn(`Screener statements unavailable for ${symbol}: ${errorText(error)}`);
      return this.providerFailure(metricIds, period);
    }
    const market: MarketInputs = {
      price,
      shares: needsMarket ? await this.shares(symbol) : null,
    };
    return Object.fromEntries(
      metricIds.map((id) => [id, evaluateScreenerMetric(id, statements, market, period)]),
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

  private emptyStatements(): NormalizedStatements {
    return { years: [], quarters: [], financial: false };
  }

  /** Rules only on unsupported metrics: no provider call, every value is `missing` with reason. */
  private unsupportedOnly(
    metricIds: readonly ScreenerMetricId[],
    period: ScreenerDefinition['scope']['period'],
  ): Record<string, ScreenerMetricResult> {
    const market: MarketInputs = { price: null, shares: null };
    return Object.fromEntries(
      metricIds.map((id) => [
        id,
        evaluateScreenerMetric(id, this.emptyStatements(), market, period),
      ]),
    );
  }

  private providerFailure(
    metricIds: readonly ScreenerMetricId[],
    period: ScreenerDefinition['scope']['period'],
  ): Record<string, ScreenerMetricResult> {
    return Object.fromEntries(
      metricIds.map((id) => {
        const result = evaluateScreenerMetric(
          id,
          this.emptyStatements(),
          { price: null, shares: null },
          period,
        );
        return [
          id,
          metricSupport(id).supported
            ? {
                ...result,
                status: 'missing' as const,
                value: null,
                reason: METRIC_REASONS.providerError,
              }
            : result,
        ];
      }),
    );
  }
}
