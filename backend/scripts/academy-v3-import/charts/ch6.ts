/**
 * Chương 6 · Phương pháp kỹ thuật mở rộng (EMA, MA Cross, DMI, Donchian Channel).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3: cùng seed `gen()`, cùng chu kỳ
 * SMA/EMA, cùng cửa sổ hiển thị. Chỉ khác ở chỗ bản mẫu vẽ SVG còn ở đây dựng mô hình chart.
 */
import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Model, Point } from './kit.js';
import { crossUps, dmiOf, donchian, emaSeeded, gen, pricePanels } from './tech.js';
import type { Num, PriceSeries } from './tech.js';
import { sma } from './math.js';
import { tone } from './tones.js';

const UP = tone('#2bb886');
const DN = tone('#e66767');
const BL = tone('#249bec');
const GD = tone('#dfb969');
const PK = tone('#e879f9');

/** Dữ liệu giá chung của Chương 6 (mỗi bài một bộ riêng, đúng seed của bản mẫu). */
const D1 = gen(61, [
  [40, 0.004, 0.014],
  [25, -0.006, 0.016],
  [30, 0.008, 0.015],
  [20, -0.002, 0.014],
  [25, -0.009, 0.017],
  [30, 0.007, 0.015],
], 24000);
const D2 = gen(23, [
  [60, 0.002, 0.012],
  [30, -0.008, 0.015],
  [40, 0.009, 0.014],
  [25, 0.001, 0.012],
  [35, -0.007, 0.015],
  [30, 0.006, 0.014],
], 26000);
const D3 = gen(41, [
  [50, 0.001, 0.013],
  [35, 0.009, 0.015],
  [30, -0.001, 0.012],
  [35, -0.009, 0.016],
  [30, 0.007, 0.014],
], 25000);
const D4 = gen(88, [
  [45, 0.001, 0.012],
  [30, 0, 0.008],
  [35, 0.009, 0.015],
  [25, -0.002, 0.013],
  [30, -0.008, 0.015],
  [25, 0.006, 0.014],
], 24000);

/** Bảng trọng số 10 phiên: MA đều, EMA giảm dần theo phiên xa (bản mẫu `g2` của Bài 1 Chương 6). */
const WEIGHT_LABELS = [
  'Cũ nhất',
  'Phiên 9',
  'Phiên 8',
  'Phiên 7',
  'Phiên 6',
  'Phiên 5',
  'Phiên 4',
  'Phiên 3',
  'Phiên 2',
  'Mới nhất',
];
const EMA_WEIGHTS = (() => {
  const a = 2 / 11;
  const w = Array.from({ length: 10 }, (_, k) => a * (1 - a) ** k).reverse();
  return w.map((v) => Math.round(v * 1e6) / 1e4);
})();

/** Một điểm giao cắt trên biểu đồ giá (vòng tròn của bản mẫu). */
const crossPoint = (i: number, value: number, up: boolean, label?: string): Point => ({
  i,
  panel: 0,
  value: Math.round(value * 1e4) / 1e4,
  tone: up ? UP : DN,
  shape: 'ring',
  ...(label ? { label } : {}),
});

export const CH6_BUILDERS: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · EMA */
  'c6l1-g1': () =>
    pricePanels(D1, 50, D1.n, {
      overlays: [
        { name: 'MA 20', values: sma(D1.c, 20), role: GD, width: 2 },
        { name: 'EMA 20', values: emaSeeded(D1.c, 20), role: BL, width: 2 },
      ],
      alt: 'Giá đóng cửa 120 phiên kèm đường MA 20 và đường EMA 20',
    }),
  'c6l1-g2': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'MA 10 phiên',
        model: {
          kind: 'category',
          mode: 'grouped',
          labels: [...WEIGHT_LABELS],
          unit: '%',
          series: [{ name: 'Trọng số', values: Array.from({ length: 10 }, () => 10), tone: GD }],
        },
      },
      {
        title: 'EMA 10 phiên',
        model: {
          kind: 'category',
          mode: 'grouped',
          labels: [...WEIGHT_LABELS],
          unit: '%',
          series: [{ name: 'Trọng số', values: EMA_WEIGHTS, tone: BL }],
        },
      },
    ],
  }),
  'c6l1-g3': () =>
    pricePanels(D1, 60, D1.n, {
      candles: false,
      overlays: [
        { name: 'EMA 50', values: emaSeeded(D1.c, 50), role: PK, width: 2 },
        { name: 'EMA 20', values: emaSeeded(D1.c, 20), role: BL, width: 2 },
        { name: 'EMA 10', values: emaSeeded(D1.c, 10), role: GD, width: 2 },
      ],
      alt: 'Giá đóng cửa kèm ba đường EMA 10, EMA 20 và EMA 50',
    }),
  'c6l1-g4': () => {
    const from = 55;
    const to = D1.n;
    const e20 = emaSeeded(D1.c, 20);
    const e50 = emaSeeded(D1.c, 50);
    const points: Point[] = [];
    let hold = false;
    for (let i = from + 1; i < to; i++) {
      const c0 = D1.c[i - 1] as number;
      const c1 = D1.c[i] as number;
      const a0 = e20[i - 1] as number;
      const a1 = e20[i] as number;
      const b1 = e50[i] as number;
      const up = c1 > a1 && c0 <= a0;
      const down = c1 < a1 && c0 >= a0;
      if (!hold && up && c1 > b1) {
        points.push({
          i,
          panel: 0,
          value: Math.round((D1.l[i] as number) * 1e4) / 1e4,
          tone: UP,
          shape: 'dot',
          label: 'Mua',
          pos: 'below',
        });
        hold = true;
      } else if (hold && down) {
        points.push({
          i,
          panel: 0,
          value: Math.round((D1.h[i] as number) * 1e4) / 1e4,
          tone: DN,
          shape: 'dot',
          label: 'Bán',
          pos: 'above',
        });
        hold = false;
      }
    }
    return pricePanels(D1, from, to, {
      overlays: [
        { name: 'EMA 50', values: e50, role: PK, width: 2 },
        { name: 'EMA 20', values: e20, role: BL, width: 2 },
      ],
      points,
      alt: 'Giá kèm EMA 20 và EMA 50, các điểm Mua và Bán theo giao cắt EMA 20',
    });
  },

  /* ---------------------------------------------------------- Bài 2 · MA Cross */
  'c6l2-g1': () => {
    const from = 70;
    const to = D2.n;
    const f = sma(D2.c, 20);
    const sl = sma(D2.c, 50);
    const points = crossUps(f, sl, from, to).map((c) =>
      crossPoint(c.i, f[c.i] as number, c.up, c.up ? 'Cắt lên' : 'Cắt xuống'),
    );
    return pricePanels(D2, from, to, {
      overlays: [
        { name: 'MA 50', values: sl, role: PK, width: 2 },
        { name: 'MA 20', values: f, role: GD, width: 2 },
      ],
      points,
      alt: 'Giá kèm MA 20 và MA 50, các điểm giao cắt đường trung bình',
    });
  },
  'c6l2-g2': () => {
    const long = gen(7, [
      [220, 0.0015, 0.011],
      [120, -0.004, 0.013],
      [90, 0.003, 0.012],
      [110, 0.0035, 0.012],
    ], 20000);
    const from = 200;
    const to = long.n;
    const f = sma(long.c, 50);
    const sl = sma(long.c, 200);
    const points = crossUps(f, sl, from, to).map((c) =>
      crossPoint(c.i, f[c.i] as number, c.up, c.up ? 'Giao cắt vàng' : 'Giao cắt tử thần'),
    );
    return pricePanels(long, from, to, {
      candles: false,
      overlays: [
        { name: 'MA 200', values: sl, role: BL, width: 3 },
        { name: 'MA 50', values: f, role: GD, width: 2 },
      ],
      points,
      alt: 'Giá đóng cửa dài hạn kèm MA 50 và MA 200, đánh dấu giao cắt vàng và giao cắt tử thần',
    });
  },
  'c6l2-g3': () => {
    const from = 95;
    const to = 150;
    const f = sma(D2.c, 20);
    const sl = sma(D2.c, 50);
    const events = crossUps(f, sl, from, to);
    const eventPoints = events.map((c) => crossPoint(c.i, f[c.i] as number, c.up));
    const shade: { from: number; to: number; tone: ChartTone; label?: string }[] = [];
    let start: number | null = null;
    for (let i = from; i < to; i++) {
      const on = (f[i] as number) > (sl[i] as number);
      if (on && start === null) start = i;
      if ((!on || i === to - 1) && start !== null) {
        shade.push({ from: start, to: on ? i : i - 1, tone: UP });
        start = null;
      }
    }
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Giao cắt · sự kiện một phiên',
          model: pricePanels(D2, from, to, {
            candles: false,
            overlays: [
              { name: 'MA 50', values: sl, role: PK, width: 2 },
              { name: 'MA 20', values: f, role: GD, width: 2 },
            ],
            points: eventPoints,
            alt: 'MA 20 cắt MA 50 tại một phiên',
          }),
        },
        {
          title: 'Nằm trên · trạng thái kéo dài',
          model: pricePanels(D2, from, to, {
            candles: false,
            overlays: [
              { name: 'MA 50', values: sl, role: PK, width: 2 },
              { name: 'MA 20', values: f, role: GD, width: 2 },
            ],
            oscShade: shade,
            alt: 'Khoảng thời gian MA 20 nằm trên MA 50 được tô nền',
          }),
        },
      ],
    };
  },
  'c6l2-g4': () => {
    const from = 80;
    const to = 150;
    const f = sma(D2.c, 20);
    const sl = sma(D2.c, 50);
    const up = crossUps(f, sl, from, to).find((c) => c.up);
    const points: Point[] = [];
    if (up) {
      const ci = up.i;
      let bi = from;
      for (let i = from; i < ci; i++) if ((D2.l[i] as number) < (D2.l[bi] as number)) bi = i;
      points.push({
        i: bi,
        panel: 0,
        value: Math.round((D2.l[bi] as number) * 1e4) / 1e4,
        tone: UP,
        shape: 'dot',
        label: 'Đáy thật',
        pos: 'below',
      });
      points.push({
        i: ci,
        panel: 0,
        value: Math.round((f[ci] as number) * 1e4) / 1e4,
        tone: UP,
        shape: 'ring',
        label: 'Giao cắt lên',
        pos: 'above',
      });
    }
    return pricePanels(D2, from, to, {
      overlays: [
        { name: 'MA 50', values: sl, role: PK, width: 2 },
        { name: 'MA 20', values: f, role: GD, width: 2 },
      ],
      points,
      alt: 'Giá kèm MA 20 và MA 50, đánh dấu đáy thật và phiên giao cắt lên',
    });
  },

  /* ---------------------------------------------------------- Bài 3 · DMI */
  'c6l3-g1': () => {
    const D = dmiOf(D3, 14);
    return pricePanels(D3, 40, D3.n, {
      overlays: [],
      osc: [
        { name: '+DI 14', values: D.p, role: UP, width: 2 },
        { name: '−DI 14', values: D.m, role: DN, width: 2 },
      ],
      titles: ['Giá đóng cửa', '+DI và −DI'],
      alt: 'Giá đóng cửa kèm hai đường +DI 14 và −DI 14',
    });
  },
  'c6l3-g2': () => ({
    kind: 'compare',
    layout: 'row',
    items: (
      [
        ['+DM = 500', 'Phần tăng giá giữa hai phiên'],
        ['−DM = 0', 'Phần giảm giá giữa hai phiên'],
        ['TR = 900', 'Biên độ thật giữa hai phiên'],
      ] as const
    ).map(([title, note]) => ({
      title,
      model: {
        kind: 'candle_glyphs',
        domain: [24800, 25900],
        groups: [
          {
            title: note,
            candles: [
              { o: 24900, h: 25400, l: 24800, c: 25100 },
              { o: 25150, h: 25900, l: 25000, c: 25700 },
            ],
            annotate: 'ohlc',
          },
        ],
        alt: `Hai phiên dùng để đo ${title}`,
      } as Model<'candle_glyphs'>,
    })),
  }),
  'c6l3-g3': () => {
    const D = dmiOf(D3, 14);
    const from = 40;
    const to = D3.n;
    const points: Point[] = [];
    for (let i = from + 1; i < to; i++) {
      const p0 = D.p[i - 1] as number;
      const p1 = D.p[i] as number;
      const m0 = D.m[i - 1] as number;
      const m1 = D.m[i] as number;
      if (p0 <= m0 && p1 > m1)
        points.push({
          i,
          panel: 0,
          value: Math.round((D3.l[i] as number) * 1e4) / 1e4,
          tone: UP,
          shape: 'dot',
          label: 'Mua',
          pos: 'below',
        });
      else if (p0 >= m0 && p1 < m1)
        points.push({
          i,
          panel: 0,
          value: Math.round((D3.h[i] as number) * 1e4) / 1e4,
          tone: DN,
          shape: 'dot',
          label: 'Bán',
          pos: 'above',
        });
    }
    const shade: { from: number; to: number; tone: ChartTone }[] = [];
    let start: number | null = null;
    for (let i = from; i < to; i++) {
      const on = (D.p[i] as number) > (D.m[i] as number);
      if (on && start === null) start = i;
      if ((!on || i === to - 1) && start !== null) {
        shade.push({ from: start, to: on ? i : i - 1, tone: UP });
        start = null;
      }
    }
    return pricePanels(D3, from, to, {
      osc: [
        { name: '+DI 14', values: D.p, role: UP, width: 2 },
        { name: '−DI 14', values: D.m, role: DN, width: 2 },
      ],
      titles: ['Giá đóng cửa', '+DI và −DI'],
      points,
      oscShade: shade,
      alt: 'Giá kèm +DI 14 và −DI 14, nền tô theo trạng thái trội và các điểm Mua, Bán',
    });
  },

  /* ---------------------------------------------------------- Bài 4 · Donchian */
  'c6l4-g1': () => {
    const K = donchian(D4, 20);
    return pricePanels(D4, 40, D4.n, {
      overlays: [
        { name: 'Biên trên 20 phiên', values: K.u, role: BL, width: 2 },
        { name: 'Biên dưới 20 phiên', values: K.l, role: BL, width: 2 },
      ],
      band: { upper: K.u, lower: K.l, tone: BL },
      alt: 'Giá đóng cửa trong kênh Donchian 20 phiên với biên trên và biên dưới',
    });
  },
  'c6l4-g2': () => {
    const K = donchian(D4, 20);
    let bi: number | null = null;
    for (let i = 60; i < D4.n; i++)
      if ((D4.c[i] as number) > (K.u[i] as number) && (D4.c[i - 1] as number) <= (K.u[i - 1] as number)) {
        bi = i;
        break;
      }
    const at = bi ?? 90;
    const from = at - 22;
    const to = at + 2;
    const upperVal = K.u[at] as number;
    return pricePanels(D4, from, to, {
      alt: 'Kênh Donchian 20 phiên: vùng 20 phiên trước và phiên đang xét',
      oscShade: [{ from: at - 20, to: at - 1, tone: BL, label: '20 phiên trước' }],
      levels: [{ value: upperVal, role: 'avg', label: 'Biên trên = giá cao nhất 20 phiên trước' }],
      marks: [{ i: at, label: 'Phiên đang xét' }],
    });
  },
  'c6l4-g3': () => {
    const K = donchian(D4, 20);
    const from = 40;
    const to = D4.n;
    const points: Point[] = [];
    let hold = false;
    for (let i = from; i < to; i++) {
      if (!hold && (D4.c[i] as number) > (K.u[i] as number)) {
        points.push({
          i,
          panel: 0,
          value: Math.round((D4.l[i] as number) * 1e4) / 1e4,
          tone: UP,
          shape: 'dot',
          label: 'Mua',
          pos: 'below',
        });
        hold = true;
      } else if (hold && (D4.c[i] as number) < (K.l[i] as number)) {
        points.push({
          i,
          panel: 0,
          value: Math.round((D4.h[i] as number) * 1e4) / 1e4,
          tone: DN,
          shape: 'dot',
          label: 'Bán',
          pos: 'above',
        });
        hold = false;
      }
    }
    return pricePanels(D4, from, to, {
      overlays: [
        { name: 'Biên trên 20 phiên', values: K.u, role: BL, width: 2 },
        { name: 'Biên dưới 20 phiên', values: K.l, role: BL, width: 2 },
      ],
      band: { upper: K.u, lower: K.l, tone: BL },
      points,
      alt: 'Giá trong kênh Donchian 20 phiên kèm các điểm Mua khi phá biên trên và Bán khi phá biên dưới',
    });
  },
};

export type { PriceSeries, Num };
