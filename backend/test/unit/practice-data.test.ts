import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  PracticeDataError,
  PracticeDataService,
  buildCalendar,
  sessionOf,
} from '../../src/modules/practice/practice.data.js';
import type { FrozenBarRow } from '../../src/modules/practice/practice.repository.js';
import { loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import { MemoryPracticeStore, walkRows } from './practice-fixtures.js';

const set = loadPracticeSet();

// Failure paths log on purpose; keep the test output clean.
beforeAll(() => Logger.overrideLogger(false));

type Fetch = { symbol: string; start: string; end: string; options: unknown };

/** Stand-in for the quant market-data adapter: same contract, deterministic rows. */
function market(
  rows: readonly FrozenBarRow[],
  options: { adjusted?: boolean; scale?: number; fail?: boolean } = {},
) {
  const fetches: Fetch[] = [];
  return {
    fetches,
    async getHistoricalOhlcv(symbol: string, start: string, end: string, opts?: unknown) {
      fetches.push({ symbol, start, end, options: opts });
      await Promise.resolve();
      if (options.fail) throw new Error('upstream exploded for ACB at 2024-03-04');
      const scale = options.scale ?? 1;
      const records = rows
        .filter((row) => row[0] <= end)
        .map(([time, open, high, low, close, volume]) => ({
          time,
          open: open / scale,
          high: high / scale,
          low: low / scale,
          close: close / scale,
          volume,
        }));
      const startIndex = records.findIndex((record) => record.time >= start);
      return {
        records,
        startIndex: startIndex < 0 ? records.length : startIndex,
        skippedRows: 0,
        source: 'TEST',
        sourcePriority: 1,
        adjusted: options.adjusted ?? false,
      };
    },
  };
}

const service = (store: MemoryPracticeStore, feed: ReturnType<typeof market>) =>
  new PracticeDataService(store, set, feed);

describe('practice frozen data', () => {
  it('freezes the bars once with a data_version and enough warmup before the observation', async () => {
    const store = new MemoryPracticeStore();
    const feed = market(walkRows('ACB'));
    const loaded = await service(store, feed).load('ACB');

    expect(store.symbolRows).toHaveLength(1);
    const row = store.symbolRows[0]!;
    expect(row).toMatchObject({ set_version: set.set_version, symbol: 'ACB', source: 'TEST' });
    expect(row.data_version).toMatch(/^[a-f0-9]{64}$/);
    expect(row.data_version).toBe(loaded.data_version);
    // warmup is requested for the longest form (252 / 250 sessions) with margin
    expect(feed.fetches[0]).toMatchObject({
      symbol: 'ACB',
      start: set.observation.from,
      end: set.test.to,
      options: { warmupSessions: set.warmup.sessions_requested },
    });
    expect(row.warmup_bars).toBe(set.warmup.sessions_requested);
    expect(row.warmup_bars).toBeGreaterThanOrEqual(253);
    expect(row.bars).toHaveLength(row.warmup_bars + row.observation_bars + row.test_bars);
    expect(loaded.notes).toEqual(['prices_not_adjusted']);

    // the observation window is ~6 months; the 24-month test window starts right after it
    const { calendar } = loaded;
    expect(calendar.bars[calendar.observationStart]!.date >= set.observation.from).toBe(true);
    expect(calendar.bars[calendar.observationStart - 1]!.date < set.observation.from).toBe(true);
    expect(calendar.bars[calendar.firstTest - 1]!.date <= set.observation.to).toBe(true);
    expect(calendar.bars[calendar.firstTest]!.date >= set.test.from).toBe(true);
    expect(calendar.bars[calendar.lastTest]!.date <= set.test.to).toBe(true);
    // Phiên 1 = first test session, Phiên 0 = last observation session, negatives before it
    expect(sessionOf(calendar, calendar.firstTest)).toBe(1);
    expect(sessionOf(calendar, calendar.firstTest - 1)).toBe(0);
    expect(sessionOf(calendar, calendar.observationStart)).toBe(-(row.observation_bars - 1));
    expect(sessionOf(calendar, calendar.lastTest)).toBe(row.test_bars);
  });

  it('uses only sessions present in the source: no synthetic bars for gaps', async () => {
    const rows = walkRows('BID');
    const holes = new Set(['2024-09-02', '2025-01-29', '2025-01-30', '2025-04-30']);
    const withHoles = rows.filter((row) => !holes.has(row[0]));
    expect(withHoles.length).toBe(rows.length - holes.size);
    const store = new MemoryPracticeStore();
    const { calendar } = await service(store, market(withHoles)).load('BID');
    const dates = new Set(calendar.bars.map((bar) => bar.date));
    for (const hole of holes) expect(dates.has(hole)).toBe(false);
    const sourceDates = new Set(withHoles.map((row) => row[0]));
    expect(calendar.bars.every((bar) => sourceDates.has(bar.date))).toBe(true);
    // the 24 months are a calendar range, not a fixed 504 sessions
    expect(calendar.lastTest - calendar.firstTest + 1).toBe(
      withHoles.filter((row) => row[0] >= set.test.from && row[0] <= set.test.to).length,
    );
  });

  it('never keeps a bar after the end of the test window', async () => {
    const rows = walkRows('CTG', '2021-09-01', '2026-09-30');
    const store = new MemoryPracticeStore();
    const { calendar } = await service(store, market(rows)).load('CTG');
    expect(calendar.bars.at(-1)!.date <= set.test.to).toBe(true);
    expect(store.symbolRows[0]!.bars.every((row) => row[0] <= set.test.to)).toBe(true);
  });

  it('fetches once for concurrent loads and serves later loads from the frozen row', async () => {
    const store = new MemoryPracticeStore();
    const feed = market(walkRows('FPT'));
    const first = service(store, feed);
    const [a, b] = await Promise.all([first.load('FPT'), first.load('FPT')]);
    expect(a.data_version).toBe(b.data_version);
    expect(feed.fetches).toHaveLength(1);
    const fresh = service(store, feed);
    expect((await fresh.load('FPT')).data_version).toBe(a.data_version);
    expect(feed.fetches).toHaveLength(1);
    expect(store.symbolRows).toHaveLength(1);
  });

  it('reports a feed failure without symbol or date and stores nothing', async () => {
    const store = new MemoryPracticeStore();
    const failing = service(store, market(walkRows('GAS'), { fail: true }));
    const error = await failing.load('GAS').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PracticeDataError);
    expect((error as PracticeDataError).code).toBe('DATA_UNAVAILABLE');
    expect((error as PracticeDataError).message).not.toMatch(/GAS|ACB|\d{4}-\d{2}-\d{2}/);
    expect(store.symbolRows).toHaveLength(0);
    // the failure is not cached: the next attempt freezes normally
    const ok = service(store, market(walkRows('GAS')));
    expect((await ok.load('GAS')).data_version).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses data that is too thin and stores nothing', async () => {
    const store = new MemoryPracticeStore();
    const short = walkRows('GVR', '2021-09-01', '2025-01-31');
    const error = await service(store, market(short))
      .load('GVR')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PracticeDataError);
    expect((error as PracticeDataError).code).toBe('DATA_INSUFFICIENT');
    expect(store.symbolRows).toHaveLength(0);
    expect(() => buildCalendar([], set)).toThrow(PracticeDataError);
  });

  it('normalises thousand-VND quotes and flags short warmup and adjusted state', async () => {
    const store = new MemoryPracticeStore();
    const rows = walkRows('HDB', '2023-09-01', '2026-06-30');
    const loaded = await service(store, market(rows, { scale: 1000, adjusted: true })).load('HDB');
    const row = store.symbolRows[0]!;
    expect(row.price_scale).toBe(1000);
    expect(row.adjusted).toBe(true);
    expect(loaded.notes).toEqual(['warmup_short']);
    expect(row.warmup_bars).toBeLessThan(set.warmup.sessions_required);
    const source = rows.find((r) => r[0] === row.bars[10]![0])!;
    expect(row.bars[10]!.slice(1, 5)).toEqual(source.slice(1, 5));
    expect(
      row.bars.every((bar) =>
        (bar.slice(1, 5) as number[]).every((v) => Number.isInteger(v) && v >= 1000),
      ),
    ).toBe(true);
  });

  it('changes the data_version when the data changes', async () => {
    const a = new MemoryPracticeStore();
    const b = new MemoryPracticeStore();
    const rows = walkRows('HPG');
    const tweaked = rows.map((row, i) =>
      i === 300 ? ([...row.slice(0, 5), row[5] + 1] as FrozenBarRow) : row,
    );
    const first = await service(a, market(rows)).load('HPG');
    const second = await service(b, market(tweaked)).load('HPG');
    expect(first.data_version).not.toBe(second.data_version);
  });
});
