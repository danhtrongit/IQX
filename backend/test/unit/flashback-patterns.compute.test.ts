import { describe, expect, it } from 'vitest';

import { cdCard } from '../../src/modules/candle-dojo/shared/cards.js';
import {
  CANDLE_DETECTOR_VERSION,
  pick,
  prep,
  type CdBar,
  type CdRawBar,
} from '../../src/modules/candle-dojo/shared/detector.js';
import {
  computeSymbolPatterns,
  FlashbackPatternsCompute,
  PATTERN_CONTEXT_SESSIONS,
  PATTERN_MAX_GAP_SESSIONS,
  PATTERN_STALE_RUN_MS,
} from '../../src/modules/flashback/flashback-patterns.compute.js';
import type { PatternRawRow } from '../../src/modules/flashback/flashback-patterns.repository.js';
import { contextBars, simulateMarket } from './candle-dojo-test-kit.js';
import { FakeDatasetSource, MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';
import {
  datasetBarsOf,
  rawPricesOf,
  seriesOf,
  sessionDates,
} from './helpers/flashback-patterns-fixtures.js';
import { MemoryPatternsRepository } from './helpers/flashback-patterns-memory.js';

const NOW = new Date('2026-11-04T03:00:00.000Z');
const VN_CARDS = ['tran_trang', 'san_trang', 'keo_tran', 'dap_san'];

/** Giá gốc theo idx, bằng giá đã điều chỉnh, tham chiếu = đóng cửa phiên trước. */
function rawByIdx(bars: readonly CdBar[], skip: ReadonlySet<number> = new Set()): Map<number, PatternRawRow> {
  const out = new Map<number, PatternRawRow>();
  bars.forEach((bar, idx) => {
    if (skip.has(idx)) return;
    out.set(idx, {
      idx,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      ref: idx === 0 ? bar.c : bars[idx - 1]!.c,
    });
  });
  return out;
}

const key = (rows: ReadonlyArray<{ idx: number; cardId: string; cardN: number }>) =>
  rows.map((row) => `${row.idx}:${row.cardId}:${row.cardN}`);

describe('computeSymbolPatterns · đúng với bộ nhận diện (v1.3 §3.2, nghiệm thu 2)', () => {
  const bars = simulateMarket(7, 3_000);
  const series = seriesOf(bars);
  const full = computeSymbolPatterns(series, rawByIdx(bars), 'HOSE');

  it('mỗi phiên có đúng kết quả pick(prep(cả chuỗi), i); phiên không có mẫu thì không có dòng', () => {
    const prepared = prep(
      bars,
      bars.map<CdRawBar>((bar, idx) => ({
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        ref: idx === 0 ? bar.c : bars[idx - 1]!.c,
        exchange: 'HOSE',
      })),
    );
    const expected: string[] = [];
    for (let i = 0; i < bars.length; i += 1) {
      const match = pick(prepared, i);
      if (match) expected.push(`${i}:${match.id}:${match.n}`);
    }
    expect(key(full.patterns)).toEqual(expected);
    // Dữ liệu sạch nên không bị loại; đủ đa dạng để phép so sánh có nghĩa.
    expect(full.patterns.length).toBeGreaterThan(500);
    expect(new Set(full.patterns.map((row) => row.cardId)).size).toBeGreaterThan(10);
    expect(full.missingRawSessions).toBe(0);
  });

  it('mỗi phiên tối đa một dòng; bậc, ngày, idx và số nến khớp danh mục và ràng buộc của bảng', () => {
    const seen = new Set<number>();
    for (const row of full.patterns) {
      expect(seen.has(row.idx)).toBe(false);
      seen.add(row.idx);
      expect(row.tier).toBe(cdCard(row.cardId)!.tier);
      expect(row.date).toBe(series[row.idx]!.date);
      expect(row.cardN).toBeGreaterThanOrEqual(1);
      expect(row.cardN).toBeLessThanOrEqual(20);
      expect(row.idx).toBeGreaterThanOrEqual(row.cardN - 1);
    }
  });

  it('không nhìn trước: cắt bỏ phần sau phiên k thì kết quả tới phiên k không đổi (nghiệm thu 3)', () => {
    for (let cut = 140; cut < bars.length; cut += 47) {
      const truncated = computeSymbolPatterns(
        series.slice(0, cut + 1),
        rawByIdx(bars.slice(0, cut + 1)),
        'HOSE',
      );
      expect(key(truncated.patterns)).toEqual(key(full.patterns.filter((row) => row.idx <= cut)));
    }
  });

  it('chuỗi phiên không liên tục (idx lệch) là lỗi dữ liệu, không âm thầm tính sai', () => {
    const broken = series.map((bar) => (bar.idx === 10 ? { ...bar, idx: 11 } : bar));
    expect(() => computeSymbolPatterns(broken, rawByIdx(bars), 'HOSE')).toThrow(RangeError);
  });
});

describe('computeSymbolPatterns · loại mẫu chạm dữ liệu xấu (v1.3 §3.2 bước 5)', () => {
  const bars = simulateMarket(11, 1_500);
  const raw = rawByIdx(bars);
  const baseline = computeSymbolPatterns(seriesOf(bars), raw, 'HOSE').patterns;
  const touches = (row: { idx: number; cardN: number }, at: number) =>
    row.idx - row.cardN + 1 - PATTERN_CONTEXT_SESSIONS <= at && at <= row.idx;

  it('nến bad=1: bỏ đúng các mẫu có [i − n + 1 − 25, i] chứa nến đó, giữ phần còn lại', () => {
    const badAt = 700;
    const withBad = computeSymbolPatterns(seriesOf(bars, { [badAt]: { bad: 1 } }), raw, 'HOSE').patterns;
    expect(key(withBad)).toEqual(key(baseline.filter((row) => !touches(row, badAt))));
    expect(baseline.some((row) => touches(row, badAt))).toBe(true);
    expect(withBad.length).toBeLessThan(baseline.length);
  });

  it('gap_before > 5 bị loại, bằng 5 thì giữ', () => {
    const gapAt = 900;
    const over = computeSymbolPatterns(
      seriesOf(bars, { [gapAt]: { gapBefore: PATTERN_MAX_GAP_SESSIONS + 1 } }),
      raw,
      'HOSE',
    ).patterns;
    expect(key(over)).toEqual(key(baseline.filter((row) => !touches(row, gapAt))));
    const edge = computeSymbolPatterns(
      seriesOf(bars, { [gapAt]: { gapBefore: PATTERN_MAX_GAP_SESSIONS } }),
      raw,
      'HOSE',
    ).patterns;
    expect(key(edge)).toEqual(key(baseline));
  });

  it('nến xấu ở đầu chuỗi: cửa sổ bị cắt ở phiên 0, không lỗi', () => {
    const result = computeSymbolPatterns(seriesOf(bars, { 3: { bad: 1 } }), raw, 'HOSE').patterns;
    expect(key(result)).toEqual(key(baseline.filter((row) => !touches(row, 3))));
  });
});

describe('computeSymbolPatterns · 4 thẻ Việt Nam đọc giá gốc (v1.3 §2.3)', () => {
  // 40 phiên đi ngang quanh 20.000 rồi một nến khoá trần 21.400 (tham chiếu 20.000, HOSE bước giá 50).
  const flat = contextBars('F', 20_000, 40);
  const lock: CdBar = { o: 21_400, h: 21_400, l: 21_400, c: 21_400, v: 1 };
  const bars = [...flat, lock];
  const lockIdx = bars.length - 1;
  const hasLockCard = (patterns: ReadonlyArray<{ idx: number; cardId: string }>) =>
    patterns.some((row) => row.idx === lockIdx && row.cardId === 'tran_trang');

  it('có giá gốc và tham chiếu: nến khoá trần là Limit Up Lock', () => {
    const result = computeSymbolPatterns(seriesOf(bars), rawByIdx(bars), 'HOSE');
    expect(hasLockCard(result.patterns)).toBe(true);
  });

  it('thiếu giá gốc của đúng phiên đó: phiên không xét 4 thẻ này, được đếm vào phiên thiếu', () => {
    const result = computeSymbolPatterns(seriesOf(bars), rawByIdx(bars, new Set([lockIdx])), 'HOSE');
    expect(result.patterns.some((row) => VN_CARDS.includes(row.cardId) && row.idx === lockIdx)).toBe(false);
    expect(result.missingRawSessions).toBe(1);
  });

  it('không có giá gốc nào: không bao giờ xét 4 thẻ này trên giá điều chỉnh, 43 thẻ còn lại vẫn xét', () => {
    const market = simulateMarket(5, 2_000);
    const withRaw = computeSymbolPatterns(seriesOf(market), rawByIdx(market), 'HOSE');
    const withoutRaw = computeSymbolPatterns(seriesOf(market), new Map(), 'HOSE');
    expect(withRaw.patterns.some((row) => VN_CARDS.includes(row.cardId))).toBe(true);
    expect(withoutRaw.patterns.some((row) => VN_CARDS.includes(row.cardId))).toBe(false);
    expect(withoutRaw.missingRawSessions).toBe(market.length);
    expect(withoutRaw.patterns.some((row) => !VN_CARDS.includes(row.cardId))).toBe(true);
  });

  it('dùng đúng biên độ của sàn: 21.400 là trần của HOSE (7%) nhưng chưa phải trần của UPCoM (15%)', () => {
    const upcom = computeSymbolPatterns(seriesOf(bars), rawByIdx(bars), 'UPCOM');
    expect(hasLockCard(upcom.patterns)).toBe(false);
    const upcomLock = [...flat, { o: 23_000, h: 23_000, l: 23_000, c: 23_000, v: 1 }];
    const result = computeSymbolPatterns(seriesOf(upcomLock), rawByIdx(upcomLock), 'UPCOM');
    expect(hasLockCard(result.patterns)).toBe(true);
  });
});

// ------------------------------------------------------------------ dịch vụ

function setup(options: { symbols?: string[]; count?: number } = {}) {
  const symbols = options.symbols ?? ['AAA', 'BBB', 'CCC'];
  const count = options.count ?? 700;
  const datasets = new MemoryDatasetRepository(() => NOW);
  const patterns = new MemoryPatternsRepository(datasets, () => NOW);
  const market = new Map<string, CdBar[]>(symbols.map((symbol, index) => [symbol, simulateMarket(100 + index, count)]));
  const version = datasets.seedActive(
    Object.fromEntries(symbols.map((symbol) => [symbol, datasetBarsOf(market.get(symbol)!)])),
  );
  const source = new FakeDatasetSource();
  source.rawPrices = async (symbol) => rawPricesOf(market.get(symbol)!);
  const compute = new FlashbackPatternsCompute(patterns, source);
  const expected = (symbol: string, exchange: 'HOSE' | 'HNX' | 'UPCOM' = 'HOSE') =>
    computeSymbolPatterns(seriesOf(market.get(symbol)!), rawByIdx(market.get(symbol)!), exchange).patterns;
  return { datasets, patterns, source, compute, version, market, symbols, expected };
}

describe('FlashbackPatternsCompute.run · bước 2b trên một phiên bản kho', () => {
  it('tính cả kho: giá gốc + mẫu từng mã, lần chạy done với số mã, số mẫu, thẻ theo loại và nhật ký giá gốc', async () => {
    const { compute, patterns, version, symbols, expected } = setup();
    const result = await compute.run({ version, trigger: 'build', requestedBy: 'admin-1', now: NOW });
    expect(result.status).toBe('done');
    if (result.status === 'already_running') return;

    const total = symbols.reduce((sum, symbol) => sum + expected(symbol).length, 0);
    expect(result).toMatchObject({
      version,
      detectorVersion: CANDLE_DETECTOR_VERSION,
      symbolsDone: 3,
      symbolsTotal: 3,
      patternsCount: total,
      failed: [],
      reason: null,
    });
    for (const symbol of symbols) {
      expect(key(patterns.allPatterns(version, symbol, CANDLE_DETECTOR_VERSION))).toEqual(key(expected(symbol)));
      expect(patterns.rawRows.get(`${version}:${symbol}`)!.rows).toHaveLength(700);
    }
    expect(total).toBeGreaterThan(100);

    const run = (await patterns.latestDoneRun(version))!;
    expect(run).toMatchObject({
      status: 'done',
      trigger: 'build',
      requestedBy: 'admin-1',
      symbolsDone: 3,
      symbolsTotal: 3,
      patternsCount: total,
    });
    expect(run.finishedAt).not.toBeNull();
    expect(run.log).toMatchObject({
      failed: [],
      raw: { source: 'VCI:price-history:dong:raw', symbols_with_raw: 3, symbols_without_raw: 0, errors: [], reused: [] },
      missing_raw_sessions: 0,
      sessions: 2_100,
    });
    expect(Object.values(run.log.cards ?? {}).reduce((sum, count) => sum + count, 0)).toBe(total);
  });

  it('chạy lại nhiều lần cho đúng kết quả, không tạo dòng trùng; lần done mới nhất là lần được dùng', async () => {
    const { compute, patterns, version, symbols, expected } = setup();
    await compute.run({ version, trigger: 'build', now: NOW });
    const again = await compute.run({ version, trigger: 'admin', now: NOW });
    expect(again.status).toBe('done');
    for (const symbol of symbols) {
      expect(key(patterns.allPatterns(version, symbol, CANDLE_DETECTOR_VERSION))).toEqual(key(expected(symbol)));
    }
    expect(patterns.runs).toHaveLength(2);
    expect((await patterns.latestDoneRun(version))!.trigger).toBe('admin');
  });

  it('bộ nhận diện mới: chạy với detector_version khác, mẫu cũ còn nguyên cho ván đang chơi', async () => {
    const { compute, patterns, version, expected } = setup();
    await compute.run({ version, trigger: 'build', now: NOW });
    await compute.run({ version, trigger: 'detector', detectorVersion: 2, now: NOW });
    expect(patterns.allPatterns(version, 'AAA', 1)).toHaveLength(expected('AAA').length);
    expect(patterns.allPatterns(version, 'AAA', 2)).toHaveLength(expected('AAA').length);
    expect((await patterns.latestDoneRun(version))!.detectorVersion).toBe(2);
  });

  it('một mã lỗi: mã đó không có mẫu và được ghi vào log, các mã khác vẫn xong, lần chạy vẫn done', async () => {
    const { compute, patterns, version } = setup();
    patterns.failLoadFor.add('BBB');
    const result = await compute.run({ version, trigger: 'build', now: NOW });
    expect(result.status).toBe('done');
    if (result.status === 'already_running') return;
    expect(result.symbolsDone).toBe(2);
    expect(result.failed).toEqual([{ symbol: 'BBB', reason: 'lỗi đọc nến của BBB' }]);
    expect(patterns.allPatterns(version, 'BBB', CANDLE_DETECTOR_VERSION)).toEqual([]);
    expect(patterns.allPatterns(version, 'AAA', CANDLE_DETECTOR_VERSION).length).toBeGreaterThan(0);
    const run = (await patterns.latestDoneRun(version))!;
    expect(run.log.failed).toEqual([{ symbol: 'BBB', reason: 'lỗi đọc nến của BBB' }]);
    expect(run.symbolsDone).toBe(2);
  });

  it('lỗi ghi CSDL của một mã cũng chỉ loại mã đó', async () => {
    const { compute, patterns, version } = setup();
    patterns.failSaveFor.add('CCC');
    const result = await compute.run({ version, trigger: 'build', now: NOW });
    expect(result).toMatchObject({ status: 'done', symbolsDone: 2 });
  });

  it('không mã nào tính được: cả lần chạy failed (kho mới không được kích hoạt)', async () => {
    const { compute, patterns, version, symbols } = setup();
    for (const symbol of symbols) patterns.failLoadFor.add(symbol);
    const result = await compute.run({ version, trigger: 'build', now: NOW });
    expect(result.status).toBe('failed');
    if (result.status === 'already_running') return;
    expect(result.reason).toContain('Không tính được mẫu nến cho mã nào');
    expect(result.failed).toHaveLength(3);
    expect(await patterns.latestDoneRun(version)).toBeNull();
    expect((await patterns.latestRun(version))!).toMatchObject({ status: 'failed' });
  });

  it('phiên bản không có mã hợp lệ: failed có lý do rõ ràng', async () => {
    const { compute, patterns } = setup({ symbols: [] });
    const result = await compute.run({ version: 1, trigger: 'build', now: NOW });
    expect(result).toMatchObject({ status: 'failed', symbolsTotal: 0 });
    expect((await patterns.latestRun(1))!.log.error).toContain('không có mã hợp lệ');
  });

  it('đang có một lần chạy khác của phiên bản: trả already_running, không tạo lần chạy thứ hai', async () => {
    const { compute, patterns, version } = setup();
    patterns.seedRun({ version, status: 'running', finishedAt: null, heartbeatAt: NOW });
    const result = await compute.run({ version, trigger: 'admin', now: NOW });
    expect(result).toEqual({ status: 'already_running', version });
    expect(patterns.runs).toHaveLength(1);
  });

  it('lần chạy bị ngắt (mất nhịp quá hạn) được đóng lại và lần mới chạy bình thường', async () => {
    const { compute, patterns, version } = setup();
    patterns.seedRun({
      version,
      status: 'running',
      finishedAt: null,
      heartbeatAt: new Date(NOW.getTime() - PATTERN_STALE_RUN_MS - 1_000),
    });
    const result = await compute.run({ version, trigger: 'admin', now: NOW });
    expect(result.status).toBe('done');
    expect(patterns.runs[0]).toMatchObject({ status: 'failed' });
    expect(patterns.runs[0]!.log.error).toContain('bị ngắt');
  });

  it('chạy thử (dryRun): tính và báo cáo nhưng không ghi gì', async () => {
    const { compute, patterns, version } = setup();
    const result = await compute.run({ version, trigger: 'backfill', dryRun: true, now: NOW });
    expect(result.status).toBe('done');
    if (result.status === 'already_running') return;
    expect(result.patternsCount).toBeGreaterThan(100);
    expect(result.runId).toBe(0);
    expect(patterns.runs).toEqual([]);
    expect(patterns.patternRows.size).toBe(0);
    expect(patterns.rawRows.size).toBe(0);
    expect(patterns.calls.saveSymbol).toBe(0);
  });

  it('ghi sàn của mã (bảng symbols) cùng giá gốc', async () => {
    const { compute, patterns, version } = setup();
    patterns.exchangeBySymbol.set('BBB', 'UPCOM');
    await compute.run({ version, trigger: 'build', now: NOW });
    expect(patterns.rawRows.get(`${version}:BBB`)!.exchange).toBe('UPCOM');
    expect(patterns.rawRows.get(`${version}:AAA`)!.exchange).toBe('HOSE');
  });

  it('thiếu giá gốc ở vài phiên: đếm phiên thiếu, vẫn tính phần còn lại', async () => {
    const { compute, patterns, source, market, version } = setup();
    source.rawPrices = async (symbol) => rawPricesOf(market.get(symbol)!, undefined, new Set([10, 11, 12]));
    await compute.run({ version, trigger: 'build', now: NOW });
    const run = (await patterns.latestDoneRun(version))!;
    expect(run.log.missing_raw_sessions).toBe(9);
    expect(patterns.rawRows.get(`${version}:AAA`)!.rows).toHaveLength(697);
  });

  it('lấy giá gốc lỗi: mã đó không xét 4 thẻ Việt Nam, lý do vào log; lần sau lỗi tiếp thì dùng lại giá gốc đã lưu', async () => {
    const { compute, patterns, source, market, version } = setup();
    // Lần 1: nguồn lỗi với AAA, chưa có gì để dùng lại.
    source.rawPrices = async (symbol) => {
      if (symbol === 'AAA') throw new Error('VCI chặn IP');
      return rawPricesOf(market.get(symbol)!);
    };
    await compute.run({ version, trigger: 'build', now: NOW });
    const first = (await patterns.latestDoneRun(version))!;
    expect(first.log.raw).toMatchObject({
      symbols_with_raw: 2,
      symbols_without_raw: 1,
      errors: [{ symbol: 'AAA', reason: 'VCI chặn IP' }],
      reused: [],
    });
    expect(first.log.missing_raw_sessions).toBe(700);
    expect(patterns.rawRows.has(`${version}:AAA`)).toBe(false);
    expect(patterns.allPatterns(version, 'AAA', 1).some((row) => VN_CARDS.includes(row.cardId))).toBe(false);

    // Lần 2: lấy được AAA. Lần 3: BBB lỗi nhưng giá gốc lần 2 còn nên được dùng lại, kết quả không đổi.
    source.rawPrices = async (symbol) => rawPricesOf(market.get(symbol)!);
    await compute.run({ version, trigger: 'admin', now: NOW });
    const withRaw = patterns.allPatterns(version, 'BBB', 1);
    expect(withRaw.some((row) => VN_CARDS.includes(row.cardId))).toBe(true);
    source.rawPrices = async () => {
      throw new Error('VCI chặn IP');
    };
    await compute.run({ version, trigger: 'admin', now: NOW });
    const third = (await patterns.latestDoneRun(version))!;
    expect(third.log.raw?.reused).toEqual(['AAA', 'BBB', 'CCC']);
    expect(third.log.missing_raw_sessions).toBe(0);
    expect(key(patterns.allPatterns(version, 'BBB', 1))).toEqual(key(withRaw));
    expect(patterns.rawRows.get(`${version}:BBB`)!.rows).toHaveLength(700);
  });

  it('nguồn không có cổng giá gốc: 4 thẻ Việt Nam không xét, lần chạy vẫn done', async () => {
    const { compute, patterns, source, version } = setup();
    delete source.rawPrices;
    const result = await compute.run({ version, trigger: 'build', now: NOW });
    expect(result.status).toBe('done');
    const run = (await patterns.latestDoneRun(version))!;
    expect(run.log.raw?.symbols_with_raw).toBe(0);
    expect(run.log.raw?.errors).toHaveLength(3);
    expect(run.log.raw?.errors[0]!.reason).toContain('không có giá gốc');
    expect(patterns.allPatterns(version, 'AAA', 1).some((row) => VN_CARDS.includes(row.cardId))).toBe(false);
  });

  it('giá gốc của nguồn không khớp ngày nào của kho: coi như không có', async () => {
    const { compute, patterns, source, market, version } = setup();
    source.rawPrices = async (symbol) => rawPricesOf(market.get(symbol)!, '2031-01-05');
    await compute.run({ version, trigger: 'build', now: NOW });
    const run = (await patterns.latestDoneRun(version))!;
    expect(run.log.raw?.errors[0]!.reason).toContain('không khớp ngày nào');
    expect(patterns.rawRows.size).toBe(0);
  });

  it('ngày của giá gốc ghép theo NGÀY với phiên của kho, không theo vị trí', async () => {
    const { compute, patterns, source, market, version } = setup({ symbols: ['AAA'] });
    // Nguồn có thêm vài ngày ngoài kho (đầu và cuối) và thiếu một ngày giữa kho.
    const bars = market.get('AAA')!;
    const dates = sessionDates(bars.length);
    source.rawPrices = async () => {
      const prices = rawPricesOf(bars);
      prices.delete(dates[300]!);
      prices.set('2000-01-03', { open: 1000, high: 1000, low: 1000, close: 1000, ref: 1000 });
      prices.set('2099-01-01', { open: 1000, high: 1000, low: 1000, close: 1000, ref: 1000 });
      return prices;
    };
    await compute.run({ version, trigger: 'build', now: NOW });
    const rows = patterns.rawRows.get(`${version}:AAA`)!.rows;
    expect(rows).toHaveLength(699);
    expect(rows.some((row) => row.idx === 300)).toBe(false);
    expect(rows.find((row) => row.idx === 299)).toMatchObject({ close: bars[299]!.c });
  });
});
