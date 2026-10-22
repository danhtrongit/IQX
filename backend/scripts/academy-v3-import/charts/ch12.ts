/**
 * Chương 12 · Chỉ tiêu dòng tiền (CFO Margin, CFO/LNST, Capex/Doanh thu, FCF Margin, chuỗi FCF).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C12L1-g1 … C12L5-g3).
 */
import type { Builder } from './kit.js';
import {
  bars,
  formulaFlow,
  lines,
  wf,
  zones,
  S1,
  S2,
  S3,
  UP,
  DN,
  GD,
  OR,
  PK,
} from './fund.js';

const ch12: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · CFO Margin */
  'c12l1-g1': () =>
    formulaFlow(
      [
        {
          id: 'cfo',
          title: 'Kinh doanh · CFO',
          value: 'Thường dương',
          tone: UP,
          children: [
            { title: 'Thu tiền bán hàng' },
            { title: 'Trả nhà cung cấp' },
            { title: 'Trả lương nhân viên' },
            { title: 'Trả lãi vay, nộp thuế' },
          ],
        },
        {
          id: 'cfi',
          title: 'Đầu tư · CFI',
          value: 'Thường âm khi đang đầu tư',
          tone: GD,
          children: [
            { title: 'Mua nhà xưởng, máy móc' },
            { title: 'Góp vốn, cho vay' },
            { title: 'Bán tài sản cố định' },
            { title: 'Thu lãi, cổ tức' },
          ],
        },
        {
          id: 'cff',
          title: 'Tài chính · CFF',
          value: 'Âm khi trả nợ, trả cổ tức',
          tone: S1,
          children: [
            { title: 'Vay ngân hàng' },
            { title: 'Phát hành cổ phiếu' },
            { title: 'Trả nợ gốc vay' },
            { title: 'Trả cổ tức' },
          ],
        },
      ],
      'Ba dòng tiền trong báo cáo lưu chuyển tiền tệ: CFO thường dương ở doanh nghiệp tốt, CFI thường âm khi đang đầu tư và CFF âm khi trả nợ, trả cổ tức',
    ),
  'c12l1-g2': () =>
    wf({
      steps: [
        { label: 'LNST', value: 100, kind: 'base', tone: S2 },
        { label: 'Khấu hao', value: 30, kind: 'add', tone: UP },
        { label: 'Tăng phải thu', value: 35, kind: 'sub', tone: DN },
        { label: 'Tăng tồn kho', value: 15, kind: 'sub', tone: DN },
        { label: 'Tăng phải trả', value: 10, kind: 'add', tone: UP },
        { label: 'CFO', value: 90, kind: 'total', tone: S1 },
      ],
      unit: 'tỷ đồng',
      alt: 'Từ LNST 100 tỷ đồng, cộng khấu hao 30, trừ tăng phải thu 35 và tăng tồn kho 15, cộng tăng phải trả 10, còn CFO 90 tỷ đồng',
    }),
  'c12l1-g3': () =>
    formulaFlow(
      [
        {
          id: 'revenue',
          title: 'Doanh thu 4 quý gần nhất',
          value: '1.000 tỷ',
          tone: 'p3',
        },
        {
          id: 'cfo',
          title: 'CFO 4 quý gần nhất',
          value: '120 tỷ',
          tone: UP,
        },
        {
          id: 'margin',
          title: 'CFO Margin',
          value: '12%',
          sub: '12 đồng tiền trên 100 đồng doanh thu',
          tone: GD,
          emph: true,
        },
      ],
      'CFO Margin bằng CFO 120 tỷ chia doanh thu 1.000 tỷ, bằng 12%',
    ),
  'c12l1-g4': () =>
    lines({
      title: 'Biên lợi nhuận ròng so với CFO Margin · %',
      labels: ['Q1/24', 'Q2/24', 'Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25'],
      series: [
        { name: 'Biên lợi nhuận ròng', values: [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5], tone: GD },
        { name: 'CFO Margin', values: [10, 9.6, 8.4, 7.2, 5.8, 4.5, 3.2, 2.2], tone: S1 },
      ],
      unit: '%',
    }),

  /* ---------------------------------------------------------- Bài 2 · CFO / LNST */
  'c12l2-g1': () =>
    bars({
      title: 'Hai doanh nghiệp cùng LNST, khác CFO · tỷ đồng',
      labels: ['Doanh nghiệp A', 'Doanh nghiệp B'],
      series: [
        { name: 'LNST', values: [100, 100], tone: S2 },
        { name: 'CFO', values: [130, 40], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c12l2-g2': () =>
    zones({
      min: 0,
      max: 2,
      segs: [
        [0, 0.5, 'Lợi nhuận trên giấy', DN],
        [0.5, 1, 'Cần theo dõi', GD],
        [1, 2, 'Có tiền thật', UP],
      ],
      ticks: [0, 0.5, 1, 1.5, 2],
      mark: [0.4, 'Doanh nghiệp B · 0,4'],
      alt: 'Thang tham chiếu CFO trên LNST: dưới 0,5 lần là lợi nhuận trên giấy, từ 1 lần là có tiền thật',
    }),
  'c12l2-g3': () =>
    bars({
      title: 'LNST tăng, CFO không theo · tỷ đồng',
      labels: ['Năm 1', 'Năm 2', 'Năm 3', 'Năm 4', 'Năm 5'],
      series: [
        { name: 'LNST', values: [150, 180, 220, 270, 340], tone: S2 },
        { name: 'CFO', values: [165, 175, 170, 150, 120], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 3 · Capex / Revenue */
  'c12l3-g1': () =>
    formulaFlow(
      [
        { id: 'cfo', title: 'CFO', value: 'Tiền thu từ kinh doanh', tone: UP },
        { id: 'capex', title: 'Capex', value: 'Chi mua nhà xưởng, máy móc', tone: S2 },
        {
          id: 'fixed',
          title: 'Tài sản cố định',
          value: 'Dùng trong nhiều năm',
          tone: GD,
        },
        {
          id: 'revenue',
          title: 'Doanh thu',
          value: 'Tạo ra trong các năm sau',
          tone: S1,
        },
      ],
      'Dòng chảy của Capex: CFO tạo ra tiền, Capex dùng tiền mua tài sản cố định, tài sản cố định phân bổ dần qua khấu hao và tạo ra doanh thu trong các năm sau',
    ),
  'c12l3-g2': () =>
    bars({
      title: 'Capex trên doanh thu, mức thường gặp · %',
      labels: [
        'Phân phối, bán lẻ',
        'Phần mềm, dịch vụ',
        'Thực phẩm, đồ uống',
        'Thép, xi măng',
        'Điện, hạ tầng',
      ],
      series: [
        { name: 'Mức thấp', values: [1, 2, 3, 6, 15], tone: S3 },
        { name: 'Mức cao', values: [3, 5, 7, 12, 30], tone: DN },
      ],
      unit: '%',
      values: true,
    }),
  'c12l3-g3': () =>
    bars({
      title: 'Chu kỳ đầu tư: doanh thu và Capex trên doanh thu',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        { name: 'Doanh thu, tỷ đồng', values: [1000, 1040, 1070, 1090, 1420, 1700, 1880], tone: S1 },
        { name: 'Capex trên doanh thu, %', values: [4, 5, 14, 16, 6, 5, 5], tone: S2 },
      ],
      unit: '',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 4 · FCF Margin */
  'c12l4-g1': () =>
    bars({
      title: 'CFO trừ Capex bằng FCF · tỷ đồng',
      labels: ['CFO', 'Capex', 'FCF'],
      series: [
        { name: 'Số tiền', values: [120, 40, 80], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c12l4-g2': () =>
    formulaFlow(
      [
        { id: 'fcf', title: 'FCF dương', value: 'Tiền tự do', tone: S3 },
        {
          id: 'uses',
          title: 'Dùng FCF vào đâu',
          value: 'Bốn lựa chọn',
          tone: 'p3',
          children: [
            { title: 'Trả cổ tức tiền mặt' },
            { title: 'Trả nợ vay' },
            { title: 'Mua lại cổ phiếu' },
            { title: 'Tích lũy, đầu tư thêm' },
          ],
        },
      ],
      'FCF dương là tiền tự do, dùng để trả cổ tức tiền mặt, trả nợ vay, mua lại cổ phiếu hoặc tích lũy đầu tư thêm',
    ),
  'c12l4-g3': () =>
    bars({
      title: 'Cùng biên lợi nhuận, khác FCF · %',
      labels: ['Doanh nghiệp A', 'Doanh nghiệp B'],
      series: [
        { name: 'Biên lợi nhuận ròng', values: [10, 10], tone: GD },
        { name: 'CFO Margin', values: [13, 9], tone: S1 },
        { name: 'FCF Margin', values: [9, -4], tone: S3 },
      ],
      unit: '%',
      values: true,
    }),

  /* ---------------------------------------------------------- Bài 5 · FCF Positive Streak */
  'c12l5-g1': () =>
    bars({
      title: 'FCF tăng trưởng qua các năm · tỷ đồng',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        {
          name: 'FCF',
          values: [150, -80, 60, -40, 120, 180, 210],
          tone: S1,
          toneBySign: { pos: S1, neg: DN },
        },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c12l5-g2': () =>
    bars({
      title: 'Cách đếm chuỗi FCF dương liên tiếp',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        {
          name: 'Doanh nghiệp A',
          values: [1, 1, 1, -1, 1, 1, 1],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
        {
          name: 'Doanh nghiệp B',
          values: [-1, -1, 1, 1, 1, 1, 1],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
        {
          name: 'Doanh nghiệp C',
          values: [1, 1, 1, 1, 1, 1, -1],
          tone: UP,
          toneBySign: { pos: UP, neg: DN },
        },
      ],
      unit: '1 là dương, 0 là âm',
    }),
  'c12l5-g3': () =>
    bars({
      title: 'Chuỗi dài nhưng khác độ lớn · tỷ đồng',
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        { name: 'Doanh nghiệp A', values: [8, 10, 6, 9, 7, 11, 10], tone: S1 },
        { name: 'Doanh nghiệp B', values: [150, 170, 160, 190, 210, 230, 250], tone: S1 },
      ],
      unit: 'tỷ đồng',
    }),
};

export const CH12_BUILDERS: Record<string, Builder> = ch12;
export { OR, PK };
