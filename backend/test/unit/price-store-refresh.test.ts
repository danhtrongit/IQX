/**
 * Daily price store (PLAN-bot-strategy D2–D4): vendor normalisation (VND, R16), refresh plan
 * (append / replace on adjustment / never delete), idempotency, VNINDEX written last, eligibility.
 * The repository is an in-memory fake with the same contract as the PostgreSQL one.
 */

import { describe, expect, it } from 'vitest';

import {
  eligibleMembers,
  finalBeforeDate,
  normalizeIndexRows,
  normalizeStockRows,
  planRefresh,
  PriceStoreService,
  PriceUnitError,
  seriesHash,
  type PriceStoreRepository,
  type PriceStoreSourcePort,
  type StoreBar,
  type StoreSymbolRow,
} from '../../src/modules/price-store/index.js';
import type { PriceSeriesBundle } from '../../src/modules/strategy-rules/contracts.js';

const VN = 7 * 3_600_000;
/** Vendor timestamp (seconds) of a Vietnam trading date (DNSE sends 00:00 ICT). */
const ts = (date: string) => (Date.parse(`${date}T00:00:00Z`) - VN) / 1000;

function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

const vendorRow = (date: string, close: number, volume = 1_000) => ({
  time: ts(date),
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume,
});

class MemoryRepository implements PriceStoreRepository {
  rows = new Map<string, StoreSymbolRow>();
  barsBy = new Map<string, Map<string, StoreBar>>();
  memberships: Record<string, Array<{ session_date: string; symbols: string[] }>> = {};
  held: string[] = [];
  writes = 0;
  deletes = 0;

  async symbols() {
    return [...this.rows.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
  }
  async symbol(symbol: string) {
    return this.rows.get(symbol) ?? null;
  }
  async bars(symbol: string) {
    return [...(this.barsBy.get(symbol)?.values() ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
  }
  async writeSymbol(write: Parameters<PriceStoreRepository['writeSymbol']>[0]) {
    this.writes += write.upserts.length;
    const bars = this.barsBy.get(write.symbol) ?? new Map<string, StoreBar>();
    for (const bar of write.upserts) bars.set(bar.date, bar);
    this.barsBy.set(write.symbol, bars);
    const dates = [...bars.keys()].sort();
    const previous = this.rows.get(write.symbol);
    const row: StoreSymbolRow = {
      symbol: write.symbol,
      kind: write.kind,
      source: write.source,
      first_date: dates[0] ?? null,
      last_date: dates.at(-1) ?? null,
      bars_count: dates.length,
      series_rev: (previous?.series_rev ?? 1) + (write.bump_rev ? 1 : 0),
      series_hash: write.series_hash,
      refreshed_at: write.refreshed_at,
      last_error: null,
    };
    this.rows.set(write.symbol, row);
    return row;
  }
  async markError(symbol: string, kind: 'stock' | 'index', source: string, error: string) {
    const previous = this.rows.get(symbol);
    this.rows.set(symbol, {
      symbol,
      kind,
      source,
      first_date: previous?.first_date ?? null,
      last_date: previous?.last_date ?? null,
      bars_count: previous?.bars_count ?? 0,
      series_rev: previous?.series_rev ?? 1,
      series_hash: previous?.series_hash ?? null,
      refreshed_at: previous?.refreshed_at ?? null,
      last_error: error,
    });
  }
  async calendar(until?: string) {
    return (await this.bars('VNINDEX'))
      .map((bar) => bar.date)
      .filter((date) => !until || date <= until);
  }
  async latestMembership(code: string) {
    return this.memberships[code]?.at(-1) ?? null;
  }
  async membershipAt(code: string, session: string) {
    return (
      [...(this.memberships[code] ?? [])].reverse().find((row) => row.session_date <= session) ??
      null
    );
  }
  async openPositionSymbols() {
    return this.held;
  }
  async loadSeries(): Promise<PriceSeriesBundle> {
    throw new Error('not used');
  }
}

class FakeSource implements PriceStoreSourcePort {
  stocks = new Map<string, unknown[]>();
  index: unknown[] = [];
  failing = new Set<string>();
  calls: string[] = [];
  async stockHistory(symbol: string) {
    this.calls.push(symbol);
    if (this.failing.has(symbol)) throw new Error(`DNSE lỗi ${symbol}`);
    return this.stocks.get(symbol) ?? [];
  }
  async indexHistory() {
    this.calls.push('VNINDEX');
    return this.index;
  }
}

const DATES = weekdays('2026-10-01', 30);
const LAST = DATES.at(-1)!;
/** 16:00 ICT on the last date: that session is final. */
const NOW = new Date(Date.parse(`${LAST}T16:00:00Z`) - VN);

function world() {
  const repository = new MemoryRepository();
  const source = new FakeSource();
  repository.memberships = {
    VN100: [{ session_date: DATES[0]!, symbols: ['AAA', 'BBB', 'CCC'] }],
    VN30: [{ session_date: DATES[0]!, symbols: ['AAA', 'BBB'] }],
  };
  repository.held = ['OLD'];
  for (const symbol of ['AAA', 'BBB', 'CCC', 'OLD']) {
    source.stocks.set(
      symbol,
      DATES.map((date, i) => vendorRow(date, 20 + i * 0.1)),
    );
  }
  source.index = DATES.map((date, i) => ({ ...vendorRow(date, 1_250.37 + i), volume: 5e8 }));
  return { repository, source, service: new PriceStoreService(repository, source) };
}

describe('price store · normalisation', () => {
  it('R16: DNSE thousand-VND rows become integer VND; invalid bars are dropped, never invented', () => {
    const bars = normalizeStockRows(
      [
        vendorRow('2026-10-01', 118.5, 2_000),
        { ...vendorRow('2026-10-02', 119), close: 0 },
        { ...vendorRow('2026-10-05', 120), high: 100, low: 130 },
        vendorRow('2026-10-06', 121.25),
        vendorRow('2026-10-07', 122),
      ],
      '2026-10-07',
    );
    expect(bars.map((bar) => [bar.date, bar.close])).toEqual([
      ['2026-10-01', 118_500],
      ['2026-10-06', 121_250],
    ]);
    expect(bars[0]!.value_vnd).toBe(118_500 * 2_000);
    expect(() => normalizeStockRows([vendorRow('2026-10-01', 118_500)], '2026-12-01')).toThrow(
      PriceUnitError,
    );
  });

  it('VNINDEX keeps points (2 decimals) and stores × 100 in the price columns', () => {
    const [bar] = normalizeIndexRows([vendorRow('2026-10-01', 1_234.567)], '2026-10-02');
    expect(bar).toMatchObject({ close_idx: 1_234.57, close: 123_457 });
  });

  it('today is final only from 15:15 ICT', () => {
    expect(finalBeforeDate(new Date('2026-11-20T08:14:00Z'))).toBe('2026-11-20');
    expect(finalBeforeDate(new Date('2026-11-20T08:15:00Z'))).toBe('2026-11-21');
  });

  it('refresh plan: append, adjustment replace, stored-only dates kept', () => {
    const bar = (date: string, close: number): StoreBar => ({
      date,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
      value_vnd: close,
      close_idx: null,
    });
    const stored = [bar('2026-01-01', 10), bar('2026-01-02', 11)];
    expect(planRefresh(stored, [...stored, bar('2026-01-05', 12)])).toMatchObject({
      adjusted: false,
      new_dates: 1,
      changed_dates: 0,
    });
    const adjusted = planRefresh(stored, [bar('2026-01-02', 9), bar('2026-01-05', 12)]);
    expect(adjusted).toMatchObject({ adjusted: true, changed_dates: 1, new_dates: 1 });
    expect(adjusted.merged.map((b) => [b.date, b.close])).toEqual([
      ['2026-01-01', 10],
      ['2026-01-02', 9],
      ['2026-01-05', 12],
    ]);
    expect(planRefresh(stored, stored).upserts).toHaveLength(0);
    expect(seriesHash(stored)).toBe(seriesHash([...stored].reverse()));
  });

  it('eligibility = members ∩ stored symbols', () => {
    expect(eligibleMembers(['bbb', 'AAA', 'ZZZ'], new Set(['AAA', 'BBB']))).toEqual(['AAA', 'BBB']);
  });
});

describe('price store · refresh service', () => {
  it('first build: VN100 ∪ VN30 ∪ held symbols + VNINDEX; data_as_of = last final session', async () => {
    const { service, repository, source } = world();
    const result = await service.refresh({ now: NOW });
    expect(result).toMatchObject({
      status: 'refreshed',
      latest_session: LAST,
      data_as_of: LAST,
      set_size: 4,
    });
    expect(source.calls[0]).toBe('VNINDEX');
    // VNINDEX (the calendar / data_as_of) is written after every stock.
    expect(result.outcomes.at(-1)?.symbol).toBe('VNINDEX');
    expect(repository.rows.get('OLD')?.bars_count).toBe(30);
    expect((await repository.bars('AAA'))[0]!.close).toBe(20_000);
    const meta = await service.meta();
    expect(meta).toMatchObject({
      data_store: 'flashback_vn100',
      data_as_of: LAST,
      price_unit: 'VND',
      adjusted: true,
      sessions: 30,
    });
    expect(meta.earliest_start).toBeNull(); // fewer than 451 sessions
    expect(await service.eligibility()).toMatchObject({
      vn30: ['AAA', 'BBB'],
      vn100: ['AAA', 'BBB', 'CCC'],
    });
  });

  it('idempotent: a second run is up to date; a forced run writes nothing and keeps revisions', async () => {
    const { service, repository, source } = world();
    await service.refresh({ now: NOW });
    const writes = repository.writes;
    source.calls = [];
    expect((await service.refresh({ now: NOW })).status).toBe('up_to_date');
    expect(source.calls).toEqual(['VNINDEX']);
    const forced = await service.refresh({ now: NOW, force: true });
    expect(forced.outcomes.every((outcome) => outcome.status === 'unchanged')).toBe(true);
    expect(repository.writes).toBe(writes);
    expect([...repository.rows.values()].every((row) => row.series_rev === 1)).toBe(true);
  });

  it('next session appends; an adjusted history replaces the changed bars and bumps series_rev', async () => {
    const { service, repository, source } = world();
    await service.refresh({ now: NOW });
    const hashBefore = repository.rows.get('AAA')!.series_hash;
    const next = weekdays(LAST, 2)[1]!;
    const later = new Date(Date.parse(`${next}T16:00:00Z`) - VN);
    // AAA: dividend adjustment of the whole history (× 0.9) + new bar; BBB: new bar only.
    source.stocks.set(
      'AAA',
      [...DATES, next].map((date, i) =>
        vendorRow(date, Math.round((20 + i * 0.1) * 0.9 * 100) / 100),
      ),
    );
    source.stocks.set(
      'BBB',
      [...DATES, next].map((date, i) => vendorRow(date, 20 + i * 0.1)),
    );
    source.index = [...DATES, next].map((date, i) => ({
      ...vendorRow(date, 1_250.37 + i),
      volume: 5e8,
    }));
    const result = await service.refresh({ now: later });
    expect(result).toMatchObject({ status: 'refreshed', data_as_of: next, adjusted: ['AAA'] });
    expect(repository.rows.get('AAA')).toMatchObject({
      series_rev: 2,
      bars_count: 31,
      last_date: next,
    });
    expect(repository.rows.get('AAA')!.series_hash).not.toBe(hashBefore);
    expect(repository.rows.get('BBB')).toMatchObject({ series_rev: 1, bars_count: 31 });
    // CCC / OLD: vendor has no new bar (suspended) → unchanged, kept.
    expect(repository.rows.get('CCC')).toMatchObject({ series_rev: 1, bars_count: 30 });
    expect((await repository.bars('AAA'))[0]!.close).toBe(18_000);
  });

  it('never deletes: a symbol leaving VN100 and a shorter vendor history keep their bars', async () => {
    const { service, repository, source } = world();
    await service.refresh({ now: NOW });
    repository.memberships.VN100!.push({ session_date: LAST, symbols: ['AAA', 'BBB'] });
    repository.held = [];
    source.stocks.set(
      'AAA',
      DATES.slice(10).map((date, i) => vendorRow(date, 20 + (i + 10) * 0.1)),
    );
    await service.refresh({ now: NOW, force: true });
    expect(repository.rows.get('AAA')!.bars_count).toBe(30);
    expect(repository.rows.get('CCC')!.bars_count).toBe(30);
    expect(repository.rows.get('OLD')!.bars_count).toBe(30);
    // CCC left VN100: no longer eligible, data kept.
    expect((await service.eligibility()).vn100).toEqual(['AAA', 'BBB']);
    expect(await service.membersAt('VN100', DATES[5]!)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('too many stock failures: VNINDEX (data_as_of) does not advance; failures are recorded', async () => {
    const { service, repository, source } = world();
    await service.refresh({ now: NOW });
    const next = weekdays(LAST, 2)[1]!;
    source.index = [...DATES, next].map((date, i) => ({
      ...vendorRow(date, 1_250 + i),
      volume: 1,
    }));
    source.failing = new Set(['AAA', 'BBB', 'CCC']);
    const result = await service.refresh({
      now: new Date(Date.parse(`${next}T16:00:00Z`) - VN),
      maxFailures: 2,
    });
    expect(result).toMatchObject({ status: 'partial', data_as_of: LAST, latest_session: next });
    expect(result.failed.map((f) => f.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(repository.rows.get('AAA')!.last_error).toContain('DNSE lỗi AAA');
    expect((await service.calendar()).at(-1)).toBe(LAST);
    // Next run retries the failed ones and advances once they succeed.
    source.failing.clear();
    const retry = await service.refresh({ now: new Date(Date.parse(`${next}T16:10:00Z`) - VN) });
    expect(retry).toMatchObject({ status: 'refreshed', data_as_of: next });
  });

  it('partial refresh that advances VNINDEX: pendingSymbols lists the failed symbols until retried', async () => {
    const { service, source } = world();
    await service.refresh({ now: NOW });
    expect(await service.pendingSymbols(LAST, ['AAA', 'BBB', 'OLD'])).toEqual([]);
    const next = weekdays(LAST, 2)[1]!;
    source.index = [...DATES, next].map((date, i) => ({
      ...vendorRow(date, 1_250 + i),
      volume: 1,
    }));
    for (const symbol of ['AAA', 'BBB', 'CCC', 'OLD']) {
      source.stocks.set(
        symbol,
        [...DATES, next].map((date, i) => vendorRow(date, 20 + i * 0.1)),
      );
    }
    source.failing = new Set(['BBB']);
    const at = new Date(Date.parse(`${next}T16:00:00Z`) - VN);
    const result = await service.refresh({ now: at, maxFailures: 2 });
    expect(result).toMatchObject({ status: 'partial', data_as_of: next });
    expect(await service.pendingSymbols(next, ['AAA', 'BBB', 'ZZZ', 'OLD'])).toEqual([
      'BBB',
      'ZZZ',
    ]);
    expect(await service.pendingSymbols(next, [])).toEqual([]);
    source.failing.clear();
    await service.refresh({ now: new Date(at.getTime() + 600_000) });
    expect(await service.pendingSymbols(next, ['AAA', 'BBB', 'OLD'])).toEqual([]);
  });

  it('VNINDEX failure: nothing is published', async () => {
    const { service, source } = world();
    source.index = [];
    const result = await service.refresh({ now: NOW });
    expect(result).toMatchObject({ status: 'failed', data_as_of: null });
    expect(source.calls).toEqual(['VNINDEX']);
  });
});
