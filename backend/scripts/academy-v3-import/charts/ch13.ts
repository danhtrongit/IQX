/**
 * Chương 13 · Chỉ tiêu định giá (P/E, P/B, P/S, PEG, EV/EBITDA, FCF Yield).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C13L1-g1 … C13L6-g3).
 */
import type { Builder } from './kit.js';
import {
  bars,
  formulaFlow,
  hb,
  wf,
  zones,
  S1,
  S3,
  UP,
  DN,
  GD,
  OR,
  PK,
} from './fund.js';

const ch13: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · P/E */
  'c13l1-g1': () =>
    formulaFlow(
      [
        {
          id: 'price',
          title: 'Giá một cổ phiếu',
          value: '30.000 đồng',
          tone: S1,
        },
        {
          id: 'eps',
          title: 'Lợi nhuận một năm của một cổ phiếu (EPS)',
          value: '2.500 đồng',
          tone: GD,
        },
        {
          id: 'pe',
          title: 'P/E',
          value: '12 lần',
          sub: 'Giá cổ phiếu bằng 12 năm lợi nhuận ở mức hiện tại',
          tone: GD,
          emph: true,
        },
      ],
      'P/E bằng giá cổ phiếu 30.000 đồng chia cho EPS 2.500 đồng, bằng 12 lần, tức giá cổ phiếu bằng 12 năm lợi nhuận ở mức hiện tại',
    ),
  'c13l1-g2': () =>
    formulaFlow(
      [
        { id: 'price', title: 'Giá hiện tại', value: '30.000 đồng', tone: 'price' },
        {
          id: 'eps',
          title: 'EPS 4 quý gần nhất',
          value: 'Tổng 2.500 đồng',
          tone: GD,
          children: [
            { title: 'Q3/25: 600 đồng' },
            { title: 'Q4/25: 700 đồng' },
            { title: 'Q1/26: 550 đồng' },
            { title: 'Q2/26: 650 đồng' },
          ],
        },
        { id: 'pe', title: 'P/E', value: '12 lần', tone: GD, emph: true },
      ],
      'P/E bằng giá hiện tại 30.000 đồng chia cho tổng EPS 4 quý gần nhất 2.500 đồng, bằng 12 lần',
    ),
  'c13l1-g3': () =>
    bars({
      title: 'EPS 4 quý và P/E theo quý',
      labels: [
        'Q1/24',
        'Q2/24',
        'Q3/24',
        'Q4/24',
        'Q1/25',
        'Q2/25',
        'Q3/25',
        'Q4/25',
        'Q1/26',
        'Q2/26',
      ],
      series: [
        {
          name: 'EPS 4 quý, đồng',
          values: [1800, 2100, 2500, 2900, 3200, 3300, 2900, 2300, 1800, 1500],
          tone: GD,
        },
        {
          name: 'P/E, lần',
          values: [20, 18.1, 16, 13.8, 11.9, 10.9, 11.4, 13, 15.6, 18],
          tone: S1,
        },
      ],
      unit: '',
      values: true,
    }),
  'c13l1-g4': () =>
    hb({
      title: 'P/E so cùng ngành',
      items: [
        { label: 'Doanh nghiệp A', value: 8, tone: S1 },
        { label: 'Doanh nghiệp mẫu', value: 9, tone: GD, bold: true },
        { label: 'Doanh nghiệp B', value: 11, tone: S1 },
        { label: 'Doanh nghiệp C', value: 17, tone: S1 },
        { label: 'Doanh nghiệp D', value: 18, tone: S1 },
        { label: 'Doanh nghiệp E', value: 21, tone: S1 },
      ],
      unit: ' lần',
      ref: [14, 'Trung vị ngành 14 lần'],
    }),

  /* ---------------------------------------------------------- Bài 2 · P/B */
  'c13l2-g1': () =>
    bars({
      title: 'Ba mức P/B',
      labels: ['P/B dưới 1', 'P/B bằng 1', 'P/B trên 1'],
      series: [
        { name: 'Vốn hóa', values: [0.7, 1, 2], tone: S1 },
        { name: 'VCSH', values: [1, 1, 1], tone: GD },
      ],
      unit: 'lần',
      values: true,
    }),
  'c13l2-g2': () =>
    bars({
      title: 'Bảng cân đối: tổng tài sản 20.000 tỷ',
      labels: ['Nợ phải trả', 'Vốn chủ sở hữu', 'Vốn hóa'],
      series: [
        { name: 'Nợ phải trả', values: [12000, null, null], tone: OR },
        { name: 'Vốn chủ sở hữu', values: [null, 8000, null], tone: S1 },
        { name: 'Vốn hóa', values: [null, null, 12000], tone: GD },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c13l2-g3': () =>
    bars({
      title: 'P/B và ROE',
      labels: ['6%', '8%', '10%', '12%', '14%', '15%', '17%', '19%', '21%', '22%'],
      series: [
        { name: 'P/B, lần', values: [0.6, 0.8, 0.95, 1.15, 1.35, 1.5, 1.7, 2, 2.25, 2.45], tone: S1 },
      ],
      unit: 'lần',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 3 · P/S */
  'c13l3-g1': () =>
    formulaFlow(
      [
        { id: 'mcap', title: 'Vốn hóa', value: '10.000 tỷ', tone: GD },
        { id: 'revenue', title: 'Doanh thu 4 quý', value: '5.000 tỷ', tone: S1 },
        {
          id: 'ps',
          title: 'P/S',
          value: '2 lần',
          sub: 'Nhà đầu tư trả 2 đồng cho mỗi 1 đồng doanh thu một năm',
          tone: GD,
          emph: true,
        },
      ],
      'P/S bằng vốn hóa 10.000 tỷ chia doanh thu 4 quý 5.000 tỷ, bằng 2 lần',
    ),
  'c13l3-g2': () =>
    bars({
      title: 'Cùng P/S 1 lần, khác biên lợi nhuận',
      labels: ['Doanh nghiệp X', 'Doanh nghiệp Y'],
      series: [
        { name: 'Vốn hóa', values: [1000, 1000], tone: GD },
        { name: 'Doanh thu', values: [1000, 1000], tone: S1 },
        { name: 'Lợi nhuận', values: [150, 20], tone: UP },
      ],
      unit: '',
      values: true,
    }),
  'c13l3-g3': () =>
    hb({
      title: 'P/S thường lệ theo ngành · số liệu minh họa',
      items: [
        { label: 'Bán lẻ', value: 0.4, tone: S1 },
        { label: 'Xây dựng', value: 0.6, tone: S1 },
        { label: 'Thép', value: 0.7, tone: S1 },
        { label: 'Thực phẩm', value: 1.5, tone: S1 },
        { label: 'Dược phẩm', value: 2, tone: S1 },
        { label: 'Phần mềm', value: 3.5, tone: S1 },
      ],
      unit: ' lần',
      decimals: 1,
    }),

  /* ---------------------------------------------------------- Bài 4 · PEG */
  'c13l4-g1': () =>
    bars({
      title: 'Hai doanh nghiệp: P/E và tăng trưởng EPS',
      labels: ['Doanh nghiệp A', 'Doanh nghiệp B'],
      series: [
        { name: 'P/E, lần', values: [20, 10], tone: S1 },
        { name: 'Tăng trưởng EPS, %', values: [25, 5], tone: S3 },
      ],
      unit: '',
      values: true,
    }),
  'c13l4-g2': () =>
    formulaFlow(
      [
        { id: 'pe', title: 'P/E', value: '15 lần', tone: 'price' },
        {
          id: 'growth',
          title: 'Tăng trưởng EPS',
          value: '20',
          sub: 'EPS tăng 20%, dùng số 20',
          tone: UP,
        },
        { id: 'peg', title: 'PEG', value: '0,75', tone: GD, emph: true },
      ],
      'PEG bằng P/E 15 lần chia tăng trưởng EPS 20%, bằng 0,75',
    ),
  'c13l4-g3': () =>
    zones({
      min: 0,
      max: 3,
      segs: [
        [0, 1, 'Giá thấp so với tăng trưởng', UP],
        [1, 3, 'Giá cao so với tăng trưởng', DN],
      ],
      ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3],
      mark: [1, 'Mốc PEG = 1 · tương xứng'],
      alt: 'Thang PEG: dưới 1 là giá thấp so với tăng trưởng, trên 1 là giá cao so với tăng trưởng; EPS đi ngang hoặc giảm thì PEG không có ý nghĩa',
    }),

  /* ---------------------------------------------------------- Bài 5 · EV / EBITDA */
  'c13l5-g1': () =>
    wf({
      steps: [
        { label: 'Vốn hóa trả cổ đông', value: 10000, kind: 'base', tone: S1 },
        { label: 'Nợ vay gánh thêm', value: 4000, kind: 'add', tone: OR },
        { label: 'Tiền nhận lại', value: 1500, kind: 'sub', tone: S3 },
        { label: 'EV giá mua toàn bộ', value: 0, kind: 'total', tone: GD },
      ],
      unit: 'tỷ đồng',
      alt: 'Giá trị doanh nghiệp bằng vốn hóa 10.000 tỷ cộng nợ vay 4.000 tỷ trừ tiền 1.500 tỷ, bằng 12.500 tỷ',
    }),
  'c13l5-g2': () =>
    wf({
      steps: [
        { label: 'LN trước thuế', value: 1200, kind: 'base', tone: S1 },
        { label: 'Lãi vay', value: 300, kind: 'add', tone: OR },
        { label: 'EBIT', value: 0, kind: 'total', tone: S1 },
        { label: 'Khấu hao', value: 500, kind: 'add', tone: PK },
        { label: 'EBITDA', value: 0, kind: 'total', tone: GD },
      ],
      unit: 'tỷ đồng',
      alt: 'EBITDA bằng EBIT 1.500 tỷ cộng khấu hao 500 tỷ, bằng 2.000 tỷ, nên EV trên EBITDA bằng 12.500 chia 2.000 là 6,25 lần',
    }),
  'c13l5-g3': () =>
    bars({
      title: 'Cùng vốn hóa, khác nợ · tỷ đồng',
      labels: ['Doanh nghiệp A', 'Doanh nghiệp B'],
      series: [
        { name: 'Vốn hóa', values: [10000, 10000], tone: S1 },
        { name: 'EV', values: [9000, 17500], tone: GD },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 6 · FCF Yield */
  'c13l6-g1': () =>
    formulaFlow(
      [
        {
          id: 'cells',
          title: '100 đồng vốn hóa',
          value: '7,5 đồng tiền mặt tự do mỗi năm',
          sub: 'Tiền này dùng trả cổ tức, trả nợ hoặc mua lại cổ phiếu',
          tone: S1,
        },
        {
          id: 'yield',
          title: 'FCF Yield',
          value: '7,5%',
          tone: GD,
          emph: true,
        },
      ],
      'FCF Yield 7,5% nghĩa là 100 đồng vốn hóa tạo ra 7,5 đồng tiền mặt tự do mỗi năm, số tiền này có thể dùng trả cổ tức, trả nợ hoặc mua lại cổ phiếu',
    ),
  'c13l6-g2': () =>
    wf({
      steps: [
        { label: 'CFO 4 quý', value: 2400, kind: 'base', tone: S1 },
        { label: 'Capex 4 quý', value: 900, kind: 'sub', tone: OR },
        { label: 'FCF 4 quý', value: 0, kind: 'total', tone: GD },
      ],
      unit: 'tỷ đồng',
      alt: 'FCF 4 quý bằng CFO 2.400 tỷ trừ Capex 900 tỷ, bằng 1.500 tỷ; chia 20.000 tỷ vốn hóa rồi nhân 100 được FCF Yield 7,5%',
    }),
  'c13l6-g3': () =>
    bars({
      title: 'So với tỷ suất lợi nhuận · %',
      labels: ['A: lợi nhuận thành tiền', 'B: lợi nhuận trên giấy'],
      series: [
        { name: 'Tỷ suất lợi nhuận', values: [8, 8], tone: S1 },
        { name: 'FCF Yield', values: [7.5, -1], tone: GD },
      ],
      unit: '%',
      values: true,
    }),
};

export const CH13_BUILDERS: Record<string, Builder> = ch13;
export { DN };
