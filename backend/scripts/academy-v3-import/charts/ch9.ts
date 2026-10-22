/**
 * Chương 9 · Chất lượng lợi nhuận (chuỗi lãi, ổn định tăng trưởng, biên, EPS, ROIC).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C9L1-g1 … C9L5-g4).
 * Bản mẫu vẽ hai khung cạnh nhau bằng cùng một hàm `chart()`; ở đây mỗi khung là một
 * `series_panels` và cả cặp là một `compare`.
 */
import type { Builder, Category, Model } from './kit.js';
import {
  bars,
  formulaFlow,
  gauge,
  meanBandChart,
  S1,
  S2,
  UP,
  DN,
  GD,
  OR,
  P3,
} from './fund.js';

const YR = ['2021', '2022', '2023', '2024', '2025'];

/** `chart()` của bản mẫu: đường + dải bình quân ± độ lệch chuẩn + đường bình quân. */
function chartOf(
  labels: readonly string[],
  values: readonly number[],
  lo: number,
  hi: number,
  gaps = false,
): Model<'series_panels'> {
  return meanBandChart({ labels, values, lo, hi, step: (hi - lo) / 4, gaps });
}

/** `epsBars()` của bản mẫu: cột EPS + dải bình quân ± độ lệch chuẩn + đường bình quân. */
function epsBarsOf(
  labels: readonly string[],
  values: readonly number[],
  top: number,
): Model<'series_panels'> {
  const n = values.length;
  const m = values.reduce((s, x) => s + x, 0) / n;
  const d = Math.sqrt(values.reduce((s, x) => s + (x - m) * (x - m), 0) / n);
  return {
    kind: 'series_panels',
    x: { start: 0, end: n - 1, ticks: [...labels] },
    marks: [],
    panels: [
      {
        title: '',
        bounds: [0, top],
        series: [{ name: 'EPS', role: S1, width: 2, values: values.map((v) => Math.round(v * 1e4) / 1e4) }],
        band: {
          upper: Array.from({ length: n }, () => Math.round((m + d) * 1e4) / 1e4),
          lower: Array.from({ length: n }, () => Math.round((m - d) * 1e4) / 1e4),
          tone: S1,
        },
        levels: [{ value: Math.round(m * 1e4) / 1e4, role: 'avg', label: 'Bình quân' }],
      },
    ],
  } as Model<'series_panels'>;
}

const ch9: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · Profit Positive Streak */
  'c9l1-g1': () =>
    bars({
      title: 'LNST theo năm · tỷ đồng',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        {
          name: 'LNST',
          values: [259.55, -118.48, 243.33, 373.43, 261.74, 385.88, 514.47],
          tone: S1,
          toneBySign: { pos: S1, neg: DN },
        },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c9l1-g2': () =>
    bars({
      title: 'Chuỗi lãi liên tiếp tính ngược từ năm gần nhất',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        {
          name: 'Doanh nghiệp A',
          values: [1, 1, 1, 1, 1, 1, 1],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
        {
          name: 'Doanh nghiệp B',
          values: [1, 0, 1, 1, 1, 1, 1],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
        {
          name: 'Doanh nghiệp C',
          values: [1, 1, 1, 1, 1, 1, 0],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
      ],
      unit: '1 là lãi, 0 là lỗ',
    }),
  'c9l1-g3': () => ({
    kind: 'scale',
    orientation: 'h',
    domain: [0, 7],
    ticks: [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: String(v) })),
    zones: [
      { from: 0, to: 2, tone: DN, label: 'Yếu' },
      { from: 2, to: 4, tone: GD, label: 'Trung bình' },
      { from: 4, to: 7, tone: UP, label: 'Tốt' },
    ],
    markers: [{ v: 5, label: 'Doanh nghiệp mẫu · 5 năm', tone: S1, side: 'a' }],
    alt: 'Thang tham chiếu số năm lãi liên tiếp: dưới 3 năm là yếu, từ 5 năm trở lên là tốt',
  }),
  'c9l1-g4': () =>
    bars({
      title: 'Cùng chuỗi lãi, khác quy mô · tỷ đồng',
      labels: ["'19", "'20", "'21", "'22", "'23", "'24", "'25"],
      series: [
        { name: 'Lãi lớn, tăng đều', values: [180, 220, 260, 300, 350, 410, 480], tone: UP },
        { name: 'Lãi rất mỏng, đi ngang', values: [12, 8, 15, 6, 10, 9, 11], tone: GD },
      ],
      unit: 'tỷ đồng',
    }),

  /* ---------------------------------------------------------- Bài 2 · Revenue Growth Stability */
  'c9l2-g1': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Doanh nghiệp A · tăng đều',
        model: chartOf(YR, [12, 14, 11, 13, 12], -10, 30),
      },
      {
        title: 'Doanh nghiệp B · thất thường',
        model: chartOf(YR, [28, -4, 22, 2, 14], -10, 30),
      },
    ],
  }) as Model<'compare'>,
  'c9l2-g2': () =>
    chartOf(YR, [16.68, 17.0, 3.71, 14.35, 10.88], 0, 20, true),
  'c9l2-g3': () =>
    gauge({
      max: 15,
      cuts: [5, 10],
      names: ['Ổn định', 'Trung bình', 'Thất thường'],
      value: 4.92,
      label: 'Doanh nghiệp mẫu · 4,9 điểm %',
      unit: 'điểm %',
      alt: 'Thang tham chiếu độ lệch chuẩn tăng trưởng doanh thu: ổn định dưới 5 điểm phần trăm, thất thường trên 10',
    }),
  'c9l2-g4': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Tăng nhanh, đều',
        model: chartOf(["'21", "'22", "'23", "'24", "'25"], [19, 21, 18, 22, 20], -10, 30),
      },
      {
        title: 'Tăng chậm, đều',
        model: chartOf(["'21", "'22", "'23", "'24", "'25"], [2, 3, 1, 3, 2], -10, 30),
      },
      {
        title: 'Thất thường',
        model: chartOf(["'21", "'22", "'23", "'24", "'25"], [28, -4, 22, 2, 14], -10, 30),
      },
    ],
  }) as Model<'compare'>,

  /* ---------------------------------------------------------- Bài 3 · Margin Stability */
  'c9l3-g1': () =>
    bars({
      title: 'Mỗi 100 đồng doanh thu thu được bao nhiêu lợi nhuận ròng',
      labels: YR,
      series: [
        { name: 'Chi phí', values: [93.69, 91.72, 94.4, 92.78, 91.32], tone: P3 },
        { name: 'LNST', values: [6.31, 8.28, 5.6, 7.22, 8.68], tone: UP },
      ],
      stacked: true,
      unit: 'đồng',
      values: true,
    }),
  'c9l3-g2': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Doanh nghiệp A · biên ổn định',
        model: chartOf(YR, [10.2, 10.8, 9.9, 10.5, 10.4], 0, 16),
      },
      {
        title: 'Doanh nghiệp B · biên dao động',
        model: chartOf(YR, [14, 4, 12, 2, 9], 0, 16),
      },
    ],
  }) as Model<'compare'>,
  'c9l3-g3': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Biên cao, dao động',
        model: {
          kind: 'category',
          mode: 'line',
          labels: YR,
          unit: '%',
          series: [{ name: 'Biên lợi nhuận ròng', values: [17, 9, 19, 8, 15], tone: GD }],
          value_labels: 'none',
        } as Category,
      },
      {
        title: 'Biên cao, ổn định · tốt nhất',
        model: {
          kind: 'category',
          mode: 'line',
          labels: YR,
          unit: '%',
          series: [{ name: 'Biên lợi nhuận ròng', values: [15, 16, 15.5, 16, 15.5], tone: UP }],
          value_labels: 'none',
        } as Category,
      },
      {
        title: 'Biên thấp, dao động',
        model: {
          kind: 'category',
          mode: 'line',
          labels: YR,
          unit: '%',
          series: [{ name: 'Biên lợi nhuận ròng', values: [5, 1, 4.5, 0.5, 3], tone: DN }],
          value_labels: 'none',
        } as Category,
      },
      {
        title: 'Biên thấp, ổn định',
        model: {
          kind: 'category',
          mode: 'line',
          labels: YR,
          unit: '%',
          series: [{ name: 'Biên lợi nhuận ròng', values: [2.5, 3, 2.8, 3, 2.7], tone: S1 }],
          value_labels: 'none',
        } as Category,
      },
    ],
  }) as Model<'compare'>,
  'c9l3-g4': () =>
    gauge({
      max: 4.5,
      cuts: [1.5, 3],
      names: ['Ổn định', 'Trung bình', 'Thất thường'],
      value: 1.16,
      label: 'Doanh nghiệp mẫu · 1,2 điểm %',
      unit: 'điểm %',
      decimals: 1,
      alt: 'Thang tham chiếu độ lệch chuẩn biên lợi nhuận ròng: ổn định dưới 1,5 điểm phần trăm',
    }),

  /* ---------------------------------------------------------- Bài 4 · EPS Stability */
  'c9l4-g1': () =>
    formulaFlow(
      [
        { id: 'lnst', title: 'Lợi nhuận sau thuế', value: '514 tỷ đồng', tone: S1 },
        { id: 'shares', title: 'Số cổ phiếu lưu hành', value: '360 triệu', tone: GD },
        {
          id: 'eps',
          title: 'EPS năm 2025',
          value: 'xấp xỉ 1.429 đồng',
          tone: UP,
          emph: true,
        },
      ],
      'EPS năm 2025 bằng lợi nhuận sau thuế 514 tỷ đồng chia cho 360 triệu cổ phiếu lưu hành, tức khoảng 1.429 đồng mỗi cổ phiếu',
    ),
  'c9l4-g2': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Doanh nghiệp A · EPS khoảng 1.000 đồng',
        model: epsBarsOf(YR, [800, 1200, 900, 1100, 1000], 1500),
      },
      {
        title: 'Doanh nghiệp B · EPS khoảng 5.000 đồng',
        model: epsBarsOf(YR, [4800, 5200, 4900, 5100, 5000], 6000),
      },
    ],
  }) as Model<'compare'>,
  'c9l4-g3': () =>
    gauge({
      max: 50,
      cuts: [15, 35],
      names: ['Ổn định', 'Trung bình', 'Thất thường'],
      value: 24.35,
      label: 'Doanh nghiệp mẫu · 24,4%',
      unit: '%',
      alt: 'Thang tham chiếu hệ số biến thiên của EPS: ổn định dưới 15%, thất thường trên 35%',
    }),
  'c9l4-g4': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'EPS tăng đều',
        model: epsBarsOf(YR, [700, 900, 1100, 1300, 1500], 1600),
      },
      {
        title: 'EPS lên xuống thất thường',
        model: epsBarsOf(YR, [1400, 800, 1350, 750, 1200], 1600),
      },
    ],
  }) as Model<'compare'>,

  /* ---------------------------------------------------------- Bài 5 · ROIC Stability */
  'c9l5-g1': () =>
    formulaFlow(
      [
        {
          id: 'nopat',
          title: 'Lợi nhuận hoạt động sau thuế',
          value: 'Lợi nhuận hoạt động',
          tone: S1,
        },
        {
          id: 'invested',
          title: 'Vốn đầu tư bình quân',
          value: 'Vốn đầu tư bình quân',
          tone: GD,
          children: [
            { title: 'Vốn chủ sở hữu', tone: 'price' },
            { title: 'Cộng nợ vay', tone: 'price' },
            { title: 'Trừ tiền mặt', tone: 'price' },
          ],
        },
        { id: 'roic', title: 'ROIC (%)', tone: UP, emph: true },
      ],
      'ROIC bằng lợi nhuận hoạt động sau thuế chia cho vốn đầu tư bình quân, trong đó vốn đầu tư là vốn chủ sở hữu cộng nợ vay trừ tiền mặt đang để không',
    ),
  'c9l5-g2': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Doanh nghiệp A · ROIC ổn định',
        model: chartOf(YR, [15, 16, 14.5, 15.5, 15], 0, 25),
      },
      {
        title: 'Doanh nghiệp B · ROIC dao động',
        model: chartOf(YR, [22, 6, 18, 4, 12], 0, 25),
      },
    ],
  }) as Model<'compare'>,
  'c9l5-g3': () =>
    gauge({
      max: 6,
      cuts: [2, 4],
      names: ['Ổn định', 'Trung bình', 'Thất thường'],
      value: 1.82,
      label: 'Doanh nghiệp mẫu · 1,8 điểm %',
      unit: 'điểm %',
      alt: 'Thang tham chiếu độ lệch chuẩn ROIC: ổn định dưới 2 điểm phần trăm',
    }),
  'c9l5-g4': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'ROIC cao và ổn định',
        model: chartOf(YR, [15.5, 16, 15, 16.5, 15.8], 0, 20),
      },
      {
        title: 'ROIC thấp và ổn định',
        model: chartOf(YR, [4, 3.6, 4.3, 3.8, 4.1], 0, 20),
      },
    ],
  }) as Model<'compare'>,
};

export const CH9_BUILDERS: Record<string, Builder> = ch9;
export { S2, OR };
