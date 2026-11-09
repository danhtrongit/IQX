import { describe, expect, it } from 'vitest';

import {
  runBulletinChecks,
  commentChecks,
  levelChecks,
  slotChecks,
} from '../../src/modules/market-bulletins/bulletin-checks.js';
import {
  autoMetrics,
  buildVnIndexModel,
  suggestLevels,
} from '../../src/modules/market-bulletins/bulletin-model.js';
import {
  evaluateTracking,
  summarizeTracking,
} from '../../src/modules/market-bulletins/bulletin-tracking.js';
import { nf, sg } from '../../src/modules/market-bulletins/bulletin.format.js';
import {
  bulletinContentHash,
  retentionCutoff,
} from '../../src/modules/market-bulletins/bulletins.service.js';
import { EMPTY_LEVELS, type Levels } from '../../src/modules/market-bulletins/bulletin.types.js';
import {
  FIXTURE_DATE,
  fixtureContent,
  fixtureModel,
  fixtureSlot,
  syntheticIndexBars,
  tradingDays,
} from './market-bulletin-fixture.js';

const emptySlots = { 1: null, 2: null, 3: null } as const;
const readySlots = () => ({
  1: fixtureSlot(1),
  2: fixtureSlot(2, { passed: 0 }),
  3: fixtureSlot(3),
});
const levels = (patch: Partial<Levels> = {}): Levels => ({ ...EMPTY_LEVELS, ...patch });

describe('định dạng số kiểu Việt Nam', () => {
  it('nf nhóm hàng nghìn bằng dấu chấm và thập phân bằng dấu phẩy, không phụ thuộc ICU', () => {
    expect(nf(1755.612, 2)).toBe('1.755,61');
    expect(nf(21345.6, 0)).toBe('21.346');
    expect(nf(95.4, 1, 2)).toBe('95,4');
    expect(nf(null)).toBe('—');
    expect(nf(-1234.5, 1)).toBe('-1.234,5');
  });
  it('sg thêm dấu và dùng dấu trừ U+2212; số 0 không dấu', () => {
    expect(sg(6.61)).toBe('+6,61');
    expect(sg(-0.52)).toBe('−0,52');
    expect(sg(0)).toBe('0,00');
    expect(sg(0.001)).toBe('0,00');
  });
});

describe('mô hình VN-Index', () => {
  it('chỉ báo khớp số tính tay từ nến', () => {
    const bars = syntheticIndexBars(FIXTURE_DATE, 260);
    const model = buildVnIndexModel(bars, FIXTURE_DATE, null)!;
    const closes = bars.map((bar) => bar.close);
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(model.close).toBe(closes.at(-1));
    expect(model.change).toBeCloseTo(closes.at(-1)! - closes.at(-2)!, 9);
    expect(model.changePct).toBeCloseTo((closes.at(-1)! / closes.at(-2)! - 1) * 100, 9);
    expect(model.series.sma20.at(-1)).toBeCloseTo(mean(closes.slice(-20)), 9);
    expect(model.series.sma50.at(-1)).toBeCloseTo(mean(closes.slice(-50)), 9);
    expect(model.series.sma200.at(-1)).toBeCloseTo(mean(closes.slice(-200)), 9);
    expect(model.volumeMa20).toBeCloseTo(mean(bars.slice(-20).map((bar) => bar.volume)), 3);
    const rsi = model.series.rsi.at(-1)!;
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
    expect(model.series.hist.at(-1)).toBeCloseTo(
      model.series.macd.at(-1)! - model.series.signal.at(-1)!,
      9,
    );
  });

  it('không dựng khi thiếu nến hoặc nến cuối không phải phiên cần', () => {
    const bars = syntheticIndexBars(FIXTURE_DATE, 260);
    expect(buildVnIndexModel(bars.slice(-30), FIXTURE_DATE, null)).toBeNull();
    expect(buildVnIndexModel(bars.slice(0, -1), FIXTURE_DATE, null)).toBeNull();
    // Phiên cũ hơn: dùng nến tới ngày đó.
    const earlier = bars.at(-2)!.date;
    expect(buildVnIndexModel(bars, earlier, null)?.date).toBe(earlier);
  });

  it('gợi ý mức: làm tròn, gộp mức trùng, bỏ mức cách giá đóng cửa dưới 0,3%, đúng phía', () => {
    const model = fixtureModel();
    const suggestions = suggestLevels(model);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const item of suggestions) {
      expect(Number.isInteger(item.value)).toBe(true);
      expect(Math.abs(item.value - model.close) / model.close).toBeGreaterThanOrEqual(0.003);
      expect(item.side).toBe(item.value > model.close ? 'resistance' : 'support');
    }
    expect(new Set(suggestions.map((item) => item.value)).size).toBe(suggestions.length);
  });

  it('số liệu tự động của bước 1', () => {
    const metrics = autoMetrics(fixtureModel());
    expect(metrics.value_bn).toBeCloseTo(21_345.6, 6);
    expect([metrics.advances, metrics.unchanged, metrics.declines]).toEqual([212, 61, 143]);
    expect(metrics.volume_millions).toBeGreaterThan(0);
  });
});

describe('kiểm tra bản tin (spec §3.5)', () => {
  const model = fixtureModel();
  const close = model.close;
  const sma20 = model.series.sma20.at(-1)!;
  const messages = (items: { message: string }[]) => items.map((item) => item.message);

  it('dữ liệu chưa chốt thì lỗi và khoá Public', () => {
    const checks = runBulletinChecks({
      tradeDate: FIXTURE_DATE,
      content: fixtureContent(model),
      model: null,
      dataReadyAt: null,
      slots: readySlots(),
      overflow: [],
    });
    expect(messages(checks.items)).toContain('Chưa có dữ liệu phiên 06/11/2026. Chưa Public được.');
    expect(checks.errors).toBeGreaterThan(0);
  });

  it('ô nhận định trống', () => {
    const content = { ...fixtureContent(model), momentum: '  ' };
    const checks = runBulletinChecks({
      tradeDate: FIXTURE_DATE,
      content,
      model,
      dataReadyAt: null,
      slots: readySlots(),
      overflow: [],
    });
    expect(messages(checks.items)).toContain('Chưa viết nhận định "Động lượng".');
  });

  it('số không khớp, số của mức hỗ trợ/kháng cự và số làm tròn được chấp nhận', () => {
    const rounded = Math.round(close);
    const ok = commentChecks(
      {
        trend: `Đóng cửa ${nf(close, 2)} điểm, kháng cự ${rounded + 40}.`,
        momentum: `RSI(14) ở ${nf(model.series.rsi.at(-1)!, 1)}.`,
        liquidity: `Khối lượng ${nf(model.volume / 1e6, 0)} triệu cp.`,
      },
      model,
      levels({ r1: rounded + 40 }),
    );
    expect(ok).toEqual([]);
    const bad = commentChecks(
      { trend: 'Chỉ số ở 38,0 điểm.', momentum: '', liquidity: '' },
      model,
      levels(),
    );
    expect(messages(bad)).toEqual([
      'Nhận xét "Xu hướng": số 38,0 không khớp số liệu tính được. Kiểm tra lại.',
    ]);
  });

  it('sai chiều so sánh', () => {
    const above = close > sma20;
    const wrong = above ? 'dưới' : 'trên';
    const right = above ? 'trên' : 'dưới';
    expect(
      messages(
        commentChecks(
          { trend: `Giá ${wrong} SMA20.`, momentum: '', liquidity: '' },
          model,
          levels(),
        ),
      ),
    ).toEqual([`Nhận xét "Xu hướng": "${wrong} SMA20" sai so với giá đóng cửa.`]);
    expect(
      commentChecks({ trend: `Giá ${right} SMA20.`, momentum: '', liquidity: '' }, model, levels()),
    ).toEqual([]);
    const macdAbove = model.series.macd.at(-1)! > model.series.signal.at(-1)!;
    const macdWrong = macdAbove ? 'dưới' : 'trên';
    expect(
      commentChecks(
        { trend: '', momentum: `MACD nằm ${macdWrong} Signal.`, liquidity: '' },
        model,
        levels(),
      ),
    ).toHaveLength(1);
    const volAbove = model.volume > model.volumeMa20!;
    const volWrong = volAbove ? 'thấp' : 'cao';
    expect(
      commentChecks(
        { trend: '', momentum: '', liquidity: `Khối lượng ${volWrong} hơn trung bình 20 phiên.` },
        model,
        levels(),
      ),
    ).toHaveLength(1);
  });

  it('mức hỗ trợ, kháng cự và hai nhánh kịch bản', () => {
    const text = (items: ReturnType<typeof levelChecks>) =>
      messages(items.filter((item) => item.level === 'error'));
    const c = Math.round(close);
    expect(text(levelChecks(levels({ r1: c - 5 }), close))).toEqual([
      `Kháng cự ${nf(c - 5, 0)} phải cao hơn giá đóng cửa (${nf(close, 2)}).`,
    ]);
    expect(text(levelChecks(levels({ s1: c + 5 }), close))).toEqual([
      `Hỗ trợ ${nf(c + 5, 0)} phải thấp hơn giá đóng cửa (${nf(close, 2)}).`,
    ]);
    expect(text(levelChecks(levels({ pa: c, pt: null }), close))).toEqual([
      'Kịch bản tích cực cần đủ 2 mức: giữ trên … và hồi về ….',
    ]);
    expect(text(levelChecks(levels({ na: c, nt: null }), close))).toEqual([
      'Kịch bản tiêu cực cần đủ 2 mức: thủng … và về ….',
    ]);
    expect(text(levelChecks(levels({ pa: c + 10, pt: c + 5 }), close))).toEqual([
      'Kịch bản tích cực: mức "hồi về" phải cao hơn mức "giữ trên".',
    ]);
    expect(text(levelChecks(levels({ na: c - 10, nt: c - 5 }), close))).toEqual([
      'Kịch bản tiêu cực: mức "về" phải thấp hơn mức "thủng".',
    ]);
    const far = levelChecks(levels({ r1: Math.round(close * 1.2) }), close).filter(
      (item) => item.level === 'warn',
    );
    expect(messages(far)).toContain(
      `Mức ${nf(Math.round(close * 1.2), 0)} cách giá đóng cửa hơn 15%.`,
    );
    const none = levelChecks(levels(), close).filter((item) => item.level === 'warn');
    expect(messages(none)).toEqual(['Chưa có kháng cự.', 'Chưa có hỗ trợ.']);
  });

  it('ô bộ lọc: chưa đẩy phiên này là lỗi; 0 mã là lưu ý; có mã là thông tin', () => {
    const items = slotChecks(FIXTURE_DATE, {
      1: fixtureSlot(1, { date: '2026-11-05' }),
      2: fixtureSlot(2, { passed: 0 }),
      3: { ...fixtureSlot(3, { passed: 13 }), picks: fixtureSlot(3, { passed: 10 }).picks },
    });
    expect(items.map((item) => [item.level, item.message])).toEqual([
      ['error', 'Bộ lọc 1: chưa đẩy kết quả phiên 06/11/2026 từ Bộ lọc.'],
      ['warn', 'Bộ lọc 2: phiên này không có mã đạt. Bản tin in câu "Phiên này không có mã đạt."'],
      ['info', 'Bộ lọc 3: 10 mã (chọn từ 13 mã đạt).'],
    ]);
    expect(slotChecks(FIXTURE_DATE, emptySlots).every((item) => item.level === 'error')).toBe(true);
  });

  it('chữ tràn khung là lỗi và nội dung hợp lệ không có lỗi', () => {
    const clean = runBulletinChecks({
      tradeDate: FIXTURE_DATE,
      content: fixtureContent(model),
      model,
      dataReadyAt: '2026-11-06T09:10:00.000Z',
      slots: readySlots(),
      overflow: [],
    });
    expect(clean.errors).toBe(0);
    const overflow = runBulletinChecks({
      tradeDate: FIXTURE_DATE,
      content: fixtureContent(model),
      model,
      dataReadyAt: null,
      slots: readySlots(),
      overflow: ['liquidity'],
    });
    expect(messages(overflow.items)).toContain(
      'Nhận xét "Thanh khoản" quá dài, vượt khung. Hãy rút gọn.',
    );
  });
});

describe('nội dung bản tin: băm và hạn lưu', () => {
  const model = fixtureModel();
  it('băm đổi khi nhận định, mức hoặc mã trong ô thay đổi', () => {
    const content = fixtureContent(model);
    const base = bulletinContentHash(content, readySlots());
    expect(bulletinContentHash({ ...content }, readySlots())).toBe(base);
    expect(bulletinContentHash({ ...content, trend: content.trend + ' ' }, readySlots())).not.toBe(
      base,
    );
    expect(
      bulletinContentHash({ ...content, levels: { ...content.levels, r1: 1 } }, readySlots()),
    ).not.toBe(base);
    const slots = readySlots();
    slots[1] = { ...slots[1], picks: slots[1].picks.slice(1) };
    expect(bulletinContentHash(content, slots)).not.toBe(base);
  });

  it('hạn lưu 6 tháng tính theo lịch', () => {
    expect(retentionCutoff(new Date('2026-11-06T09:00:00.000Z'))).toBe('2026-05-06');
    expect(retentionCutoff(new Date('2026-08-31T09:00:00.000Z'))).toBe('2026-02-28');
    expect(retentionCutoff(new Date('2027-01-15T02:00:00.000Z'))).toBe('2026-07-15');
  });
});

describe('quy tắc Theo dõi (spec §5.3)', () => {
  const entryDate = '2026-10-01';
  const sessions = tradingDays('2026-12-31', 90).filter((date) => date >= entryDate);
  const series = (closeAt: (date: string, index: number) => number) => {
    const d = sessions;
    const c = d.map(closeAt);
    return { d, o: c, h: c, l: c, c, v: d.map(() => 1_000_000) };
  };
  const row = { firstTradeDate: entryDate, entryPrice: 50 };

  it('ngày đề xuất có số phiên 0 và lợi nhuận tính theo giá hôm nay', () => {
    const result = evaluateTracking(
      row,
      series(() => 50),
      sessions.slice(0, 1),
    );
    expect(result).toMatchObject({ entry: 50, price: 50, sessions: 0, returnPct: 0, exit: null });
  });

  it('phiên thứ 20 còn theo dõi, phiên thứ 21 rời danh sách', () => {
    const flat = series(() => 50);
    expect(evaluateTracking(row, flat, sessions.slice(0, 21)).exit).toBeNull();
    expect(evaluateTracking(row, flat, sessions.slice(0, 21)).sessions).toBe(20);
    expect(evaluateTracking(row, flat, sessions.slice(0, 22)).exit).toEqual({
      date: sessions[21],
      reason: '20_sessions',
    });
  });

  it('đóng cửa <= 93% giá đề xuất thì rời từ phiên đó; 93,1% thì còn', () => {
    const drop = series((_, index) => (index === 3 ? 46.5 : 50));
    expect(evaluateTracking(row, drop, sessions.slice(0, 10)).exit).toEqual({
      date: sessions[3],
      reason: 'stop_7',
    });
    const near = series((_, index) => (index === 3 ? 46.55 : 50));
    expect(evaluateTracking(row, near, sessions.slice(0, 10)).exit).toBeNull();
  });

  it('giá ngày đề xuất theo chuỗi đã điều chỉnh: tách cổ phiếu 2:1 chia đôi cả chuỗi', () => {
    // Chuỗi sau điều chỉnh: toàn bộ giá trước ngày giao dịch không hưởng quyền giảm một nửa, kể cả ngày đề xuất.
    const adjusted = series((_, index) => (index < 5 ? 25 : 26));
    const result = evaluateTracking(row, adjusted, sessions.slice(0, 8));
    expect(result.entry).toBe(25);
    expect(result.returnPct).toBeCloseTo(4, 9);
    // Không có chuỗi giá: dùng giá đã lưu.
    expect(evaluateTracking(row, null, sessions.slice(0, 3))).toMatchObject({
      entry: 50,
      price: null,
      returnPct: null,
    });
  });

  it('ba số tổng: không tính mã đề xuất hôm nay vào tỷ lệ lãi và lợi nhuận trung bình', () => {
    const summary = summarizeTracking([
      { sessions: 0, returnPct: 0, indexReturnPct: null },
      { sessions: 3, returnPct: 10, indexReturnPct: 2 },
      { sessions: 5, returnPct: -4, indexReturnPct: 4 },
      { sessions: 8, returnPct: 3, indexReturnPct: null },
    ]);
    expect(summary).toMatchObject({
      tracking_count: 4,
      today_count: 1,
      profit_count: 2,
      profit_base: 3,
    });
    expect(summary.average_return).toBeCloseTo(3, 9);
    expect(summary.index_return).toBeCloseTo(3, 9);
    expect(summarizeTracking([])).toMatchObject({
      tracking_count: 0,
      profit_base: 0,
      average_return: null,
      index_return: null,
    });
  });
});
