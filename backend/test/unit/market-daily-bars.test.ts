import { describe, expect, it, vi } from 'vitest';

import { DnseMarketProvider, dnseDate, parseDnseColumns } from '../../src/modules/market-data/index.js';
import {
  MarketTransportError,
  type MarketHttpTransport,
} from '../../src/modules/market-data/providers/http.transport.js';
import {
  acceptBar,
  BOT_BAR_WINDOW_DAYS,
  barsUpTo,
  barWindowStart,
  DailyBarsService,
  latestCompletedWeekday,
  sessionFromCoverage,
  toStoredColumns,
  type StoredColumns,
} from '../../src/modules/market-integration/daily-bars.service.js';
import { SymbolAttributesService } from '../../src/modules/market-integration/symbol-attributes.service.js';
import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';

const daysFromEpoch = (days: number): string =>
  new Date(Date.UTC(2023, 0, 1) + days * 86_400_000).toISOString().slice(0, 10);

/** 2025-05-30 (Friday) 16:00 ICT: the session of that day is closed. */
const AFTER_CLOSE = new Date('2025-05-30T09:00:00Z');
/** The same Friday at 14:00 ICT: still trading, the day's bar is not final. */
const MID_SESSION = new Date('2025-05-30T07:00:00Z');

const seconds = (date: string, hourIct = 9): number =>
  Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hourIct - 7,
  ) / 1000;

describe('DNSE chart API parsing', () => {
  it('maps the unix second to the Vietnam trading date', () => {
    expect(dnseDate(seconds('2025-05-30', 9))).toBe('2025-05-30');
    expect(dnseDate(seconds('2025-05-30', 7))).toBe('2025-05-30');
    // 00:00 ICT of the next day is 17:00 UTC of the previous one: still the next trading date.
    expect(dnseDate(Date.UTC(2025, 4, 29, 17, 0, 0) / 1000)).toBe('2025-05-30');
  });

  it('parses the column payload sorted by date and drops a row with a non-finite field', () => {
    const bars = parseDnseColumns({
      t: [seconds('2025-05-29'), seconds('2025-05-28'), seconds('2025-05-30'), 'x'],
      o: [10, 9, 12, 1],
      h: [11, 10, 13, 1],
      l: [9, 8, 11, 1],
      c: [10.5, 9.5, 'abc', 1],
      v: [1000, 900, 1100, 1],
    });
    // 30/05 has a non-numeric close and the last time is not a number: both rows are dropped.
    expect(bars).toEqual([
      { date: '2025-05-28', open: 9, high: 10, low: 8, close: 9.5, volume: 900 },
      { date: '2025-05-29', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
    ]);
  });

  it('keeps the last row of a duplicated trading date', () => {
    const bars = parseDnseColumns({
      t: [seconds('2025-05-30', 9), seconds('2025-05-30', 7)],
      o: [12, 12.5],
      h: [13, 13],
      l: [11, 12],
      c: [12.4, 12.8],
      v: [1100, 1200],
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ date: '2025-05-30', open: 12.5, close: 12.8, volume: 1200 });
  });

  it('is empty for anything that is not a column object', () => {
    for (const raw of [null, undefined, [], 'x', 5, { t: 'nope' }, {}]) expect(parseDnseColumns(raw)).toEqual([]);
  });

  it('asks the stock or index endpoint with from, to, symbol and resolution=1D', async () => {
    const requestJson = vi.fn(async () => ({
      t: [seconds('2025-05-30')],
      o: [1],
      h: [2],
      l: [1],
      c: [2],
      v: [10],
    }));
    const provider = new DnseMarketProvider({ requestJson } as unknown as MarketHttpTransport);
    const stock = await provider.fetchDailyBars('FPT', 1_700_000_000.9, 1_700_086_400, 'stock');
    expect(stock.bars).toHaveLength(1);
    const url = new URL((requestJson.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe('https://services.entrade.com.vn/chart-api/v2/ohlcs/stock');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: '1700000000',
      to: '1700086400',
      symbol: 'FPT',
      resolution: '1D',
    });
    await provider.fetchDailyBars('VNINDEX', 1, 2, 'index');
    expect((requestJson.mock.calls[1] as unknown as [string])[0]).toContain('/ohlcs/index?');
  });

  it('turns a DNSE error body into a transport error instead of an empty series', async () => {
    const requestJson = vi.fn(async () => ({ status: 400, message: 'bad symbol' }));
    const provider = new DnseMarketProvider({ requestJson } as unknown as MarketHttpTransport);
    await expect(provider.fetchDailyBars('???', 1, 2)).rejects.toBeInstanceOf(MarketTransportError);
  });
});

describe('daily bar store helpers', () => {
  const bar = (patch: Partial<Parameters<typeof acceptBar>[0]> = {}) => ({
    date: '2025-05-29',
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: 1000,
    ...patch,
  });

  it('acceptBar never repairs a bar: positive prices, volume >= 0, consistent high/low', () => {
    expect(acceptBar(bar())).toBe(true);
    expect(acceptBar(bar({ volume: 0 }))).toBe(true);
    for (const patch of [
      { open: 0 },
      { close: -1 },
      { volume: -5 },
      { high: 10 },
      { low: 10.4 },
      { close: 12 },
    ])
      expect(acceptBar(bar(patch)), JSON.stringify(patch)).toBe(false);
  });

  it('toStoredColumns creates no Intl.DateTimeFormat per bar (native memory, OOM of 2026-11-05)', () => {
    const constructed = vi.spyOn(Intl, 'DateTimeFormat');
    const bars = Array.from({ length: 600 }, (_, index) => ({
      date: daysFromEpoch(index),
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: 100,
    }));
    try {
      expect(toStoredColumns(bars, MID_SESSION).d).toHaveLength(520);
      expect(constructed).not.toHaveBeenCalled();
    } finally {
      constructed.mockRestore();
    }
  });

  it('toStoredColumns keeps closed sessions only, drops invalid bars, caps at the newest N', () => {
    const bars = [
      bar({ date: '2025-05-27' }),
      bar({ date: '2025-05-28', close: 99 }),
      bar({ date: '2025-05-29' }),
      bar({ date: '2025-05-30' }),
    ];
    const during = toStoredColumns(bars, MID_SESSION);
    expect(during.d).toEqual(['2025-05-27', '2025-05-29']);
    const after = toStoredColumns(bars, AFTER_CLOSE);
    expect(after.d).toEqual(['2025-05-27', '2025-05-29', '2025-05-30']);
    expect(after.c).toEqual([10.5, 10.5, 10.5]);
    expect(toStoredColumns(bars, AFTER_CLOSE, 2).d).toEqual(['2025-05-29', '2025-05-30']);
  });

  it('barsUpTo cuts at the session (no later bar is ever visible) and starts at the Bot window', () => {
    const dates = ['2020-01-02', '2024-06-03', '2025-05-28', '2025-05-29', '2025-05-30', '2025-06-02'];
    const columns: StoredColumns = {
      d: dates,
      o: dates.map((_, i) => 10 + i),
      h: dates.map((_, i) => 11 + i),
      l: dates.map((_, i) => 9 + i),
      c: dates.map((_, i) => 10 + i),
      v: dates.map((_, i) => 100 + i),
    };
    const session = barsUpTo(columns, '2025-05-29');
    // 2020-01-02 is older than the Bot window (670 calendar days); the later bars are after the session.
    expect(session.dates).toEqual(['2024-06-03', '2025-05-28', '2025-05-29']);
    expect(session.volume).toEqual([101, 102, 103]);
    expect(BOT_BAR_WINDOW_DAYS).toBe(Math.ceil(400 * 1.6) + 30);
    expect(barWindowStart('2025-05-29')).toBe(
      new Date(Date.UTC(2025, 4, 29) - BOT_BAR_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
    );
    const wide = barsUpTo(columns, '2025-06-02', false);
    expect(wide.dates).toHaveLength(6);
    expect(barsUpTo(columns, '2019-01-01').dates).toEqual([]);
  });

  it('latestCompletedWeekday: today after 15:15 ICT, else the previous weekday, never a weekend', () => {
    expect(latestCompletedWeekday(AFTER_CLOSE)).toBe('2025-05-30');
    expect(latestCompletedWeekday(MID_SESSION)).toBe('2025-05-29');
    // Saturday 10:00 ICT and Monday 08:00 ICT both resolve to Friday.
    expect(latestCompletedWeekday(new Date('2025-05-31T03:00:00Z'))).toBe('2025-05-30');
    expect(latestCompletedWeekday(new Date('2025-06-01T03:00:00Z'))).toBe('2025-05-30');
    expect(latestCompletedWeekday(new Date('2025-06-02T01:00:00Z'))).toBe('2025-05-30');
  });

  it('sessionFromCoverage: the newest closed date that at least 85% of the stored symbols is up to date for', () => {
    const now = AFTER_CLOSE;
    // 90 of 100 up to date for the 30th: T is the 30th.
    expect(
      sessionFromCoverage(
        [
          { date: '2025-05-30', covered: 90, total: 100 },
          { date: '2025-05-29', covered: 100, total: 100 },
        ],
        now,
      ),
    ).toEqual({ session: '2025-05-30', coverage: 90, total: 100 });
    // A half-finished refresh (60% on the 30th) never exposes the 30th.
    expect(
      sessionFromCoverage(
        [
          { date: '2025-05-30', covered: 60, total: 100 },
          { date: '2025-05-29', covered: 95, total: 100 },
        ],
        now,
      ),
    ).toEqual({ session: '2025-05-29', coverage: 95, total: 100 });
    // A date that is not yet closed is skipped even if everyone "has" it; the next closed one is used.
    expect(
      sessionFromCoverage(
        [
          { date: '2025-05-30', covered: 100, total: 100 },
          { date: '2025-05-29', covered: 100, total: 100 },
        ],
        MID_SESSION,
      ),
    ).toEqual({ session: '2025-05-29', coverage: 100, total: 100 });
    // Nothing closed at all: no session.
    expect(sessionFromCoverage([{ date: '2025-05-30', covered: 10, total: 10 }], MID_SESSION)).toBeNull();
    expect(sessionFromCoverage([], now)).toBeNull();
  });
});

type Call = { sql: string; params: unknown[] };

function fakeDatabase(handler: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const calls: Call[] = [];
  const database = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return handler(sql, params);
    }),
  };
  return { database, calls };
}

const dnseBars = (dates: string[]) =>
  dates.map((date, index) => ({
    date,
    open: 10 + index,
    high: 12 + index,
    low: 9 + index,
    close: 11 + index,
    volume: 1_000 * (index + 1),
  }));

describe('DailyBarsService', () => {
  it('refreshSymbol stores the adjusted series as columns with its first/last date', async () => {
    const { database, calls } = fakeDatabase();
    const dnse = {
      fetchDailyBars: vi.fn(async () => ({ bars: dnseBars(['2025-05-28', '2025-05-29', '2025-05-30']), rawEndpoint: 'x' })),
    };
    const service = new DailyBarsService(database as never, dnse as never);
    await expect(service.refreshSymbol('FPT', AFTER_CLOSE)).resolves.toBe('stored');
    const insert = calls.find((call) => call.sql.includes('insert into market_daily_bars'))!;
    expect(insert.params[0]).toBe('FPT');
    expect(JSON.parse(insert.params[1] as string)).toMatchObject({ d: ['2025-05-28', '2025-05-29', '2025-05-30'], c: [11, 12, 13] });
    expect(insert.params.slice(2, 6)).toEqual([3, '2025-05-28', '2025-05-30', 'DNSE']);
    expect(insert.sql).toContain("'thousand_vnd', true");
    // The request covers about 820 days up to now.
    const [, from, to, kind] = dnse.fetchDailyBars.mock.calls[0] as unknown as [string, number, number, string];
    expect(kind).toBe('stock');
    expect(to - from).toBe(820 * 86_400);
  });

  it('refreshSymbol stores nothing for a symbol whose bars are all invalid or still open', async () => {
    const { database, calls } = fakeDatabase();
    const dnse = {
      fetchDailyBars: vi.fn(async () => ({ bars: [{ ...dnseBars(['2025-05-30'])[0]!, volume: -1 }], rawEndpoint: 'x' })),
    };
    const service = new DailyBarsService(database as never, dnse as never);
    await expect(service.refreshSymbol('XXX', AFTER_CLOSE)).resolves.toBe('no_data');
    expect(calls.some((call) => call.sql.includes('insert into market_daily_bars'))).toBe(false);
  });

  it('refreshSymbols isolates a failing symbol and reports it', async () => {
    const { database } = fakeDatabase();
    const dnse = {
      fetchDailyBars: vi.fn(async (symbol: string) => {
        if (symbol === 'BAD') throw new Error('timeout');
        if (symbol === 'NIL') return { bars: [], rawEndpoint: 'x' };
        return { bars: dnseBars(['2025-05-30']), rawEndpoint: 'x' };
      }),
    };
    const service = new DailyBarsService(database as never, dnse as never);
    const summary = await service.refreshSymbols(['AAA', 'BAD', 'NIL', 'BBB'], AFTER_CLOSE, 2);
    expect(summary).toMatchObject({ requested: 4, stored: 2, no_data: 1, failed: 1 });
    expect(summary.errors).toEqual(['BAD: timeout']);
  });

  it('resolveSession counts a symbol fetched after the close as up to date (illiquid symbols do not hold T back)', async () => {
    const { database, calls } = fakeDatabase((sql) =>
      sql.includes('group by last_date')
        ? [
            { last_date: new Date('2025-05-30T00:00:00Z'), n: '95', total: '100' },
            { last_date: '2025-05-29', n: 100, total: 100 },
          ]
        : [],
    );
    const service = new DailyBarsService(database as never, {} as never);
    await expect(service.resolveSession(AFTER_CLOSE)).resolves.toEqual({ session: '2025-05-30', coverage: 95, total: 100 });
    const sql = calls[0]!.sql;
    expect(sql).toContain("fetched_at >= ((last_date + time '15:15') at time zone 'Asia/Ho_Chi_Minh')");
    expect(calls[0]!.params).toEqual([['HOSE', 'HNX', 'UPCOM']]);
  });

  describe('ensureFresh', () => {
    const counts = (date: string, n = 100) => (sql: string) =>
      sql.includes('group by last_date')
        ? [{ last_date: date, n, total: n }]
        : sql.includes('left join market_daily_bars')
          ? []
          : [];

    it('is a cheap no-op while the store already has the newest closed session and nothing is stale', async () => {
      const { database } = fakeDatabase(counts('2025-05-30'));
      const dnse = { fetchDailyBars: vi.fn() };
      const service = new DailyBarsService(database as never, dnse as never);
      await expect(service.ensureFresh(AFTER_CLOSE)).resolves.toEqual({ status: 'up_to_date', session: '2025-05-30' });
      expect(dnse.fetchDailyBars).not.toHaveBeenCalled();
    });

    it('skips while the benchmark is unavailable and while it has no session newer than the store', async () => {
      const { database } = fakeDatabase(counts('2025-05-29'));
      const down = { fetchDailyBars: vi.fn(async () => Promise.reject(new Error('503'))) };
      await expect(new DailyBarsService(database as never, down as never).ensureFresh(AFTER_CLOSE)).resolves.toEqual({
        status: 'skipped',
        reason: 'benchmark_unavailable',
        session: '2025-05-29',
      });
      const same = { fetchDailyBars: vi.fn(async () => ({ bars: dnseBars(['2025-05-29']), rawEndpoint: 'x' })) };
      await expect(new DailyBarsService(database as never, same as never).ensureFresh(AFTER_CLOSE)).resolves.toEqual({
        status: 'skipped',
        reason: 'no_new_session',
        session: '2025-05-29',
      });
    });

    it('bootstraps an empty store from the benchmark session, refreshes stale symbols once and retries a failed one after ten minutes', async () => {
      const stale = ['AAA', 'BBB', 'CCC'];
      const { database } = fakeDatabase((sql) => {
        if (sql.includes('group by last_date')) return [];
        if (sql.includes('left join market_daily_bars')) return stale.map((symbol) => ({ symbol }));
        return [];
      });
      const dnse = {
        fetchDailyBars: vi.fn(async (symbol: string, _from: number, _to: number, kind: string) =>
          kind === 'index'
            ? { bars: dnseBars(['2025-05-29', '2025-05-30']), rawEndpoint: 'x' }
            : symbol === 'CCC'
              ? Promise.reject(new Error('503'))
              : { bars: dnseBars(['2025-05-30']), rawEndpoint: 'x' },
        ),
      };
      const service = new DailyBarsService(database as never, dnse as never);
      const first = await service.ensureFresh(AFTER_CLOSE);
      expect(first).toMatchObject({ status: 'refreshed', session: '2025-05-30', summary: { requested: 3, stored: 2, failed: 1 } });
      // Within ten minutes the failed straggler is not asked again (no hammering of a failing symbol).
      const calls = dnse.fetchDailyBars.mock.calls.length;
      const second = await service.ensureFresh(new Date(AFTER_CLOSE.getTime() + 5 * 60_000));
      expect(second.status).toBe('up_to_date');
      expect(dnse.fetchDailyBars.mock.calls.length).toBe(calls + 1); // only the benchmark probe
      // After ten minutes only the failed symbol is asked again; the stored ones wait for the hour.
      const third = await service.ensureFresh(new Date(AFTER_CLOSE.getTime() + 11 * 60_000));
      expect(third).toMatchObject({ status: 'refreshed', summary: { requested: 1, failed: 1 } });
    });

    it('counts a symbol DNSE does not list (HTTP 400 "invalid symbol") as no data, not a failure', async () => {
      const { database } = fakeDatabase(() => []);
      const dnse = {
        fetchDailyBars: vi.fn(async () =>
          Promise.reject(new MarketTransportError('DNSE rejected ABA: invalid symbol', 400)),
        ),
      };
      const service = new DailyBarsService(database as never, dnse as never);
      await expect(service.refreshSymbols(['ABA'], AFTER_CLOSE)).resolves.toMatchObject({ no_data: 1, failed: 0 });
    });
  });
});

describe('SymbolAttributesService', () => {
  const income = (rows: Record<string, unknown>[]) => ({ data: { years: [], quarters: rows }, rawEndpoint: 'x' });
  const vci = (options: { bank?: string[]; failing?: string[]; shares?: Record<string, number> }) => ({
    fetchFinancialRaw: vi.fn(async (symbol: string) => {
      if (options.failing?.includes(symbol)) throw new Error('upstream 503');
      return income(options.bank?.includes(symbol) ? [{ isb25: 5, isb27: 3 }] : [{ isa3: 100 }]);
    }),
    fetchFinancialReport: vi.fn(async (symbol: string) => ({
      data: options.shares?.[symbol] ? [{ number_of_shares_mkt_cap: options.shares[symbol] }] : [],
      rawEndpoint: 'x',
    })),
  });

  it('stores the statement template and the share count of the due symbols, isolating failures', async () => {
    const due = [
      { symbol: 'AAA', template_due: true, shares_due: true },
      { symbol: 'BANK', template_due: true, shares_due: true },
      { symbol: 'ERR', template_due: true, shares_due: true },
      { symbol: 'NOSHARE', template_due: false, shares_due: true },
    ];
    const { database, calls } = fakeDatabase((sql) => (sql.includes('from symbols') ? due : []));
    const service = new SymbolAttributesService(
      database as never,
      vci({ bank: ['BANK'], failing: ['ERR'], shares: { AAA: 1_000_000.4, BANK: 2_000_000 } }) as never,
    );
    const outcome = await service.ensureFresh(AFTER_CLOSE);
    expect(outcome).toMatchObject({ due: 4, processed: 3, failed: 1, template_updated: 2, shares_updated: 2 });
    expect(outcome.errors).toEqual(['ERR: upstream 503']);
    const updates = calls.filter((call) => call.sql.includes('update symbols'));
    const template = updates.filter((call) => call.sql.includes('statement_template')).map((call) => call.params.slice(0, 2));
    expect(template).toEqual(expect.arrayContaining([['AAA', 'thuong'], ['BANK', 'nh']]));
    const shares = updates.filter((call) => call.sql.includes('shares_outstanding')).map((call) => call.params.slice(0, 2));
    expect(shares).toEqual(expect.arrayContaining([['AAA', 1_000_000], ['BANK', 2_000_000]]));
    // A symbol with no share count in the source is left alone (null stays null, never 0).
    expect(shares.some(([symbol]) => symbol === 'NOSHARE')).toBe(false);
  });

  it('does nothing when no symbol is due, and a concurrent call returns at once', async () => {
    const { database } = fakeDatabase();
    const service = new SymbolAttributesService(database as never, vci({}) as never);
    await expect(service.ensureFresh(AFTER_CLOSE)).resolves.toMatchObject({ due: 0, processed: 0 });
  });
});

describe('screener job handlers', () => {
  const jobs = (extra: { dailyBars?: unknown; symbolAttributes?: unknown; indexMembership?: unknown; bot?: unknown }) =>
    new DomainRuntimeJobs(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      (extra.bot ?? {}) as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined, // flashbackDataset
      extra.dailyBars as never,
      extra.symbolAttributes as never,
      extra.indexMembership as never,
    ).handlers();
  const context = (name: string) => ({ jobId: name, name, scheduledFor: AFTER_CLOSE }) as never;

  it('market.daily-bars: skipped reasons are passed through, a refresh is a completed job even with failed symbols', async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValueOnce({ status: 'skipped', reason: 'no_new_session', session: '2025-05-30' })
      .mockResolvedValueOnce({
        status: 'refreshed',
        session: '2025-05-30',
        summary: { requested: 3, stored: 2, no_data: 0, failed: 1, elapsed_ms: 5, errors: ['X: boom'] },
      });
    const handler = jobs({ dailyBars: { ensureFresh } })['market.daily-bars']!;
    await expect(handler(context('market.daily-bars'))).resolves.toMatchObject({ status: 'skipped', reason: 'no_new_session' });
    await expect(handler(context('market.daily-bars'))).resolves.toMatchObject({ status: 'completed' });
    expect(ensureFresh).toHaveBeenCalledWith(AFTER_CLOSE);
    await expect(jobs({})['market.daily-bars']!(context('market.daily-bars'))).resolves.toEqual({
      status: 'skipped',
      reason: 'daily-bars-unavailable',
    });
  });

  it('market.symbol-attributes: nothing due is a skip, work done is a completed job', async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValueOnce({ due: 0, processed: 0 })
      .mockResolvedValueOnce({ due: 5, processed: 5, failed: 0 });
    const handler = jobs({ symbolAttributes: { ensureFresh } })['market.symbol-attributes']!;
    await expect(handler(context('market.symbol-attributes'))).resolves.toEqual({ status: 'skipped', reason: 'nothing-due' });
    await expect(handler(context('market.symbol-attributes'))).resolves.toMatchObject({ status: 'completed' });
  });

  it('market.index-membership stores the Bot VN30 first, then the screener baskets best-effort', async () => {
    const capture = vi.fn(async (code: string) => ({ status: code === 'HNX30' ? 'unavailable' : 'stored', index_code: code }));
    const captureVn30Membership = vi.fn(async () => ({ status: 'stored', index_code: 'VN30', count: 30 }));
    const handler = jobs({ bot: { captureVn30Membership }, indexMembership: { capture } })['market.index-membership']!;
    const outcome = await handler(context('market.index-membership'));
    expect(outcome.status).toBe('completed');
    expect(capture.mock.calls.map((call) => call[0])).toEqual(['VN100', 'VNMIDCAP', 'VNSMALLCAP', 'HNX30']);
    expect(JSON.stringify(outcome)).toContain('"HNX30":"unavailable"');
    // A failing VN30 stays a failed job (the Bot depends on it) and no basket is fetched.
    capture.mockClear();
    captureVn30Membership.mockResolvedValueOnce({ status: 'unavailable', reason: 'feed down' } as never);
    await expect(handler(context('market.index-membership'))).rejects.toThrow('feed down');
    expect(capture).not.toHaveBeenCalled();
  });
});
