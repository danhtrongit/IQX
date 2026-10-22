/**
 * Chương 11 · Chỉ tiêu sức mạnh tài chính (D/E, Current Ratio, Interest Coverage, Net Debt/EBITDA).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3 (C11L1-g1 … C11L4-g4).
 */
import type { Builder } from './kit.js';
import { bars, formulaFlow, lines, zones, S1, S2, S3, UP, DN, GD, OR } from './fund.js';

const ch11: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · D/E */
  'c11l1-g1': () =>
    bars({
      title: 'Bảng cân đối: tổng tài sản 6.465 tỷ đồng',
      labels: ['Tổng tài sản', 'Nợ vay', 'Nợ khác', 'Vốn chủ sở hữu'],
      series: [
        { name: 'Tổng tài sản', values: [6465, null, null, null], tone: S1 },
        { name: 'Nợ vay', values: [null, 1100, null, null], tone: OR },
        { name: 'Nợ khác', values: [null, null, 896, null], tone: GD },
        { name: 'Vốn chủ sở hữu', values: [null, null, null, 4469], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c11l1-g2': () =>
    formulaFlow(
      [
        {
          id: 'no',
          title: 'Nợ vay · có trả lãi',
          value: '1.100 tỷ',
          tone: OR,
          children: [
            { title: 'Vay ngắn hạn ngân hàng' },
            { title: 'Vay dài hạn ngân hàng' },
            { title: 'Trái phiếu phát hành' },
          ],
        },
        {
          id: 'other',
          title: 'Nợ khác · không trả lãi',
          value: '896 tỷ',
          tone: GD,
          children: [
            { title: 'Phải trả nhà cung cấp' },
            { title: 'Người mua trả tiền trước' },
            { title: 'Lương, thuế còn phải trả' },
          ],
        },
      ],
      'D/E chỉ tính nợ vay có trả lãi là 1.100 tỷ; nợ khác 896 tỷ không trả lãi nên không tính vào D/E',
    ),
  'c11l1-g3': () =>
    bars({
      title: 'Đòn bẩy hai mặt · ROE %',
      labels: ['Năm thuận lợi', 'Năm khó khăn'],
      series: [
        { name: 'A · không vay', values: [15, 2], tone: S1 },
        { name: 'B · vay 50% tài sản', values: [20, -6], tone: OR },
      ],
      unit: '%',
      values: true,
    }),
  'c11l1-g4': () =>
    zones({
      min: 0,
      max: 2.5,
      segs: [
        [0, 0.5, 'Thấp', UP],
        [0.5, 1, 'Vừa phải', GD],
        [1, 2, 'Cao', OR],
        [2, 2.5, 'Rất cao', DN],
      ],
      ticks: [0, 0.5, 1, 2],
      mark: [0.25, 'Doanh nghiệp mẫu · 0,25'],
      unit: 'lần',
      alt: 'Thang tham chiếu D/E: dưới 0,5 lần là thấp, trên 2 lần là rất cao',
    }),

  /* ---------------------------------------------------------- Bài 2 · Current Ratio */
  'c11l2-g1': () =>
    bars({
      title: 'Tài sản ngắn hạn 2.445 so với nợ ngắn hạn 1.556 · Current Ratio = 2.445 ÷ 1.556 = 1,57 lần',
      labels: ['Tiền', 'Phải thu', 'Hàng tồn kho', 'Khác', 'Vay ngắn hạn', 'Phải trả người bán', 'Khác'],
      series: [
        { name: 'Tài sản ngắn hạn', values: [700, 730, 815, 200, null, null, null], tone: UP },
        { name: 'Nợ ngắn hạn', values: [null, null, null, null, 660, 748, 148], tone: DN },
      ],
      stacked: true,
      unit: 'tỷ đồng',
      values: true,
    }),
  'c11l2-g2': () =>
    bars({
      title: 'Chất lượng tài sản ngắn hạn · %',
      labels: ['Doanh nghiệp A · 1,5 lần', 'Doanh nghiệp B · 1,5 lần'],
      series: [
        { name: 'Tiền', values: [40, 5], tone: UP },
        { name: 'Phải thu', values: [40, 15], tone: S1 },
        { name: 'Tồn kho', values: [20, 80], tone: GD },
      ],
      stacked: true,
      unit: '%',
      values: true,
    }),
  'c11l2-g3': () =>
    zones({
      min: 0,
      max: 3.5,
      segs: [
        [0, 1, 'Thiếu hụt', DN],
        [1, 1.5, 'Cần theo dõi', OR],
        [1.5, 3, 'An toàn', UP],
        [3, 3.5, 'Dư thừa', GD],
      ],
      ticks: [0, 1, 1.5, 3],
      mark: [1.57, 'Doanh nghiệp mẫu · 1,57'],
      unit: 'lần',
      alt: 'Thang tham chiếu Current Ratio: dưới 1 lần là thiếu hụt, từ 1,5 đến 3 lần là an toàn',
    }),

  /* ---------------------------------------------------------- Bài 3 · Interest Coverage */
  'c11l3-g1': () =>
    bars({
      title: 'EBIT 4 quý 823 tỷ so với chi phí lãi vay 4 quý 93,5 tỷ',
      labels: ['EBIT', 'Chi phí lãi vay'],
      series: [
        { name: 'Số tiền', values: [823, 93.5], tone: S1 },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c11l3-g2': () =>
    lines({
      title: 'Số lần lãi vay được EBIT bảo phủ · lần',
      labels: ['Q1/24', 'Q2/24', 'Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25'],
      series: [
        { name: 'Tính từng quý', values: [2.75, 4.25, 5.25, 8.5, 3, 4.5, 5.5, 9], tone: GD },
        { name: 'Tính 4 quý', values: [3.94, 5.31, 6.56, 8.44, 4.25, 5.44, 6.5, 8.5], tone: S1 },
      ],
      unit: 'lần',
    }),
  'c11l3-g3': () =>
    bars({
      title: 'Khả năng chịu đựng · lần',
      labels: ['Doanh nghiệp A', 'Doanh nghiệp B'],
      series: [
        { name: 'Bình thường', values: [8, 2], tone: S1 },
        { name: 'EBIT giảm 40%', values: [4.8, 1.2], tone: OR },
      ],
      unit: 'lần',
      values: true,
    }),
  'c11l3-g4': () =>
    zones({
      min: 0,
      max: 10,
      segs: [
        [0, 1.5, 'Nguy hiểm', DN],
        [1.5, 3, 'Cần theo dõi', OR],
        [3, 5, 'Ổn', GD],
        [5, 10, 'An toàn', UP],
      ],
      ticks: [0, 1.5, 3, 5, 10],
      mark: [8.8, 'Doanh nghiệp mẫu · 8,8'],
      unit: 'lần',
      alt: 'Thang tham chiếu Interest Coverage: dưới 1,5 lần là nguy hiểm, trên 5 lần là an toàn',
    }),

  /* ---------------------------------------------------------- Bài 4 · Net Debt / EBITDA */
  'c11l4-g1': () =>
    formulaFlow(
      [
        {
          id: 'net-debt',
          title: 'Nợ ròng',
          value: '400 tỷ',
          sub: 'Nợ vay 1.100 trừ tiền 700',
          tone: OR,
        },
        {
          id: 'ebitda',
          title: 'EBITDA 4 quý',
          value: '1.016 tỷ',
          sub: 'EBIT 823 cộng khấu hao 192',
          tone: S1,
        },
        {
          id: 'ratio',
          title: 'Net Debt / EBITDA',
          value: '0,39 lần',
          tone: GD,
          emph: true,
        },
      ],
      'Net Debt chia EBITDA bằng nợ ròng 400 tỷ chia EBITDA 4 quý 1.016 tỷ, bằng 0,39 lần',
    ),
  'c11l4-g2': () =>
    bars({
      title: 'Nợ ròng dương và nợ ròng âm · tỷ đồng',
      labels: ['Doanh nghiệp mẫu', 'Doanh nghiệp B'],
      series: [
        { name: 'Nợ vay', values: [1100, 300], tone: OR },
        { name: 'Tiền', values: [700, 800], tone: UP },
      ],
      unit: 'tỷ đồng',
      values: true,
    }),
  'c11l4-g3': () =>
    bars({
      title: 'Số năm EBITDA để trả nợ ròng · lần',
      labels: ['Doanh nghiệp mẫu', 'Doanh nghiệp C', 'Doanh nghiệp D'],
      series: [
        { name: 'Chỉ tiêu', values: [0.39, 4.8, 2.5], tone: S1 },
      ],
      unit: 'lần',
      values: true,
    }),
  'c11l4-g4': () =>
    zones({
      min: -1,
      max: 5,
      segs: [
        [-1, 0, 'Tiền ròng', S3],
        [0, 2, 'Thấp', UP],
        [2, 3, 'Vừa phải', GD],
        [3, 4, 'Cao', OR],
        [4, 5, 'Rủi ro', DN],
      ],
      ticks: [0, 2, 3, 4],
      mark: [0.39, 'Doanh nghiệp mẫu · 0,39'],
      unit: 'lần',
      alt: 'Thang tham chiếu Net Debt trên EBITDA: âm là tiền ròng, trên 4 lần là rủi ro',
    }),
};

export const CH11_BUILDERS: Record<string, Builder> = ch11;
export { S2 };
