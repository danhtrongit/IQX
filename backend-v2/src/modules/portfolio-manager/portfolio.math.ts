import type {
  PortfolioHolding,
  PortfolioInput,
  PortfolioPricePoint,
  PortfolioTrade,
} from './portfolio.types.js';

export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const previous = values[i - 1]!;
    const current = values[i]!;
    if (previous > 0 && current > 0 && Number.isFinite(previous) && Number.isFinite(current)) {
      out.push(Number((current / previous - 1).toFixed(12)));
    }
  }
  return out;
}

export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, x) => a + (x - mean) ** 2, 0) / (values.length - 1));
}

export function annualizedVol(values: number[]): number | null {
  const daily = stdev(values);
  return daily === null ? null : daily * Math.sqrt(252);
}

export function maxDrawdown(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = -Infinity;
  let result = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) return null;
    peak = Math.max(peak, value);
    result = Math.min(result, value / peak - 1);
  }
  return result;
}

export function correlation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const n = a.length;
  const mx = a.reduce((s, v) => s + v, 0) / n;
  const my = b.reduce((s, v) => s + v, 0) / n;
  const xy = a.reduce((s, v, i) => s + (v - mx) * (b[i]! - my), 0);
  const xx = a.reduce((s, v) => s + (v - mx) ** 2, 0);
  const yy = b.reduce((s, v) => s + (v - my) ** 2, 0);
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : null;
}

export function beta(asset: number[], market: number[]): number | null {
  if (asset.length !== market.length || asset.length < 2) return null;
  const n = asset.length;
  const mm = market.reduce((s, v) => s + v, 0) / n;
  const am = asset.reduce((s, v) => s + v, 0) / n;
  const covariance = market.reduce((s, v, i) => s + (v - mm) * (asset[i]! - am), 0);
  const variance = market.reduce((s, v) => s + (v - mm) ** 2, 0);
  return variance > 0 ? covariance / variance : null;
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;
}

function weights(input: PortfolioInput): Map<string, number> {
  if (input.navVnd <= 0n) return new Map(input.holdings.map((holding) => [holding.ticker, 0]));
  return new Map(
    input.holdings.map((holding) => [
      holding.ticker,
      Number(holding.marketValueVnd) / Number(input.navVnd),
    ]),
  );
}

function priceMap(history: PortfolioPricePoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of history) {
    if (
      typeof point.date === 'string' &&
      point.date.length > 0 &&
      Number.isFinite(point.close) &&
      point.close > 0
    ) {
      map.set(point.date, point.close);
    }
  }
  return map;
}

function commonDates(series: PortfolioPricePoint[][]): string[] {
  if (!series.length || series.some((points) => points.length < 2)) return [];
  let dates = new Set([...priceMap(series[0]!).keys()]);
  for (const points of series.slice(1)) {
    const available = new Set(priceMap(points).keys());
    dates = new Set([...dates].filter((date) => available.has(date)));
  }
  return [...dates].sort();
}

function portfolioIndex(
  input: PortfolioInput,
  dates: string[],
  holdings: PortfolioHolding[] = input.holdings,
): number[] {
  if (!dates.length || !holdings.length || input.navVnd <= 0n) return [];
  const maps = new Map(holdings.map((holding) => [holding.ticker, priceMap(holding.priceHistory)]));
  const holdingWeights = weights(input);
  const investedWeight = holdings.reduce(
    (sum, holding) => sum + (holdingWeights.get(holding.ticker) ?? 0),
    0,
  );
  const stableCashWeight = Math.max(0, 1 - investedWeight);
  const bases = new Map<string, number>();
  for (const holding of holdings) {
    const base = maps.get(holding.ticker)?.get(dates[0]!);
    if (base === undefined || base <= 0) return [];
    bases.set(holding.ticker, base);
  }
  return dates.map((date) => {
    let value = stableCashWeight;
    for (const holding of holdings) {
      const price = maps.get(holding.ticker)?.get(date);
      const base = bases.get(holding.ticker);
      if (price === undefined || base === undefined) return Number.NaN;
      value += (holdingWeights.get(holding.ticker) ?? 0) * (price / base);
    }
    return value;
  });
}

function weightedMetric(
  input: PortfolioInput,
  key: 'pe' | 'pb' | 'roe',
): { value: number | null; coverage: number; missing: string[] } {
  const total = input.holdings.reduce((sum, holding) => sum + Number(holding.marketValueVnd), 0);
  const usable = input.holdings.filter(
    (holding) => holding[key] !== null && Number.isFinite(holding[key]),
  );
  const covered = usable.reduce((sum, holding) => sum + Number(holding.marketValueVnd), 0);
  const coverage = total > 0 ? covered / total : 0;
  const value =
    covered > 0
      ? usable.reduce(
          (sum, holding) => sum + (Number(holding.marketValueVnd) / covered) * holding[key]!,
          0,
        )
      : null;
  return {
    value: round(value),
    coverage: round(coverage) ?? 0,
    missing: input.holdings
      .filter((holding) => holding[key] === null)
      .map((holding) => holding.ticker),
  };
}

type ClosedTradeEvidence = {
  evaluated: boolean;
  dispositionFlag: boolean | null;
  winnerQuantity: number;
  loserQuantity: number;
  averageWinnerDays: number | null;
  averageLoserDays: number | null;
  closedQuantity: number;
};

function tradeEvidence(trades: PortfolioTrade[]): ClosedTradeEvidence {
  type Lot = { quantity: number; price: bigint; tradedAt: Date };
  const buys = new Map<string, Lot[]>();
  let winnerQuantity = 0;
  let loserQuantity = 0;
  let winnerDays = 0;
  let loserDays = 0;
  const ordered = trades
    .filter(
      (trade) =>
        Number.isSafeInteger(trade.quantity) &&
        trade.quantity > 0 &&
        Number.isFinite(trade.tradedAt.getTime()),
    )
    .sort((left, right) => left.tradedAt.getTime() - right.tradedAt.getTime());
  for (const trade of ordered) {
    const symbol = trade.symbol.toUpperCase();
    if (trade.side === 'buy') {
      const queue = buys.get(symbol) ?? [];
      queue.push({ quantity: trade.quantity, price: trade.priceVnd, tradedAt: trade.tradedAt });
      buys.set(symbol, queue);
      continue;
    }
    let remaining = trade.quantity;
    const queue = buys.get(symbol) ?? [];
    while (remaining > 0 && queue.length) {
      const lot = queue[0]!;
      const matched = Math.min(remaining, lot.quantity);
      const days = Math.max(
        0,
        Math.floor((trade.tradedAt.getTime() - lot.tradedAt.getTime()) / 86_400_000),
      );
      if (trade.priceVnd >= lot.price) {
        winnerQuantity += matched;
        winnerDays += days * matched;
      } else {
        loserQuantity += matched;
        loserDays += days * matched;
      }
      remaining -= matched;
      lot.quantity -= matched;
      if (lot.quantity === 0) queue.shift();
    }
  }
  const averageWinnerDays = winnerQuantity ? winnerDays / winnerQuantity : null;
  const averageLoserDays = loserQuantity ? loserDays / loserQuantity : null;
  // A discipline score is only meaningful when at least one filled sell has
  // actually been matched to a buy lot.  The disposition comparison itself is
  // stricter and requires both a winning and losing closed lot.
  const closedQuantity = winnerQuantity + loserQuantity;
  const evaluated = closedQuantity > 0;
  return {
    evaluated,
    dispositionFlag:
      averageWinnerDays !== null && averageLoserDays !== null
        ? averageLoserDays > averageWinnerDays * 1.5
        : null,
    winnerQuantity,
    loserQuantity,
    averageWinnerDays: round(averageWinnerDays),
    averageLoserDays: round(averageLoserDays),
    closedQuantity,
  };
}

function qualityScore(roe: number, pe: number): number {
  if (roe > 0.18 && pe > 0 && pe < 12) return 5;
  if (roe >= 0.15) return 4;
  if (roe >= 0.12) return 3;
  if (roe >= 0.08) return 2;
  return 1;
}

export function buildAnalysis(input: PortfolioInput): Record<string, unknown> {
  const holdingWeights = weights(input);
  const totalCost = input.holdings.reduce((sum, holding) => sum + holding.costBasisVnd, 0n);
  const pnl = input.holdings.reduce((sum, holding) => sum + holding.unrealizedPnlVnd, 0n);
  const totalReturn = totalCost > 0n ? Number(pnl) / Number(totalCost) : null;
  const holdingDates = commonDates(input.holdings.map((holding) => holding.priceHistory));
  const holdingSeries = portfolioIndex(input, holdingDates);
  const allHoldingsSupported =
    input.holdings.length > 0 &&
    holdingDates.length >= 3 &&
    holdingSeries.length === holdingDates.length &&
    holdingSeries.every(Number.isFinite);
  const portfolioReturns = allHoldingsSupported ? dailyReturns(holdingSeries) : [];

  const benchmarkMap = priceMap(input.benchmarkHistory);
  const benchmarkDates = allHoldingsSupported
    ? holdingDates.filter((date) => benchmarkMap.has(date))
    : [];
  const benchmarkPortfolioSeries = portfolioIndex(input, benchmarkDates);
  const benchmarkSeries = benchmarkDates.map((date) => benchmarkMap.get(date)!);
  const hasAlignedBenchmark =
    benchmarkDates.length >= 3 &&
    benchmarkPortfolioSeries.length === benchmarkDates.length &&
    benchmarkPortfolioSeries.every(Number.isFinite) &&
    benchmarkSeries.length === benchmarkDates.length &&
    benchmarkSeries.every((value) => Number.isFinite(value) && value > 0);
  const alignedPortfolioReturns = hasAlignedBenchmark ? dailyReturns(benchmarkPortfolioSeries) : [];
  const benchmarkReturns = hasAlignedBenchmark ? dailyReturns(benchmarkSeries) : [];
  const portfolioPeriodReturn = allHoldingsSupported
    ? holdingSeries.at(-1)! / holdingSeries[0]! - 1
    : null;
  const benchmarkReturn = hasAlignedBenchmark
    ? benchmarkSeries.at(-1)! / benchmarkSeries[0]! - 1
    : null;
  const comparablePortfolioReturn = hasAlignedBenchmark
    ? benchmarkPortfolioSeries.at(-1)! / benchmarkPortfolioSeries[0]! - 1
    : null;
  const excess =
    comparablePortfolioReturn === null || benchmarkReturn === null
      ? null
      : comparablePortfolioReturn - benchmarkReturn;

  const sector: Record<string, number> = {};
  for (const holding of input.holdings) {
    sector[holding.sector] =
      (sector[holding.sector] ?? 0) + (holdingWeights.get(holding.ticker) ?? 0);
  }
  const sortedWeights = [...holdingWeights.values()].sort((a, b) => b - a);
  const hhi = [...holdingWeights.values()].reduce((sum, weight) => sum + weight * weight, 0);
  const correlationRows: Array<{ a: string; b: string; value: number }> = [];
  if (allHoldingsSupported) {
    const maps = new Map(
      input.holdings.map((holding) => [holding.ticker, priceMap(holding.priceHistory)]),
    );
    for (let i = 0; i < input.holdings.length; i += 1) {
      for (let j = i + 1; j < input.holdings.length; j += 1) {
        const left = input.holdings[i]!;
        const right = input.holdings[j]!;
        const leftReturns = dailyReturns(
          holdingDates.map((date) => maps.get(left.ticker)!.get(date)!),
        );
        const rightReturns = dailyReturns(
          holdingDates.map((date) => maps.get(right.ticker)!.get(date)!),
        );
        const value = round(correlation(leftReturns, rightReturns));
        if (value !== null) correlationRows.push({ a: left.ticker, b: right.ticker, value });
      }
    }
  }
  const risk = {
    beta: hasAlignedBenchmark ? round(beta(alignedPortfolioReturns, benchmarkReturns)) : null,
    volatility: allHoldingsSupported ? round(annualizedVol(portfolioReturns)) : null,
    max_drawdown: allHoldingsSupported ? round(maxDrawdown(holdingSeries)) : null,
    correlation: allHoldingsSupported ? correlationRows : [],
    data_quality: {
      complete: allHoldingsSupported,
      holdings_total: input.holdings.length,
      holdings_with_history: input.holdings.filter((holding) => holding.priceHistory.length >= 3)
        .length,
      common_price_observations: holdingDates.length,
      benchmark_aligned_observations: benchmarkDates.length,
      beta_available: hasAlignedBenchmark,
      missing_history: input.holdings
        .filter((holding) => holding.priceHistory.length < 3)
        .map((holding) => holding.ticker),
      history_alignment_complete: allHoldingsSupported && holdingDates.length >= 3,
    },
  };

  const pe = weightedMetric(input, 'pe');
  const pb = weightedMetric(input, 'pb');
  const roe = weightedMetric(input, 'roe');
  const qualityEligible =
    input.holdings.length > 0 &&
    pe.value !== null &&
    roe.value !== null &&
    pe.coverage === 1 &&
    roe.coverage === 1;
  const quality = {
    pe: pe.value,
    pb: pb.value,
    roe: roe.value,
    coverage: { pe: pe.coverage, pb: pb.coverage, roe: roe.coverage },
    score_eligible: qualityEligible,
    missing: {
      pe: pe.missing,
      pb: pb.missing,
      roe: roe.missing,
    },
  };
  const evidence = tradeEvidence(input.trades);
  const losingCount = input.holdings.filter((holding) => holding.unrealizedPnlVnd < 0n).length;
  // Do not infer trading discipline from unrealized/open losses.  A score is
  // emitted only from matched, closed-lot evidence; when the lot history is
  // insufficient the API returns null and explains why in behavior.evidence.
  const discipline =
    evidence.evaluated && evidence.dispositionFlag !== null
      ? evidence.dispositionFlag
        ? 2
        : 5
      : null;
  const performanceScore =
    excess === null
      ? null
      : excess > 0.05
        ? 5
        : excess > 0.02
          ? 4
          : excess >= -0.02
            ? 3
            : excess >= -0.08
              ? 2
              : 1;
  const betaValue = risk.beta;
  const riskScore =
    betaValue === null ? null : betaValue >= 0.8 && betaValue <= 1.1 ? 5 : betaValue <= 1.3 ? 3 : 1;
  const effectiveN = hhi > 0 ? 1 / hhi : null;
  const pillars = {
    performance: performanceScore,
    risk: riskScore,
    diversification: effectiveN === null ? null : effectiveN >= 6 ? 4 : effectiveN >= 4 ? 3 : 1,
    quality: qualityEligible ? qualityScore(roe.value!, pe.value!) : null,
    discipline,
  };
  const scored = Object.values(pillars).filter((value): value is number => value !== null);
  const priceQuality = input.holdings.map((holding) => ({
    ticker: holding.ticker,
    source: holding.priceSource,
    as_of: holding.priceAsOf,
    age_days: round(holding.priceAgeDays),
    stale: holding.priceStale,
  }));

  return {
    meta: {
      portfolio_id: input.accountId.slice(0, 8),
      date: input.asOf,
      mode: 'full_changed',
      period_number: 1,
      data_quality: {
        complete_risk_history: allHoldingsSupported,
        aligned_benchmark: hasAlignedBenchmark,
        fundamentals_complete: qualityEligible,
        discipline_evidence_complete: evidence.evaluated,
        valuation_prices: priceQuality,
        cash_components: {
          available: input.cashAvailableVnd.toString(),
          reserved: input.cashReservedVnd.toString(),
          pending: input.cashPendingVnd.toString(),
          total: input.cashVnd.toString(),
        },
      },
    },
    overview: {
      nav: input.navVnd.toString(),
      cash: {
        available: input.cashAvailableVnd.toString(),
        reserved: input.cashReservedVnd.toString(),
        pending: input.cashPendingVnd.toString(),
        total: input.cashVnd.toString(),
      },
      cash_pct: input.navVnd > 0n ? round(Number(input.cashVnd) / Number(input.navVnd)) : null,
      n_positions: input.holdings.length,
      total_return: round(totalReturn),
      total_pnl: pnl.toString(),
      positions: input.holdings.map((holding) => ({
        ticker: holding.ticker,
        sector: holding.sector,
        weight: round(holdingWeights.get(holding.ticker) ?? 0),
        pnl: holding.unrealizedPnlVnd.toString(),
        price_source: holding.priceSource,
        price_as_of: holding.priceAsOf,
        price_age_days: round(holding.priceAgeDays),
        price_stale: holding.priceStale,
      })),
    },
    allocation: Object.entries(sector).map(([name, weight]) => ({
      sector: name,
      weight: round(weight),
    })),
    concentration: {
      top1: round(sortedWeights[0] ?? 0),
      top3: round(sortedWeights.slice(0, 3).reduce((sum, weight) => sum + weight, 0)),
      effective_n: round(effectiveN),
      largest_sector: round(Math.max(...Object.values(sector), 0)),
    },
    performance: {
      portfolio_return: round(portfolioPeriodReturn),
      benchmark_return: round(benchmarkReturn),
      excess_return: round(excess),
      max_drawdown: risk.max_drawdown,
      method: allHoldingsSupported ? 'date_aligned_market_history' : null,
      observations: holdingDates.length,
    },
    risk,
    attribution: input.holdings.map((holding) => ({
      ticker: holding.ticker,
      pnl: holding.unrealizedPnlVnd.toString(),
    })),
    quality,
    behavior: {
      losing_count: losingCount,
      disposition_flag: evidence.dispositionFlag,
      evidence: {
        evaluated: evidence.evaluated,
        closed_winner_quantity: evidence.winnerQuantity,
        closed_loser_quantity: evidence.loserQuantity,
        average_winner_days: evidence.averageWinnerDays,
        average_loser_days: evidence.averageLoserDays,
        closed_quantity: evidence.closedQuantity,
      },
    },
    scores: {
      pillars,
      overall:
        scored.length === 5
          ? Math.round((scored.reduce((sum, value) => sum + value, 0) / 5) * 10) / 10
          : null,
      available_pillars: scored.length,
    },
  };
}

export function safeTradeSide(value: unknown): 'buy' | 'sell' {
  return String(value).toLowerCase() === 'buy' ? 'buy' : 'sell';
}

export function toTrade(row: Record<string, unknown>): PortfolioTrade {
  return {
    symbol: String(row.symbol).toUpperCase(),
    side: safeTradeSide(row.side),
    quantity: Number(row.quantity),
    priceVnd: BigInt(String(row.filled_price_vnd ?? row.limit_price_vnd ?? 0)),
    tradedAt: new Date(String(row.created_at)),
  };
}

export function toHolding(row: Record<string, unknown>): PortfolioHolding {
  const quantity = Number(row.quantity_total);
  const avg = BigInt(String(row.avg_cost_vnd ?? 0));
  const price = BigInt(String(row.current_price_vnd));
  const cost = avg * BigInt(quantity);
  const market = price * BigInt(quantity);
  return {
    ticker: String(row.symbol).toUpperCase(),
    quantity,
    avgCostVnd: avg,
    currentPriceVnd: price,
    marketValueVnd: market,
    unrealizedPnlVnd: market - cost,
    costBasisVnd: cost,
    sector: String(row.sector ?? 'Khác'),
    priceHistory: Array.isArray(row.__history) ? (row.__history as PortfolioPricePoint[]) : [],
    priceSource: row.__price_source === 'symbol_snapshot' ? 'symbol_snapshot' : 'daily_close',
    priceAsOf: String(row.__price_as_of),
    priceAgeDays:
      typeof row.__price_age_days === 'number' && Number.isFinite(row.__price_age_days)
        ? Math.max(0, row.__price_age_days)
        : null,
    priceStale: row.__price_stale === true,
    pe: typeof row.__pe === 'number' && Number.isFinite(row.__pe) ? row.__pe : null,
    pb: typeof row.__pb === 'number' && Number.isFinite(row.__pb) ? row.__pb : null,
    roe: typeof row.__roe === 'number' && Number.isFinite(row.__roe) ? row.__roe : null,
    fundamentalsSource:
      typeof row.__fundamentals_source === 'string' ? row.__fundamentals_source : null,
  };
}
