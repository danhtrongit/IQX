/**
 * Chương 8 · Tăng trưởng và CAGR (doanh thu, LNST, EPS).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C8L1-g1 … C8L6-g2).
 */
import type { Builder } from './kit.js';
import { bars, formulaFlow, lines, wf, S1, S2, S3, UP, GD, DN, OR, PK, P3 } from './fund.js';

const c8: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · Tăng trưởng doanh thu YoY */
  'c8l1-g1': () =>
    wf({
      steps: [
        { label: 'Doanh thu', value: 1598.2, kind: 'base', tone: S1, decimals: 1 },
        { label: 'Giá vốn', value: 1172.1, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'LN gộp', value: 426.1, kind: 'total', tone: GD, decimals: 1 },
        { label: 'Chi phí|hoạt động', value: 210.1, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Lãi vay', value: 23.4, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Thuế', value: 38.5, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'LNST', value: 154.1, kind: 'total', tone: UP, decimals: 1 },
      ],
      unit: 'tỷ đồng',
      alt: 'Báo cáo kết quả kinh doanh quý 2/2026: từ doanh thu 1.598,2 tỷ đồng, trừ giá vốn 1.172,1 còn lợi nhuận gộp 426,1, trừ chi phí hoạt động 210,1, lãi vay 23,4 và thuế 38,5 còn lợi nhuận sau thuế 154,1 tỷ đồng',
    }),
  'c8l1-g2': () =>
    bars({
      title: 'Doanh thu theo quý · tỷ đồng',
      labels: [
        'Q1/23',
        'Q2/23',
        'Q3/23',
        'Q4/23',
        'Q1/24',
        'Q2/24',
        'Q3/24',
        'Q4/24',
        'Q1/25',
        'Q2/25',
        'Q3/25',
        'Q4/25',
      ],
      series: [
        {
          name: 'Doanh thu',
          values: [
            1020.1, 1118.3, 1166.6, 1371.5, 1167.0, 1283.8, 1345.3, 1551.5, 1308.9,
            1450.4, 1467.2, 1703.1,
          ],
          tone: S1,
        },
      ],
      unit: 'tỷ đồng',
    }),
  'c8l1-g3': () =>
    bars({
      title: 'Tăng trưởng doanh thu YoY · %',
      labels: ['Q2/2025', 'Q2/2026'],
      series: [
        { name: 'Doanh thu', values: [1450.4, 1598.2], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 2 · Tăng trưởng LNST YoY */
  'c8l2-g1': () =>
    bars({
      title: 'Chi phí cố định khuếch đại lợi nhuận · tỷ đồng',
      labels: ['Năm trước', 'Năm nay'],
      series: [
        { name: 'Chi phí cố định', values: [300, 300], tone: GD },
        { name: 'Chi phí biến đổi', values: [600, 660], tone: OR },
        { name: 'Lợi nhuận', values: [100, 140], tone: UP },
      ],
      stacked: true,
      unit: 'tỷ đồng',
      values: true,
    }),
  'c8l2-g2': () =>
    bars({
      title: 'LNST theo quý · tỷ đồng',
      labels: ['Quý 1', 'Quý 2', 'Quý 3', 'Quý 4'],
      series: [
        { name: 'LNST 2020', values: [28.0, -227.4, 33.8, 47.1], tone: OR },
        { name: 'LNST 2021', values: [54.9, 55.4, 58.6, 74.4], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c8l2-g3': () =>
    lines({
      title: 'Tăng trưởng LNST YoY so với doanh thu YoY · %',
      labels: [
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
          name: 'Tăng trưởng LNST YoY',
          values: [37.1, 40.0, 22.5, 32.8, 38.1, 38.7, 39.4, 20.6],
          tone: UP,
        },
        {
          name: 'Tăng trưởng doanh thu YoY',
          values: [15.3, 13.1, 12.2, 13.0, 9.1, 9.8, 15.4, 10.2],
          tone: S1,
        },
      ],
      unit: '%',
    }),

  /* ---------------------------------------------------------- Bài 3 · Tăng trưởng EPS YoY */
  'c8l3-g1': () =>
    formulaFlow(
      [
        {
          id: 'lnst',
          title: 'LNST quý 2/2026',
          value: '154,1 tỷ đồng',
          tone: UP,
        },
        {
          id: 'shares',
          title: 'Số cổ phiếu lưu hành',
          value: '360 triệu cổ phiếu',
          tone: GD,
        },
        {
          id: 'eps',
          title: 'EPS quý 2/2026',
          value: '428 đồng mỗi cổ phiếu',
          tone: S1,
          emph: true,
        },
      ],
      'EPS quý 2/2026 = LNST quý 2/2026 chia cho số cổ phiếu lưu hành, tức 154,1 tỷ đồng chia 360 triệu cổ phiếu xấp xỉ 428 đồng mỗi cổ phiếu',
    ),
  'c8l3-g2': () =>
    lines({
      title: 'Tăng trưởng LNST YoY và EPS YoY · %',
      labels: [
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
        { name: 'LNST', values: [37.1, 40.0, 22.5, 32.8, 38.1, 38.7, 39.4, 20.6], tone: UP },
        { name: 'EPS', values: [37.1, 40.0, 12.3, 21.7, 26.6, 27.2, 39.4, 20.6], tone: S1 },
      ],
      unit: '%',
    }),
  'c8l3-g3': () =>
    bars({
      title: 'Quý 1/2025 so với quý 1/2024 · %',
      labels: ['LNST', 'Số cổ phiếu', 'EPS'],
      series: [
        { name: 'Tăng trưởng', values: [22.5, 9.1, 12.3], tone: S1 },
      ],
      unit: '%',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 4 · Revenue CAGR 3Y */
  'c8l4-g1': () =>
    bars({
      title: 'Doanh thu cả năm · tỷ đồng',
      labels: ['2022', '2023', '2024', '2025'],
      series: [
        { name: 'Doanh thu', values: [4509.3, 4676.4, 5347.6, 5929.6], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c8l4-g2': () =>
    bars({
      title: 'Tăng 50% rồi giảm 50%',
      labels: ['Năm 0', 'Năm 1', 'Năm 2'],
      series: [{ name: 'Giá trị', values: [100, 150, 75], tone: S1 }],
      unit: '',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 5 · Net Profit CAGR 3Y */
  'c8l5-g1': () => {
    const real = [373.4, 261.7, 385.9, 514.47];
    const cg = Math.pow(514.47 / 373.4, 1 / 3);
    const smooth = real.map((_, i) => 373.4 * Math.pow(cg, i));
    return lines({
      title: 'LNST thực tế và đường tăng đều theo CAGR · tỷ đồng',
      labels: ['2022', '2023', '2024', '2025'],
      series: [
        { name: 'Tăng đều', values: smooth, tone: GD, dash: true },
        { name: 'Thực tế', values: real, tone: S1 },
      ],
      unit: 'tỷ đồng',
    });
  },
  'c8l5-g2': () =>
    bars({
      title: 'LNST tăng so với năm trước · %',
      labels: ['2023', '2024', '2025'],
      series: [
        {
          name: 'Tăng trưởng LNST',
          values: [-29.9, 47.4, 33.3],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
      ],
      unit: '%',
      values: true,
      refs: [{ value: 11.3, label: 'CAGR 11,3%', tone: S1 }],
    }),
  /* ---------------------------------------------------------- Bài 6 · EPS CAGR 3Y */
  'c8l6-g1': () =>
    formulaFlow(
      [
        { id: 'lnst-cagr', title: 'LNST CAGR', value: '11,3% mỗi năm', tone: UP },
        {
          id: 'shares',
          title: 'Số cổ phiếu tăng',
          value: '+2,9% mỗi năm',
          sub: '330 lên 360 triệu',
          tone: GD,
        },
        {
          id: 'eps-cagr',
          title: 'EPS CAGR',
          value: '8,1% mỗi năm',
          tone: S1,
          emph: true,
        },
      ],
      'Lợi nhuận chia cho nhiều cổ phiếu hơn nên EPS tăng chậm hơn LNST: LNST CAGR 11,3% mỗi năm, số cổ phiếu tăng 2,9% mỗi năm nên EPS CAGR chỉ 8,1%',
    ),
  'c8l6-g2': () =>
    bars({
      title: 'Ba tốc độ CAGR · %',
      labels: ['Doanh thu CAGR', 'LNST CAGR', 'EPS CAGR'],
      series: [
        { name: 'CAGR', values: [9.6, 11.3, 8.1], tone: S1 },
      ],
      unit: '%',
      values: true,
    }),
};

export const CH8_BUILDERS: Record<string, Builder> = c8;
export { S2, S3, PK, P3 };
