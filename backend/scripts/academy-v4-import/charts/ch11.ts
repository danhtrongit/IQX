/**
 * Chương 11 (v4, Phân tích công ty chứng khoán): builder của các biểu đồ mà page script của bản mẫu v4 vẽ cho chương này
 * (10 bài x 3 hình, `C11L1-g1` ... `C11L10-g3`). Khóa = id svg viết thường (vd. `c11l1-g1`).
 *
 * Số liệu port nguyên văn từ page script (kể cả giá trị script tự tính: phần trăm tỷ trọng, `100 - v`, tăng trưởng
 * dư nợ). Thư viện vẽ dùng chung của chương (`bars`, `lines`, `hb`, `wf`, `panel` + `big`) đã được `fund.ts` port:
 *   - `card()` + `opr()` -> `flow` (hộp công thức; toán tử `÷ − × =` thành nhãn trên mũi tên: chia, trừ, nhân, bằng)
 *   - `bars()` / `lines()` -> `category`; `hb()` -> `category` ngang; `wf()` -> `schematic`
 *   - thanh chia hai phần (chi phí | lợi nhuận) -> `segment_bar`; ô chữ có mũi tên -> `flow`; hai hàng -> `compare`
 *
 * Màu: `PK` (#e879f9) là màu mảng thứ tư của Bài 1. `#5d6f86` và `#34465c` (hai mảng không phải tự doanh của Bài 7)
 * không có trong bảng tone: chọn tone gần nhất là `p3` và `neutral`.
 */
import type { ChartTone } from '../../../src/modules/academy/content/v4/schema.js';
import type { FlowCard } from './fund.js';
import {
  DN,
  GD,
  OR,
  P3,
  PK,
  S1,
  S2,
  S3,
  UP,
  bars,
  fmtNum,
  formulaFlow,
  hb,
  lines,
  minus,
  r4,
  wf,
} from './fund.js';
import type { Builder, Category, Flow, LegendItem, Model, Scale, SegmentBar } from './kit.js';
import { tone } from './tones.js';

/** `BL` (#249bec) của bản mẫu. */
const BL = tone('#249bec');
/** `#34465c` (mảng "Tài sản khác" của Bài 7): tone gần nhất trong bảng. */
const MUTED: ChartTone = 'neutral';

/** Số kiểu `fv()` của bản mẫu: `fv(v, d)` = `toLocaleString('vi-VN')` với d chữ số thập phân. */
const fv = (v: number, d = 0): string => fmtNum(v, d);

/** Phần trăm có dấu: dấu trừ là dấu gạch ngang ASCII (xem `minus` trong `fund.ts`). */
const pct = (v: number, d = 0): string => `${minus(v)}${fmtNum(Math.abs(v), d)}%`;

const QUARTERS = ['Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25', 'Q1/26', 'Q2/26'];

/**
 * Chuỗi hộp công thức `card()` + `opr()` của bản mẫu: giống `formulaFlow` nhưng mỗi mũi tên mang toán tử
 * (`chia`, `trừ`, `bằng`) để không mất phép tính mà bản mẫu vẽ giữa các thẻ.
 */
function opFlow(cards: readonly FlowCard[], ops: readonly string[], alt: string): Flow {
  const flow = formulaFlow(cards, alt);
  return {
    ...flow,
    edges: cards.slice(1).map((c, i) => ({
      from: (cards[i] as FlowCard).id,
      to: c.id,
      label: ops[i] as string,
    })),
  };
}

/** `card(s,x,y,w,h,t,v,c,notes)`: ghi chú nhiều dòng của thẻ nối thành một câu. */
const notes = (...parts: string[]): string => parts.join(' ');

/** Thanh doanh thu tách chi phí và lãi (Bài 2 g1, Bài 6 g1). */
function profitSplit(o: {
  label: string;
  sub: string;
  margin: string;
  cost: [string, number];
  profit: [string, number];
  alt: string;
}): SegmentBar {
  const total = o.cost[1] + o.profit[1];
  return {
    kind: 'segment_bar',
    max: total,
    rows: [
      {
        label: o.label,
        sub: o.sub,
        total: { text: o.margin, tone: UP },
        segments: [
          { value: o.cost[1], label: o.cost[0], sub: `${fv(o.cost[1])} tỷ`, tone: S2 },
          { value: o.profit[1], label: o.profit[0], sub: `${fv(o.profit[1])} tỷ`, tone: UP },
        ],
      },
    ],
    alt: o.alt,
  };
}

/**
 * `hb()` với tiêu đề dài của bản mẫu: `hb()` dùng tiêu đề làm tên chuỗi (tối đa 60 ký tự) nên tiêu đề được gắn
 * sau khi dựng.
 */
function titledHb(title: string, o: Omit<Parameters<typeof hb>[0], 'title'>): Category {
  return { ...hb(o), title };
}

/** Cột có nhãn phụ phía trên (các thẻ `tag()` mà bản mẫu đặt dưới trục). */
function withSublabels(m: Category, sublabels: string[]): Category {
  return { ...m, sublabels };
}

const BUILDERS: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · Cơ cấu doanh thu hoạt động */
  'c11l1-g1': (): SegmentBar => {
    const tot = 1092.4;
    const items: [string, number, ChartTone][] = [
      ['Cho vay margin', 500.3, S2],
      ['Môi giới', 332.4, S1],
      ['Tự doanh', 189.7, S3],
      ['Ngân hàng đầu tư và khác', 70.0, PK],
    ];
    const share = (v: number): string => `${fv((v / tot) * 100, 1)}%`;
    return {
      kind: 'segment_bar',
      max: tot,
      rows: [
        {
          label: 'Doanh thu hoạt động Q2/26',
          total: { text: '1.092 tỷ đồng' },
          segments: items.map(([name, v, t]) => ({
            value: v,
            label: name,
            sub: `${fv(v)} tỷ đồng · ${share(v)}`,
            tone: t,
          })),
        },
      ],
      alt: `Doanh thu hoạt động quý 2 năm 2026 là 1.092 tỷ đồng, chia bốn mảng: ${items
        .map(([name, v]) => `${name.toLowerCase()} ${fv(v)} tỷ đồng chiếm ${share(v)}`)
        .join(', ')}`,
    };
  },
  'c11l1-g2': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            {
              id: 'moigioi',
              title: 'Môi giới chứng khoán',
              tone: S1,
              sub: 'Doanh thu nghiệp vụ môi giới chứng khoán',
              caption: 'Phụ thuộc giá trị giao dịch của thị trường',
            },
            {
              id: 'margin',
              title: 'Cho vay margin',
              tone: S2,
              sub: 'Lãi từ các khoản cho vay và phải thu',
              caption: 'Cho vay ký quỹ và ứng trước tiền bán',
            },
          ],
          alt: 'Môi giới chứng khoán lấy từ doanh thu nghiệp vụ môi giới và phụ thuộc giá trị giao dịch của thị trường; cho vay margin lấy từ lãi các khoản cho vay và phải thu, gồm cho vay ký quỹ và ứng trước tiền bán',
        },
      },
      {
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            {
              id: 'tudoanh',
              title: 'Tự doanh',
              tone: S3,
              sub: 'Lãi từ tài sản tài chính FVTPL, HTM, AFS',
              caption: 'Lên xuống mạnh theo giá chứng khoán',
            },
            {
              id: 'ibanking',
              title: 'Ngân hàng đầu tư và khác',
              tone: PK,
              sub: 'Bảo lãnh phát hành, tư vấn, lưu ký',
              caption: 'Phụ thuộc số thương vụ trong kỳ',
            },
          ],
          alt: 'Tự doanh lấy từ lãi tài sản tài chính FVTPL, HTM, AFS và lên xuống mạnh theo giá chứng khoán; ngân hàng đầu tư và khác gồm bảo lãnh phát hành, tư vấn, lưu ký và phụ thuộc số thương vụ trong kỳ',
        },
      },
    ],
  }),
  'c11l1-g3': () =>
    lines({
      labels: QUARTERS,
      series: [
        {
          name: 'Cho vay margin',
          values: [647.5, 612.9, 563.7, 511.9, 470.4, 450.7, 460.1, 500.3],
          tone: S2,
        },
        {
          name: 'Tự doanh',
          values: [551.9, 395.2, 441.2, 403.6, 44.4, 284.6, 159.6, 189.7],
          tone: S3,
        },
      ],
      unit: 'tỷ đồng',
    }),

  /* ---------------------------------------------------------- Bài 2 · Biên lợi nhuận hoạt động */
  'c11l2-g1': () =>
    profitSplit({
      label: 'Doanh thu hoạt động 4 quý · 4.305 tỷ đồng',
      sub: 'Biên lợi nhuận hoạt động = 2.381 ÷ 4.305',
      margin: '≈ 55,3%',
      cost: ['Chi phí hoạt động', 1924],
      profit: ['Lợi nhuận hoạt động', 2381],
      alt: 'Doanh thu hoạt động 4 quý là 4.305 tỷ đồng, gồm chi phí hoạt động 1.924 tỷ đồng và lợi nhuận hoạt động 2.381 tỷ đồng; biên lợi nhuận hoạt động bằng 2.381 chia 4.305, khoảng 55,3%',
    }),
  'c11l2-g2': (): Model<'compare'> => {
    const row = (
      id: string,
      cardTone: ChartTone,
      a: string,
      b: string,
      c: string,
      alt: string,
    ): Flow => ({
      kind: 'flow',
      layout: 'row',
      nodes: [
        { id: `${id}-a`, title: a },
        { id: `${id}-b`, title: b },
        { id: `${id}-c`, title: c, tone: cardTone },
      ],
      edges: [
        { from: `${id}-a`, to: `${id}-b`, label: 'trừ' },
        { from: `${id}-b`, to: `${id}-c`, label: 'bằng' },
      ],
      alt,
    });
    return {
      kind: 'compare',
      layout: 'stack',
      items: [
        {
          title: 'Doanh nghiệp sản xuất · biên gộp',
          tone: BL,
          model: row(
            'sx',
            BL,
            'Doanh thu thuần',
            'Giá vốn hàng bán',
            'Lợi nhuận gộp',
            'Doanh nghiệp sản xuất: doanh thu thuần trừ giá vốn hàng bán bằng lợi nhuận gộp',
          ),
        },
        {
          title: 'Công ty chứng khoán · biên lợi nhuận hoạt động',
          tone: UP,
          model: row(
            'ck',
            UP,
            'Doanh thu hoạt động',
            'Chi phí hoạt động',
            'Lợi nhuận hoạt động',
            'Công ty chứng khoán: doanh thu hoạt động trừ chi phí hoạt động bằng lợi nhuận hoạt động',
          ),
        },
      ],
    };
  },
  'c11l2-g3': () =>
    lines({
      labels: QUARTERS,
      series: [
        {
          name: 'Công ty A · thiên về cho vay',
          values: [56, 55, 55, 54, 55, 56, 55, 56],
          tone: S1,
        },
        {
          name: 'Công ty B · thiên về tự doanh',
          values: [62, 40, 58, 35, 60, 44, 30, 52],
          tone: OR,
        },
      ],
      unit: '%',
    }),

  /* ---------------------------------------------------------- Bài 3 · Tăng trưởng dư nợ cho vay */
  'c11l3-g1': () =>
    opFlow(
      [
        {
          id: 'now',
          title: 'Dư nợ cuối Q2/26',
          value: '19.060 tỷ',
          sub: 'Bảng cân đối kế toán',
          tone: BL,
        },
        {
          id: 'prev',
          title: 'Dư nợ cuối Q2/25',
          value: '19.500 tỷ',
          sub: 'Cùng kỳ năm trước',
          tone: GD,
        },
        {
          id: 'growth',
          title: 'Tăng trưởng',
          value: pct(((19060 - 19500) / 19500) * 100, 1),
          sub: '(19.060 − 19.500) ÷ 19.500',
          tone: DN,
          emph: true,
        },
      ],
      ['trừ', 'bằng'],
      'Tăng trưởng dư nợ bằng dư nợ cuối Q2/26 là 19.060 tỷ trừ dư nợ cuối Q2/25 là 19.500 tỷ, chia cho 19.500 tỷ, bằng âm 2,3%',
    ),
  'c11l3-g2': (): Flow => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      {
        id: 'assets',
        title: 'Bảng cân đối kế toán · Tài sản',
        children: [
          { title: 'Tiền và tương đương tiền' },
          { title: 'Tài sản tài chính FVTPL, HTM, AFS' },
          { title: 'Các khoản cho vay', tone: S1 },
          { title: 'Phải thu và tài sản khác' },
        ],
      },
      {
        id: 'loans',
        title: 'Các khoản cho vay',
        tone: S1,
        children: [
          { title: 'Cho vay ký quỹ (margin)', sub: 'Vay tiền để mua chứng khoán', tone: S1 },
          { title: 'Ứng trước tiền bán', sub: 'Nhận trước tiền bán chứng khoán', tone: S1 },
        ],
      },
    ],
    edges: 'sequential',
    alt: 'Trên bảng cân đối kế toán, mục Các khoản cho vay nằm trong phần tài sản và gồm hai khoản: cho vay ký quỹ (margin) để mua chứng khoán và ứng trước tiền bán chứng khoán',
  }),
  'c11l3-g3': (): Model<'compare'> => {
    const chain = (
      id: string,
      t: ChartTone,
      steps: [string, string, string, string],
      alt: string,
    ): Flow => ({
      kind: 'flow',
      layout: 'row',
      nodes: steps.map((title, k) => ({ id: `${id}-${k + 1}`, title, tone: t })),
      edges: 'sequential',
      alt,
    });
    return {
      kind: 'compare',
      layout: 'stack',
      items: [
        {
          model: chain(
            'up',
            UP,
            [
              'Thị trường sôi động',
              'Nhà đầu tư vay thêm',
              'Dư nợ cho vay tăng',
              'Lãi cho vay tăng',
            ],
            'Thị trường sôi động: nhà đầu tư vay thêm, dư nợ cho vay tăng, lãi cho vay tăng',
          ),
        },
        {
          model: chain(
            'down',
            DN,
            [
              'Thị trường trầm lắng',
              'Nhà đầu tư giảm vay',
              'Dư nợ cho vay giảm',
              'Lãi cho vay giảm',
            ],
            'Thị trường trầm lắng: nhà đầu tư giảm vay, dư nợ cho vay giảm, lãi cho vay giảm',
          ),
        },
      ],
    };
  },

  /* ---------------------------------------------------------- Bài 4 · Dư nợ cho vay / VCSH */
  'c11l4-g1': () =>
    opFlow(
      [
        { id: 'loans', title: 'Dư nợ cho vay', value: '19.060 tỷ', sub: 'Cuối Q2/26', tone: BL },
        { id: 'equity', title: 'Vốn chủ sở hữu', value: '29.588 tỷ', sub: 'Cuối Q2/26', tone: GD },
        {
          id: 'ratio',
          title: 'Dư nợ / VCSH',
          value: '0,64 lần',
          sub: notes('100 đồng vốn chủ', 'đang cho vay 64 đồng'),
          tone: UP,
          emph: true,
        },
      ],
      ['chia', 'bằng'],
      'Dư nợ cho vay trên vốn chủ sở hữu bằng 19.060 tỷ chia 29.588 tỷ, bằng 0,64 lần: 100 đồng vốn chủ đang cho vay 64 đồng',
    ),
  'c11l4-g2': (): Scale => {
    const ticks = [0, 0.5, 1, 1.5, 2];
    return {
      kind: 'scale',
      orientation: 'h',
      domain: [0, 2],
      ticks: ticks.map((v, i) => ({
        v,
        label: i === ticks.length - 1 ? `${fv(v, 1)} lần` : fv(v, 1),
      })),
      zones: [
        { from: 0, to: 0.5, tone: BL, label: 'Thận trọng' },
        { from: 0.5, to: 1, tone: UP, label: 'Vừa phải' },
        { from: 1, to: 1.5, tone: GD, label: 'Cao' },
        { from: 1.5, to: 2, tone: DN, label: 'Rất cao' },
      ],
      markers: [
        { v: 0.64, label: 'Q2/26 · 0,64', tone: UP, side: 'a' },
        { v: 0.99, label: 'Q3/24 · 0,99', tone: GD, side: 'b' },
      ],
      alt: 'Mức tham khảo của dư nợ cho vay trên vốn chủ sở hữu, tính bằng lần: dưới 0,5 là thận trọng, từ 0,5 đến 1 vừa phải, từ 1 đến 1,5 cao, từ 1,5 đến 2 rất cao. Quý 2 năm 2026 ở 0,64 lần, quý 3 năm 2024 ở 0,99 lần. Càng gần giới hạn pháp lý, công ty càng ít dư địa để cho vay thêm',
    };
  },
  'c11l4-g3': () =>
    withSublabels(
      bars({
        labels: ['Q3/24', 'Q2/26'],
        series: [
          { name: 'Dư nợ cho vay', values: [24.7, 19.1], tone: S1 },
          { name: 'Vốn chủ sở hữu', values: [24.9, 29.6], tone: S2 },
        ],
        unit: 'nghìn tỷ',
        values: true,
      }),
      ['Tỷ lệ 0,99 lần', 'Tỷ lệ 0,64 lần'],
    ),

  /* ---------------------------------------------------------- Bài 5 · Lợi suất cho vay */
  'c11l5-g1': () =>
    opFlow(
      [
        {
          id: 'interest',
          title: 'Lãi cho vay 4 quý',
          value: '1.882 tỷ',
          sub: 'Từ Q3/25 đến Q2/26',
          tone: BL,
        },
        {
          id: 'average',
          title: 'Dư nợ bình quân',
          value: '19.280 tỷ',
          sub: '(19.500 + 19.060) ÷ 2',
          tone: GD,
        },
        {
          id: 'yield',
          title: 'Lợi suất cho vay',
          value: '9,8%',
          sub: notes('100 đồng cho vay', 'thu về 9,8 đồng lãi/năm'),
          tone: UP,
          emph: true,
        },
      ],
      ['chia', 'bằng'],
      'Lợi suất cho vay bằng lãi cho vay 4 quý 1.882 tỷ chia dư nợ bình quân 19.280 tỷ, bằng 9,8%: 100 đồng cho vay thu về 9,8 đồng lãi mỗi năm',
    ),
  'c11l5-g2': () =>
    lines({
      title: 'Dư nợ cho vay cuối quý (tỷ đồng)',
      labels: ['Q2/25 · đầu kỳ', 'Q3/25', 'Q4/25', 'Q1/26', 'Q2/26 · cuối kỳ'],
      series: [{ name: 'Dư nợ', values: [19500, 17920, 17169, 17527, 19060], tone: S1 }],
      unit: 'tỷ đồng',
      refs: [{ value: 19280, label: 'Bình quân đầu và cuối kỳ · 19.280' }],
      values: true,
    }),
  'c11l5-g3': () =>
    titledHb('Lợi suất cho vay so với chi phí vay · chi phí vay là số minh họa', {
      items: [
        { label: 'Lợi suất cho vay', value: 9.8, tone: S1 },
        { label: 'Chi phí vay', value: 6.0, tone: GD },
        { label: 'Chênh lệch', value: 3.8, tone: UP },
      ],
      unit: '%',
      decimals: 1,
    }),

  /* ---------------------------------------------------------- Bài 6 · Biên lợi nhuận môi giới */
  'c11l6-g1': () =>
    profitSplit({
      label: 'Doanh thu môi giới 4 quý · 1.444 tỷ đồng',
      sub: 'Biên lợi nhuận môi giới = 448 ÷ 1.444',
      margin: '≈ 31,0%',
      cost: ['Chi phí môi giới', 996],
      profit: ['Lãi môi giới', 448],
      alt: 'Doanh thu môi giới 4 quý là 1.444 tỷ đồng, gồm chi phí môi giới 996 tỷ đồng và lãi môi giới 448 tỷ đồng; biên lợi nhuận môi giới bằng 448 chia 1.444, khoảng 31,0%',
    }),
  'c11l6-g2': (): Flow => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      { id: 'volume', title: 'Giá trị giao dịch', caption: 'Thanh khoản thị trường' },
      { id: 'fee', title: 'Tỷ lệ phí', caption: 'Cạnh tranh về phí' },
      { id: 'revenue', title: 'Doanh thu môi giới', tone: BL, caption: 'Kết quả hoạt động' },
      { id: 'cost', title: 'Chi phí môi giới', tone: S2, caption: 'Nhân sự, phí, hệ thống' },
      { id: 'profit', title: 'Lãi môi giới', tone: UP, caption: 'Biên khoảng 31%' },
    ],
    edges: [
      { from: 'volume', to: 'fee', label: 'nhân' },
      { from: 'fee', to: 'revenue', label: 'bằng' },
      { from: 'revenue', to: 'cost', label: 'trừ' },
      { from: 'cost', to: 'profit', label: 'bằng' },
    ],
    alt: 'Giá trị giao dịch nhân tỷ lệ phí bằng doanh thu môi giới, trừ chi phí môi giới bằng lãi môi giới; biên lãi môi giới khoảng 31%',
  }),
  'c11l6-g3': () =>
    withSublabels(
      bars({
        labels: ['Thanh khoản cao', 'Thanh khoản vừa', 'Thanh khoản thấp'],
        series: [
          { name: 'Doanh thu môi giới', values: [200, 140, 90], tone: S1 },
          { name: 'Chi phí môi giới', values: [120, 98, 78], tone: S2 },
        ],
        unit: 'tỷ đồng',
        values: true,
      }),
      ['Biên 40%', 'Biên 30%', 'Biên 13%'],
    ),

  /* ---------------------------------------------------------- Bài 7 · Tỷ trọng tài sản tự doanh */
  'c11l7-g1': (): SegmentBar => {
    const items: [string, number, ChartTone][] = [
      ['FVTPL', 11735, S1],
      ['AFS', 4578, S2],
      ['HTM', 9297, S3],
      ['Các khoản cho vay', 19060, P3],
      ['Tài sản khác', 7198, MUTED],
    ];
    const tot = 51868;
    return {
      kind: 'segment_bar',
      max: tot,
      rows: [
        {
          label: 'Tổng tài sản 51.868 tỷ',
          sub: 'Tài sản tự doanh 25.610 tỷ',
          segments: items.map(([name, v, t]) => ({
            value: v,
            label: name,
            sub: `${fv(v)} tỷ`,
            tone: t,
          })),
        },
      ],
      brackets: [{ row: 0, from: 0, to: 25610, label: '49,4% tổng tài sản', tone: OR }],
      alt: 'Tổng tài sản 51.868 tỷ đồng gồm FVTPL 11.735 tỷ, AFS 4.578 tỷ, HTM 9.297 tỷ, các khoản cho vay 19.060 tỷ và tài sản khác 7.198 tỷ; ba loại tài sản tự doanh cộng lại 25.610 tỷ, bằng 49,4% tổng tài sản',
    };
  },
  'c11l7-g2': (): Flow => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      {
        id: 'fvtpl',
        title: 'FVTPL',
        tone: S1,
        sub: 'Ghi nhận qua lãi/lỗ',
        children: [
          { title: 'Cổ phiếu, trái phiếu mua để bán' },
          { title: 'Đánh giá lại vào kết quả kinh doanh' },
          { title: 'Biến động cao', tone: DN },
        ],
      },
      {
        id: 'afs',
        title: 'AFS',
        tone: S2,
        sub: 'Sẵn sàng để bán',
        children: [
          { title: 'Nắm giữ trung và dài hạn' },
          { title: 'Đánh giá lại vào vốn chủ sở hữu' },
          { title: 'Biến động vừa', tone: GD },
        ],
      },
      {
        id: 'htm',
        title: 'HTM',
        tone: S3,
        sub: 'Giữ đến ngày đáo hạn',
        children: [
          { title: 'Tiền gửi có kỳ hạn, trái phiếu' },
          { title: 'Thu lãi đều, giá trị ổn định' },
          { title: 'Biến động thấp', tone: UP },
        ],
      },
    ],
    alt: 'Ba loại tài sản tự doanh: FVTPL ghi nhận qua lãi lỗ với biến động cao, AFS sẵn sàng để bán với biến động vừa, HTM giữ đến ngày đáo hạn với biến động thấp',
  }),
  'c11l7-g3': (): Model<'compare'> => {
    const company = (
      title: string,
      t: 'pos' | 'neg',
      v: [number, number, number],
      summary: string,
    ) => ({
      title,
      tone: t,
      model: {
        ...hb({
          title: 'Tỷ trọng trong tổng tài sản',
          items: [
            { label: 'FVTPL', value: v[0], tone: S1 },
            { label: 'AFS', value: v[1], tone: S2 },
            { label: 'HTM', value: v[2], tone: S3 },
          ],
          unit: '%',
        }),
        bounds: [0, 40] as [number, number],
        caption_value: summary,
        caption_tone: t,
      } satisfies Category,
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        company('Công ty A · tự doanh 50%', 'pos', [10, 5, 35], 'Chủ yếu tiền gửi và trái phiếu'),
        company('Công ty B · tự doanh 50%', 'neg', [40, 5, 5], 'Chủ yếu cổ phiếu FVTPL'),
      ],
    };
  },

  /* ---------------------------------------------------------- Bài 8 · Hiệu suất tự doanh */
  'c11l8-g1': () =>
    opFlow(
      [
        {
          id: 'profit',
          title: 'Lãi tự doanh thuần 4 quý',
          value: '678 tỷ',
          sub: 'Từ Q3/25 đến Q2/26',
          tone: BL,
        },
        {
          id: 'average',
          title: 'Tài sản tự doanh bình quân',
          value: '25.426 tỷ',
          sub: '(25.243 + 25.610) ÷ 2',
          tone: GD,
        },
        {
          id: 'efficiency',
          title: 'Hiệu suất tự doanh',
          value: '2,7%',
          sub: notes('100 đồng tài sản', 'lãi 2,7 đồng/năm'),
          tone: DN,
          emph: true,
        },
      ],
      ['chia', 'bằng'],
      'Hiệu suất tự doanh bằng lãi tự doanh thuần 4 quý 678 tỷ chia tài sản tự doanh bình quân 25.426 tỷ, bằng 2,7%: 100 đồng tài sản lãi 2,7 đồng mỗi năm',
    ),
  'c11l8-g2': () =>
    wf({
      steps: [
        { label: 'Lãi FVTPL', value: 520, kind: 'add', tone: S1 },
        { label: 'Lãi HTM', value: 380, kind: 'add', tone: S3 },
        { label: 'Lãi AFS', value: 90, kind: 'add', tone: GD },
        { label: 'Lỗ FVTPL', value: 312, kind: 'sub', tone: DN },
        { label: 'Lãi tự doanh thuần', value: 678, kind: 'total', tone: UP },
      ],
      unit: 'tỷ đồng',
      alt: 'Lãi tự doanh thuần: cộng lãi FVTPL 520 tỷ, lãi HTM 380 tỷ và lãi AFS 90 tỷ, trừ lỗ FVTPL 312 tỷ, còn 678 tỷ đồng',
    }),
  'c11l8-g3': () =>
    titledHb('Hiệu suất tự doanh so với lãi tiền gửi · lãi tiền gửi là số minh họa', {
      items: [
        { label: 'Q3/24', value: 7.2, tone: UP },
        { label: 'Lãi tiền gửi', value: 5.0, tone: GD },
        { label: 'Q2/26', value: 2.7, tone: DN },
      ],
      unit: '%',
      decimals: 1,
    }),

  /* ---------------------------------------------------------- Bài 9 · Chi phí hoạt động / Doanh thu hoạt động */
  'c11l9-g1': () =>
    opFlow(
      [
        {
          id: 'cost',
          title: 'Chi phí hoạt động 4 quý',
          value: '1.924 tỷ',
          sub: 'Từ Q3/25 đến Q2/26',
          tone: S2,
        },
        {
          id: 'revenue',
          title: 'Doanh thu hoạt động 4 quý',
          value: '4.305 tỷ',
          sub: 'Từ Q3/25 đến Q2/26',
          tone: BL,
        },
        {
          id: 'ratio',
          title: 'Chi phí / Doanh thu',
          value: '44,7%',
          sub: notes('100 đồng doanh thu', 'tốn 44,7 đồng chi phí'),
          tone: GD,
          emph: true,
        },
      ],
      ['chia', 'bằng'],
      'Chi phí trên doanh thu bằng chi phí hoạt động 4 quý 1.924 tỷ chia doanh thu hoạt động 4 quý 4.305 tỷ, bằng 44,7%: 100 đồng doanh thu tốn 44,7 đồng chi phí',
    ),
  'c11l9-g2': (): SegmentBar => {
    const labels = ['Q3/24', 'Q4/25', 'Q2/26'];
    const cp = [43.9, 47.4, 44.7];
    return {
      kind: 'segment_bar',
      max: 100,
      rows: labels.map((l, i) => {
        const cost = cp[i] as number;
        return {
          label: l,
          segments: [
            { value: cost, label: `${fv(cost, 1)}%`, tone: S2 },
            { value: r4(100 - cost), label: `${fv(100 - cost, 1)}%`, tone: UP },
          ],
        };
      }),
      alt: 'Hai mặt của 100% doanh thu hoạt động: quý 3 năm 2024 chi phí 43,9% và biên lợi nhuận hoạt động 56,1%; quý 4 năm 2025 là 47,4% và 52,6%; quý 2 năm 2026 là 44,7% và 55,3%',
    };
  },
  'c11l9-g3': (): Model<'compare'> => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        model: bars({
          labels: ['Q3/24', 'Q2/26'],
          series: [
            { name: 'Doanh thu 4 quý', values: [7.3, 4.3], tone: S1 },
            { name: 'Chi phí 4 quý', values: [3.2, 1.9], tone: S2 },
          ],
          unit: 'nghìn tỷ',
          values: true,
        }),
      },
      {
        model: {
          kind: 'flow',
          layout: 'column',
          header: { text: 'Thay đổi', tone: 'price' },
          nodes: [
            { id: 'revenue', title: 'Doanh thu', value: pct(-41), tone: S1 },
            { id: 'cost', title: 'Chi phí', value: pct(-40), tone: S2 },
            {
              id: 'ratio',
              title: 'Tỷ lệ gần như giữ',
              sub: 'nguyên quanh 44 đến 45%',
              tone: GD,
            },
          ],
          alt: 'Doanh thu giảm 41%, chi phí giảm 40%, nên tỷ lệ chi phí trên doanh thu gần như giữ nguyên quanh 44 đến 45%',
        },
      },
    ],
  }),

  /* ---------------------------------------------------------- Bài 10 · Nợ vay / VCSH */
  'c11l10-g1': () =>
    opFlow(
      [
        {
          id: 'debt',
          title: 'Nợ vay',
          value: '18.991 tỷ',
          sub: 'Vay ngắn hạn + dài hạn',
          tone: BL,
        },
        { id: 'equity', title: 'Vốn chủ sở hữu', value: '29.588 tỷ', sub: 'Cuối Q2/26', tone: GD },
        {
          id: 'ratio',
          title: 'Nợ vay / VCSH',
          value: '0,64 lần',
          sub: notes('100 đồng vốn chủ', 'đi kèm 64 đồng nợ vay'),
          tone: UP,
          emph: true,
        },
      ],
      ['chia', 'bằng'],
      'Nợ vay trên vốn chủ sở hữu bằng nợ vay 18.991 tỷ chia vốn chủ sở hữu 29.588 tỷ, bằng 0,64 lần: 100 đồng vốn chủ đi kèm 64 đồng nợ vay',
    ),
  'c11l10-g2': (): Flow => ({
    kind: 'flow',
    layout: 'row',
    header: { text: 'Lợi nhuận đến từ chênh lệch giữa hai mức lãi', tone: GD },
    nodes: [
      { id: 'banks', title: 'Ngân hàng, trái phiếu' },
      {
        id: 'borrow',
        title: 'Vay ngắn hạn và dài hạn',
        tone: BL,
        children: [{ title: 'Công ty trả lãi vay', tone: DN }],
      },
      { id: 'firm', title: 'Công ty chứng khoán', tone: BL },
      {
        id: 'margin',
        title: 'Cho vay margin',
        tone: GD,
        children: [{ title: 'Công ty thu lãi cho vay', tone: UP }],
      },
      { id: 'investor', title: 'Nhà đầu tư vay ký quỹ' },
    ],
    edges: 'sequential',
    alt: 'Dòng vốn vay: ngân hàng và trái phiếu cho công ty chứng khoán vay ngắn hạn và dài hạn, công ty trả lãi vay; công ty cho nhà đầu tư vay ký quỹ qua cho vay margin và thu lãi cho vay; lợi nhuận đến từ chênh lệch giữa hai mức lãi',
  }),
  'c11l10-g3': () =>
    bars({
      labels: ['Q3/24', 'Q3/25', 'Q2/26'],
      series: [
        { name: 'Nợ vay', values: [24.4, 18.8, 19.0], tone: S1 },
        { name: 'Dư nợ cho vay', values: [24.7, 17.9, 19.1], tone: GD },
      ],
      unit: 'nghìn tỷ',
      values: true,
    }),
};

export const CH11_BUILDERS: Record<string, Builder> = BUILDERS;

/** Chú giải mà bản mẫu vẽ trong svg (hàm `leg()`), theo id chart. */
export const CH11_LEGENDS: Record<string, LegendItem[]> = {
  'c11l1-g3': [
    { label: 'Lãi cho vay margin (tỷ đồng)', tone: S2 },
    { label: 'Lãi tự doanh (tỷ đồng)', tone: S3 },
  ],
  'c11l2-g3': [
    { label: 'Công ty A · thiên về cho vay (%)', tone: S1 },
    { label: 'Công ty B · thiên về tự doanh (%)', tone: OR },
  ],
  'c11l4-g3': [
    { label: 'Dư nợ cho vay (nghìn tỷ)', tone: S1 },
    { label: 'Vốn chủ sở hữu (nghìn tỷ)', tone: S2 },
  ],
  'c11l6-g3': [
    { label: 'Doanh thu môi giới (tỷ đồng)', tone: S1 },
    { label: 'Chi phí môi giới (tỷ đồng)', tone: S2 },
  ],
  'c11l9-g2': [
    { label: 'Chi phí / Doanh thu (%)', tone: S2 },
    { label: 'Biên lợi nhuận hoạt động (%)', tone: UP },
  ],
  'c11l9-g3': [
    { label: 'Doanh thu 4 quý (nghìn tỷ)', tone: S1 },
    { label: 'Chi phí 4 quý (nghìn tỷ)', tone: S2 },
  ],
  'c11l10-g3': [
    { label: 'Nợ vay (nghìn tỷ)', tone: S1 },
    { label: 'Dư nợ cho vay (nghìn tỷ)', tone: GD },
  ],
};
