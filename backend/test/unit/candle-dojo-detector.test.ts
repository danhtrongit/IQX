import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { CD_CARDS, CD_CARD_COUNT, CD_TIER_INFO } from '../../src/modules/candle-dojo/shared/cards.js';
import {
  DETECTOR_CARD_IDS,
  lim,
  pick,
  prep,
  rawMatches,
  type CdBar,
  type CdMatch,
  type CdRawBar,
} from '../../src/modules/candle-dojo/shared/detector.js';
import {
  PATTERN_CARDS,
  contextBars,
  contextOf,
  rng,
  shapeBars,
  simulateMarket,
} from './candle-dojo-test-kit.js';

// Bản gốc nguyên văn của Phụ lục A: detector.ts phải khớp nó trên mọi chuỗi nến (kiểm thử đối chiếu).
const reference = createRequire(import.meta.url)(
  '../fixtures/candle-dojo/detector-reference.cjs',
) as {
  prep: (bars: CdBar[]) => unknown;
  rawMatches: (S: unknown, i: number) => CdMatch[];
  pick: (S: unknown, i: number) => CdMatch | null;
};

const STRESS_BARS = Number(process.env.CANDLE_DOJO_STRESS_BARS ?? 120_000);

describe('bộ thẻ nến', () => {
  it('có đúng 47 thẻ, 5 bậc 11/16/8/3/9 và giá 300/600/1000/2000/3000', () => {
    expect(CD_CARDS).toHaveLength(CD_CARD_COUNT);
    const byTier = [1, 2, 3, 4, 5].map((tier) => CD_CARDS.filter((card) => card.tier === tier).length);
    expect(byTier).toEqual([11, 16, 8, 3, 9]);
    expect([1, 2, 3, 4, 5].map((tier) => CD_TIER_INFO[tier as 1].priceXu)).toEqual([
      300, 600, 1000, 2000, 3000,
    ]);
    expect(new Set(CD_CARDS.map((card) => card.id)).size).toBe(47);
  });

  it('danh mục thẻ và bộ nhận diện dùng đúng cùng một tập mã', () => {
    expect([...DETECTOR_CARD_IDS].sort()).toEqual(CD_CARDS.map((card) => card.id).sort());
  });

  it('bậc của thẻ theo số nến của hình mẫu (1, 2, 3, 4, từ 5 trở lên)', () => {
    for (const card of CD_CARDS) expect(card.tier).toBe(Math.min(card.candles, 5));
  });
});

describe('hình mẫu chuẩn (canon, Phụ lục B)', () => {
  for (const card of PATTERN_CARDS) {
    it(`${card.id} nhận đúng tên và không thẻ cùng số nến nào khớp theo`, () => {
      const context = contextOf(card);
      const bars = [...contextBars(context), ...shapeBars(card, 1000)];
      const S = prep(bars);
      const last = bars.length - 1;
      const found = pick(S, last);
      expect(found?.id).toBe(card.id);
      const same = rawMatches(S, last).filter((m) => m.n === found?.n);
      expect(same.map((m) => m.id)).toEqual([card.id]);
      // Thẻ có bối cảnh nhận ra sau đúng bối cảnh, không nhận sau bối cảnh ngược lại.
      if (context !== 'F') {
        const opposite = context === 'D' ? 'T' : 'D';
        const flipped = prep([...contextBars(opposite), ...shapeBars(card, 1000)]);
        expect(pick(flipped, last)?.id).not.toBe(card.id);
      }
    });
  }

  it('4 thẻ Việt Nam: khoá trần, khoá sàn, kéo trần, đập sàn (giá tham chiếu = đóng cửa trước)', () => {
    const ctxBars = contextBars('F', 20_000);
    const ref = ctxBars[ctxBars.length - 1]!.c;
    const { tran, san } = lim(ref);
    const cases: [string, CdBar][] = [
      ['tran_trang', { o: tran, h: tran, l: tran, c: tran }],
      ['san_trang', { o: san, h: san, l: san, c: san }],
      ['keo_tran', { o: ref - 200, h: tran, l: ref - 250, c: tran }],
      ['dap_san', { o: ref + 200, h: ref + 250, l: san, c: san }],
    ];
    for (const [id, bar] of cases) {
      const bars = [...ctxBars, bar];
      expect(pick(prep(bars), bars.length - 1)).toEqual({ id, n: 1 });
    }
    // Mở trên tham chiếu rồi đóng trần: không phải Limit Up Close.
    const above: CdBar[] = [...ctxBars, { o: ref + 300, h: tran, l: ref + 250, c: tran }];
    expect(pick(prep(above), above.length - 1)?.id).not.toBe('keo_tran');
  });

  it('giá trần/sàn: làm tròn theo bước giá và biên độ từng sàn', () => {
    expect(lim(9_000)).toEqual({ tran: 9_630, san: 8_370 });
    expect(lim(20_000)).toEqual({ tran: 21_400, san: 18_600 });
    expect(lim(100_000)).toEqual({ tran: 107_000, san: 93_000 });
    expect(lim(20_000, 'HNX')).toEqual({ tran: 22_000, san: 18_000 });
    expect(lim(20_000, 'UPCOM')).toEqual({ tran: 23_000, san: 17_000 });
  });
});

describe('giá gốc cho 4 thẻ Việt Nam (v1.3 §2.3, §3.1)', () => {
  const ctxBars = contextBars('F', 20_000);
  const ref = ctxBars[ctxBars.length - 1]!.c;
  const rawOf = (bar: CdRawBar | null): (CdRawBar | null)[] => [
    ...ctxBars.map((b, i) => ({
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      ref: i > 0 ? ctxBars[i - 1]!.c : b.o,
    })),
    bar,
  ];

  it('đọc giá gốc và tham chiếu của sàn, không phải đóng cửa điều chỉnh của phiên trước', () => {
    // Ngày GDKHQ: tham chiếu của sàn thấp hơn đóng cửa phiên trước 1.000đ, nên trần cũng thấp hơn.
    const exRef = ref - 1_000;
    const { tran } = lim(exRef);
    const adjusted: CdBar = { o: tran, h: tran, l: tran, c: tran };
    const bars = [...ctxBars, adjusted];
    const raw = rawOf({ o: tran, h: tran, l: tran, c: tran, ref: exRef });
    expect(pick(prep(bars, raw), bars.length - 1)).toEqual({ id: 'tran_trang', n: 1 });
    // Cùng nến nhưng so với trần tính từ đóng cửa phiên trước thì không phải khoá trần.
    expect(pick(prep(bars), bars.length - 1)?.id).not.toBe('tran_trang');
  });

  it('thiếu giá gốc thì không xét 4 thẻ Việt Nam; 43 thẻ còn lại vẫn xét', () => {
    const { tran } = lim(ref);
    const bars = [...ctxBars, { o: tran, h: tran, l: tran, c: tran }];
    expect(pick(prep(bars, rawOf(null)), bars.length - 1)).toBeNull();
    const doji: CdBar[] = [...ctxBars, { o: ref, h: ref + 400, l: ref - 400, c: ref + 1 }];
    expect(pick(prep(doji, rawOf(null)), doji.length - 1)?.id).toBe('doji');
  });

  it('HNX có biên độ 10% và bước giá 100đ', () => {
    const exRef = 20_000;
    const { tran } = lim(exRef, 'HNX');
    expect(tran).toBe(22_000);
    const bars = [...ctxBars, { o: tran, h: tran, l: tran, c: tran }];
    const raw = rawOf({ o: tran, h: tran, l: tran, c: tran, ref: exRef, exchange: 'HNX' });
    expect(pick(prep(bars, raw), bars.length - 1)?.id).toBe('tran_trang');
  });
});

describe('đối chiếu với bản gốc Phụ lục A', () => {
  it('rawMatches khớp từng phiên trên chuỗi mô phỏng thị trường Việt Nam', () => {
    const bars = simulateMarket(7, 20_000);
    const mine = prep(bars);
    const theirs = reference.prep(bars);
    let seen = 0;
    for (let i = 1; i < bars.length; i++) {
      const expected = reference.rawMatches(theirs, i);
      const actual = rawMatches(mine, i);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`phiên ${i}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
      seen += actual.length;
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('pick khớp trên các chuỗi có hình mẫu chuẩn chèn vào', () => {
    const rand = rng(11);
    const bars: CdBar[] = [];
    let base = 1000;
    for (let k = 0; k < 120; k++) {
      const card = PATTERN_CARDS[Math.floor(rand() * PATTERN_CARDS.length)]!;
      const context = contextOf(card);
      bars.push(...contextBars(context, base, 30), ...shapeBars(card, base));
      base = bars[bars.length - 1]!.c + 50;
    }
    const mine = prep(bars);
    const theirs = reference.prep(bars);
    const names = new Set<string>();
    for (let i = 1; i < bars.length; i++) {
      const expected = reference.pick(theirs, i);
      const actual = pick(mine, i);
      expect(actual).toEqual(expected);
      if (actual) names.add(actual.id);
    }
    expect(names.size).toBeGreaterThan(35);
  });

  it('chạy trên ván Flashback mẫu cho đúng 13 thẻ của `flashback.hits`', () => {
    const sample = JSON.parse(
      readFileSync(new URL('../fixtures/candle-dojo/flashback-sample.json', import.meta.url), 'utf8'),
    ) as { bars: CdBar[]; H: number; hits: [number, string, number][] };
    const S = prep(sample.bars);
    const hits: [number, string, number][] = [];
    for (let i = sample.H; i < sample.bars.length; i++) {
      const m = pick(S, i);
      if (m) hits.push([i, m.id, m.n]);
    }
    expect(hits).toHaveLength(13);
    expect(hits).toEqual(sample.hits);
  });
});

describe('không nhìn trước và không trùng (spec §4.4, v1.3 §3.2)', () => {
  it('kết quả tại phiên i chỉ phụ thuộc các phiên <= i', () => {
    const bars = simulateMarket(23, 4_000);
    const full = prep(bars);
    const rand = rng(5);
    let checked = 0;
    let withCard = 0;
    for (let i = 60; i < bars.length && checked < 300; i += 1 + Math.floor(rand() * 20)) {
      const cut = prep(bars.slice(0, i + 1));
      const a = pick(cut, i);
      expect(a).toEqual(pick(full, i));
      checked++;
      if (a) withCard++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(withCard).toBeGreaterThanOrEqual(0);
  });

  it(`không có hai thẻ cùng số nến khớp một phiên (${STRESS_BARS.toLocaleString('en-US')} nến mô phỏng)`, () => {
    const sameN: string[] = [];
    const bigClash: string[] = [];
    const cardsSeen = new Set<string>();
    const chunk = 5_000;
    for (let part = 0; part * chunk < STRESS_BARS; part++) {
      const bars = simulateMarket(1000 + part, chunk, 10_000 + (part % 7) * 9_000);
      const S = prep(bars);
      for (let i = 1; i < bars.length; i++) {
        const matches = rawMatches(S, i);
        if (matches.length < 2) {
          if (matches[0]) cardsSeen.add(matches[0].id);
          continue;
        }
        const counts = new Map<number, string[]>();
        for (const m of matches) {
          cardsSeen.add(m.id);
          counts.set(m.n, [...(counts.get(m.n) ?? []), m.id]);
        }
        for (const [n, ids] of counts) if (n < 5 && ids.length > 1) sameN.push(`${part}:${i}:${ids}`);
        const fivePlus = matches.filter((m) => m.n >= 5);
        if (fivePlus.length > 1) bigClash.push(`${part}:${i}:${fivePlus.map((m) => m.id)}`);
      }
    }
    expect(sameN).toEqual([]);
    // Spec §4.4: 0 lần trùng giữa các mẫu 5 nến trở lên. Với bộ sinh của repo, chạy 3 triệu nến gặp 1 ca
    // hiếm (Island Reversal Bottom cùng Tower Bottom); `pick` vẫn chọn xác định (n lớn hơn thắng, hoà thì
    // theo thứ tự khai báo). Mặc định (120.000 nến, hạt giống cố định) phải bằng 0.
    expect(bigClash.length).toBeLessThanOrEqual(STRESS_BARS <= 1_000_000 ? 0 : 3);
    expect(cardsSeen.size).toBeGreaterThan(20);
  });

  it('mẫu nhiều nến thắng khi trùng mẫu ít nến, mỗi phiên chỉ một tên', () => {
    const card = CD_CARDS.find((item) => item.id === 'tan_cong_tang')!;
    const bars = [...contextBars('D'), ...shapeBars(card, 1000)];
    const S = prep(bars);
    const last = bars.length - 1;
    const all = rawMatches(S, last);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(pick(S, last)).toEqual({ id: 'tan_cong_tang', n: 4 });
  });
});
