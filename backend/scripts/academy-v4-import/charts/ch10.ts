/**
 * Chương 10 (v4, Phân tích ngân hàng): builder của 33 biểu đồ `C10L1-g1` ... `C10L11-g3` mà page script
 * của bản mẫu v4 vẽ cho chương này (11 bài x 3 hình).
 *
 * Khóa = id svg viết thường (vd. `c10l1-g1`). Số liệu và nhãn lấy nguyên văn từ page script (kể cả giá trị
 * script tự tính). Hàm vẽ dùng chung của bản mẫu (`bars`, `lines`, `hb`, `wf`, `card` + `opr`) đi qua các helper
 * của `fund.ts`; bản mẫu v4 thêm hai điều so với v3.3:
 *
 * - công thức `card ÷ card = card` giữ cả dấu phép tính: `flow` với cạnh có nhãn (`÷`, `=`);
 * - hình tự vẽ (tách đôi thanh, hai bảng so sánh, thang vùng LDR...) dùng `segment_bar`, `compare`, `scale`,
 *   `series_panels` (khoảng chênh giữa hai đường) thay vì `diagram`, vì hình rộng 760 có chữ không dùng được `diagram`.
 */
import type { ChartTone } from '../../../src/modules/academy/content/v4/schema.js';
import type { Builder, Category, Flow, LegendItem, Schematic } from './kit.js';
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
  P3,
  r4,
  type FlowCard,
  type HbOptions,
  type WfOptions,
} from './fund.js';

/** Bản mẫu: các nhãn quý dùng chung của chương. */
const Q8 = ['Q3/24', 'Q4/24', 'Q1/25', 'Q2/25', 'Q3/25', 'Q4/25', 'Q1/26', 'Q2/26'];

/** Thêm trường phụ (caption, bounds, sublabels...) vào một mô hình `category` đã dựng bằng helper. */
const cx = (m: Category, extra: Partial<Category>): Category => ({ ...m, ...extra });

/** `hb()` + trường phụ. */
const hbx = (o: HbOptions, extra: Partial<Category> = {}): Category => cx(hb(o), extra);

/**
 * `card(...) opr('÷') card(...) opr('=') card(...)` của bản mẫu -> `flow` có cạnh mang nhãn phép tính.
 * `ops[i]` là phép tính giữa hộp i và hộp i + 1.
 */
function calc(cards: readonly FlowCard[], ops: readonly string[], alt: string): Flow {
  return {
    ...formulaFlow(cards, alt),
    edges: cards.slice(1).map((c, i) => ({
      from: (cards[i] as FlowCard).id,
      to: c.id,
      label: ops[i] as string,
    })),
  };
}

/**
 * `wf()` + dòng chữ của bản mẫu: tiêu đề hình (đặt ở góc trên bên trái, trục y) và dòng kết luận
 * (chữ nằm phía trên các cột, tự xuống dòng khi hẹp).
 */
function wfNoted(o: WfOptions, title: string, note: string, noteTone: 'warn' | 'price'): Schematic {
  const m = wf(o);
  const x: [number, number] = m.domain?.x ?? [-0.5, o.steps.length - 0.5];
  const [lo, hi] = m.domain?.y ?? [0, 1];
  const span = hi - lo;
  return {
    ...m,
    domain: { x, y: [lo, r4(hi + span * 0.3)] },
    axes: { ...m.axes, y: { ticks: [], title } },
    layers: [
      ...m.layers,
      {
        t: 'text',
        at: [(o.steps.length - 1) / 2, r4(hi + span * 0.16)],
        text: note,
        tone: noteTone,
        anchor: 'middle',
      },
    ],
  };
}

const T = (v: number): { v: number; label: string } => ({ v, label: `${v}%` });

const ch10: Record<string, Builder> = {
  /* ------------------------------------------------------- Bài 1 · NIM */
  'c10l1-g1': () =>
    calc(
      [
        {
          id: 'thu-nhap-lai-thuan',
          title: 'Thu nhập lãi thuần 4 quý',
          value: '95.811 tỷ',
          sub: 'Kết quả kinh doanh · Q3/25 đến Q2/26',
          tone: S1,
        },
        {
          id: 'tai-san-sinh-lai',
          title: 'Tài sản sinh lãi bình quân',
          value: '2.243 nghìn tỷ',
          sub: 'Bảng cân đối · Bình quân đầu và cuối kỳ',
          tone: GD,
        },
        {
          id: 'nim',
          title: 'NIM',
          value: '4,27%',
          sub: '100 đồng tài sản sinh lãi tạo ra 4,27 đồng lãi thuần',
          tone: UP,
          emph: true,
        },
      ],
      ['÷', '='],
      'NIM bằng thu nhập lãi thuần 4 quý 95.811 tỷ đồng chia cho tài sản sinh lãi bình quân 2.243 nghìn tỷ đồng, bằng 4,27%',
    ),
  'c10l1-g2': () =>
    hbx(
      {
        title: 'Tài sản sinh lãi bình quân · 2.243 nghìn tỷ đồng',
        items: [
          { label: 'Cho vay khách hàng', value: 1580, tone: S1 },
          { label: 'Chứng khoán đầu tư', value: 330, tone: S3 },
          { label: 'Gửi và cho vay TCTD khác', value: 300, tone: GD },
          { label: 'Chứng khoán kinh doanh', value: 33, tone: OR },
        ],
      },
      {
        unit: 'nghìn tỷ đồng',
        caption_value: 'Không tính vào mẫu số: tiền mặt, tài sản cố định, tài sản khác',
      },
    ),
  'c10l1-g3': () =>
    hb({
      title: 'NIM tham khảo theo mô hình ngân hàng · số minh họa',
      items: [
        { label: 'Nhiều cho vay tiêu dùng', value: 6.5, tone: OR },
        { label: 'Bán lẻ cá nhân', value: 4.5, tone: S1 },
        { label: 'Cân bằng', value: 3.5, tone: S1 },
        { label: 'Doanh nghiệp lớn', value: 2.8, tone: S3 },
      ],
      unit: '%',
      decimals: 1,
    }),

  /* ------------------------------------------------------- Bài 2 · Lợi suất tài sản sinh lãi và chi phí vốn */
  'c10l2-g1': () => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        model: calc(
          [
            {
              id: 'thu-nhap-lai',
              title: 'Thu nhập lãi 4 quý',
              value: '166.324 tỷ',
              tone: S1,
            },
            {
              id: 'tai-san-sinh-lai',
              title: 'Tài sản sinh lãi bình quân',
              value: '2.243 nghìn tỷ',
              tone: GD,
            },
            {
              id: 'loi-suat',
              title: 'Lợi suất tài sản sinh lãi',
              value: '7,42%',
              tone: UP,
              emph: true,
            },
          ],
          ['÷', '='],
          'Lợi suất tài sản sinh lãi bằng thu nhập lãi 4 quý 166.324 tỷ đồng chia cho tài sản sinh lãi bình quân 2.243 nghìn tỷ đồng, bằng 7,42%',
        ),
      },
      {
        model: calc(
          [
            {
              id: 'chi-phi-lai',
              title: 'Chi phí lãi 4 quý',
              value: '70.513 tỷ',
              tone: S1,
            },
            {
              id: 'no-chiu-lai',
              title: 'Nợ chịu lãi bình quân',
              value: '1.816 nghìn tỷ',
              tone: GD,
            },
            {
              id: 'chi-phi-von',
              title: 'Chi phí vốn',
              value: '3,88%',
              tone: DN,
              emph: true,
            },
          ],
          ['÷', '='],
          'Chi phí vốn bằng chi phí lãi 4 quý 70.513 tỷ đồng chia cho nợ chịu lãi bình quân 1.816 nghìn tỷ đồng, bằng 3,88%',
        ),
      },
    ],
  }),
  'c10l2-g2': () =>
    hbx(
      {
        title: 'Nợ chịu lãi bình quân · 1.816 nghìn tỷ đồng',
        items: [
          { label: 'Tiền gửi của khách hàng', value: 1651, tone: S1 },
          { label: 'Tiền gửi, vay TCTD khác', value: 110, tone: GD },
          { label: 'Phát hành giấy tờ có giá', value: 55, tone: OR },
        ],
      },
      { unit: 'nghìn tỷ đồng' },
    ),
  'c10l2-g3': () =>
    cx(
      bars({
        labels: ['Lợi suất', 'Chi phí vốn', 'Chênh lệch', 'NIM'],
        series: [
          {
            name: 'Lợi suất, chi phí vốn, chênh lệch và NIM',
            values: [7.42, 3.88, 3.53, 4.27],
            tone: UP,
            perBarTones: [UP, DN, S1, GD],
          },
        ],
        unit: '%',
        values: true,
      }),
      {
        sublabels: ['tài sản sinh lãi', '', 'lợi suất − chi phí', ''],
        value_format: { suffix: '%' },
        bounds: [0, 8],
        ticks: [0, 2, 4, 6, 8],
        caption_value: '+0,74 nhờ phần vốn chủ',
        caption_tone: 'warn',
      },
    ),

  /* ------------------------------------------------------- Bài 3 · CIR */
  'c10l3-g1': () =>
    calc(
      [
        {
          id: 'chi-phi-hoat-dong',
          title: 'Chi phí hoạt động 4 quý',
          value: '40.020 tỷ',
          sub: 'Kết quả kinh doanh',
          tone: DN,
        },
        {
          id: 'toi',
          title: 'Tổng thu nhập hoạt động',
          value: '123.181 tỷ',
          sub: 'TOI 4 quý',
          tone: S1,
        },
        {
          id: 'cir',
          title: 'CIR',
          value: '32,5%',
          sub: '100 đồng thu nhập tốn 32,5 đồng chi phí',
          tone: UP,
          emph: true,
        },
      ],
      ['÷', '='],
      'CIR bằng chi phí hoạt động 4 quý 40.020 tỷ đồng chia cho tổng thu nhập hoạt động 123.181 tỷ đồng, bằng 32,5%',
    ),
  'c10l3-g2': () =>
    wfNoted(
      {
        steps: [
          { label: 'Thu nhập lãi thuần', value: 95811, kind: 'base', tone: S1 },
          { label: 'Thu nhập ngoài lãi', value: 27370, kind: 'add', tone: S3 },
          { label: 'Tổng thu nhập hoạt động', value: 123181, kind: 'total', tone: GD },
          { label: 'Chi phí hoạt động', value: 40020, kind: 'sub', tone: DN },
          { label: 'Lợi nhuận trước dự phòng', value: 83161, kind: 'total', tone: UP },
        ],
        alt: 'Thu nhập lãi thuần 95.811 tỷ đồng cộng thu nhập ngoài lãi 27.370 tỷ đồng thành tổng thu nhập hoạt động 123.181 tỷ đồng; trừ chi phí hoạt động 40.020 tỷ đồng còn lợi nhuận trước dự phòng 83.161 tỷ đồng; CIR bằng 40.020 chia 123.181, xấp xỉ 32,5%',
      },
      '4 quý gần nhất · tỷ đồng',
      'CIR = 40.020 ÷ 123.181 ≈ 32,5%',
      'warn',
    ),
  'c10l3-g3': () =>
    lines({
      labels: Q8,
      series: [
        {
          name: 'Ngân hàng A · CIR giảm dần (%)',
          values: [45, 44, 42.5, 41, 39.5, 38, 37, 36],
          tone: UP,
        },
        {
          name: 'Ngân hàng B · CIR tăng dần (%)',
          values: [36, 37, 39, 41, 43, 45, 47, 49],
          tone: DN,
        },
      ],
      unit: '%',
    }),

  /* ------------------------------------------------------- Bài 4 · Tỷ trọng thu nhập ngoài lãi */
  'c10l4-g1': () => ({
    kind: 'segment_bar',
    unit: 'tỷ đồng',
    max: 34329,
    rows: [
      {
        label: 'Tổng thu nhập hoạt động Q2/26',
        total: { text: '34.329 tỷ đồng' },
        segments: [
          { value: 27283, label: 'Thu nhập lãi thuần · 79,5%', sub: '27.283 tỷ', tone: S1 },
          { value: 7047, label: 'Ngoài lãi · 20,5%', sub: '7.047 tỷ', tone: GD },
        ],
      },
    ],
    brackets: [
      {
        row: 0,
        from: 27283,
        to: 34329,
        label: 'Tỷ trọng ngoài lãi = 7.047 ÷ 34.329 ≈ 20,5%',
        tone: GD,
      },
    ],
    alt: 'Tổng thu nhập hoạt động quý Q2/26 là 34.329 tỷ đồng, gồm 27.283 tỷ thu nhập lãi thuần (79,5%) và 7.047 tỷ thu nhập ngoài lãi (20,5%); tỷ trọng ngoài lãi bằng 7.047 chia 34.329, xấp xỉ 20,5%',
  }),
  'c10l4-g2': () =>
    hbx(
      {
        title: 'Thu nhập ngoài lãi Q2/26 theo từng dòng · tỷ đồng',
        items: [
          { label: 'Lãi thuần từ dịch vụ', value: 3400, tone: S3 },
          { label: 'Kinh doanh ngoại hối', value: 1150, tone: S3 },
          { label: 'Hoạt động khác', value: 1500, tone: GD },
          { label: 'Chứng khoán đầu tư', value: 600, tone: OR },
          { label: 'Chứng khoán kinh doanh', value: 250, tone: OR },
          { label: 'Góp vốn, mua cổ phần', value: 147, tone: GD },
        ],
      },
      { unit: 'tỷ đồng' },
    ),
  'c10l4-g3': () =>
    lines({
      title: 'nghìn tỷ đồng · minh họa',
      labels: Q8,
      series: [
        {
          name: 'Lãi thuần dịch vụ · đều đặn',
          values: [2.6, 2.7, 2.8, 2.9, 3.0, 3.1, 3.3, 3.4],
          tone: S3,
        },
        {
          name: 'Lãi chứng khoán · thất thường',
          values: [0.9, 0.2, 1.3, 0.4, 1.4, -0.2, 1.6, 0.85],
          tone: OR,
        },
      ],
      unit: 'nghìn tỷ đồng',
    }),

  /* ------------------------------------------------------- Bài 5 · Tăng trưởng lợi nhuận trước dự phòng */
  'c10l5-g1': () =>
    wfNoted(
      {
        steps: [
          { label: 'Tổng thu nhập hoạt động', value: 34329, kind: 'base', tone: S1 },
          { label: 'Chi phí hoạt động', value: 10662, kind: 'sub', tone: DN },
          { label: 'Lợi nhuận trước dự phòng', value: 23667, kind: 'total', tone: GD },
          { label: 'Chi phí dự phòng', value: 4600, kind: 'sub', tone: DN },
          { label: 'Lợi nhuận trước thuế', value: 19067, kind: 'total', tone: UP },
        ],
        alt: 'Quý Q2/26: tổng thu nhập hoạt động 34.329 tỷ đồng trừ chi phí hoạt động 10.662 tỷ đồng còn lợi nhuận trước dự phòng 23.667 tỷ đồng; trừ chi phí dự phòng 4.600 tỷ đồng còn lợi nhuận trước thuế 19.067 tỷ đồng. PPOP nằm giữa: đã trừ chi phí hoạt động, chưa trừ dự phòng',
      },
      'Quý Q2/26 · tỷ đồng',
      'PPOP nằm giữa: đã trừ chi phí hoạt động, chưa trừ dự phòng',
      'price',
    ),
  'c10l5-g2': () => {
    const v = [16292, 16133, 17300, 16227, 18719, 18629, 22147, 23667];
    return cx(
      bars({
        title: 'PPOP từng quý · tỷ đồng',
        labels: Q8,
        series: [
          {
            name: 'PPOP',
            values: v,
            tone: S1,
            /* bản mẫu tô đậm hai cột Q2/25 và Q2/26 (i = 3, 7), các cột còn lại mờ đi */
            perBarTones: v.map((_, i) => (i === 3 || i === 7 ? null : P3)),
          },
        ],
        unit: 'tỷ đồng',
        values: true,
      }),
      { caption_value: '+45,9% so với cùng kỳ', caption_tone: 'warn' },
    );
  },
  'c10l5-g3': () =>
    bars({
      title: 'Tăng trưởng của từng chỉ tiêu · %',
      labels: ['PPOP', 'Chi phí dự phòng', 'Lợi nhuận trước thuế'],
      series: [
        { name: 'Ngân hàng A · tăng nhờ kinh doanh (%)', values: [18, 15, 19], tone: UP },
        { name: 'Ngân hàng B · tăng nhờ giảm dự phòng (%)', values: [2, -25, 24], tone: DN },
      ],
      unit: '%',
      values: true,
    }),

  /* ------------------------------------------------------- Bài 6 · Chi phí tín dụng */
  'c10l6-g1': () =>
    calc(
      [
        {
          id: 'chi-phi-du-phong',
          title: 'Chi phí dự phòng 4 quý',
          value: '18.329 tỷ',
          sub: 'Kết quả kinh doanh',
          tone: DN,
        },
        {
          id: 'cho-vay-binh-quan',
          title: 'Cho vay KH bình quân',
          value: '1.580 nghìn tỷ',
          sub: 'Bảng cân đối · (1.450 + 1.709) ÷ 2',
          tone: S1,
        },
        {
          id: 'chi-phi-tin-dung',
          title: 'Chi phí tín dụng',
          value: '1,16%',
          sub: '100 đồng cho vay trích 1,16 đồng mỗi năm',
          tone: GD,
          emph: true,
        },
      ],
      ['÷', '='],
      'Chi phí tín dụng bằng chi phí dự phòng 4 quý 18.329 tỷ đồng chia cho cho vay khách hàng bình quân 1.580 nghìn tỷ đồng, bằng 1,16%',
    ),
  'c10l6-g2': () => ({
    kind: 'segment_bar',
    unit: 'tỷ đồng',
    max: 83161,
    rows: [
      {
        label: 'Lợi nhuận trước dự phòng 4 quý',
        sub: 'Cứ 100 đồng lợi nhuận trước dự phòng, 22 đồng dành cho rủi ro cho vay',
        total: { text: '83.161 tỷ đồng' },
        segments: [
          { value: 18329, label: 'Chi phí dự phòng · 22%', sub: '18.329 tỷ', tone: DN },
          { value: 64832, label: 'Lợi nhuận trước thuế · 78%', sub: '64.832 tỷ', tone: UP },
        ],
      },
    ],
    alt: 'Lợi nhuận trước dự phòng 4 quý là 83.161 tỷ đồng, gồm 18.329 tỷ chi phí dự phòng (22%) và 64.832 tỷ lợi nhuận trước thuế (78%); cứ 100 đồng lợi nhuận trước dự phòng thì 22 đồng dành cho rủi ro cho vay',
  }),
  'c10l6-g3': () =>
    lines({
      labels: Q8,
      series: [
        {
          name: 'Ngân hàng A · ổn định (%)',
          values: [1.1, 1.15, 1.1, 1.2, 1.15, 1.1, 1.2, 1.15],
          tone: UP,
        },
        {
          name: 'Ngân hàng B · tăng nhanh (%)',
          values: [1.0, 1.1, 1.3, 1.5, 1.8, 2.1, 2.4, 2.7],
          tone: DN,
        },
      ],
      unit: '%',
      refs: [{ value: 2, label: 'Mức 2%', tone: GD }],
    }),

  /* ------------------------------------------------------- Bài 7 · Tỷ lệ dự phòng / Dư nợ */
  'c10l7-g1': () => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        title: 'Bảng cân đối Q2/26 · tỷ đồng',
        model: calc(
          [
            {
              id: 'cho-vay',
              title: 'Cho vay khách hàng',
              value: '1.709.127',
              tone: S1,
            },
            {
              id: 'du-phong',
              title: 'Dự phòng rủi ro cho vay',
              value: '(28.983)',
              tone: DN,
            },
            {
              id: 'cho-vay-thuan',
              title: 'Cho vay khách hàng thuần',
              value: '1.680.144',
            },
          ],
          ['+', '='],
          'Cho vay khách hàng 1.709.127 tỷ đồng trừ dự phòng rủi ro cho vay 28.983 tỷ đồng (ghi trong ngoặc vì là số trừ) còn cho vay khách hàng thuần 1.680.144 tỷ đồng',
        ),
      },
      {
        title: 'Tỷ lệ dự phòng / Dư nợ',
        tone: GD,
        model: calc(
          [
            {
              id: 'du-phong',
              title: 'Dự phòng rủi ro cho vay',
              value: '28.983',
              tone: DN,
            },
            {
              id: 'du-no',
              title: 'Cho vay khách hàng',
              value: '1.709.127',
              tone: S1,
            },
            {
              id: 'ty-le',
              title: 'Tỷ lệ dự phòng / Dư nợ',
              value: '1,70%',
              sub: 'Bộ đệm cho 100 đồng cho vay',
              tone: GD,
              emph: true,
            },
          ],
          ['÷', '='],
          'Tỷ lệ dự phòng trên dư nợ bằng 28.983 chia cho 1.709.127, bằng 1,70%: bộ đệm cho 100 đồng cho vay',
        ),
      },
    ],
  }),
  'c10l7-g2': () => ({
    kind: 'flow',
    layout: 'row',
    nodes: [
      {
        id: 'chay-vao',
        title: 'Chảy vào',
        sub: 'Chi phí dự phòng trích trong kỳ',
        tone: UP,
        caption: 'Kết quả kinh doanh',
      },
      {
        id: 'so-du-du-phong',
        title: 'Số dư dự phòng',
        sub: 'Bảng cân đối',
        tone: GD,
        emph: true,
        caption: 'Tử số của tỷ lệ',
      },
      {
        id: 'chay-ra',
        title: 'Chảy ra',
        sub: 'Dùng để xử lý khoản vay không thu hồi được',
        tone: DN,
      },
    ],
    edges: 'sequential',
    alt: 'Bể dự phòng: chi phí dự phòng trích trong kỳ ở kết quả kinh doanh chảy vào số dư dự phòng trên bảng cân đối, là tử số của tỷ lệ; số dư này được dùng để xử lý khoản vay không thu hồi được',
  }),
  'c10l7-g3': () =>
    lines({
      labels: Q8,
      series: [
        {
          name: 'Ngân hàng A · bộ đệm dày lên (%)',
          values: [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1],
          tone: UP,
        },
        {
          name: 'Ngân hàng B · bộ đệm mỏng đi (%)',
          values: [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.85],
          tone: DN,
        },
      ],
      unit: '%',
      refs: [{ value: 1, label: 'Mức 1%', tone: GD }],
    }),

  /* ------------------------------------------------------- Bài 8 · Tăng trưởng tín dụng và huy động */
  'c10l8-g1': () => ({
    kind: 'compare',
    layout: 'stack',
    items: [
      {
        model: bars({
          title: 'Đơn vị: nghìn tỷ đồng',
          labels: ['Q2/25', 'Q2/26'],
          series: [
            { name: 'Cho vay KH', values: [1450, 1709], tone: S1 },
            { name: 'Tiền gửi KH', values: [1605, 1697], tone: GD },
          ],
          unit: 'nghìn tỷ đồng',
          values: true,
        }),
      },
      {
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            {
              id: 'tang-truong-tin-dung',
              title: 'Tăng trưởng tín dụng',
              value: '+17,9%',
              tone: S1,
              emph: true,
            },
            {
              id: 'tang-truong-huy-dong',
              title: 'Tăng trưởng huy động',
              value: '+5,7%',
              tone: GD,
              emph: true,
            },
          ],
          alt: 'Từ Q2/25 đến Q2/26 cho vay khách hàng tăng từ 1.450 lên 1.709 nghìn tỷ đồng, tức tăng trưởng tín dụng +17,9%; tiền gửi khách hàng tăng từ 1.605 lên 1.697 nghìn tỷ đồng, tức tăng trưởng huy động +5,7%',
        },
      },
    ],
  }),
  'c10l8-g2': () => {
    const panel = (
      title: string,
      tone: ChartTone,
      credit: number,
      deposit: number,
      msg: string,
    ) => ({
      title,
      tone,
      model: cx(
        bars({
          labels: ['Tín dụng', 'Huy động'],
          series: [
            {
              name: 'Tăng trưởng (%)',
              values: [credit, deposit],
              tone: S1,
              perBarTones: [S1, GD],
            },
          ],
          unit: '%',
          values: true,
        }),
        {
          value_format: { suffix: '%' },
          bounds: [0, 25],
          caption_value: msg,
          caption_tone: tone === UP ? 'pos' : tone === DN ? 'neg' : 'warn',
        },
      ),
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        panel('Cân bằng', UP, 15, 15, 'Nguồn vốn theo kịp'),
        panel('Tín dụng vượt', DN, 22, 8, 'Phải tìm vốn đắt hơn'),
        panel('Huy động vượt', GD, 8, 18, 'Thừa vốn, sinh lời thấp'),
      ],
    };
  },
  'c10l8-g3': () => ({
    kind: 'series_panels',
    x: { start: 0, end: 7, ticks: Q8 },
    marks: [],
    panels: [
      {
        title: '',
        bounds: [0, 30],
        ticks: [0, 5, 10, 15, 20, 25, 30],
        digits: 0,
        series: [
          {
            name: 'Tăng trưởng tín dụng (%)',
            role: S1,
            width: 2,
            values: [14, 16, 18, 20, 22, 24, 25, 26],
          },
          {
            name: 'Tăng trưởng huy động (%)',
            role: GD,
            width: 2,
            values: [13, 12, 11, 10, 9, 8, 7, 6],
          },
        ],
        fill_between: { a: 0, b: 1, above: DN, below: DN },
        notes: [{ i: 5, value: 16, text: 'Khoảng chênh rộng dần', tone: 'neg' }],
      },
    ],
    alt: 'Tăng trưởng tín dụng tăng từ 14% lên 26% còn tăng trưởng huy động giảm từ 13% xuống 6% từ Q3/24 đến Q2/26, khoảng chênh giữa hai đường rộng dần',
  }),

  /* ------------------------------------------------------- Bài 9 · LDR */
  'c10l9-g1': () =>
    calc(
      [
        {
          id: 'cho-vay',
          title: 'Cho vay khách hàng',
          value: '1.709 nghìn tỷ',
          sub: 'Bảng cân đối Q2/26',
          tone: S1,
        },
        {
          id: 'tien-gui',
          title: 'Tiền gửi khách hàng',
          value: '1.697 nghìn tỷ',
          sub: 'Bảng cân đối Q2/26',
          tone: GD,
        },
        {
          id: 'ldr',
          title: 'LDR đơn giản',
          value: '100,7%',
          sub: 'Cho vay nhiều hơn tiền gửi khách hàng',
          tone: DN,
          emph: true,
        },
      ],
      ['÷', '='],
      'LDR đơn giản bằng cho vay khách hàng 1.709 nghìn tỷ đồng chia cho tiền gửi khách hàng 1.697 nghìn tỷ đồng, bằng 100,7%: cho vay nhiều hơn tiền gửi',
    ),
  'c10l9-g2': () => ({
    kind: 'scale',
    orientation: 'h',
    domain: [60, 120],
    ticks: [60, 70, 80, 90, 100, 110, 120].map(T),
    zones: [
      { from: 60, to: 80, tone: S1, label: 'Thấp' },
      { from: 80, to: 95, tone: UP, label: 'Vừa phải' },
      { from: 95, to: 120, tone: DN, label: 'Cao' },
    ],
    markers: [
      { v: 90.4, label: 'Q2/25', sub: '90,4%', tone: 'price', side: 'a' },
      { v: 100.7, label: 'Q2/26', sub: '100,7%', tone: GD, side: 'a' },
    ],
    alt: 'Vùng tham khảo của LDR đơn giản cho ngân hàng mẫu: thấp từ 60% đến 80%, vừa phải từ 80% đến 95%, cao từ 95% đến 120%. Q2/25 ở 90,4% (vừa phải), Q2/26 ở 100,7% (vùng cao). Ngưỡng chỉ để tham khảo, khác LDR theo quy định của Ngân hàng Nhà nước',
  }),
  'c10l9-g3': () => {
    const panel = (title: string, tone: ChartTone, loan: number, msg: string) => ({
      title,
      tone,
      model: cx(
        bars({
          labels: ['Tiền gửi', 'Cho vay'],
          series: [
            {
              name: 'Số dư trên 100 đồng tiền gửi',
              values: [100, loan],
              tone: GD,
              perBarTones: [GD, S1],
            },
          ],
          unit: 'đồng',
          values: true,
          refs: [{ value: 100, label: '100' }],
        }),
        {
          bounds: [0, 120],
          caption_value: msg,
          caption_tone: tone === DN ? 'neg' : 'p1',
        },
      ),
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        panel('Ngân hàng A · LDR 75%', S1, 75, 'Còn 25 đồng tiền gửi chưa cho vay'),
        panel('Ngân hàng B · LDR 110%', DN, 110, 'Thiếu 10 đồng, phải vay nguồn khác'),
      ],
    };
  },

  /* ------------------------------------------------------- Bài 10 · Lãi dự thu / Dư nợ */
  'c10l10-g1': () => ({
    kind: 'segment_bar',
    unit: '%',
    max: 100,
    rows: [
      {
        label: 'Thu nhập lãi ghi nhận trong kỳ',
        sub: 'Kết quả kinh doanh',
        segments: [
          {
            value: 86,
            label: 'Đã thu bằng tiền',
            sub: 'Tiền lãi thực thu · Báo cáo lưu chuyển tiền tệ',
            tone: S3,
          },
          {
            value: 14,
            label: 'Chưa thu',
            sub: 'Lãi, phí phải thu · Bảng cân đối kế toán · Tử số của tỷ lệ',
            tone: GD,
          },
        ],
      },
    ],
    alt: 'Thu nhập lãi ghi nhận trong kỳ trên kết quả kinh doanh chia hai phần: phần đã thu bằng tiền là tiền lãi thực thu trên báo cáo lưu chuyển tiền tệ, phần chưa thu là lãi, phí phải thu trên bảng cân đối kế toán, chính là tử số của tỷ lệ',
  }),
  'c10l10-g2': () =>
    calc(
      [
        {
          id: 'lai-phi-phai-thu',
          title: 'Lãi, phí phải thu',
          value: '25.968 tỷ',
          sub: 'Bảng cân đối Q2/26',
          tone: GD,
        },
        {
          id: 'cho-vay',
          title: 'Cho vay khách hàng',
          value: '1.709 nghìn tỷ',
          sub: 'Bảng cân đối Q2/26',
          tone: S1,
        },
        {
          id: 'lai-du-thu',
          title: 'Lãi dự thu / Dư nợ',
          value: '1,52%',
          sub: '100 đồng cho vay có 1,52 đồng lãi chưa thu',
          tone: OR,
          emph: true,
        },
      ],
      ['÷', '='],
      'Lãi dự thu trên dư nợ bằng lãi, phí phải thu 25.968 tỷ đồng chia cho cho vay khách hàng 1.709 nghìn tỷ đồng, bằng 1,52%',
    ),
  'c10l10-g3': () =>
    lines({
      title: 'Chỉ số, Q3/24 = 100',
      labels: Q8,
      series: [
        {
          name: 'Lãi, phí phải thu',
          values: [100, 107.9, 116.0, 118.8, 129.6, 135.3, 149.3, 160.6],
          tone: OR,
        },
        {
          name: 'Cho vay khách hàng',
          values: [100, 103.1, 107.3, 108.0, 114.0, 115.1, 125.0, 127.3],
          tone: S1,
        },
      ],
      unit: 'chỉ số',
    }),

  /* ------------------------------------------------------- Bài 11 · VCSH / Tổng tài sản */
  'c10l11-g1': () => ({
    kind: 'compare',
    layout: 'stack',
    title: 'Bảng cân đối Q2/26',
    items: [
      {
        model: {
          kind: 'segment_bar',
          unit: 'nghìn tỷ',
          max: 2572.6,
          rows: [
            {
              label: 'Tổng tài sản',
              total: { text: '2.573 nghìn tỷ' },
              segments: [
                { value: 2332.4, label: 'Nợ phải trả', sub: '2.332 nghìn tỷ', tone: S2 },
                { value: 240.2, label: 'Vốn chủ sở hữu', sub: '240,2 nghìn tỷ', tone: S1 },
              ],
            },
          ],
          alt: 'Bảng cân đối Q2/26: tổng tài sản 2.573 nghìn tỷ đồng gồm nợ phải trả 2.332 nghìn tỷ và vốn chủ sở hữu 240,2 nghìn tỷ',
        },
      },
      {
        model: {
          kind: 'flow',
          layout: 'row',
          nodes: [
            {
              id: 'vcsh-tong-tai-san',
              title: 'VCSH / Tổng tài sản',
              value: '9,3%',
              tone: GD,
              emph: true,
            },
            {
              id: 'don-bay',
              title: 'Đòn bẩy',
              value: '10,7 lần',
              tone: OR,
              emph: true,
            },
          ],
          alt: 'Vốn chủ sở hữu bằng 9,3% tổng tài sản, tương ứng đòn bẩy 10,7 lần',
        },
      },
    ],
  }),
  'c10l11-g2': () => {
    const panel = (title: string, tone: ChartTone, equity: number, msg: string) => ({
      title,
      tone,
      model: {
        kind: 'segment_bar' as const,
        unit: '%',
        max: 100,
        rows: [
          {
            label: 'Tổng tài sản 100%',
            total: { text: msg, tone },
            segments: [
              { value: 100 - equity, label: 'Nợ phải trả', tone: S2 },
              { value: 3, label: 'Lỗ 3% tài sản', tone: DN },
              { value: equity - 3, label: `Vốn chủ còn ${equity - 3}%`, tone: S1 },
            ],
          },
        ],
        alt: `${title}. Lỗ 3% tài sản làm vốn chủ còn ${equity - 3}%. ${msg}`,
      },
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        panel('Ngân hàng A · vốn chủ 10%', UP, 10, 'Lỗ lấy đi 30% vốn chủ'),
        panel('Ngân hàng B · vốn chủ 5%', DN, 5, 'Lỗ lấy đi 60% vốn chủ'),
      ],
    };
  },
  'c10l11-g3': () =>
    bars({
      title: 'Cùng ROA 1,5% · số minh họa',
      labels: ['VCSH / Tổng tài sản 12%', 'VCSH / Tổng tài sản 9%', 'VCSH / Tổng tài sản 6%'],
      series: [
        { name: 'ROA (%)', values: [1.5, 1.5, 1.5], tone: S1 },
        { name: 'ROE (%)', values: [12.5, 16.7, 25], tone: GD },
      ],
      unit: '%',
      values: true,
    }),
};

export const CH10_BUILDERS: Record<string, Builder> = ch10;

/** Chú giải mà bản mẫu vẽ trong svg (hàm `leg()`), theo id chart. */
const L = (...items: [string, ChartTone][]): LegendItem[] =>
  items.map(([label, tone]) => ({ label, tone }));

export const CH10_LEGENDS: Record<string, LegendItem[]> = {
  'c10l3-g3': L(['Ngân hàng A · CIR giảm dần (%)', UP], ['Ngân hàng B · CIR tăng dần (%)', DN]),
  'c10l4-g2': L(['Ổn định', S3], ['Dao động theo thị trường', OR], ['Nguồn khác', GD]),
  'c10l4-g3': L(['Lãi thuần dịch vụ · đều đặn', S3], ['Lãi chứng khoán · thất thường', OR]),
  'c10l5-g3': L(
    ['Ngân hàng A · tăng nhờ kinh doanh (%)', UP],
    ['Ngân hàng B · tăng nhờ giảm dự phòng (%)', DN],
  ),
  'c10l6-g3': L(['Ngân hàng A · ổn định (%)', UP], ['Ngân hàng B · tăng nhanh (%)', DN]),
  'c10l7-g3': L(['Ngân hàng A · bộ đệm dày lên (%)', UP], ['Ngân hàng B · bộ đệm mỏng đi (%)', DN]),
  'c10l8-g1': L(['Cho vay KH', S1], ['Tiền gửi KH', GD]),
  'c10l8-g3': L(['Tăng trưởng tín dụng (%)', S1], ['Tăng trưởng huy động (%)', GD]),
  'c10l10-g3': L(['Lãi, phí phải thu', OR], ['Cho vay khách hàng', S1]),
  'c10l11-g3': L(['ROA (%)', S1], ['ROE (%)', GD]),
};
