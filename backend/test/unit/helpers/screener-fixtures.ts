import { randomUUID } from 'node:crypto';

import type { AcademyGrantsPort } from '../../../src/modules/academy/academy.ports.js';
import type { VciMarketProvider } from '../../../src/modules/market-data/index.js';
import type {
  NewScreenerRun,
  ScreenerRunStore,
  StoredScreenerRun,
} from '../../../src/modules/screener/screener.repository.js';
import type { DailyBarColumns } from '../../../src/modules/market-integration/daily-bars.service.js';
import type { Bar } from '../../../src/modules/quant/v2/index.js';
import type { ScreenerBasket } from '../../../src/modules/screener/screener.definition.js';
import type { UniverseRecord } from '../../../src/modules/screener/screener.market.js';
import type { ScreenerMarketDataPort } from '../../../src/modules/screener/screener.ports.js';

/** Deterministic PRNG (mulberry32) so synthetic bars are the same on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The `count` weekdays ending at `end` (inclusive), oldest first. Holidays are not modelled. */
export function weekdaysEndingAt(end: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${end}T00:00:00Z`);
  while (dates.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

export type BarSpec = {
  closes: readonly number[];
  volumes?: readonly number[];
};

/** Columns from a close series (and optional volumes): open = previous close, ±1% wicks, 100k shares default. */
export function barsFromCloses(end: string, spec: BarSpec): DailyBarColumns {
  const dates = weekdaysEndingAt(end, spec.closes.length);
  const out: DailyBarColumns = { dates, open: [], high: [], low: [], close: [], volume: [] };
  spec.closes.forEach((close, index) => {
    const open = index === 0 ? close : spec.closes[index - 1]!;
    out.open.push(open);
    out.high.push(Math.max(open, close) * 1.01);
    out.low.push(Math.min(open, close) * 0.99);
    out.close.push(close);
    out.volume.push(spec.volumes?.[index] ?? 100_000);
  });
  return out;
}

/** A seeded random walk with realistic OHLCV (high ≥ max(o,c), low ≤ min(o,c), volume > 0), thousand VND. */
export function randomWalk(seed: number, end: string, count: number): DailyBarColumns {
  const random = seeded(seed);
  const dates = weekdaysEndingAt(end, count);
  const out: DailyBarColumns = { dates, open: [], high: [], low: [], close: [], volume: [] };
  let price = 10 + random() * 90;
  const drift = (random() - 0.5) * 0.002;
  const vol = 0.008 + random() * 0.02;
  const baseVolume = 50_000 + random() * 5_000_000;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const shock = (random() - 0.5) * 2 * vol;
    const close = Math.max(0.5, open * (1 + drift + shock));
    const high = Math.max(open, close) * (1 + random() * 0.012);
    const low = Math.min(open, close) * (1 - random() * 0.012);
    out.open.push(open);
    out.high.push(high);
    out.low.push(low);
    out.close.push(close);
    out.volume.push(Math.round(baseVolume * (0.4 + random() * 1.6)));
    price = close;
  }
  return out;
}

/** The engine's `Bar[]` for a set of columns. */
export function toBars(columns: DailyBarColumns): Bar[] {
  return columns.dates.map((date, i) => ({
    date,
    open: columns.open[i]!,
    high: columns.high[i]!,
    low: columns.low[i]!,
    close: columns.close[i]!,
    volume: columns.volume[i]!,
  }));
}

export const record = (
  symbol: string,
  patch: Partial<UniverseRecord> = {},
): UniverseRecord => ({
  symbol,
  name: `Công ty ${symbol}`,
  exchange: 'HOSE',
  sector: 'Khác',
  group: 'thuong',
  shares: 100_000_000,
  ...patch,
});

/** In-memory `ScreenerMarketDataPort`: the symbols table, the stored bars and the basket snapshots. */
export class FakeMarketData implements ScreenerMarketDataPort {
  readonly priceSource = 'DNSE';
  loadCalls: string[][] = [];
  universeCalls = 0;

  constructor(
    private readonly records: UniverseRecord[],
    private readonly bars: Map<string, DailyBarColumns> = new Map(),
    private readonly session: string | null = '2025-05-30',
    private readonly baskets: Partial<Record<ScreenerBasket, string[] | null>> = {},
  ) {}

  async resolveSession(): Promise<string | null> {
    return this.session;
  }

  async universe(): Promise<UniverseRecord[]> {
    this.universeCalls += 1;
    return this.records;
  }

  /** Like the real store: only closed bars up to `session` (a later bar must never be seen). */
  async loadBars(
    symbols: readonly string[],
    session: string,
  ): Promise<Map<string, DailyBarColumns>> {
    this.loadCalls.push([...symbols]);
    const out = new Map<string, DailyBarColumns>();
    for (const symbol of symbols) {
      const columns = this.bars.get(symbol);
      if (!columns) continue;
      const cut = columns.dates.filter((date) => date <= session).length;
      if (cut === 0) continue;
      out.set(symbol, {
        dates: columns.dates.slice(0, cut),
        open: columns.open.slice(0, cut),
        high: columns.high.slice(0, cut),
        low: columns.low.slice(0, cut),
        close: columns.close.slice(0, cut),
        volume: columns.volume.slice(0, cut),
      });
    }
    return out;
  }

  async basketMembers(
    baskets: readonly ScreenerBasket[],
  ): Promise<Map<ScreenerBasket, Set<string> | null>> {
    return new Map(
      baskets.map((code) => {
        const members = this.baskets[code];
        return [code, members ? new Set(members) : null] as const;
      }),
    );
  }
}


type Row = Record<string, unknown>;

export function grants(capabilities: string[]): AcademyGrantsPort {
  return { grantedCapabilities: async () => new Set(capabilities) };
}

/** In-memory twin of the screener_runs table: owner-scoped reads, immutable rows. */
export class InMemoryRunStore implements ScreenerRunStore {
  readonly rows: Array<NewScreenerRun & { id: string; created_at: Date }> = [];

  async insert(run: NewScreenerRun): Promise<string> {
    const id = randomUUID();
    this.rows.push({ ...structuredClone(run), id, created_at: new Date() });
    return id;
  }

  async find(userId: string, resultId: string): Promise<StoredScreenerRun | null> {
    const row = this.rows.find((item) => item.id === resultId && item.user_id === userId);
    if (!row) return null;
    return {
      header: { result_id: row.id, ...structuredClone(row.header) },
      results: structuredClone(row.results),
      created_at: row.created_at,
    };
  }
}

/** Eight discrete quarters + four fiscal years; revenue grows YoY by revenueNow / revenueBase. */
export function statementRows(revenueNow: number, revenueBase: number) {
  const quarters: Record<'income' | 'cash' | 'balance', Row[]> = {
    income: [],
    cash: [],
    balance: [],
  };
  const years: Record<'income' | 'cash' | 'balance', Row[]> = { income: [], cash: [], balance: [] };
  for (const year of [2023, 2024])
    for (const q of [1, 2, 3, 4]) {
      const meta = {
        year_report: year,
        length_report: q,
        public_date: `${year}-${String(q * 3).padStart(2, '0')}-28T00:00:00`,
        update_date: `${year}-${String(q * 3).padStart(2, '0')}-28T08:00:00`,
      };
      const revenue = (year === 2024 ? revenueNow : revenueBase) / 4;
      quarters.income.push({
        ...meta,
        isa3: revenue,
        isa5: revenue * 0.25,
        isa8: -1,
        isa16: 10,
        isa20: 8,
        isa22: 8,
      });
      quarters.cash.push({ ...meta, cfa2: 1, cfa18: 9, cfa19: -2 });
      quarters.balance.push({
        ...meta,
        bsa1: 300,
        bsa53: 1000,
        bsa55: 200,
        bsa56: 50,
        bsa71: 50,
        bsa78: 400,
        bsa174: 0,
        bsa210: 0,
      });
    }
  for (const year of [2021, 2022, 2023, 2024]) {
    const meta = { year_report: year, length_report: 5, public_date: `${year + 1}-03-01T00:00:00` };
    years.income.push({ ...meta, isa3: 100 * (year - 2019), isa22: 10 });
    years.cash.push({ ...meta, cfa18: 9, cfa19: -2 });
    years.balance.push({ ...meta, bsa78: 400 });
  }
  return {
    BALANCE_SHEET: { years: years.balance, quarters: quarters.balance },
    INCOME_STATEMENT: { years: years.income, quarters: quarters.income },
    CASH_FLOW: { years: years.cash, quarters: quarters.cash },
  };
}

export function fakeVci(options: {
  revenue: Record<string, [number, number]>;
  failing?: string[];
  prices?: Record<string, number>;
  shares?: Record<string, number>;
}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const statementCalls: string[] = [];
  const vci = {
    fetchFinancialRaw: async (
      symbol: string,
      section: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW',
    ) => {
      statementCalls.push(`${symbol}:${section}`);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      if (options.failing?.includes(symbol)) throw new Error('upstream 503');
      const revenue = options.revenue[symbol] ?? [0, 0];
      return { data: statementRows(revenue[0], revenue[1])[section], rawEndpoint: 'fake' };
    },
    fetchPriceBoard: async (symbols: string[]) => ({
      data: symbols
        .filter((symbol) => options.prices?.[symbol] !== undefined)
        .map((symbol) => ({ symbol, close_price: options.prices![symbol], reference_price: null })),
      rawEndpoint: 'fake',
    }),
    fetchFinancialReport: async (symbol: string) => ({
      data: options.shares?.[symbol] ? [{ number_of_shares_mkt_cap: options.shares[symbol] }] : [],
      rawEndpoint: 'fake',
    }),
  } as unknown as VciMarketProvider;
  return { vci, statementCalls, maxInFlight: () => maxInFlight };
}

