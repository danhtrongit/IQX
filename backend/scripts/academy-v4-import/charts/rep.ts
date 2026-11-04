/**
 * Builder cho 62 "Biểu đồ đại diện" của Chương 8-12.
 *
 * Bản mẫu v4 vẽ thẻ đại diện của mỗi bài Chương 8-12 bằng một hình tĩnh (không có `id`, không do page
 * script sinh ra), nên không thể dùng `gateSvgIds` để đối chiếu. Vì vậy các chart này dùng id riêng
 * `c{chapter}l{lesson}-rep` (vị trí bài trong catalog v4) và một registry riêng
 * (`REPRESENTATIVE_BUILDERS`), tách khỏi `CHART_BUILDERS` vốn phải khớp với `id` của svg trong bản mẫu.
 *
 * Mỗi biểu đồ ra kind `fundamental`: đúng mô hình một thẻ của Dashboard phân tích (spec Dashboard
 * §8, §9; v2: hai đường trên tầng trên cho A và B, mốc tham chiếu `ref` cho B, tối đa bốn cột ở tầng
 * dưới), để Học viện và Dashboard vẽ bằng cùng một bộ khuôn. Số liệu doanh nghiệp mẫu lấy từ
 * `rep-data.ts` (đọc ra từ chính hình SVG của bản mẫu); các giá trị tóm tắt (CAGR, độ lệch chuẩn, số
 * năm dương liên tục, giá trị cuối kỳ) tính lại ở đây và phải khớp số lớn của bản mẫu.
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

/**
 * Các chỉ tiêu khuôn A: tăng trưởng so với cùng kỳ năm trước (spec Dashboard §8). Tầng dưới là cột nhóm
 * "kỳ này" và "cùng kỳ" (riêng `c10l8` là cho vay và tiền gửi, kèm đường thứ hai). Mọi chỉ tiêu banded
 * còn lại là khuôn B, trừ Cash Conversion Cycle (khuôn C, ba cột số ngày).
 */
const GROWTH_IDS: Readonly<Record<string, true>> = {
  'c8l1-rep': true, // Tăng trưởng doanh thu
  'c8l2-rep': true, // Tăng trưởng LNST
  'c8l3-rep': true, // Tăng trưởng EPS
  'c10l5-rep': true, // Tăng trưởng lợi nhuận trước dự phòng
  'c10l8-rep': true, // Tăng trưởng tín dụng và huy động (2 đường)
  'c11l3-rep': true, // Tăng trưởng dư nợ cho vay
  'c12l1-rep': true, // Tăng trưởng doanh thu phí bảo hiểm gốc
};

/**
 * Định nghĩa phải giống hệt thẻ Dashboard (spec cập nhật 22-10 DB-06): tên đường chính và ghi chú dưới
 * chú giải. Bản mẫu ghi gọn hơn, nên phần này đè lên số liệu đọc từ SVG. Khóa theo vị trí bài của v4:
 * thẻ ROE là `c8l11-rep`, Net Debt / EBITDA là `c9l9-rep`.
 */
const DASHBOARD_WORDING: Readonly<Record<string, { mainName?: string; legendNote?: string }>> = {
  'c8l11-rep': { mainName: 'ROE (4 quý, cổ đông công ty mẹ)' },
  'c9l9-rep': { legendNote: 'Tiền gồm đầu tư tài chính ngắn hạn' },
};

/** "4,9 điểm %" -> { value: 4.9, unit: "điểm %" }. */
function parseHeadline(headline: string): { value: number; unit: string } {
  const match = /^(-?[\d.]+(?:,\d+)?)\s*(.*)$/.exec(headline.trim());
  if (!match) throw new Error(`headline ${headline} is not a number`);
  const value = Number((match[1] as string).replace(/\./g, '').replace(',', '.'));
  return { value, unit: (match[2] as string).trim() };
}

/**
 * Làm tròn như bản mẫu (nửa ra xa số 0 trên chuỗi thập phân ngắn nhất, như `toLocaleString`), khác
 * `toFixed` ở các giá trị rơi đúng nửa như 17,85.
 */
function roundHalfAway(value: number, decimals: number): number {
  const scaled = Number((Math.abs(value) * 10 ** decimals).toPrecision(12));
  const rounded = Math.round(scaled) / 10 ** decimals;
  return value < 0 ? -rounded : rounded;
}

/** Kiểm tra giá trị tính lại khớp số lớn của bản mẫu sau khi làm tròn như bản mẫu. */
function expectHeadline(
  id: string,
  computed: number,
  headline: { value: number },
  decimals: number,
): void {
  const rounded = roundHalfAway(computed, decimals);
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

/** Số lẻ của số lớn theo spec Dashboard §10: % và điểm % một chữ số, "lần" hai, còn lại không. */
function decimalsOf(unit: string): number {
  if (unit === '%' || unit === 'điểm %') return 1;
  if (unit === 'lần') return 2;
  return 0;
}

function series(name: string, values: readonly number[]): { name: string; v: number[] } {
  return { name, v: [...values] };
}

/**
 * Khuôn A, B, C: một hoặc hai đường chỉ tiêu ở tầng trên (A và B), mốc tham chiếu nét đứt (B), một đến
 * bốn cột thành phần ở tầng dưới. Số lớn của thẻ là giá trị cuối kỳ của đường 1.
 */
function bandedChart(id: string, d: RepresentativeData): FundamentalChart {
  const sub = d.sub as NonNullable<RepresentativeData['sub']>;
  const line = d.line as number[];
  const kind = GROWTH_IDS[id] ? 'A' : sub.unit === 'ngày' ? 'C' : 'B';
  if (d.line2 && kind !== 'A' && kind !== 'B') throw new Error(`${id}: kind ${kind} has one line`);
  if (d.line2 && (!d.line2Name || d.line2.length !== line.length))
    throw new Error(`${id}: second line needs a name and one value per label`);
  if (d.threshold && kind !== 'B') throw new Error(`${id}: only kind B carries a reference line`);
  const unit = d.unit ?? '';
  expectHeadline(id, line[line.length - 1] as number, parseHeadline(d.headline), decimalsOf(unit));
  const main = [series(d.lineName ?? d.metric, line)];
  if (d.line2) main.push(series(d.line2Name as string, d.line2));
  return {
    name: d.metric,
    kind,
    unit,
    labels: [...d.labels],
    main,
    sub: {
      unit: sub.unit,
      type: sub.mode,
      series: sub.series.map((s) => series(s.name, s.values)),
    },
    ...(d.threshold ? { ref: d.threshold.value } : {}),
  };
}

/** Khuôn D: cột giá trị năm, `hero` = CAGR % tính từ năm đầu tới năm cuối. */
function cagrChart(id: string, d: RepresentativeData): FundamentalChart {
  const bars = d.bar as number[];
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
  const bars = d.bar as number[];
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
  const values = d.line as number[];
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
  const values = d.line as number[];
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
    main: [series(d.lineName ?? d.metric, values)],
  };
}

/** Khuôn F2: PEG cuối kỳ có điểm tròn và đường tham chiếu PEG = 1. */
function pegChart(id: string, d: RepresentativeData): FundamentalChart {
  const values = d.line as number[];
  const threshold = d.threshold as NonNullable<RepresentativeData['threshold']>;
  expectHeadline(id, values[values.length - 1] as number, parseHeadline(d.headline), 2);
  return {
    name: d.metric,
    kind: 'F2',
    unit: d.unit ?? '',
    labels: [...d.labels],
    main: [series(d.lineName ?? d.metric, values)],
    ref: threshold.value,
  };
}

/** Một biểu đồ đại diện: dựng đúng khuôn Dashboard của chỉ tiêu đó. */
function chartOf(id: string, d: RepresentativeData): FundamentalChart {
  if (d.sub && d.line) return bandedChart(id, d);
  if (d.bar) return d.fadedBefore === undefined ? cagrChart(id, d) : streakChart(id, d);
  if (!d.line) throw new Error(`${id}: representative chart has no data`);
  if (d.meanBand) return stabilityChart(id, d);
  if (d.threshold) return pegChart(id, d);
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
