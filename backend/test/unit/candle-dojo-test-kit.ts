/**
 * Dụng cụ test của Candle Dojo: dựng bối cảnh giá, hình mẫu chuẩn của từng thẻ và chuỗi nến mô phỏng thị
 * trường Việt Nam (Phụ lục B của spec v1.2: canon.js, stress.js).
 */
import type { CdBar } from '../../src/modules/candle-dojo/shared/detector.js';
import { CD_CARDS, type CdCardDef } from '../../src/modules/candle-dojo/shared/cards.js';

export type Ctx = 'D' | 'T' | 'F';

/** Nến bối cảnh: 40 phiên giảm đều, tăng đều, hoặc đi ngang; phiên cuối đóng đúng `base`. */
export function contextBars(kind: Ctx, base = 1000, n = 40): CdBar[] {
  const out: CdBar[] = [];
  for (let k = 0; k < n; k++) {
    const step = n - 1 - k;
    if (kind === 'D') {
      const c = base + step * 1.2;
      out.push({ o: c + 1.2, h: c + 1.4, l: c - 0.2, c, v: 1 });
    } else if (kind === 'T') {
      const c = base - step * 1.2;
      out.push({ o: c - 1.2, h: c + 0.2, l: c - 1.4, c, v: 1 });
    } else {
      const up = k % 2 === 0;
      out.push(
        up
          ? { o: base - 0.6, h: base + 0.2, l: base - 0.8, c: base, v: 1 }
          : { o: base + 0.6, h: base + 0.8, l: base - 0.2, c: base, v: 1 },
      );
    }
  }
  return out;
}

/** Đặt hình mẫu chuẩn của một thẻ (đơn vị tương đối) lên giá `base`. */
export function shapeBars(card: CdCardDef, base = 1000, scale = 1): CdBar[] {
  if (!card.shape) throw new Error(`${card.id} không có hình mẫu`);
  return card.shape.map(([o, h, l, c]) => ({
    o: base + o * scale,
    h: base + h * scale,
    l: base + l * scale,
    c: base + c * scale,
    v: 1,
  }));
}

/** Ngữ cảnh chuẩn để dựng thẻ: thẻ "bất kỳ" dùng nền đi ngang. */
export function contextOf(card: CdCardDef): Ctx {
  return card.ctx;
}

export const PATTERN_CARDS = CD_CARDS.filter((card) => card.shape !== null);

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = (price: number) => (price < 10_000 ? 10 : price < 50_000 ? 50 : 100);
const snap = (price: number) => {
  const t = tick(price);
  return Math.round(price / t) * t;
};

/**
 * Chuỗi nến mô phỏng thị trường Việt Nam: bước giá, trần/sàn 7%, nến khoá trần/sàn, gap, đổi xu hướng
 * và biến động thay đổi. Giá là đồng nguyên; tham chiếu của phiên = đóng cửa phiên trước.
 */
export function simulateMarket(seed: number, count: number, startPrice = 20_000): CdBar[] {
  const rand = rng(seed);
  const bars: CdBar[] = [];
  let close = startPrice;
  let drift = 0;
  let vol = 0.012;
  let left = 0;
  for (let i = 0; i < count; i++) {
    if (left-- <= 0) {
      left = 8 + Math.floor(rand() * 40);
      drift = (rand() - 0.5) * 0.02;
      vol = 0.004 + rand() * 0.02;
    }
    const ref = close;
    const t = tick(ref);
    const tran = Math.floor((ref * 1.07) / t) * t;
    const san = Math.ceil((ref * 0.93) / t) * t;
    const roll = rand();
    let o: number;
    let h: number;
    let l: number;
    let c: number;
    if (roll < 0.012) {
      o = h = l = c = tran;
    } else if (roll < 0.024) {
      o = h = l = c = san;
    } else if (roll < 0.04) {
      o = snap(ref * (0.97 + rand() * 0.03));
      c = tran;
      h = tran;
      l = Math.min(o, snap(o * (1 - rand() * 0.01)));
    } else if (roll < 0.056) {
      o = snap(ref * (1 + rand() * 0.03));
      c = san;
      l = san;
      h = Math.max(o, snap(o * (1 + rand() * 0.01)));
    } else {
      const gap = rand() < 0.1 ? (rand() - 0.5) * 0.04 : (rand() - 0.5) * 0.004;
      o = snap(ref * (1 + gap));
      const move = drift + (rand() - 0.5) * 2 * vol;
      c = snap(o * (1 + move));
      const up = Math.abs(rand() - 0.5) * vol;
      const down = Math.abs(rand() - 0.5) * vol;
      if (rand() < 0.07) c = o;
      h = snap(Math.max(o, c) * (1 + up * (rand() < 0.2 ? 0 : 1)));
      l = snap(Math.min(o, c) * (1 - down * (rand() < 0.2 ? 0 : 1)));
      o = Math.min(Math.max(o, san), tran);
      c = Math.min(Math.max(c, san), tran);
      h = Math.min(Math.max(h, o, c), tran);
      l = Math.max(Math.min(l, o, c), san);
    }
    bars.push({ o, h, l, c, v: 1 });
    close = c;
  }
  return bars;
}
