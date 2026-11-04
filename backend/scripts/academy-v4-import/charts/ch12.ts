/**
 * Chương 12 (v4, Phân tích công ty bảo hiểm): builder của các biểu đồ mà page script của bản mẫu v4 vẽ cho chương này.
 * Khóa = id svg viết thường (vd. `c12l1-g1`). Số liệu port nguyên văn từ C12L1-g1 … C12L8-g3 (kể cả giá trị mà script
 * tự tính), cùng quy ước với `fund.ts`:
 *
 * - `card()` + `opr()`        -> `flow` (hộp công thức; toán tử `÷`, `=` thành nhãn của mũi tên nối hai hộp)
 * - `bars()` / `lines()`      -> `category`
 * - `wf()`                    -> `schematic` (cột bậc thang), thêm tiêu đề trục y cho dòng chú thích của bản mẫu
 * - `zones()`                 -> `scale`
 * - panel + thanh ngang       -> `compare` của `segment_bar` / `category` ngang (thông điệp = nhãn bracket / caption)
 * - các hình vẽ tay còn lại   -> `segment_bar`, `category` xếp chồng, `flow` hoặc `schematic` gần nhất
 */
import type { ChartTone } from '../../../src/modules/academy/content/v4/schema.js';
import type {
  Builder,
  Category,
  Flow,
  Layer,
  LegendItem,
  Model,
  Scale,
  Schematic,
  SegmentBar,
} from './kit.js';
import { tone } from './tones.js';
import type { FlowCard, HbItem } from './fund.js';
import {
  bars,
  fmtNum,
  formulaFlow,
  hb,
  lines,
  wf,
  DN,
  GD,
  OR,
  P3,
  PK,
  S1,
  S2,
  S3,
  UP,
} from './fund.js';

/** `BL` của bản mẫu (#249bec). */
const BL = tone('#249bec');
/** Tô nền của `Nợ khác` (BOXL #24344a) là màu bề mặt, không có tone: dùng tone trung tính. */
const NEUTRAL: ChartTone = 'neutral';

type CaptionTone = NonNullable<Category['caption_tone']>;

/* ------------------------------------------------------------------ helper dùng riêng cho chương 12 */

/** Hộp `card()` của bản mẫu: tiêu đề, số lớn, ghi chú (các dòng ghi chú gộp thành một câu). */
const card = (id: string, title: string, value: string, tn: ChartTone, sub?: string): FlowCard => ({
  id,
  title,
  value,
  tone: tn,
  ...(sub ? { sub } : {}),
});

/**
 * Công thức `card() opr() card() opr() card()` -> `flow` ba hộp. Toán tử (`÷`, `=`) thành nhãn của mũi tên
 * nối hai hộp; `null` là toán tử `→` của bản mẫu (mũi tên đã do renderer vẽ).
 */
function formula(cards: readonly FlowCard[], ops: readonly (string | null)[], alt: string): Flow {
  const base = formulaFlow(cards, alt);
  return {
    ...base,
    edges: cards.slice(1).map((c, i) => ({
      from: (cards[i] as FlowCard).id,
      to: c.id,
      ...(ops[i] ? { label: ops[i] as string } : {}),
    })),
  };
}

/** `wf()` + dòng chú thích đơn vị mà bản mẫu vẽ ở góc trên bên phải (thành tiêu đề trục y). */
function waterfall(model: Schematic, unitNote: string): Schematic {
  return {
    ...model,
    axes: { ...model.axes, y: { ...model.axes?.y, title: unitNote } },
  };
}

/** `zones()` của chương 12: các vùng, nhãn ở các mốc biên có hậu tố `%` và vạch chỉ báo màu vàng. */
function zoneScale(
  lo: number,
  hi: number,
  segs: readonly (readonly [number, number, ChartTone, string])[],
  mark: readonly [number, string],
  alt: string,
): Scale {
  const edges = [lo, ...segs.map((z) => z[1])];
  return {
    kind: 'scale',
    orientation: 'h',
    domain: [lo, hi],
    ticks: edges.map((v) => ({ v, label: `${fmtNum(v)}%` })),
    zones: segs.map(([from, to, tn, label]) => ({ from, to, tone: tn, label })),
    markers: [{ v: mark[0], label: mark[1], tone: GD, side: 'a' }],
    alt,
  };
}

/** Thanh ngang của một panel (tên series, thông điệp dưới biểu đồ, thang chung tùy chọn). */
function hbPanel(
  items: readonly HbItem[],
  unit: string,
  name: string,
  message: string,
  messageTone: CaptionTone,
  bounds?: [number, number],
): Category {
  const m = hb({ items, unit });
  return {
    ...m,
    series: m.series.map((s) => ({ ...s, name })),
    ...(bounds ? { bounds } : {}),
    caption_value: message,
    caption_tone: messageTone,
  };
}

const indexes = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/* ------------------------------------------------------------------ builders */

export const CH12_BUILDERS: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · Tăng trưởng doanh thu phí bảo hiểm gốc */
  'c12l1-g1': () =>
    formula(
      [
        card('phi-q2-26', 'Phí gốc Q2/26', '3.255 tỷ', BL, 'Quý này'),
        card('phi-q2-25', 'Phí gốc Q2/25', '2.933 tỷ', GD, 'Cùng quý năm trước'),
        card('tang-truong', 'Tăng trưởng', '+11,0%', UP, '3.255 ÷ 2.933 − 1 · so với cùng kỳ'),
      ],
      ['÷', null],
      'Tăng trưởng phí bảo hiểm gốc: phí gốc Q2/26 là 3.255 tỷ chia phí gốc Q2/25 là 2.933 tỷ rồi trừ 1, bằng tăng 11,0% so với cùng kỳ',
    ),
  'c12l1-g2': (): Schematic => {
    const v = [2929, 3277, 3114, 2933, 3306, 3656, 3449, 3255];
    const labels = ['Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25', 'Q1/26', 'Q2/26'];
    const highlight = (i: number): boolean => i === 3 || i === 6 || i === 7;
    const layers: Layer[] = [
      {
        t: 'bars',
        x: indexes(v.length),
        h: v,
        tones: v.map((_, i): ChartTone => (highlight(i) ? S1 : P3)),
        base: 0,
      },
      { t: 'bracket', x: [3, 7], y: 5100, label: '+11,0% so với cùng kỳ', tone: UP },
      { t: 'bracket', x: [6, 7], y: 4400, label: '−5,6% so với quý trước', tone: DN },
    ];
    return {
      kind: 'schematic',
      domain: { x: [-0.5, 7.5], y: [0, 5700] },
      axes: {
        x: { ticks: labels.map((label, i) => ({ v: i, label })) },
        y: { ticks: [0, 1000, 2000, 3000, 4000].map((t) => ({ v: t, label: fmtNum(t) })) },
      },
      layers,
      alt: 'Phí bảo hiểm gốc 8 quý từ Q3/24 đến Q2/26 có tính mùa vụ. Q2/26 đạt 3.255 tỷ, tăng 11,0% so với cùng kỳ Q2/25 là 2.933 tỷ nhưng giảm 5,6% so với quý trước Q1/26 là 3.449 tỷ',
    };
  },
  'c12l1-g3': (): Model<'compare'> => {
    const panel = (
      growth: number,
      claims: number,
      message: string,
      tn: ChartTone,
      alt: string,
    ): SegmentBar => ({
      kind: 'segment_bar',
      unit: '%',
      max: 100,
      rows: [
        {
          label: 'Tăng trưởng phí',
          segments: [{ value: growth, tone: BL }],
          total: { text: `+${growth}%` },
        },
        {
          label: 'Tỷ lệ bồi thường',
          segments: [{ value: claims, tone: OR }],
          total: { text: `${claims}%` },
        },
      ],
      brackets: [{ row: 1, from: 0, to: 100, label: message, tone: tn }],
      alt,
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Công ty A · phí tăng nhanh',
          tone: DN,
          model: panel(
            25,
            72,
            'Tăng nhờ hạ phí, bồi thường tăng vọt',
            DN,
            'Công ty A có phí tăng 25% nhưng tỷ lệ bồi thường lên 72%: tăng nhờ hạ phí nên bồi thường tăng vọt',
          ),
        },
        {
          title: 'Công ty B · phí tăng đều',
          tone: UP,
          model: panel(
            11,
            54,
            'Tăng vừa phải, giữ được chất lượng',
            UP,
            'Công ty B có phí tăng 11% và tỷ lệ bồi thường 54%: tăng vừa phải và giữ được chất lượng',
          ),
        },
      ],
    };
  },

  /* ---------------------------------------------------------- Bài 2 · Tỷ lệ giữ lại */
  'c12l2-g1': (): SegmentBar => ({
    kind: 'segment_bar',
    unit: 'tỷ đồng',
    max: 13665,
    rows: [
      {
        label: 'Phí bảo hiểm gốc 4 quý · 13.665 tỷ',
        total: { text: 'Tỷ lệ giữ lại = 8.119 ÷ 13.665 ≈ 59,4%', tone: GD },
        segments: [
          { value: 8119, label: 'Giữ lại · 8.119 tỷ', sub: '59,4%', tone: S1 },
          { value: 5546, label: 'Nhượng tái · 5.546 tỷ', sub: '40,6%', tone: S2 },
        ],
      },
    ],
    brackets: [
      { row: 0, from: 0, to: 8119, label: 'Doanh thu phí bảo hiểm thuần', tone: BL },
      { row: 0, from: 8119, to: 13665, label: 'Phí nhượng tái bảo hiểm', tone: OR },
    ],
    alt: 'Phí bảo hiểm gốc 4 quý là 13.665 tỷ, gồm 8.119 tỷ giữ lại (59,4%) trở thành doanh thu phí bảo hiểm thuần và 5.546 tỷ nhượng tái (40,6%). Tỷ lệ giữ lại bằng 8.119 chia 13.665, khoảng 59,4%',
  }),
  'c12l2-g2': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        title: 'Ví dụ trên 100 đồng phí gốc, công ty giữ lại 60%',
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            { id: 'khach-hang', title: 'Khách hàng', sub: 'Mua bảo hiểm' },
            { id: 'cong-ty-bao-hiem', title: 'Công ty bảo hiểm', sub: 'Giữ lại 60 đồng', tone: BL },
            { id: 'nha-tai-bao-hiem', title: 'Nhà tái bảo hiểm', sub: 'Nhận 40 đồng', tone: GD },
          ],
          edges: [
            { from: 'khach-hang', to: 'cong-ty-bao-hiem', label: 'Phí gốc 100' },
            { from: 'cong-ty-bao-hiem', to: 'khach-hang', label: 'Bồi thường 50' },
            { from: 'cong-ty-bao-hiem', to: 'nha-tai-bao-hiem', label: 'Phí nhượng 40' },
            { from: 'nha-tai-bao-hiem', to: 'cong-ty-bao-hiem', label: 'Thu đòi 20' },
          ],
          alt: 'Dòng tiền tái bảo hiểm trên 100 đồng phí gốc: khách hàng trả phí gốc 100 cho công ty bảo hiểm, công ty giữ lại 60 và nhượng 40 cho nhà tái bảo hiểm. Khi bồi thường 50 cho khách, công ty thu đòi 20 từ nhà tái bảo hiểm',
        },
      },
      {
        model: {
          kind: 'segment_bar',
          unit: 'đồng',
          max: 50,
          rows: [
            {
              label: 'Khi tổn thất 50 đồng',
              segments: [
                { value: 30, label: 'Công ty gánh 30', tone: BL },
                { value: 20, label: 'Nhà tái bảo hiểm gánh 20', tone: GD },
              ],
            },
          ],
          alt: 'Khi tổn thất 50 đồng, công ty gánh 30 đồng và nhà tái bảo hiểm gánh 20 đồng',
        },
      },
    ],
  }),
  'c12l2-g3': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'row',
    title: 'Một vụ tổn thất lớn 1.000 tỷ',
    items: [
      {
        title: 'Giữ lại 85%',
        tone: GD,
        model: hbPanel(
          [
            { label: 'Công ty tự chịu', value: 850, tone: OR },
            { label: 'Tái bảo hiểm chịu', value: 150, tone: S1 },
          ],
          'tỷ',
          'Phần tổn thất 1.000 tỷ',
          'Lãi lớn khi êm, lỗ nặng khi có sự cố',
          'warn',
          [0, 1000],
        ),
      },
      {
        title: 'Giữ lại 35%',
        tone: BL,
        model: hbPanel(
          [
            { label: 'Công ty tự chịu', value: 350, tone: OR },
            { label: 'Tái bảo hiểm chịu', value: 650, tone: S1 },
          ],
          'tỷ',
          'Phần tổn thất 1.000 tỷ',
          'Lãi nhỏ hơn, kết quả ổn định hơn',
          'p1',
          [0, 1000],
        ),
      },
    ],
  }),

  /* ---------------------------------------------------------- Bài 3 · Tỷ lệ bồi thường */
  'c12l3-g1': () =>
    formula(
      [
        card(
          'boi-thuong-thuan',
          'Bồi thường thuần 4 quý',
          '4.614 tỷ',
          OR,
          'Sau thu đòi tái bảo hiểm',
        ),
        card('phi-thuan', 'Phí thuần 4 quý', '8.119 tỷ', BL, 'Phí đã giữ lại'),
        card(
          'ty-le-boi-thuong',
          'Tỷ lệ bồi thường',
          '56,8%',
          GD,
          '100 đồng phí thuần trả 56,8 đồng bồi thường',
        ),
      ],
      ['÷', '='],
      'Tỷ lệ bồi thường bằng bồi thường thuần 4 quý 4.614 tỷ chia phí thuần 4 quý 8.119 tỷ, bằng 56,8%: 100 đồng phí thuần trả 56,8 đồng bồi thường',
    ),
  'c12l3-g2': () =>
    waterfall(
      wf({
        steps: [
          { label: 'Tổng chi|bồi thường', value: 6900, kind: 'base', tone: S2 },
          { label: 'Thu đòi|tái bảo hiểm', value: 2286, kind: 'sub', tone: UP },
          { label: 'Bồi thường|thuần', value: 4614, kind: 'total', tone: OR },
        ],
        unit: 'tỷ đồng',
        alt: 'Từ tổng chi bồi thường 6.900 tỷ đồng, trừ thu đòi tái bảo hiểm 2.286 tỷ, còn bồi thường thuần 4.614 tỷ đồng (4 quý, số minh họa)',
      }),
      'Tỷ đồng · 4 quý · số minh họa',
    ),
  'c12l3-g3': () =>
    zoneScale(
      30,
      80,
      [
        [30, 40, BL, 'Thấp'],
        [40, 55, UP, 'Tốt'],
        [55, 65, GD, 'Cần theo dõi'],
        [65, 80, DN, 'Cao'],
      ],
      [56.8, 'Công ty mẫu 56,8%'],
      'Tỷ lệ bồi thường phi nhân thọ, mức tham khảo: dưới 40% là thấp, 40 đến 55% là tốt, 55 đến 65% cần theo dõi, trên 65% là cao. Công ty mẫu ở 56,8%',
    ),
  'c12l3-g4': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Phi nhân thọ',
        tone: BL,
        model: {
          kind: 'segment_bar',
          max: 1,
          rows: [
            {
              label: 'Chi trả khi có tổn thất',
              sub: 'Hợp đồng thường kéo dài 1 năm',
              segments: [{ value: 1, label: 'Bồi thường tổn thất', tone: S2 }],
            },
          ],
          brackets: [
            { row: 0, from: 0, to: 1, label: 'Tỷ lệ cao: phí bán ra quá thấp', tone: 'price' },
          ],
          alt: 'Phi nhân thọ chi trả khi có tổn thất, hợp đồng thường kéo dài 1 năm, nên tỷ lệ bồi thường cao nghĩa là phí bán ra quá thấp',
        },
      },
      {
        title: 'Nhân thọ',
        tone: GD,
        model: {
          kind: 'segment_bar',
          max: 1,
          rows: [
            {
              label: 'Chi trả cả khi hợp đồng đáo hạn',
              sub: 'Hợp đồng kéo dài nhiều năm',
              segments: [
                { value: 0.45, label: 'Đáo hạn', tone: S1 },
                { value: 0.3, label: 'Tiết kiệm', tone: S3 },
                { value: 0.25, label: 'Rủi ro', tone: S2 },
              ],
            },
          ],
          brackets: [
            { row: 0, from: 0, to: 1, label: 'Tỷ lệ cao chưa chắc là xấu', tone: 'price' },
          ],
          alt: 'Nhân thọ chi trả cả khi hợp đồng đáo hạn gồm đáo hạn, tiết kiệm và rủi ro, hợp đồng kéo dài nhiều năm, nên tỷ lệ chi trả cao chưa chắc là xấu',
        },
      },
    ],
  }),

  /* ---------------------------------------------------------- Bài 4 · Tỷ lệ chi phí */
  'c12l4-g1': () =>
    formula(
      [
        card('chi-phi', 'Chi phí 4 quý', '3.354 tỷ', PK, 'Kinh doanh và quản lý'),
        card('phi-thuan', 'Phí thuần 4 quý', '8.119 tỷ', BL, 'Phí đã giữ lại'),
        card(
          'ty-le-chi-phi',
          'Tỷ lệ chi phí',
          '41,3%',
          GD,
          '100 đồng phí thuần tốn 41,3 đồng chi phí',
        ),
      ],
      ['÷', '='],
      'Tỷ lệ chi phí bằng chi phí 4 quý 3.354 tỷ chia phí thuần 4 quý 8.119 tỷ, bằng 41,3%: 100 đồng phí thuần tốn 41,3 đồng chi phí',
    ),
  'c12l4-g2': (): Category => ({
    kind: 'category',
    mode: 'stacked',
    labels: ['Phí bảo hiểm thuần', 'Chi phí KD và quản lý'],
    unit: 'tỷ đồng',
    series: [
      { name: 'Phí bảo hiểm thuần', values: [8119, null], tone: S1 },
      { name: 'Chi phí khác KD bảo hiểm · 2.030', values: [null, 2030], tone: GD },
      { name: 'Bán hàng và quản lý · 1.324', values: [null, 1324], tone: PK },
    ],
    value_labels: 'all',
    value_format: { suffix: ' tỷ' },
    caption_value: 'Chi phí bằng 41,3% phí bảo hiểm thuần',
    caption_tone: 'warn',
  }),
  'c12l4-g3': (): SegmentBar => ({
    kind: 'segment_bar',
    unit: 'đồng',
    max: 100,
    rows: [
      {
        label: '100 đồng phí thuần của công ty mẫu được dùng như sau',
        segments: [
          { value: 56.8, label: 'Bồi thường 56,8 đồng', tone: S1 },
          { value: 41.3, label: 'Chi phí 41,3 đồng', tone: S2 },
          { value: 1.9, label: 'Lãi nghiệp vụ 1,9 đồng', tone: UP },
        ],
      },
    ],
    brackets: [
      { row: 0, from: 0, to: 98.1, label: 'Bồi thường + chi phí = combined ratio 98,1%', tone: GD },
    ],
    alt: '100 đồng phí thuần của công ty mẫu: 56,8 đồng bồi thường, 41,3 đồng chi phí và 1,9 đồng lãi nghiệp vụ. Bồi thường cộng chi phí là combined ratio 98,1%',
  }),

  /* ---------------------------------------------------------- Bài 5 · Combined ratio */
  'c12l5-g1': (): Category => ({
    kind: 'category',
    mode: 'stacked',
    title: 'Công ty mẫu · 4 quý đến Q2/26',
    labels: ['Combined ratio'],
    unit: '%',
    series: [
      { name: 'Bồi thường 56,8%', values: [56.8], tone: S1 },
      { name: 'Chi phí 41,3%', values: [41.3], tone: S2 },
    ],
    value_labels: 'all',
    value_format: { suffix: '%', decimals: 1 },
    threshold: { value: 100, label: 'Mốc 100%' },
    caption_value: 'Lãi nghiệp vụ 1,9%',
    caption_tone: 'pos',
  }),
  'c12l5-g2': (): Category => ({
    ...bars({
      labels: ['Dưới 100% · lãi 8 đồng', 'Bằng 100% · hòa vốn', 'Trên 100% · lỗ 8 đồng'],
      series: [
        { name: 'Tỷ lệ bồi thường', values: [52, 58, 66], tone: S1 },
        { name: 'Tỷ lệ chi phí', values: [40, 42, 42], tone: S2 },
      ],
      stacked: true,
      unit: '%',
      values: true,
      refs: [{ value: 100, label: 'Mốc 100%' }],
    }),
    value_format: { suffix: '%' },
  }),
  'c12l5-g3': () =>
    zoneScale(
      85,
      110,
      [
        [85, 95, UP, 'Tốt'],
        [95, 100, GD, 'Lãi mỏng'],
        [100, 110, DN, 'Lỗ nghiệp vụ'],
      ],
      [98.1, 'Công ty mẫu 98,1%'],
      'Combined ratio phi nhân thọ, mức tham khảo: dưới 95% là tốt, từ 95 đến 100% là lãi mỏng, trên 100% là lỗ nghiệp vụ. Công ty mẫu ở 98,1%',
    ),

  /* ---------------------------------------------------------- Bài 6 · Lợi suất đầu tư */
  'c12l6-g1': () =>
    formula(
      [
        card(
          'doanh-thu-tai-chinh',
          'Doanh thu tài chính',
          '1.129 tỷ',
          UP,
          'Cộng dồn 4 quý · Kết quả kinh doanh',
        ),
        card(
          'dau-tu-binh-quan',
          'Đầu tư bình quân',
          '19.970 tỷ',
          BL,
          'Ngắn hạn + dài hạn · Bảng cân đối',
        ),
        card('loi-suat-dau-tu', 'Lợi suất đầu tư', '5,65%', GD, 'Mỗi năm'),
      ],
      ['÷', '='],
      'Lợi suất đầu tư bằng doanh thu tài chính cộng dồn 4 quý 1.129 tỷ chia đầu tư bình quân 19.970 tỷ, bằng 5,65% mỗi năm',
    ),
  'c12l6-g2': (): Category => ({
    kind: 'category',
    mode: 'stacked',
    title: 'Đem đi đầu tư: nguồn tiền thành danh mục đầu tư cuối kỳ',
    labels: ['Nguồn tiền', 'Danh mục đầu tư cuối kỳ'],
    unit: 'tỷ đồng',
    series: [
      { name: 'Vốn chủ sở hữu · 9.892 tỷ', values: [9892, null], tone: S1 },
      { name: 'Dự phòng nghiệp vụ · 15.881 tỷ', values: [15881, null], tone: S2 },
      { name: 'Tiền gửi · 13.000', values: [null, 13000], tone: S1 },
      { name: 'Trái phiếu · 4.300', values: [null, 4300], tone: S3 },
      { name: 'Cổ phiếu, khác · 3.240', values: [null, 3240], tone: S2 },
    ],
    value_labels: 'all',
    value_format: { suffix: ' tỷ' },
  }),
  'c12l6-g3': (): Category =>
    lines({
      labels: ['Năm 1', 'Năm 2', 'Năm 3', 'Năm 4', 'Năm 5', 'Năm 6'],
      series: [
        { name: 'Công ty A · chủ yếu tiền gửi', values: [5.8, 5.6, 6.0, 5.7, 5.9, 5.6], tone: S1 },
        { name: 'Công ty B · nhiều cổ phiếu', values: [9.5, 3.0, 11.2, 2.5, 8.0, 4.1], tone: OR },
      ],
      unit: '%',
      refs: [{ value: 5, label: 'Lãi tiền gửi 5%' }],
    }),

  /* ---------------------------------------------------------- Bài 7 · Cơ cấu lợi nhuận */
  'c12l7-g1': (): SegmentBar => ({
    kind: 'segment_bar',
    unit: '%',
    max: 100,
    rows: [
      {
        label: 'Tổng lợi nhuận hai mảng 4 quý · 1.281 tỷ',
        total: { text: 'Tỷ trọng lợi nhuận đầu tư = 1.129 ÷ 1.281 ≈ 88,1%' },
        segments: [
          { value: 11.9, label: 'Bảo hiểm · 152 tỷ', sub: '11,9%', tone: S1 },
          { value: 88.1, label: 'Đầu tư · 1.129 tỷ', sub: '88,1%', tone: S3 },
        ],
      },
    ],
    alt: 'Tổng lợi nhuận hai mảng 4 quý là 1.281 tỷ: bảo hiểm 152 tỷ (11,9%) và đầu tư 1.129 tỷ (88,1%). Tỷ trọng lợi nhuận đầu tư bằng 1.129 chia 1.281, khoảng 88,1%',
  }),
  'c12l7-g2': () =>
    waterfall(
      wf({
        steps: [
          { label: 'Phí|thuần', value: 8119, kind: 'base', tone: S1 },
          { label: 'Bồi thường|thuần', value: 4614, kind: 'sub', tone: OR },
          { label: 'Chi phí KD|và quản lý', value: 3354, kind: 'sub', tone: PK },
          { label: 'Lợi nhuận|bảo hiểm', value: 152, kind: 'base', tone: BL },
          { label: 'Lợi nhuận|đầu tư', value: 1129, kind: 'add', tone: S3 },
          { label: 'Tổng|hai mảng', value: 1281, kind: 'total', tone: GD },
        ],
        unit: 'tỷ đồng',
        alt: 'Từ phí thuần 8.119 tỷ đồng, trừ bồi thường thuần 4.614 và chi phí kinh doanh, quản lý 3.354, còn lợi nhuận bảo hiểm 152 tỷ; cộng lợi nhuận đầu tư 1.129 tỷ được tổng lợi nhuận hai mảng 1.281 tỷ đồng (4 quý đến Q2/26)',
      }),
      'Tỷ đồng · 4 quý đến Q2/26',
    ),
  'c12l7-g3': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Công ty A · tỷ trọng đầu tư 60%',
        tone: UP,
        model: hbPanel(
          [
            { label: 'Bảo hiểm', value: 400, tone: S1 },
            { label: 'Đầu tư', value: 600, tone: S3 },
          ],
          'tỷ',
          'Lợi nhuận hai mảng',
          'Cả hai mảng cùng đóng góp',
          'pos',
        ),
      },
      {
        title: 'Công ty B · tỷ trọng đầu tư 125%',
        tone: DN,
        model: hbPanel(
          [
            { label: 'Bảo hiểm', value: -200, tone: DN },
            { label: 'Đầu tư', value: 1000, tone: S3 },
          ],
          'tỷ',
          'Lợi nhuận hai mảng',
          'Bảo hiểm lỗ, đầu tư gánh toàn bộ',
          'neg',
        ),
      },
    ],
  }),

  /* ---------------------------------------------------------- Bài 8 · Dự phòng nghiệp vụ / VCSH */
  'c12l8-g1': (): SegmentBar => ({
    kind: 'segment_bar',
    unit: 'tỷ đồng',
    max: 28373,
    rows: [
      {
        label: 'Nguồn vốn cuối Q2/26 · tỷ đồng',
        total: { text: 'Dự phòng ÷ VCSH = 15.881 ÷ 9.892 = 1,61 lần', tone: GD },
        segments: [
          { value: 15881, label: 'Dự phòng nghiệp vụ', sub: '15.881', tone: S2 },
          { value: 2600, label: 'Nợ khác', sub: '2.600', tone: NEUTRAL },
          { value: 9892, label: 'Vốn chủ sở hữu', sub: '9.892', tone: S1 },
        ],
      },
    ],
    brackets: [
      { row: 0, from: 0, to: 15881, label: 'Nghĩa vụ với khách hàng', tone: OR },
      { row: 0, from: 18481, to: 28373, label: 'Vốn của cổ đông', tone: BL },
    ],
    alt: 'Nguồn vốn cuối Q2/26 gồm dự phòng nghiệp vụ 15.881 tỷ (nghĩa vụ với khách hàng), nợ khác 2.600 tỷ và vốn chủ sở hữu 9.892 tỷ (vốn của cổ đông). Dự phòng chia vốn chủ sở hữu bằng 15.881 chia 9.892, khoảng 1,61 lần',
  }),
  'c12l8-g2': (): Flow => ({
    kind: 'flow',
    layout: 'row',
    header: { text: 'Công ty mẫu phi nhân thọ · tổng dự phòng nghiệp vụ 15.881 tỷ', tone: 'price' },
    nodes: [
      {
        id: 'du-phong-phi',
        title: 'Dự phòng phí',
        value: '8.300 tỷ',
        sub: 'Phí đã thu, thời gian bảo hiểm chưa hết',
        tone: BL,
      },
      {
        id: 'du-phong-boi-thuong',
        title: 'Dự phòng bồi thường',
        value: '6.900 tỷ',
        sub: 'Tổn thất đã xảy ra nhưng chưa trả xong',
        tone: OR,
      },
      {
        id: 'du-phong-dao-dong-lon',
        title: 'Dự phòng dao động lớn',
        value: '681 tỷ',
        sub: 'Dành cho năm có tổn thất bất thường',
        tone: GD,
      },
    ],
    alt: 'Công ty mẫu phi nhân thọ có tổng dự phòng nghiệp vụ 15.881 tỷ, gồm dự phòng phí 8.300 tỷ, dự phòng bồi thường 6.900 tỷ và dự phòng dao động lớn 681 tỷ',
  }),
  'c12l8-g3': (): Category =>
    hb({
      title: 'Dự phòng nghiệp vụ / VCSH · số minh họa',
      items: [
        { label: 'Phi nhân thọ · mẫu', value: 1.61, tone: S1 },
        { label: 'Phi nhân thọ · mức cao', value: 2.5, tone: GD },
        { label: 'Nhân thọ · thường gặp', value: 7, tone: PK },
      ],
      unit: 'lần',
    }),
};

/** Chú giải mà bản mẫu vẽ trong svg (hàm `leg()` và nét mẫu thủ công), theo id chart. */
export const CH12_LEGENDS: Record<string, LegendItem[]> = {
  'c12l5-g2': [
    { label: 'Tỷ lệ bồi thường', tone: S1 },
    { label: 'Tỷ lệ chi phí', tone: S2 },
  ],
  'c12l6-g3': [
    { label: 'Công ty A · chủ yếu tiền gửi', tone: S1 },
    { label: 'Công ty B · nhiều cổ phiếu', tone: OR },
    { label: 'Lãi tiền gửi 12 tháng 5% (minh họa) · lợi suất % mỗi năm', tone: GD },
  ],
};
