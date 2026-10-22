/**
 * Chương 10 · Chỉ tiêu sinh lời (ROE, ROA, ROIC, biên lợi nhuận, vòng quay, CCC).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C10L1-g1 … C10L7-g3).
 */
import type { Builder } from './kit.js';
import {
  bars,
  formulaFlow,
  hb,
  lines,
  wf,
  S1,
  S2,
  S3,
  UP,
  DN,
  GD,
  OR,
  PK,
} from './fund.js';

const Q8 = ['Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25', 'Q1/26', 'Q2/26'];

const ch10: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · ROE */
  'c10l1-g1': () =>
    formulaFlow(
      [
        {
          id: 'lnst',
          title: 'Lợi nhuận sau thuế 4 quý',
          value: '584 tỷ',
          sub: 'Từ Q3/25 đến Q2/26',
          tone: S1,
        },
        {
          id: 'equity',
          title: 'Vốn chủ bình quân',
          value: '4.235 tỷ',
          sub: '(4.001 + 4.469) ÷ 2',
          tone: GD,
        },
        {
          id: 'roe',
          title: 'ROE',
          value: '13,8%',
          sub: '100 đồng vốn chủ tạo ra 13,8 đồng lãi',
          tone: UP,
          emph: true,
        },
      ],
      'ROE bằng lợi nhuận sau thuế 4 quý 584 tỷ chia cho vốn chủ bình quân 4.235 tỷ, bằng 13,8%',
    ),
  'c10l1-g2': () =>
    formulaFlow(
      [
        {
          id: 'roe',
          title: 'ROE',
          value: '13,8%',
          tone: UP,
          emph: true,
        },
        {
          id: 'margin',
          title: 'Biên lợi nhuận ròng',
          value: '9,3%',
          sub: 'LNST ÷ Doanh thu · bán hàng có lãi',
          tone: S1,
        },
        {
          id: 'turnover',
          title: 'Vòng quay tài sản',
          value: '1,02 lần',
          sub: 'Doanh thu ÷ Tài sản · khai thác tài sản',
          tone: GD,
        },
        {
          id: 'leverage',
          title: 'Đòn bẩy tài chính',
          value: '1,46 lần',
          sub: 'Tài sản ÷ Vốn chủ · dùng thêm nợ',
          tone: OR,
        },
      ],
      'Theo phân tích DuPont, ROE 13,8% là tích của biên lợi nhuận ròng 9,3%, vòng quay tài sản 1,02 lần và đòn bẩy tài chính 1,46 lần',
    ),
  'c10l1-g3': () =>
    bars({
      title: 'Cùng ROE 18%, khác nguồn tạo ra',
      labels: ['Biên ròng', 'Vòng quay', 'Đòn bẩy'],
      series: [
        { name: 'Doanh nghiệp A', values: [12, 1, 1.5], tone: S1 },
        { name: 'Doanh nghiệp B', values: [3, 1, 6], tone: DN },
      ],
      unit: '',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 2 · ROA */
  'c10l2-g1': () =>
    bars({
      title: 'Bảng cân đối: tổng tài sản bình quân 6.185 tỷ',
      labels: ['Nợ phải trả', 'Vốn chủ'],
      series: [
        { name: 'Nợ phải trả', values: [1950, 0], tone: S2 },
        { name: 'Vốn chủ', values: [0, 4235], tone: S1 },
      ],
      stacked: true,
      unit: 'tỷ đồng',
      values: true,
    }),
  'c10l2-g2': () =>
    bars({
      title: 'Cùng ROA, khác đòn bẩy · %',
      labels: ['Đòn bẩy 1,2 lần', 'Đòn bẩy 2 lần', 'Đòn bẩy 4 lần'],
      series: [
        { name: 'ROA', values: [8, 8, 8], tone: S1 },
        { name: 'ROE', values: [9.6, 16, 32], tone: GD },
      ],
      unit: '%',
      values: true,
    }),
  'c10l2-g3': () =>
    hb({
      title: 'ROA tham khảo theo ngành · số minh họa',
      items: [
        { label: 'Ngân hàng', value: 1.5, tone: S1 },
        { label: 'Bất động sản', value: 4, tone: S1 },
        { label: 'Bán lẻ', value: 7, tone: S1 },
        { label: 'Sản xuất', value: 8, tone: S1 },
        { label: 'Phần mềm', value: 15, tone: S1 },
      ],
      unit: '%',
      decimals: 1,
    }),

  /* ---------------------------------------------------------- Bài 3 · ROIC */
  'c10l3-g1': () =>
    formulaFlow(
      [
        {
          id: 'nopat',
          title: 'NOPAT 4 quý',
          value: '658 tỷ',
          sub: 'EBIT 823 × (1 − thuế 20%)',
          tone: S1,
        },
        {
          id: 'invested',
          title: 'Vốn đầu tư bình quân',
          value: '4.635 tỷ',
          sub: '(4.401 + 4.869) ÷ 2',
          tone: GD,
        },
        {
          id: 'roic',
          title: 'ROIC',
          value: '14,2%',
          sub: 'Lãi trên toàn bộ vốn chủ sở hữu và nợ vay',
          tone: UP,
          emph: true,
        },
      ],
      'ROIC bằng NOPAT 4 quý 658 tỷ chia cho vốn đầu tư bình quân 4.635 tỷ, bằng 14,2%',
    ),
  'c10l3-g2': () =>
    wf({
      steps: [
        { label: 'Vốn chủ sở hữu', value: 4469, kind: 'base', tone: S1 },
        { label: 'Cộng nợ vay', value: 1100, kind: 'add', tone: S2 },
        { label: 'Trừ tiền mặt', value: 700, kind: 'sub', tone: DN },
        { label: 'Vốn đầu tư', value: 4869, kind: 'total', tone: GD },
      ],
      unit: 'tỷ đồng',
      alt: 'Vốn đầu tư bằng vốn chủ sở hữu 4.469 tỷ cộng nợ vay 1.100 tỷ trừ tiền mặt 700 tỷ, bằng 4.869 tỷ',
    }),
  'c10l3-g3': () =>
    lines({
      title: 'ROIC so với chi phí vốn · %',
      labels: ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        { name: 'ROIC', values: [8.4, 9.6, 11.6, 12.8, 13.5, 12.2, 13.6, 14.2], tone: S1 },
      ],
      unit: '%',
      refs: [{ value: 11, label: 'Chi phí vốn 11%', tone: GD }],
    }),

  /* ---------------------------------------------------------- Bài 4 · Biên lợi nhuận gộp */
  'c10l4-g1': () =>
    bars({
      title: 'Doanh thu 4 quý 6.279 tỷ đồng',
      labels: ['Giá vốn hàng bán', 'Lợi nhuận gộp'],
      series: [
        { name: 'Giá vốn hàng bán', values: [4653, 0], tone: S1 },
        { name: 'Lợi nhuận gộp', values: [0, 1626], tone: S2 },
      ],
      stacked: true,
      unit: 'tỷ đồng',
      values: true,
    }),
  'c10l4-g2': () =>
    hb({
      title: 'Biên gộp tham khảo theo ngành · số minh họa',
      items: [
        { label: 'Phần mềm', value: 55, tone: S1 },
        { label: 'Dược phẩm', value: 40, tone: S1 },
        { label: 'Hàng tiêu dùng', value: 28, tone: S1 },
        { label: 'Bán lẻ', value: 18, tone: S1 },
        { label: 'Thép', value: 10, tone: S1 },
        { label: 'Phân phối xăng dầu', value: 5, tone: S1 },
      ],
      unit: '%',
    }),
  'c10l4-g3': () =>
    lines({
      title: 'Ổn định và suy giảm · %',
      labels: Q8,
      series: [
        {
          name: 'Doanh nghiệp A · biên gộp ổn định',
          values: [26.1, 26.4, 25.8, 26.2, 26.5, 26.0, 26.3, 26.4],
          tone: UP,
        },
        {
          name: 'Doanh nghiệp B · biên gộp giảm',
          values: [28.2, 27.5, 26.4, 25.1, 23.8, 22.0, 20.6, 19.3],
          tone: DN,
        },
      ],
      unit: '%',
    }),

  /* ---------------------------------------------------------- Bài 5 · Biên lợi nhuận ròng */
  'c10l5-g1': () =>
    wf({
      steps: [
        { label: 'Doanh thu', value: 100, kind: 'base', tone: S1, decimals: 0 },
        { label: 'Giá vốn', value: 74.1, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Lợi nhuận gộp', value: 25.9, kind: 'total', tone: S2, decimals: 1 },
        { label: 'Chi phí bán hàng, quản lý', value: 12.8, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Lãi vay', value: 1.5, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Thuế', value: 2.3, kind: 'sub', tone: DN, decimals: 1 },
        { label: 'Lợi nhuận sau thuế', value: 9.3, kind: 'total', tone: UP, decimals: 1 },
      ],
      unit: '',
      alt: 'Từ 100 đồng doanh thu, trừ 74,1 đồng giá vốn còn 25,9 đồng lợi nhuận gộp, trừ 12,8 đồng chi phí bán hàng quản lý, 1,5 đồng lãi vay và 2,3 đồng thuế còn 9,3 đồng lợi nhuận sau thuế',
    }),
  'c10l5-g2': () =>
    lines({
      title: 'Biên gộp và biên ròng · %',
      labels: Q8,
      series: [
        { name: 'Biên gộp', values: [23.4, 23.9, 24.0, 24.4, 24.8, 25.2, 25.6, 25.9], tone: S2 },
        { name: 'Biên ròng', values: [6.9, 7.2, 7.4, 7.7, 8.2, 8.7, 9.1, 9.3], tone: S1 },
      ],
      unit: '%',
    }),
  'c10l5-g3': () =>
    bars({
      title: 'LNST theo quý · tỷ đồng',
      labels: Q8,
      series: [
        {
          name: 'LNST từ kinh doanh chính',
          values: [94, 106, 109, 128, 132, 147, 152, 154],
          tone: S1,
        },
        {
          name: 'Lãi bất thường',
          values: [null, null, null, null, 180, null, null, null],
          tone: GD,
        },
      ],
      stacked: true,
      unit: 'tỷ đồng',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 6 · Asset Turnover */
  'c10l6-g1': () =>
    hb({
      title: 'Doanh thu 4 quý so với tài sản bình quân',
      items: [
        { label: 'Doanh thu 4 quý', value: 6279, tone: S1 },
        { label: 'Tài sản bình quân', value: 6185, tone: S2 },
      ],
      unit: ' tỷ',
    }),
  'c10l6-g2': () =>
    bars({
      title: 'Hai mô hình cùng ROA 7,5%',
      labels: ['Siêu thị: lãi mỏng', 'Thủy điện: lãi dày'],
      series: [
        { name: 'Vòng quay tài sản', values: [3.0, 0.3], tone: S1 },
        { name: 'Biên lợi nhuận ròng', values: [2.5, 25], tone: S2 },
      ],
      unit: '',
      values: true,
    }),
  'c10l6-g3': () =>
    hb({
      title: 'Vòng quay tài sản tham khảo theo ngành · số minh họa',
      items: [
        { label: 'Phân phối', value: 3.0, tone: S1 },
        { label: 'Bán lẻ', value: 2.5, tone: S1 },
        { label: 'Sản xuất', value: 1.0, tone: S1 },
        { label: 'Bất động sản', value: 0.3, tone: S1 },
        { label: 'Điện', value: 0.3, tone: S1 },
      ],
      unit: ' lần',
      decimals: 1,
    }),

  /* ---------------------------------------------------------- Bài 7 · Cash Conversion Cycle */
  'c10l7-g1': () =>
    bars({
      title: 'Dòng thời gian một vòng tiền · ngày',
      labels: ['Tồn kho', 'Thu tiền', 'Trả tiền', 'CCC'],
      series: [
        { name: 'Số ngày', values: [61.7, 39.8, 54.3, 47.2], tone: S1 },
      ],
      unit: 'ngày',
      values: true,
    }),
  'c10l7-g2': () =>
    wf({
      steps: [
        { label: 'Ngày tồn kho', value: 61.7, kind: 'base', tone: S1, decimals: 1 },
        { label: 'Ngày thu tiền', value: 39.8, kind: 'add', tone: S2, decimals: 1 },
        { label: 'Ngày trả tiền', value: 54.3, kind: 'sub', tone: S3, decimals: 1 },
        { label: 'CCC', value: 47.2, kind: 'total', tone: GD, decimals: 1 },
      ],
      unit: ' ngày',
      alt: 'Chu kỳ chuyển đổi tiền mặt bằng 61,7 ngày tồn kho cộng 39,8 ngày thu tiền trừ 54,3 ngày trả tiền, bằng 47,2 ngày',
    }),
  'c10l7-g3': () =>
    hb({
      title: 'CCC tham khảo theo mô hình kinh doanh · số minh họa',
      items: [
        { label: 'Chuỗi siêu thị', value: -15, tone: UP },
        { label: 'Hàng tiêu dùng', value: 30, tone: S1 },
        { label: 'Sản xuất', value: 47, tone: S1 },
        { label: 'Xây dựng', value: 160, tone: S2 },
      ],
      unit: ' ngày',
    }),
};

export const CH10_BUILDERS: Record<string, Builder> = ch10;
export { OR, PK };
