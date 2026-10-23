/**
 * Builder cho 33 "Biểu đồ đại diện" của Chương 8-13.
 *
 * Bản mẫu v3.3 vẽ thẻ đại diện bằng SVG viết tay tĩnh (không có `id`, không do page script
 * sinh ra), nên không thể dùng `gateSvgIds` để đối chiếu. Vì vậy các chart này dùng id riêng
 * `c{chapter}l{lesson}-rep` và một registry riêng (`REPRESENTATIVE_BUILDERS`), tách khỏi
 * `CHART_BUILDERS` vốn phải khớp với `id` của svg trong bản mẫu.
 *
 * Mỗi biểu đồ ra kind `fundamental`: đúng mô hình một thẻ của Dashboard phân tích (spec Dashboard
 * §9, §11; spec cập nhật 22-10 DB-02), để Học viện và Dashboard vẽ bằng cùng một bộ khuôn. Số liệu
 * doanh nghiệp mẫu lấy từ `rep-data.ts` (đọc ra từ chính hình SVG của bản mẫu); các giá trị tóm tắt
 * (CAGR, độ lệch chuẩn, số năm dương liên tục) tính lại ở đây và phải khớp số lớn của bản mẫu.
 */
import type { Builder, Model } from './kit.js';
import { meanSd, r4 } from './fund.js';
import { REPRESENTATIVE_DATA } from './rep-data.js';
import type { RepresentativeData } from './rep-data.js';

type Fundamental = Model<'fundamental'>;
type FundamentalChart = Fundamental['chart'];

/** Chuỗi dài hơn mức này là chuỗi định giá theo ngày (khuôn F). */
const MAX_PERIODS = 32;

/** Ngày giao dịch đầu tiên của chuỗi định giá mẫu: các mốc 07/23 … 01/26 của bản mẫu rơi đúng vào ngày làm việc. */
const DAILY_START = '2023-07-03';

/** Ba chỉ tiêu tăng trưởng YoY của Chương 8 so kỳ này với cùng kỳ năm trước (khuôn A). */
const GROWTH_IDS: Readonly<Record<string, true>> = {
  'c8l1-rep': true,
  'c8l2-rep': true,
  'c8l3-rep': true,
};

/**
 * Định nghĩa phải giống hệt thẻ Dashboard (spec cập nhật 22-10 DB-06): tên đường chính và ghi chú dưới
 * chú giải. Bản mẫu ghi gọn hơn, nên phần này đè lên số liệu đọc từ SVG.
 */
const DASHBOARD_WORDING: Readonly<Record<string, { mainName?: string; legendNote?: string }>> = {
  'c10l1-rep': { mainName: 'ROE (4 quý, cổ đông công ty mẹ)' },
  'c11l4-rep': { legendNote: 'Tiền gồm đầu tư tài chính ngắn hạn' },
};

/** "4,9 điểm %" -> { value: 4.9, unit: "điểm %" }. */
function parseHeadline(headline: string): { value: number; unit: string } {
  const match = /^(-?[\d.]+(?:,\d+)?)\s*(.*)$/.exec(headline.trim());
  if (!match) throw new Error(`headline ${headline} is not a number`);
  const value = Number((match[1] as string).replace(/\./g, '').replace(',', '.'));
  return { value, unit: (match[2] as string).trim() };
}

/** Kiểm tra giá trị tính lại khớp số lớn của bản mẫu sau khi làm tròn như bản mẫu. */
function expectHeadline(
  id: string,
  computed: number,
  headline: { value: number },
  decimals: number,
): void {
  const rounded = Number(computed.toFixed(decimals));
  if (Math.abs(rounded - headline.value) > 1e-9)
    throw new Error(
      `${id}: computed ${computed} does not round to the mockup headline ${headline.value}`,
    );
}

/** Ngày làm việc (thứ 2 đến thứ 6) liên tiếp từ `start`. */
function tradingDays(start: string, count: number): string[] {
  const out: string[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  while (out.length < count) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

function decimalsOf(unit: string): number {
  if (unit === '%' || unit === 'điểm %') return 1;
  if (unit === 'lần') return 2;
  return 0;
}

function series(name: string, values: readonly number[]): { name: string; v: number[] } {
  return { name, v: [...values] };
}

/** Khuôn A, B, C: đường chỉ tiêu ở tầng trên, cột thành phần ở tầng dưới. */
function bandedChart(id: string, d: RepresentativeData): FundamentalChart {
  const sub = d.sub!;
  return {
    name: d.metric,
    kind: GROWTH_IDS[id] ? 'A' : sub.unit === 'ngày' ? 'C' : 'B',
    unit: d.unit ?? '',
    labels: [...d.labels],
    main: [series(d.lineName ?? d.metric, d.line!)],
    sub: {
      unit: sub.unit,
      type: sub.mode,
      series: sub.series.map((s) => series(s.name, s.values)),
    },
  };
}

/** Khuôn D: cột giá trị năm, `hero` = CAGR % tính từ năm đầu tới năm cuối. */
function cagrChart(id: string, d: RepresentativeData): FundamentalChart {
  const bars = d.bar!;
  const first = bars[0] as number;
  const last = bars[bars.length - 1] as number;
  const cagr = ((last / first) ** (1 / (bars.length - 1)) - 1) * 100;
  const headline = parseHeadline(d.headline);
  expectHeadline(id, cagr, headline, 1);
  return {
    name: d.metric,
    kind: 'D',
    unit: headline.unit,
    labels: [...d.labels],
    main: [series(d.barName ?? d.metric, bars)],
    mainUnit: d.unit ?? '',
    hero: r4(cagr),
  };
}

/** Khuôn E2: cột LNST/FCF năm, `hero` = số năm của chuỗi dương liên tục gần nhất. */
function streakChart(id: string, d: RepresentativeData): FundamentalChart {
  const bars = d.bar!;
  let streak = 0;
  for (let i = bars.length - 1; i >= 0 && (bars[i] as number) > 0; i -= 1) streak += 1;
  const headline = parseHeadline(d.headline);
  expectHeadline(id, streak, headline, 0);
  if (d.fadedBefore !== undefined && d.fadedBefore !== bars.length - streak)
    throw new Error(
      `${id}: fadedBefore ${d.fadedBefore} differs from the streak start ${bars.length - streak}`,
    );
  return {
    name: d.metric,
    kind: 'E2',
    unit: headline.unit,
    labels: [...d.labels],
    main: [series(d.metric, bars)],
    mainUnit: d.unit ?? '',
    hero: streak,
  };
}

/**
 * Khuôn E1: đường giá trị năm, bình quân và bình quân ± độ lệch chuẩn do bộ khuôn vẽ. `hero` là độ
 * lệch chuẩn (điểm %) hoặc hệ số biến thiên (%, khi đơn vị của chuỗi không phải %).
 */
function stabilityChart(id: string, d: RepresentativeData): FundamentalChart {
  const values = d.line!;
  const { m, d: sd } = meanSd(values);
  const headline = parseHeadline(d.headline);
  const hero = headline.unit === '%' && d.unit !== '%' ? (sd / Math.abs(m)) * 100 : sd;
  expectHeadline(id, hero, headline, 1);
  return {
    name: d.metric,
    kind: 'E1',
    unit: headline.unit,
    labels: [...d.labels],
    main: [series(d.lineName ?? d.metric, values)],
    mainUnit: d.unit ?? '',
    hero: r4(hero),
  };
}

/** Khuôn F: chuỗi định giá theo ngày giao dịch; trung vị và dải do bộ khuôn tính trên cả giai đoạn. */
function dailyChart(id: string, d: RepresentativeData): FundamentalChart {
  const values = d.line!;
  const dates = tradingDays(DAILY_START, values.length);
  // Các mốc trục của bản mẫu (07/23, 01/24, …) phải rơi vào đúng tháng của ngày tại vị trí đó.
  (d.labelAt ?? []).forEach((index, k) => {
    const label = d.labels[k] as string;
    const date = dates[index] as string;
    if (`${date.slice(5, 7)}/${date.slice(2, 4)}` !== label)
      throw new Error(`${id}: tick ${label} at ${index} falls on ${date}`);
  });
  const headline = parseHeadline(d.headline);
  expectHeadline(id, values[values.length - 1] as number, headline, decimalsOf(d.unit ?? ''));
  return {
    name: d.metric,
    kind: 'F',
    unit: d.unit ?? '',
    labels: dates,
    main: [series(d.metric, values)],
  };
}

/** Khuôn F2: PEG cuối kỳ có điểm tròn và đường tham chiếu PEG = 1. */
function pegChart(d: RepresentativeData): FundamentalChart {
  return {
    name: d.metric,
    kind: 'F2',
    unit: d.unit ?? '',
    labels: [...d.labels],
    main: [series(d.lineName ?? d.metric, d.line!)],
    ref: d.threshold!.value,
  };
}

/** Một biểu đồ đại diện: dựng đúng khuôn Dashboard của chỉ tiêu đó. */
function chartOf(id: string, d: RepresentativeData): FundamentalChart {
  if (d.sub && d.line) return bandedChart(id, d);
  if (d.line && d.bar) return cagrChart(id, d);
  if (d.bar) return streakChart(id, d);
  if (!d.line) throw new Error(`${id}: representative chart has no data`);
  if (d.meanBand) return stabilityChart(id, d);
  if (d.threshold) return pegChart(d);
  if (d.line.length > MAX_PERIODS) return dailyChart(id, d);
  throw new Error(`${id}: no dashboard template for this representative chart`);
}

function buildRepresentative(id: string, d: RepresentativeData): Fundamental {
  const chart = chartOf(id, d);
  const wording = DASHBOARD_WORDING[id];
  const first = chart.main[0];
  if (wording?.mainName && first) chart.main[0] = { ...first, name: wording.mainName };
  if (wording?.legendNote) chart.legendNote = wording.legendNote;
  return { kind: 'fundamental', chart, alt: `${d.metric}: ${d.headline}` };
}

/** Registry riêng cho biểu đồ đại diện (id `c{chapter}l{lesson}-rep`). */
export const REPRESENTATIVE_BUILDERS: Readonly<Record<string, Builder>> = Object.fromEntries(
  Object.entries(REPRESENTATIVE_DATA).map(([id, d]) => [id, () => buildRepresentative(id, d)]),
);
