import type { Block } from '../../../src/modules/academy/content/v3/schema.js';

/**
 * Mockup svg drawings that are really text (receipts, tables, step cards, tiles). They become HTML
 * blocks so they stay readable on a phone. Keys are the lowercased, chapter-prefixed chart ids.
 */
export const TEXT_FIGURES: Record<string, () => Block[]> = {
  'c1l3-g1': () => [
    {
      type: 'kv_cards',
      items: [
        {
          title: 'MUA',
          tone: 'pos',
          rows: [
            { label: 'Mã cổ phiếu', value: 'ABC' },
            { label: 'Khối lượng', value: '500' },
            { label: 'Giá', value: '25.150' },
            { label: 'Loại lệnh', value: 'LO' },
          ],
          total: { label: 'Giá trị lệnh', value: '12.575.000 đ', tone: 'info' },
        },
      ],
    },
  ],
  'c1l3-g4': () => {
    const buy = [
      ['25.100', '09:20', '1.000'],
      ['25.100', '09:31', '500'],
      ['25.050', '09:18', '2.000'],
    ];
    const sell = [
      ['25.150', '09:25', '800'],
      ['25.200', '09:16', '1.500'],
      ['25.250', '09:40', '600'],
    ];
    const cell = ([p, t, v]: string[], first: boolean) => {
      const text = `<b>${p}</b> · ${t} · ${v} cp`;
      return first ? { text, highlight: true as const } : text;
    };
    return [
      {
        type: 'table',
        variant: 'grid',
        columns: [
          { label: 'Thứ tự', align: 'c' },
          { label: 'Bên mua', tone: 'pos' },
          { label: 'Bên bán', tone: 'neg' },
        ],
        rows: buy.map((b, i) => ({
          cells: [String(i + 1), cell(b, i === 0), cell(sell[i] as string[], i === 0)],
        })),
        aria_label: 'Sổ lệnh: giá, thời gian đặt và khối lượng của bên mua và bên bán',
      },
    ];
  },
  'c1l4-g2': () => [
    {
      type: 'kv_cards',
      items: [
        {
          title: 'MUA',
          tone: 'pos',
          rows: [
            { label: '1.000 × 20.000', value: '20.000.000' },
            { label: 'Phí 0,15%', value: '+ 30.000' },
            { label: 'Thuế', value: '0' },
          ],
          total: { label: 'Tổng tiền trả', value: '20.030.000' },
        },
        {
          title: 'BÁN',
          tone: 'neg',
          rows: [
            { label: '1.000 × 22.000', value: '22.000.000' },
            { label: 'Phí 0,15%', value: '− 33.000' },
            { label: 'Thuế 0,1%', value: '− 22.000' },
          ],
          total: { label: 'Thực nhận', value: '21.945.000' },
        },
      ],
    },
  ],
  'c1l10-g4': () => [
    {
      type: 'steps',
      items: [
        { title: 'Rủi ro tối đa', text: '100 triệu × 2%', value: '2.000.000 đ' },
        { title: 'Rủi ro mỗi cổ phiếu', text: '20.000 − 18.600', value: '1.400 đ' },
        { title: 'Khối lượng mua', text: '2.000.000 ÷ 1.400', value: '≈ 1.400 cổ phiếu' },
      ],
    },
  ],
  'c1l10-g5': () => [
    {
      type: 'definitions',
      title: 'Kế hoạch trước khi mua',
      marker: 'check',
      items: [
        { term: 'Lý do mua', text: 'Điểm mạnh của doanh nghiệp' },
        { term: 'Điểm mua', text: 'Vùng giá dự kiến mua' },
        { term: 'Điểm cắt lỗ', text: 'Mức giá bán nếu nhận định sai' },
        { term: 'Mục tiêu', text: 'Mức giá chốt lời nếu nhận định đúng' },
        { term: 'Khối lượng', text: 'Số cổ phiếu theo mức rủi ro chấp nhận' },
      ],
    },
  ],
  'c2l1-g2': () => [
    {
      type: 'funnel',
      items: (
        [
          ['Traffic', '100 người được tiếp cận', 520, 'p1'],
          ['Tư vấn', '30 người trò chuyện sâu', 430, 'pos'],
          ['Chuyển đổi', '10 người mở tài khoản', 300, 'warn'],
          ['Chăm sóc', '7 khách giao dịch đều đặn', 190, 'p4'],
        ] as const
      ).map(([label, note, w, tone]) => ({
        label,
        note,
        pct: Math.round((w / 520) * 1000) / 10,
        tone,
      })),
    },
  ],
  'c4l9-g1': () => [
    {
      type: 'tiles',
      items: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((n) =>
        n === 13 || n === 34 || n === 55 || n === 89
          ? { glyph: String(n), highlight: true as const }
          : { glyph: String(n) },
      ),
      facts: [
        { label: '34 ÷ 55 ≈ 0,618', value: '61,8%' },
        { label: '34 ÷ 89 ≈ 0,382', value: '38,2%' },
        { label: '13 ÷ 55 ≈ 0,236', value: '23,6%' },
      ],
    },
  ],
  'c5l2-g3': () => [
    {
      type: 'formula',
      rows: [
        {
          label: 'EPS',
          a: 'Lợi nhuận sau thuế 200 tỷ',
          op: '÷',
          b: 'Số cổ phiếu 100 triệu',
          result: '2.000 đ',
        },
        { label: 'P/E', a: 'Giá cổ phiếu 24.000 đ', op: '÷', b: 'EPS 2.000 đ', result: '12 lần' },
        {
          label: 'P/B',
          a: 'Giá cổ phiếu 24.000 đ',
          op: '÷',
          b: 'Giá trị sổ sách mỗi cổ phiếu 16.000 đ',
          result: '1,5 lần',
        },
        {
          label: 'ROE',
          a: 'Lợi nhuận sau thuế 200 tỷ',
          op: '÷',
          b: 'Vốn chủ sở hữu 1.600 tỷ',
          result: '12,5%',
        },
      ],
    },
  ],
  'c5l3-g1': () => [
    {
      type: 'tiles',
      items: [
        { glyph: 'M1', title: 'Ý nghĩa', sub: 'Meaning · Hiểu doanh nghiệp' },
        { glyph: 'M2', title: 'Lợi thế cạnh tranh', sub: 'Moat · Có “con hào” bảo vệ' },
        { glyph: 'M3', title: 'Ban lãnh đạo', sub: 'Management · Minh bạch, vì cổ đông' },
        {
          glyph: 'M4',
          title: 'Biên an toàn',
          sub: 'Margin of Safety · Mua với giá rẻ',
          highlight: true,
        },
      ],
      groups: [
        { from: 0, to: 2, label: 'Doanh nghiệp tốt' },
        { from: 3, to: 3, label: 'Giá hợp lý' },
      ],
    },
  ],
  'c5l3-g3': () => [
    {
      type: 'steps',
      items: [
        { title: 'EPS hiện tại', value: '2.000 đ' },
        { title: 'EPS sau 10 năm', value: '≈ 6.200 đ', text: 'tăng 12%/năm' },
        { title: 'Giá sau 10 năm', value: '≈ 124.000 đ', text: '× P/E 20' },
        { title: 'Giá trị hợp lý', value: '≈ 30.700 đ', text: 'quy về hiện tại' },
        { title: 'Giá mua', value: '≈ 15.350 đ', text: '÷ 2' },
      ],
    },
  ],
  'c5l4-g0': () => [
    {
      type: 'steps',
      items: [
        { title: 'Thị trường', text: 'Kiểm tra chữ M' },
        { title: 'Lọc cổ phiếu', text: 'Theo C, A, L' },
        { title: 'Theo dõi nền', text: 'Kiểm tra N, I' },
        { title: 'Mua đúng điểm', text: 'Khối lượng theo S' },
        { title: 'Quản lý lệnh', text: 'Cắt lỗ, chốt lời' },
      ],
    },
  ],
  'c5l4-g1': () => [
    {
      type: 'tiles',
      items: [
        ['C', 'Lợi nhuận quý'],
        ['A', 'Lợi nhuận năm'],
        ['N', 'Cái mới'],
        ['S', 'Cung và cầu'],
        ['L', 'Dẫn đầu'],
        ['I', 'Tổ chức'],
        ['M', 'Thị trường chung'],
      ].map(([glyph, title]) => ({ glyph: glyph as string, title: title as string })),
      groups: [
        { from: 0, to: 2, label: 'Doanh nghiệp tăng trưởng' },
        { from: 3, to: 5, label: 'Sức mạnh cổ phiếu' },
        { from: 6, to: 6, label: 'Thời điểm' },
      ],
    },
  ],
};
