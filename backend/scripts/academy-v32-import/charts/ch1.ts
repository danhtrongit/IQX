import type { Builder, Diagram, Layer, SegmentBar, Shape } from './kit.js';

type Seg = SegmentBar['rows'][number]['segments'][number];
import { round2, sample } from './kit.js';
import { lcg, round4 } from './math.js';

/** Chapter 1 chart models (hand ports of the C1L* IIFEs of the mockup). */

const YRS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const VNI = [
  579.03, 664.87, 984.24, 892.54, 960.99, 1103.87, 1498.28, 1007.09, 1129.93, 1266.78, 1784.49,
];
const CPI = [0, 2.66, 3.53, 3.54, 2.79, 3.23, 1.84, 3.15, 3.25, 3.63, 3.31];

/** C1L1-g1 series: A (VN-Index), B (savings 6%), D (cash purchasing power), all from 100. */
export function c1l1Growth(): { A: number[]; B: number[]; D: number[] } {
  const v0 = VNI[0] as number;
  const A = VNI.map((v) => (100 * v) / v0);
  const B = YRS.map((_, i) => 100 * Math.pow(1.06, i));
  let p = 100;
  const D = CPI.map((c, i) => (i ? (p = p / (1 + c / 100)) : 100));
  return { A, B, D };
}

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  o: Partial<Extract<Shape, { t: 'rect' }>> = {},
): Shape => ({ t: 'rect', x: round2(x), y: round2(y), w: round2(w), h: round2(h), ...o });
const text = (
  x: number,
  y: number,
  s: string,
  o: Partial<Extract<Shape, { t: 'text' }>> = {},
): Shape => ({
  t: 'text',
  x: round2(x),
  y: round2(y),
  text: s,
  ...o,
});

const diagramA1: Diagram = {
  kind: 'diagram',
  view_box: [200, 120],
  alt: 'Một căn nhà cần hàng tỷ đồng, trong khi 100 cổ phiếu chỉ cần khoảng 2 triệu đồng',
  shapes: [
    { t: 'path', d: 'M14 58 L52 26 L90 58', stroke: 'p5', width: 3 },
    rect(22, 56, 60, 40, { fill: 'p5', opacity: 0.2, stroke: 'p5' }),
    rect(46, 72, 12, 24, { fill: 'p5' }),
    text(52, 114, 'hàng tỷ đồng', { anchor: 'middle', size: 's' }),
    rect(112, 46, 80, 46, { r: 8, fill: 'p1', opacity: 0.2, stroke: 'p1' }),
    text(152, 66, '100 cổ phiếu', { anchor: 'middle', size: 's' }),
    text(152, 84, '2 triệu', { anchor: 'middle', size: 'm', weight: 'bold' }),
    text(152, 114, 'vài triệu đồng', { anchor: 'middle', size: 's', weight: 'bold', tone: 'p1' }),
  ],
};

function diagramA3(): Diagram {
  const cells: Shape[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const own = r === 3 && c === 3;
      cells.push(
        rect(
          18 + c * 22,
          20 + r * 22,
          17,
          17,
          own ? { r: 2, fill: 'p1' } : { r: 2, fill: 'p3', opacity: 0.35 },
        ),
      );
    }
  return {
    kind: 'diagram',
    view_box: [200, 120],
    alt: 'Sở hữu một phần doanh nghiệp: hưởng giá tăng và cổ tức',
    shapes: [
      rect(10, 12, 96, 96, { r: 5, fill: 'p3', opacity: 0.15, stroke: 'p3' }),
      ...cells,
      { t: 'path', d: 'M124 58 L140 46 L152 52 L172 30', stroke: 'p1', width: 3 },
      text(150, 76, 'Giá tăng', { anchor: 'middle', size: 's', weight: 'bold', tone: 'p1' }),
      { t: 'circle', cx: 150, cy: 94, r: 9, stroke: 'pos' },
      text(150, 98, 'đ', { anchor: 'middle', size: 's', weight: 'bold', tone: 'pos' }),
      text(150, 118, 'Cổ tức', { anchor: 'middle', size: 's', weight: 'bold', tone: 'pos' }),
    ],
  };
}

function diagramA4(): Diagram {
  const rows: Shape[] = [];
  (
    [
      ['p4', 30],
      ['pos', 46],
      ['warn', 62],
      ['neg', 78],
    ] as const
  ).forEach(([t, y]) => {
    rows.push(rect(20, y, 44, 8, { r: 2, fill: 'p3', opacity: 0.35 }));
    rows.push(rect(70, y, 30, 8, { r: 2, fill: t }));
  });
  return {
    kind: 'diagram',
    view_box: [200, 120],
    alt: 'Bảng giá công khai và báo cáo tài chính của doanh nghiệp',
    shapes: [
      rect(10, 16, 100, 88, { r: 6, fill: 'p1', opacity: 0.2, stroke: 'p1' }),
      ...rows,
      {
        t: 'path',
        d: 'M132 16 h40 l14 14 v74 h-54 z',
        fill: 'p3',
        opacity: 0.2,
        stroke: 'p1',
        width: 2,
      },
      ...[44, 58, 72, 86].map((y): Shape => ({
        t: 'line',
        x1: 142,
        y1: y,
        x2: 176,
        y2: y,
        stroke: 'p1',
        width: 2,
      })),
    ],
  };
}

const diagramA5: Diagram = {
  kind: 'diagram',
  view_box: [200, 120],
  alt: 'Thuế khi bán chỉ 0,1% giá trị giao dịch',
  shapes: [
    {
      t: 'path',
      d: 'M50 10 h100 v100 l-10 -7 l-10 7 l-10 -7 l-10 7 l-10 -7 l-10 7 l-10 -7 l-10 7 l-10 -7 l-10 7 z',
      fill: 'pos',
      opacity: 0.15,
      stroke: 'pos',
      width: 2,
    },
    text(100, 42, 'Thuế khi bán', { anchor: 'middle', size: 's' }),
    text(100, 76, '0,1%', { anchor: 'middle', size: 'l', weight: 'bold', tone: 'pos' }),
  ],
};

/** C1L2-g4 redrawn at 0.42 scale (narrow diagram, so the two labels stay readable on a phone). */
function diagramVn30(): Diagram {
  const k = 0.42;
  const shapes: Shape[] = [rect(4, 4, 312, 102, { r: 8, stroke: 'p3' })];
  shapes.push(text(12, 20, 'VN-Index', { size: 'm', weight: 'bold' }));
  shapes.push(text(12, 33, 'toàn bộ cổ phiếu trên HOSE', { size: 's' }));
  const cx = 560;
  const cy = 135;
  const R = 82;
  const rnd = lcg(7);
  const X = (x: number) => round2(x * k);
  const Y = (y: number) => round2(8 + y * k);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 34; c++) {
      const x = 34 + c * 21 + (r % 2) * 10;
      const y = 62 + r * 20;
      if (Math.hypot(x - cx, y - cy) < R + 10 || x > 740) continue;
      shapes.push({
        t: 'circle',
        cx: X(x),
        cy: Y(y),
        r: round2((3 + rnd() * 2.2) * k),
        fill: 'p3',
        opacity: 0.6,
      });
    }
  shapes.push({
    t: 'circle',
    cx: X(cx),
    cy: Y(cy),
    r: round2(R * k),
    fill: 'p1',
    opacity: 0.2,
    stroke: 'p1',
  });
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996;
    const rr = Math.sqrt((i + 0.5) / 30) * (R - 18);
    shapes.push({
      t: 'circle',
      cx: X(cx + rr * Math.cos(a)),
      cy: Y(cy + 8 + rr * Math.sin(a) * 0.82),
      r: round2((7.5 - i * 0.12) * k),
      fill: 'p1',
    });
  }
  shapes.push(text(X(cx), Y(cy - R + 22), 'VN30', { anchor: 'middle', size: 'm', weight: 'bold' }));
  return {
    kind: 'diagram',
    view_box: [320, 110],
    alt: 'VN-Index gồm toàn bộ cổ phiếu trên HOSE, VN30 là nhóm 30 cổ phiếu bên trong',
    shapes,
  };
}

export const CH1_BUILDERS: Record<string, Builder> = {
  'c1l1-g1': () => {
    const { A, B, D } = c1l1Growth();
    const end = (a: number[]) => `${Math.round(a[10] as number)} triệu`;
    return {
      kind: 'category',
      mode: 'line',
      labels: YRS.map(String),
      unit: 'triệu',
      series: [
        { name: 'Đầu tư theo VN-Index', values: A.map(round4), tone: 'p1' },
        { name: 'Gửi tiết kiệm 6%/năm', values: B.map(round4), tone: 'p2' },
        { name: 'Giữ tiền mặt (sức mua)', values: D.map(round4), tone: 'p3' },
      ],
      value_labels: 'none',
      end_labels: [end(A), end(B), end(D)],
      bounds: [0, 350],
      ticks: [0, 50, 100, 150, 200, 250, 300, 350],
      animate: 'draw',
    };
  },
  'c1l1-g2': () => ({
    kind: 'segment_bar',
    max: 10,
    pictogram: { per_unit: 1, icon: 'banknote' },
    rows: [
      { label: 'Năm 2015', total: { text: '100 triệu' }, segments: [{ value: 10, tone: 'pos' }] },
      {
        label: 'Năm 2025',
        total: { text: '≈ 74 triệu', tone: 'neg' },
        segments: [
          { value: 7.4, tone: 'pos' },
          { value: 2.6, tone: 'neutral', ghost: true },
        ],
      },
    ],
    alt: 'Năm 2015 có 10 tờ tiền 10 triệu, năm 2025 sức mua chỉ còn khoảng 7,4 tờ',
  }),
  'c1l1-a1': () => diagramA1,
  'c1l1-a2': () => ({
    kind: 'segment_bar',
    max: 20,
    rows: [
      {
        label: 'Chứng khoán',
        segments: [{ value: 2, tone: 'p1' }],
        total: { text: '2 ngày', tone: 'p1' },
      },
      {
        label: 'Bất động sản',
        segments: [{ value: 18, tone: 'p5', label: 'vài tuần đến vài tháng' }],
      },
    ],
    alt: 'Bán chứng khoán nhận tiền sau 2 ngày, bất động sản mất vài tuần đến vài tháng',
  }),
  'c1l1-a3': diagramA3,
  'c1l1-a4': diagramA4,
  'c1l1-a5': () => diagramA5,

  'c1l2-g1': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Thị trường sơ cấp',
        tone: 'p1',
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            { id: 'doanh-nghiep', title: 'Doanh nghiệp', tone: 'p1', emph: true },
            { id: 'nha-dau-tu', title: 'Nhà đầu tư' },
          ],
          edges: [
            { from: 'doanh-nghiep', to: 'nha-dau-tu', label: 'Cổ phiếu' },
            { from: 'nha-dau-tu', to: 'doanh-nghiep', label: 'Tiền' },
          ],
        },
      },
      {
        title: 'Thị trường thứ cấp',
        tone: 'warn',
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            { id: 'nha-dau-tu-a', title: 'Nhà đầu tư A' },
            { id: 'nha-dau-tu-b', title: 'Nhà đầu tư B' },
          ],
          edges: [
            { from: 'nha-dau-tu-a', to: 'nha-dau-tu-b', label: 'Cổ phiếu' },
            { from: 'nha-dau-tu-b', to: 'nha-dau-tu-a', label: 'Tiền' },
          ],
        },
      },
    ],
  }),
  'c1l2-g2': () => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      { id: 'cong-ty-co-phan', title: 'Công ty cổ phần' },
      { id: 'ipo', title: 'IPO', tone: 'p1', emph: true },
      {
        id: 'cong-ty-dai-chung',
        title: 'Công ty đại chúng',
        children: [
          { title: 'Niêm yết', sub: 'HOSE · HNX', tone: 'p1' },
          { title: 'Đăng ký giao dịch', sub: 'UPCoM' },
        ],
      },
    ],
    edges: 'sequential',
    alt: 'Công ty cổ phần qua IPO trở thành công ty đại chúng, sau đó niêm yết hoặc đăng ký giao dịch',
  }),
  'c1l2-g3': () => ({
    kind: 'flow',
    layout: 'row',
    header: { text: 'Ủy ban Chứng khoán Nhà nước · quản lý và giám sát', tone: 'warn' },
    nodes: [
      { id: 'nha-dau-tu', title: 'Nhà đầu tư', caption: 'Đặt lệnh' },
      { id: 'cong-ty-chung-khoan', title: 'Công ty chứng khoán', caption: 'Nhận, chuyển lệnh' },
      {
        id: 'so-giao-dich',
        title: 'Sở giao dịch',
        sub: 'HOSE · HNX',
        tone: 'p1',
        emph: true,
        caption: 'Khớp lệnh',
        children: [{ title: 'Doanh nghiệp phát hành' }],
      },
      { id: 'vsdc', title: 'VSDC', caption: 'Lưu ký, thanh toán' },
    ],
    edges: 'sequential',
    alt: 'Lệnh đi từ nhà đầu tư qua công ty chứng khoán đến sở giao dịch, VSDC lưu ký và thanh toán',
  }),
  'c1l2-g4': diagramVn30,

  'c1l3-g2': () => ({
    kind: 'scale',
    orientation: 'v',
    domain: [23250, 26750],
    gradient: ['p4', 'pos', 'warn', 'neg', 'info'],
    zones: [
      { from: 25000, to: 26750, tone: 'pos', label: 'Tăng: màu xanh lá' },
      { from: 23250, to: 25000, tone: 'neg', label: 'Giảm: màu đỏ' },
    ],
    markers: [
      { v: 26750, label: 'Giá trần', sub: '26.750 · +7%', tone: 'p4' },
      { v: 25000, label: 'Giá tham chiếu', sub: '25.000 · 0%', tone: 'warn' },
      { v: 23250, label: 'Giá sàn', sub: '23.250 · −7%', tone: 'info' },
    ],
    alt: 'Biên độ giá HOSE: tham chiếu 25.000, trần 26.750, sàn 23.250',
  }),
  'c1l3-g3': () => {
    const hm = (h: number, m: number) => h * 60 + m;
    const S = {
      ato: 'p4',
      lt: 'p1',
      atc: 'p5',
      tt: 'p3',
      plo: 'warn',
    } as const;
    const nghi = { label: 'Nghỉ trưa', tone: 'neutral', muted: true } as const;
    return {
      kind: 'gantt',
      domain: [hm(9, 0), hm(15, 0)],
      tick_format: 'hhmm',
      ticks: [
        { v: hm(9, 0), label: '9:00' },
        { v: hm(11, 30), label: '11:30' },
        { v: hm(13, 0), label: '13:00' },
        { v: hm(14, 30), label: '14:30' },
        { v: hm(15, 0), label: '15:00' },
      ],
      rows: [
        {
          name: 'HOSE',
          segments: [
            { from: hm(9, 0), to: hm(9, 15), label: 'ATO', tone: S.ato },
            { from: hm(9, 15), to: hm(11, 30), label: 'Liên tục', tone: S.lt },
            { from: hm(11, 30), to: hm(13, 0), ...nghi },
            { from: hm(13, 0), to: hm(14, 30), label: 'Liên tục', tone: S.lt },
            { from: hm(14, 30), to: hm(14, 45), label: 'ATC', tone: S.atc },
            { from: hm(14, 45), to: hm(15, 0), label: 'Thỏa thuận', tone: S.tt },
          ],
        },
        {
          name: 'HNX',
          segments: [
            { from: hm(9, 0), to: hm(11, 30), label: 'Liên tục', tone: S.lt },
            { from: hm(11, 30), to: hm(13, 0), ...nghi },
            { from: hm(13, 0), to: hm(14, 30), label: 'Liên tục', tone: S.lt },
            { from: hm(14, 30), to: hm(14, 45), label: 'ATC', tone: S.atc },
            { from: hm(14, 45), to: hm(15, 0), label: 'PLO', tone: S.plo },
          ],
        },
        {
          name: 'UPCoM',
          segments: [
            { from: hm(9, 0), to: hm(11, 30), label: 'Liên tục', tone: S.lt },
            { from: hm(11, 30), to: hm(13, 0), ...nghi },
            { from: hm(13, 0), to: hm(15, 0), label: 'Liên tục', tone: S.lt },
          ],
        },
      ],
      legend: [
        { tone: S.ato, label: 'Mở cửa 9:00-9:15' },
        { tone: S.atc, label: 'Đóng cửa 14:30-14:45' },
        { tone: S.tt, label: 'Thỏa thuận' },
        { tone: S.plo, label: 'Sau giờ (HNX)' },
      ],
      alt: 'Các phiên giao dịch trong ngày của HOSE, HNX và UPCoM',
    };
  },

  'c1l4-g1': () => {
    const days = [
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
      'Chủ nhật',
      'Thứ Hai',
    ];
    const link = (a: number, b: number) => ({
      from: a + 0.5,
      to: b + 0.5,
      tone: 'neutral' as const,
      muted: true as const,
    });
    return {
      kind: 'gantt',
      domain: [0, 8],
      tick_format: 'day',
      ticks: days.map((_, i) => ({ v: i, label: '' })),
      columns: days.map((d, i) =>
        i === 5 || i === 6 ? { label: d, dim: true as const } : { label: d },
      ),
      rows: [
        {
          name: 'Mua thứ Hai',
          segments: [link(0, 2)],
          markers: [
            { at: 0.5, text: 'T', tone: 'pos' },
            { at: 2.5, text: 'T+2.5', tone: 'p1' },
          ],
          note: 'Cổ phiếu về, bán được từ phiên chiều',
        },
        {
          name: 'Bán thứ Hai',
          segments: [link(0, 2)],
          markers: [
            { at: 0.5, text: 'T', tone: 'pos' },
            { at: 2.5, text: 'T+2', tone: 'warn' },
          ],
          note: 'Tiền về tài khoản',
        },
        {
          name: 'Mua thứ Năm',
          segments: [link(3, 7)],
          markers: [
            { at: 3.5, text: 'T', tone: 'pos' },
            { at: 7.5, text: 'T+2.5', tone: 'p1' },
          ],
        },
      ],
      alt: 'Lịch thanh toán T+2: mua thứ Năm thì cổ phiếu về chiều thứ Hai tuần sau, bỏ qua cuối tuần',
    };
  },
  'c1l4-g3': () => ({
    kind: 'segment_bar',
    max: 200,
    unit: 'triệu',
    rows: [
      { label: 'Không vay', segments: [{ value: 100, label: 'Vốn 100 triệu', tone: 'p3' }] },
      {
        label: 'Dùng margin',
        segments: [
          { value: 100, label: 'Vốn 100 triệu', tone: 'p3' },
          { value: 100, label: 'Vay 100 triệu', tone: 'p1' },
        ],
        total: { text: 'Sức mua 200 triệu', tone: 'p1' },
      },
    ],
    alt: 'Dùng margin vay thêm 100 triệu, sức mua tăng lên 200 triệu',
  }),
  'c1l4-g4': () => ({
    kind: 'category',
    mode: 'grouped',
    title: 'Lãi/lỗ trên vốn',
    labels: ['Giá tăng 20%', 'Giá giảm 20%'],
    unit: '%',
    series: [
      { name: 'Không vay: mua 100 triệu', values: [20, -20], tone: 'p3' },
      { name: 'Dùng margin: mua 200 triệu', values: [40, -40], tone: 'p1' },
    ],
    value_labels: 'all',
    value_format: { sign: true, suffix: '%' },
    bounds: [-45, 45],
    ticks: [-40, -20, 0, 20, 40],
  }),

  'c1l5-g1': () => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      {
        id: 'co-dong',
        title: 'Cổ đông',
        sub: 'chủ sở hữu',
        tone: 'p1',
        caption: 'Mua cổ phiếu · Lợi nhuận theo kết quả kinh doanh',
      },
      { id: 'doanh-nghiep', title: 'Doanh nghiệp', sub: 'huy động vốn', emph: true },
      {
        id: 'trai-chu',
        title: 'Trái chủ',
        sub: 'chủ nợ',
        tone: 'warn',
        caption: 'Mua trái phiếu · Lãi suất xác định trước',
      },
    ],
    edges: [
      { from: 'co-dong', to: 'doanh-nghiep', label: 'Góp vốn' },
      { from: 'doanh-nghiep', to: 'co-dong', label: 'Cổ tức, giá tăng' },
      { from: 'trai-chu', to: 'doanh-nghiep', label: 'Cho vay' },
      { from: 'doanh-nghiep', to: 'trai-chu', label: 'Lãi và gốc' },
    ],
    alt: 'Cổ đông góp vốn và nhận cổ tức, trái chủ cho vay và nhận lãi cùng gốc',
  }),
  'c1l5-g2': () => ({
    kind: 'category',
    mode: 'stacked',
    labels: ['Mua', 'Năm 1', 'Năm 2', 'Năm 3'],
    unit: 'đ',
    series: [
      { name: 'Tiền mua trái phiếu', values: [-100000, null, null, null], tone: 'neg' },
      { name: 'Tiền lãi 8.000/năm', values: [null, 8000, 8000, 8000], tone: 'warn' },
      { name: 'Hoàn trả mệnh giá', values: [null, null, null, 100000], tone: 'pos' },
    ],
    value_labels: 'all',
    value_format: { sign: true },
  }),
  'c1l5-g3': () => {
    const X0 = 70;
    const Y0 = 230;
    const W = 640;
    const H = 200;
    const q = (t: number, a: number, b: number, c: number) =>
      (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
    const P0 = [X0 + 30, Y0 - 24];
    const P1 = [X0 + W * 0.45, Y0 - 60];
    const P2 = [X0 + W - 40, Y0 - H + 20];
    const curve: [number, number][] = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const x = q(t, P0[0] as number, P1[0] as number, P2[0] as number);
      const y = q(t, P0[1] as number, P1[1] as number, P2[1] as number);
      curve.push([round4((x - X0) / W), round4((Y0 - y) / H)]);
    }
    return {
      kind: 'schematic',
      domain: { x: [0, 1], y: [0, 1] },
      axes: { x: { title: 'Rủi ro', arrow: true }, y: { title: 'Lợi nhuận kỳ vọng', arrow: true } },
      layers: [
        { t: 'line', pts: curve, tone: 'p1', dash: true, width: 2 },
        {
          t: 'point',
          at: [0.08, 0.12],
          tone: 'p3',
          size: 'm',
          label: 'Tiền gửi tiết kiệm',
          pos: 'right',
        },
        {
          t: 'point',
          at: [0.28, 0.24],
          tone: 'warn',
          size: 'm',
          label: 'Trái phiếu Chính phủ',
          pos: 'right',
        },
        {
          t: 'point',
          at: [0.52, 0.42],
          tone: 'warn',
          size: 'm',
          label: 'Trái phiếu doanh nghiệp',
          pos: 'right',
        },
        { t: 'point', at: [0.86, 0.82], tone: 'p1', size: 'l', label: 'Cổ phiếu', pos: 'left' },
      ],
      alt: 'Rủi ro càng cao, lợi nhuận kỳ vọng càng cao: tiết kiệm, trái phiếu Chính phủ, trái phiếu doanh nghiệp, cổ phiếu',
    };
  },

  'c1l6-g1': () => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      { id: 'nha-dau-tu', title: 'Nhà đầu tư' },
      { id: 'quy', title: 'Quỹ đầu tư', sub: 'công ty quản lý quỹ', tone: 'p1', emph: true },
      {
        id: 'danh-muc',
        title: 'Danh mục',
        children: [
          { title: 'Cổ phiếu', tone: 'p1' },
          { title: 'Trái phiếu', tone: 'warn' },
          { title: 'Tiền', tone: 'pos' },
        ],
      },
    ],
    edges: [
      { from: 'nha-dau-tu', to: 'quy' },
      { from: 'quy', to: 'danh-muc' },
    ],
    alt: 'Nhiều nhà đầu tư góp tiền vào quỹ, công ty quản lý quỹ đầu tư vào danh mục cổ phiếu, trái phiếu và tiền',
  }),
  'c1l6-g2': () => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      { id: 'etf', title: '1 chứng chỉ ETF', sub: 'mô phỏng VN30', tone: 'p1', emph: true },
      { id: 'ro-vn30', title: 'Rổ 30 cổ phiếu VN30' },
    ],
    edges: [{ from: 'etf', to: 'ro-vn30', label: '≈' }],
    alt: 'Một chứng chỉ ETF mô phỏng VN30 tương đương một rổ 30 cổ phiếu VN30',
  }),
  'c1l6-g3': () => ({
    kind: 'schematic',
    domain: { x: [20000, 40000], y: [-3000, 9000] },
    axes: {
      x: {
        title: 'Giá cổ phiếu ABC ngày đáo hạn',
        ticks: [20000, 25000, 30000, 35000, 40000].map((v) => ({
          v,
          label: v.toLocaleString('de-DE'),
        })),
      },
      y: {
        title: 'Lãi/lỗ',
        ticks: [
          { v: -2000, label: '−2.000' },
          { v: 0, label: '0' },
          { v: 4000, label: '+4.000' },
          { v: 8000, label: '+8.000' },
        ],
      },
    },
    layers: [
      { t: 'zone', x: [20000, 30000], y: [-2000, 0], tone: 'neg' },
      { t: 'segment', from: [30000, -2000], to: [30000, 8800], tone: 'warn', dash: true },
      {
        t: 'text',
        at: [30000, 8800],
        text: 'Giá thực hiện 30.000',
        tone: 'warn',
        anchor: 'middle',
      },
      {
        t: 'line',
        pts: [
          [20000, -2000],
          [30000, -2000],
          [40000, 8000],
        ],
        tone: 'p1',
        width: 3,
      },
      { t: 'text', at: [25000, -1600], text: 'Mất toàn bộ 2.000', tone: 'neg', anchor: 'middle' },
      { t: 'point', at: [32000, 0], tone: 'price', label: 'Hòa vốn 32.000', pos: 'below' },
      { t: 'point', at: [38000, 6000], tone: 'pos', label: 'Giá 38.000: lãi 6.000', pos: 'left' },
    ],
    alt: 'Chứng quyền mua giá thực hiện 30.000, giá chứng quyền 2.000: lỗ tối đa 2.000, hòa vốn ở 32.000',
  }),
  'c1l6-g4': () => ({
    kind: 'schematic',
    domain: { x: [-1, 1], y: [-1.2, 1.2] },
    axes: {
      x: {
        arrow: true,
        ticks: [
          { v: -1, label: 'Chỉ số giảm' },
          { v: 0, label: 'Giá lúc mở vị thế' },
          { v: 1, label: 'Chỉ số tăng' },
        ],
      },
    },
    layers: [
      { t: 'segment', from: [-1, 0], to: [1, 0], tone: 'neutral' },
      { t: 'segment', from: [0, -1.2], to: [0, 1.2], tone: 'neutral', dash: true },
      {
        t: 'line',
        pts: [
          [-1, -1],
          [1, 1],
        ],
        tone: 'p1',
        width: 3,
      },
      {
        t: 'line',
        pts: [
          [-1, 1],
          [1, -1],
        ],
        tone: 'p5',
        width: 3,
      },
      { t: 'text', at: [1, 1], text: 'Mua', tone: 'p1', anchor: 'start' },
      { t: 'text', at: [1, -1], text: 'Bán', tone: 'p5', anchor: 'start' },
      { t: 'text', at: [-1, 1], text: 'Lãi', tone: 'pos', anchor: 'end' },
      { t: 'text', at: [-1, -1], text: 'Lỗ', tone: 'neg', anchor: 'end' },
    ],
    alt: 'Vị thế mua lãi khi chỉ số tăng, vị thế bán lãi khi chỉ số giảm',
  }),
  'c1l6-g5': () => ({
    kind: 'scale',
    orientation: 'h',
    domain: [0, 700],
    gradient: ['pos', 'warn', 'neg'],
    ends: ['Rủi ro thấp', 'Rủi ro cao'],
    markers: [
      { v: 120, label: 'Quỹ mở, ETF', tone: 'price', side: 'a' },
      { v: 370, label: 'Cổ phiếu', tone: 'price', side: 'b' },
      { v: 570, label: 'Chứng quyền', tone: 'price', side: 'a' },
      { v: 660, label: 'Phái sinh', tone: 'price', side: 'b' },
    ],
    alt: 'Mức rủi ro tăng dần: quỹ mở và ETF, cổ phiếu, chứng quyền, phái sinh',
  }),

  'c1l7-g1': () => ({
    kind: 'milestones',
    points: [
      { at: 0, title: 'Công bố', detail: ['sự kiện'], tone: 'p3' },
      { at: 0.42, title: 'Giao dịch', detail: ['không hưởng quyền'], tone: 'neg' },
      { at: 0.6, title: 'Đăng ký', detail: ['cuối cùng'], tone: 'p1' },
      { at: 1, title: 'Thanh toán', detail: ['cổ tức, cổ phiếu'], tone: 'pos' },
    ],
    spans: [
      {
        from: 0,
        to: 0.42,
        label: 'Mua trong giai đoạn này: được hưởng quyền',
        tone: 'pos',
        side: 'above',
      },
      {
        from: 0.42,
        to: 1,
        label: 'Mua từ đây: không được hưởng quyền',
        tone: 'neg',
        side: 'above',
      },
    ],
    brace: { from: 0.42, to: 0.6, label: '1 ngày làm việc' },
    alt: 'Mốc thời gian của một sự kiện quyền: công bố, giao dịch không hưởng quyền, đăng ký cuối cùng, thanh toán',
  }),
  'c1l7-g2': () => ({
    kind: 'segment_bar',
    max: 33,
    unit: 'triệu',
    rows: [
      {
        label: 'Trước',
        segments: [{ value: 30, label: 'Cổ phiếu 30 triệu', sub: '1.000 × 30.000', tone: 'p1' }],
        total: { text: '30 triệu' },
      },
      {
        label: 'Sau',
        segments: [
          { value: 28, label: 'Cổ phiếu 28 triệu', sub: '1.000 × 28.000', tone: 'p1' },
          { value: 2, label: '2 tr', tone: 'pos' },
        ],
        total: { text: '30 triệu' },
      },
    ],
    alt: 'Cổ tức tiền mặt: giá cổ phiếu giảm đúng bằng cổ tức, tổng tài sản không đổi',
  }),
  'c1l7-g3': () => ({
    kind: 'segment_bar',
    max: 33,
    unit: 'triệu',
    rows: [
      {
        label: 'Trước',
        segments: [{ value: 30, label: 'Cổ phiếu 30 triệu', sub: '1.000 × 30.000', tone: 'p1' }],
        total: { text: '30 triệu' },
      },
      {
        label: 'Sau',
        segments: [{ value: 30, label: 'Cổ phiếu 30 triệu', sub: '1.200 × 25.000', tone: 'p1' }],
        total: { text: '30 triệu' },
      },
    ],
    alt: 'Cổ tức bằng cổ phiếu: số cổ phiếu tăng, giá điều chỉnh giảm, tổng giá trị không đổi',
  }),
  'c1l7-g4': () => ({
    kind: 'segment_bar',
    max: 33,
    unit: 'triệu',
    rows: [
      {
        label: 'Trước',
        segments: [
          { value: 30, label: 'Cổ phiếu 30 triệu', sub: '1.000 × 30.000', tone: 'p1' },
          { value: 3, label: '3 tr', tone: 'p3' },
        ],
        total: { text: '33 triệu' },
      },
      {
        label: 'Thực hiện quyền',
        segments: [{ value: 33, label: 'Cổ phiếu 33 triệu', sub: '1.200 × 27.500', tone: 'p1' }],
        total: { text: '33 triệu' },
      },
      {
        label: 'Bỏ quyền',
        segments: [
          { value: 27.5, label: 'Cổ phiếu 27,5 triệu', sub: '1.000 × 27.500', tone: 'p1' },
          { value: 3, label: '3 tr', tone: 'p3' },
        ],
        total: { text: '30,5 triệu', tone: 'neg' },
      },
    ],
    legend: [{ tone: 'p3', label: 'Tiền mặt 3 triệu dùng để mua 200 cổ phiếu mới' }],
    alt: 'Phát hành quyền mua: thực hiện quyền giữ nguyên 33 triệu, bỏ quyền còn 30,5 triệu',
  }),

  'c1l8-g1': () => {
    const cols = ['pos', 'p1', 'warn', 'neg'] as const;
    const names = ['Phục hồi', 'Tăng trưởng', 'Suy giảm', 'Suy thoái'];
    const f = (t: number) => -Math.cos(t * 2 * Math.PI);
    const layers: Layer[] = [];
    for (let k = 0; k < 4; k++)
      layers.push({
        t: 'zone',
        x: [k / 4, (k + 1) / 4],
        tone: cols[k] as 'pos',
        label: names[k] as string,
      });
    for (let k = 0; k < 4; k++)
      layers.push({
        t: 'line',
        pts: sample(k / 4, (k + 1) / 4, 50, f),
        tone: cols[k] as 'pos',
        width: 4,
      });
    layers.push({ t: 'text', at: [0.5, 1.15], text: 'Đỉnh', anchor: 'middle' });
    layers.push({ t: 'text', at: [0.01, -1.3], text: 'Đáy', anchor: 'start' });
    layers.push({ t: 'text', at: [0.99, -1.3], text: 'Đáy', anchor: 'end' });
    return {
      kind: 'schematic',
      domain: { x: [0, 1], y: [-1.5, 1.4] },
      layers,
      alt: 'Chu kỳ kinh tế gồm bốn pha: phục hồi, tăng trưởng, suy giảm, suy thoái',
    };
  },
  'c1l8-g2': () => {
    const sh = 70 / 680;
    const curve = (s: number) => sample(0, 1, 120, (t) => -Math.cos((t + s) * 2 * Math.PI * 1.25));
    const tE = 0.8;
    const tS = 0.8 - sh;
    return {
      kind: 'schematic',
      domain: { x: [0, 1], y: [-1.7, 1.2] },
      layers: [
        { t: 'line', pts: curve(0), tone: 'p3', width: 3 },
        { t: 'line', pts: curve(sh), tone: 'p1', width: 3 },
        { t: 'segment', from: [round4(tS), -1.12], to: [round4(tS), -1.45], tone: 'p1' },
        { t: 'segment', from: [tE, -1.12], to: [tE, -1.45], tone: 'p3' },
        { t: 'segment', from: [tE, -1.38], to: [round4(tS), -1.38], tone: 'p1', arrow: true },
        {
          t: 'text',
          at: [round4((tS + tE) / 2), -1.65],
          text: 'Thị trường tạo đáy trước',
          tone: 'p1',
          anchor: 'middle',
        },
      ],
      alt: 'Thị trường chứng khoán tạo đáy và đỉnh trước nền kinh tế',
    };
  },
  'c1l8-g3': () => {
    const col = (
      head: string,
      t: 'pos' | 'neg',
      items: [string, string],
      res: string,
      p: string,
    ) => ({
      model: {
        kind: 'flow' as const,
        layout: 'column' as const,
        header: { text: head, tone: t },
        nodes: [
          { id: `${p}-1`, title: items[0] },
          { id: `${p}-2`, title: items[1] },
          { id: `${p}-ket-qua`, title: res, tone: t, emph: true as const },
        ],
        edges: 'sequential' as const,
      },
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        col(
          'Lãi suất giảm',
          'pos',
          ['Doanh nghiệp vay vốn rẻ hơn', 'Tiền gửi kém hấp dẫn'],
          'Hỗ trợ giá cổ phiếu',
          'giam',
        ),
        col(
          'Lãi suất tăng',
          'neg',
          ['Chi phí vay vốn tăng', 'Tiền gửi hấp dẫn hơn'],
          'Áp lực lên giá cổ phiếu',
          'tang',
        ),
      ],
    };
  },
  'c1l8-g4': () => ({
    kind: 'flow',
    layout: 'cycle',
    nodes: [
      { id: 'lam-phat-tang', title: 'Lạm phát tăng', tone: 'neg' },
      { id: 'tang-lai-suat', title: 'Tăng lãi suất', tone: 'warn' },
      { id: 'kinh-te-ha-nhiet', title: 'Kinh tế hạ nhiệt', tone: 'p3' },
      { id: 'lam-phat-giam', title: 'Lạm phát giảm', tone: 'pos' },
      { id: 'giam-lai-suat', title: 'Giảm lãi suất', tone: 'p1' },
      { id: 'kinh-te-tang-toc', title: 'Kinh tế tăng tốc', tone: 'info' },
    ],
    edges: 'sequential',
    alt: 'Vòng lặp lạm phát và lãi suất',
  }),

  'c1l9-g1': () => {
    const zones = [
      [0, 0.22, 'pos', 'Tích lũy'],
      [0.22, 0.5, 'p1', 'Tăng giá'],
      [0.5, 0.72, 'warn', 'Phân phối'],
      [0.72, 1, 'neg', 'Giảm giá'],
    ] as const;
    const pts: [number, number][] = [
      [0, 0.15],
      [0.03, 0.12],
      [0.06, 0.17],
      [0.09, 0.11],
      [0.12, 0.16],
      [0.15, 0.12],
      [0.18, 0.17],
      [0.21, 0.13],
      [0.25, 0.25],
      [0.28, 0.22],
      [0.32, 0.38],
      [0.35, 0.34],
      [0.39, 0.52],
      [0.42, 0.48],
      [0.46, 0.68],
      [0.5, 0.78],
      [0.53, 0.7],
      [0.56, 0.82],
      [0.59, 0.72],
      [0.62, 0.8],
      [0.65, 0.7],
      [0.68, 0.79],
      [0.71, 0.68],
      [0.75, 0.55],
      [0.78, 0.6],
      [0.82, 0.42],
      [0.85, 0.47],
      [0.89, 0.3],
      [0.92, 0.34],
      [0.96, 0.2],
      [1, 0.18],
    ];
    const xs: number[] = [];
    const hs: number[] = [];
    const ts: ('pos' | 'p1' | 'warn' | 'neg')[] = [];
    for (let i = 0; i < 48; i++) {
      const r = (i + 0.5) / 48;
      let v: number;
      if (r < 0.22) v = 0.2 + 0.1 * Math.abs(Math.sin(i * 1.7));
      else if (r < 0.5) v = 0.35 + (0.3 * (r - 0.22)) / 0.28 + 0.1 * Math.abs(Math.sin(i * 2.1));
      else if (r < 0.72) v = 0.75 + 0.2 * Math.abs(Math.sin(i * 1.3));
      else v = 0.45 + 0.35 * Math.abs(Math.sin(i * 1.9));
      const z = zones.find(([a, b]) => r >= a && r < b) ?? zones[3];
      xs.push(round4(r));
      hs.push(round4(v));
      ts.push(z[2]);
    }
    return {
      kind: 'schematic',
      domain: { x: [0, 1], y: [0, 1] },
      panels: [{ y: [0, 1] }, { title: 'Khối lượng', y: [0, 1.1] }],
      layers: [
        ...zones.map(([a, b, t, n]): Layer => ({ t: 'zone', x: [a, b], tone: t, label: n })),
        { t: 'line', pts, tone: 'price', width: 2, panel: 0 },
        { t: 'bars', x: xs, h: hs, tones: ts, base: 0, panel: 1 },
      ],
      alt: 'Bốn pha của thị trường: tích lũy, tăng giá, phân phối, giảm giá, kèm khối lượng giao dịch',
    };
  },
  'c1l9-g2': () => {
    const f = (t: number) => -Math.cos(t * 2 * Math.PI);
    const em: [number, string, 'neg' | 'pos' | 'p1' | 'warn'][] = [
      [0.04, 'Chán nản', 'neg'],
      [0.17, 'Hy vọng', 'pos'],
      [0.29, 'Lạc quan', 'pos'],
      [0.39, 'Phấn khích', 'p1'],
      [0.5, 'Hưng phấn', 'warn'],
      [0.61, 'Lo lắng', 'warn'],
      [0.72, 'Sợ hãi', 'neg'],
      [0.84, 'Hoảng loạn', 'neg'],
      [0.97, 'Chán nản', 'neg'],
    ];
    return {
      kind: 'schematic',
      domain: { x: [0, 1], y: [-1.6, 1.3] },
      layers: [
        { t: 'line', pts: sample(0, 1, 140, f), tone: 'p1', width: 3 },
        ...em.map(([r, label, t]): Layer => ({
          t: 'point',
          at: [r, round4(f(r))],
          tone: t,
          label,
          pos: r === 0.5 ? 'above' : r < 0.1 || r > 0.9 ? 'below' : r < 0.5 ? 'left' : 'right',
        })),
        { t: 'text', at: [0.5, 0.64], text: 'Rủi ro cao nhất', anchor: 'middle' },
        { t: 'text', at: [0.005, -1.42], text: 'Cơ hội lớn nhất', anchor: 'start' },
        { t: 'text', at: [0.995, -1.42], text: 'Cơ hội lớn nhất', anchor: 'end' },
      ],
      alt: 'Chu kỳ cảm xúc của nhà đầu tư theo giá: hưng phấn ở đỉnh, chán nản ở đáy',
    };
  },
  'c1l9-g3': () => {
    const P: [string, number][] = [
      ['12/19', 961],
      ['3/20', 662],
      ['6/20', 825],
      ['9/20', 905],
      ['12/20', 1104],
      ['3/21', 1191],
      ['6/21', 1408],
      ['9/21', 1342],
      ['12/21', 1498],
      ['1/22', 1528],
      ['3/22', 1492],
      ['6/22', 1197],
      ['9/22', 1132],
      ['11/22', 911],
      ['12/22', 1007],
    ];
    const T = [0, 3, 6, 9, 12, 15, 18, 21, 24, 25, 27, 30, 33, 35, 36];
    const values: number[] = [];
    for (let m = 0; m <= 36; m++) {
      const k = T.findIndex((t) => t >= m);
      const t1 = T[k] as number;
      const v1 = (P[k] as [string, number])[1];
      if (t1 === m) {
        values.push(v1);
        continue;
      }
      const t0 = T[k - 1] as number;
      const v0 = (P[k - 1] as [string, number])[1];
      values.push(round4(v0 + ((v1 - v0) * (m - t0)) / (t1 - t0)));
    }
    const ticks: string[] = [];
    for (let m = 0; m <= 36; m++)
      ticks.push(m === 0 ? '2020' : m === 12 ? '2021' : m === 24 ? '2022' : m === 36 ? '2023' : '');
    return {
      kind: 'series_panels',
      x: {
        start: 0,
        end: 36,
        ticks,
        shade: [
          { from: 2, to: 5, tone: 'pos', label: 'Tích lũy' },
          { from: 5, to: 23, tone: 'p1', label: 'Tăng giá' },
          { from: 23, to: 28, tone: 'warn', label: 'Phân phối' },
          { from: 28, to: 35, tone: 'neg', label: 'Giảm giá' },
        ],
      },
      marks: [],
      points: [
        { i: 3, panel: 0, value: 662, tone: 'pos', label: '≈ 660', pos: 'below' },
        { i: 25, panel: 0, value: 1528, tone: 'warn', label: '≈ 1.530', pos: 'above' },
        { i: 35, panel: 0, value: 911, tone: 'neg', label: '≈ 910', pos: 'below' },
      ],
      panels: [
        {
          title: '',
          bounds: [500, 1850],
          ticks: [600, 1000, 1400],
          digits: 0,
          series: [{ name: 'VN-Index', role: 'price', width: 2, values }],
        },
      ],
      alt: 'VN-Index từ tháng 12/2019 đến tháng 12/2022 qua bốn pha thị trường',
    };
  },

  'c1l10-g1': () => {
    const pts: [number, number][] = [];
    for (let n = 1; n <= 20; n += 0.25) pts.push([n, round4(0.35 + 0.65 / n)]);
    return {
      kind: 'schematic',
      domain: { x: [1, 20], y: [0, 1] },
      axes: {
        x: {
          title: 'Số cổ phiếu trong danh mục',
          ticks: [1, 5, 10, 15, 20].map((v) => ({ v, label: String(v) })),
        },
        y: { title: 'Rủi ro' },
      },
      layers: [
        { t: 'zone', y: [0, 0.35], tone: 'neg', label: 'Rủi ro thị trường: luôn tồn tại' },
        { t: 'line', pts, tone: 'p1', width: 3 },
        {
          t: 'text',
          at: [7, 0.62],
          text: 'Rủi ro riêng doanh nghiệp: giảm dần',
          tone: 'p1',
          anchor: 'middle',
        },
      ],
      alt: 'Đa dạng hóa làm giảm rủi ro riêng của doanh nghiệp, rủi ro thị trường vẫn còn',
    };
  },
  'c1l10-g2': () => ({
    kind: 'category',
    mode: 'grouped',
    labels: ['Lỗ 10%', 'Lỗ 20%', 'Lỗ 30%', 'Lỗ 40%', 'Lỗ 50%'],
    unit: '%',
    series: [
      { name: 'Mức lỗ', values: [-10, -20, -30, -40, -50], tone: 'neg' },
      { name: 'Mức lãi cần để hòa vốn', values: [11, 25, 43, 67, 100], tone: 'pos' },
    ],
    value_labels: 'all',
    value_format: { sign: true, suffix: '%' },
  }),
  'c1l10-g3': () => ({
    kind: 'segment_bar',
    max: 100,
    unit: '%',
    rows: [
      {
        label: 'Danh mục',
        segments: [
          ['Cổ phiếu A', 'Ngân hàng'],
          ['Cổ phiếu B', 'Bán lẻ'],
          ['Cổ phiếu C', 'Thép'],
          ['Cổ phiếu D', 'Công nghệ'],
          ['Cổ phiếu E', 'Điện'],
        ]
          .map(([l, s]): Seg => ({ value: 15, label: l as string, sub: s as string, tone: 'p1' }))
          .concat([{ value: 25, label: 'Tiền mặt', sub: 'Dự phòng', tone: 'pos' }]),
      },
    ],
    alt: 'Phân bổ danh mục: 5 cổ phiếu ở 5 ngành, mỗi mã 15%, giữ 25% tiền mặt dự phòng',
  }),
};
