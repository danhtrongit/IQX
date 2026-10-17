import type { Builder } from './kit.js';
import { round4 } from './math.js';

/** Chapter 2 chart models (mockup ids `L*-g*`, prefixed `c2`). */

/** c2l1-g1: clients still trading after month m, +5 new clients a month; keep 97% vs 80%. */
export function c2l1Clients(): { A: number[]; B: number[] } {
  let a = 0;
  let b = 0;
  const A: number[] = [];
  const B: number[] = [];
  for (let m = 1; m <= 12; m++) {
    a = a * 0.97 + 5;
    b = b * 0.8 + 5;
    A.push(a);
    B.push(b);
  }
  return { A, B };
}

const hm = (h: number) => Math.round(h * 60);
const hhmm = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

export const CH2_BUILDERS: Record<string, Builder> = {
  'c2l1-g1': () => {
    const { A, B } = c2l1Clients();
    return {
      kind: 'category',
      mode: 'grouped',
      labels: A.map((_, i) => `T${i + 1}`),
      unit: 'khách',
      series: [
        { name: 'Bỏ bê', values: B.map(round4), tone: 'p3' },
        { name: 'Chăm sóc tốt', values: A.map(round4), tone: 'p1' },
      ],
      value_labels: 'last',
      bounds: [0, 60],
      ticks: [0, 20, 40, 60],
    };
  },
  'c2l3-g1': () => ({
    kind: 'segment_bar',
    max: 40,
    unit: 'người',
    rows: (
      [
        ['Gia đình', 10, 'pos'],
        ['Bạn bè thân', 20, 'pos'],
        ['Đồng nghiệp, người quen', 30, 'p1'],
        ['Mạng xã hội, cộng đồng', 40, 'p1'],
      ] as const
    ).map(([label, n, tone]) => ({
      label,
      segments: [{ value: n, tone }],
      total: { text: `≈ ${n} người` },
    })),
    alt: 'Các vòng quan hệ từ trong ra ngoài: gia đình, bạn bè thân, đồng nghiệp và người quen, mạng xã hội',
  }),
  'c2l5-g1': () => ({
    kind: 'segment_bar',
    max: 100,
    unit: '%',
    rows: [
      {
        label: 'Cuộc tư vấn',
        segments: [
          {
            value: 70,
            label: 'Khách nói 70%',
            sub: 'Mục tiêu, nỗi lo, kinh nghiệm, hoàn cảnh',
            tone: 'pos',
          },
          { value: 30, label: 'Bạn nói 30%', sub: 'Đặt câu hỏi, giải thích ngắn', tone: 'p1' },
        ],
      },
    ],
    alt: 'Trong buổi tư vấn khách nói 70%, bạn nói 30%',
  }),
  'c2l6-g1': () => ({
    kind: 'segment_bar',
    max: 5000000,
    unit: 'đ',
    rows: [
      {
        label: 'Chênh lệch phí 0,1%',
        sub: 'khi giao dịch 100 triệu',
        segments: [{ value: 100000, tone: 'warn' }],
        total: { text: '100.000 đ', tone: 'warn' },
      },
      {
        label: 'Một lần bán hoảng loạn',
        sub: 'sai 5% trên 100 triệu',
        segments: [{ value: 5000000, tone: 'neg' }],
        total: { text: '5.000.000 đ', tone: 'neg' },
      },
    ],
    alt: 'Chênh lệch phí 0,1% chỉ 100.000 đồng, một lần bán hoảng loạn mất 5.000.000 đồng',
  }),
  'c2l9-g1': () => {
    const P: [string, string, string, 'pos' | 'p1' | 'warn'][] = [
      ['Ngày 1', 'Kiểm tra tài khoản,', 'hướng dẫn ứng dụng', 'pos'],
      ['Ngày 3', 'Hỏi thăm lệnh đầu tiên,', 'giải đáp thắc mắc', 'pos'],
      ['Ngày 7', 'Gửi tài liệu học,', 'mời vào nhóm Zalo', 'p1'],
      ['Ngày 30', 'Cùng nhìn lại kết quả,', 'hỏi nhu cầu mới', 'p1'],
      ['Hằng tháng', 'Gọi hỏi thăm,', 'mời hội thảo', 'warn'],
    ];
    return {
      kind: 'milestones',
      points: P.map(([title, a, b, tone], i) => ({ at: i / 4, title, detail: [a, b], tone })),
      spans: [
        {
          from: 0,
          to: 0.75,
          label: '30 ngày đầu: khách dễ bỏ cuộc nhất, cần quan tâm nhiều nhất',
          tone: 'pos',
          side: 'below',
        },
      ],
      alt: 'Lịch chăm sóc khách mới: ngày 1, ngày 3, ngày 7, ngày 30 và hằng tháng',
    };
  },
  'c2l10-g1': () => {
    const B: [number, number, 'p4' | 'p1' | 'warn' | 'p5' | 'pos', string][] = [
      [8, 8.75, 'p4', 'Bản tin sáng'],
      [9, 11.5, 'p1', 'Theo dõi, hỗ trợ khách'],
      [11.5, 12, 'warn', 'Trưa'],
      [13, 15, 'p1', 'Hỗ trợ khách'],
      [15, 15.75, 'p5', 'Tổng kết'],
      [19, 21, 'pos', 'Tiếp cận người mới'],
    ];
    return {
      kind: 'gantt',
      domain: [hm(7.5), hm(21.5)],
      tick_format: 'hhmm',
      ticks: [8, 9, 11.5, 13, 15, 19, 21].map((h) => ({ v: hm(h), label: hhmm(h) })),
      highlight: { from: hm(9), to: hm(15) },
      rows: [
        {
          name: 'Lịch làm việc',
          segments: B.map(([a, b, tone, label]) => ({ from: hm(a), to: hm(b), tone, label })),
        },
      ],
      legend: [
        { tone: 'p4', label: '8:00 Gửi bản tin sáng' },
        { tone: 'warn', label: '11:30 Cập nhật trưa' },
        { tone: 'p5', label: '15:00 Tổng kết cuối ngày' },
        { tone: 'pos', label: '19:00-21:00 Nhắn tin, gọi điện, hẹn tư vấn' },
      ],
      alt: 'Lịch một ngày làm việc của chuyên viên tư vấn',
    };
  },
};
