/**
 * Luật nghi lễ Thần Tài (port nguyên từ `shared/ritual.ts` của IQX-KhuGiaoDich). Thuần, không chạm
 * cơ sở dữ liệu. Giờ theo múi giờ Việt Nam (UTC+7, không có giờ mùa hè); ngày lễ chưa được biết ở đây.
 *
 * Không có spec sản phẩm cho các con số dưới đây: chúng là mặc định chờ IQX xác nhận.
 */

import type { RitualDirection, RitualQue } from './floor-types.js';

export const RITUAL_RULES = {
  /** Dự đoán cho phiên đóng cửa trước giờ này (trước ATC 14:30–14:45). */
  cutoff: { hour: 14, minute: 30 },
  /** Máy chủ đọc điểm đóng cửa VNINDEX và chấm phiên sau giờ này. */
  resolveAfter: { hour: 15, minute: 0 },
  /** Giờ sớm nhất của báo giá trực tiếp được coi là điểm đóng cửa (ATC kết thúc 14:45). */
  liveCloseAt: { hour: 14, minute: 45 },
  /** Số mã mỗi người khấn. */
  tickersToPray: 3,
  /** Số mã hiện trong danh sách "được khấn nhiều nhất". */
  topTickers: 5,
  /** Mức đóng cửa dự đoán lệch quá tỷ lệ này so với giá trị hiện tại bị coi là gõ nhầm. */
  maxLevelDeviation: 0.1,
  /** Số tượng trong hall of fame. */
  statues: 3,
} as const;

/** Quẻ vui, lời lẽ nhẹ nhàng và không bao giờ là lời khuyên đầu tư. */
export const QUE_LIST: readonly RitualQue[] = [
  { id: 1, name: 'Đại Cát', luck: 5, verse: 'Kim ngân mãn đường, lộc đến tận cửa.', advice: 'Tâm vững, tay chắc, giữ kỷ luật như mọi ngày.' },
  { id: 2, name: 'Thượng Cát', luck: 5, verse: 'Gió thuận buồm căng, thuyền vàng ra khơi.', advice: 'Thuận gió cũng nhớ đặt điểm dừng lỗ.' },
  { id: 3, name: 'Trung Cát', luck: 4, verse: 'Nước chảy đá mòn, kiên trì ắt thành.', advice: 'Đi từng bước, chia nhỏ vị thế.' },
  { id: 4, name: 'Tiểu Cát', luck: 4, verse: 'Mầm non gặp mưa xuân, lộc nhỏ mà bền.', advice: 'Lãi nhỏ đều tay hơn ván lớn may rủi.' },
  { id: 5, name: 'Cát', luck: 4, verse: 'Trăng tròn soi lối, quý nhân phù trợ.', advice: 'Hỏi thêm SACO trước khi xuống tiền.' },
  { id: 6, name: 'Bình Hòa', luck: 3, verse: 'Mặt hồ phẳng lặng, chờ gió sẽ lên.', advice: 'Thị trường đi ngang thì kiên nhẫn là lộc.' },
  { id: 7, name: 'Bình An', luck: 3, verse: 'Giữ gốc là giữ lộc, an cư mới lạc nghiệp.', advice: 'Ưu tiên quản trị rủi ro hôm nay.' },
  { id: 8, name: 'Trung Bình', luck: 3, verse: 'Nửa nắng nửa mưa, cầm ô mà đi.', advice: 'Cân bằng tiền mặt và cổ phiếu.' },
  { id: 9, name: 'Tiểu Hung', luck: 2, verse: 'Mây che đỉnh núi, chậm một nhịp chẳng sao.', advice: 'Đừng đuổi giá, đợi điểm mua đẹp.' },
  { id: 10, name: 'Cẩn Thận', luck: 2, verse: 'Sông sâu chớ lội, đò đầy chớ sang.', advice: 'Hạn chế margin, giữ tâm lý thoải mái.' },
  { id: 11, name: 'Hồi Xuân', luck: 4, verse: 'Đông qua xuân tới, cây khô đâm chồi.', advice: 'Cơ hội đến với người đã chuẩn bị.' },
  { id: 12, name: 'Phúc Lộc', luck: 5, verse: 'Phúc đến lộc về, nhà nhà sung túc.', advice: 'Chia sẻ niềm vui với đồng đội SACO.' },
];

export function queById(id: number): RitualQue | undefined {
  return QUE_LIST.find((que) => que.id === id);
}

// ---------- giờ Việt Nam ----------

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export interface VnTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 là Chủ nhật. */
  weekday: number;
}

export function vnParts(epochMs: number): VnTime {
  const shifted = new Date(epochMs + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const minutesOf = (t: { hour: number; minute: number }): number => t.hour * 60 + t.minute;

/** `YYYY-MM-DD` của ngày theo giờ Việt Nam, `offsetDays` ngày sau ngày của `epochMs`. */
export function vnDay(epochMs: number, offsetDays = 0): string {
  const p = vnParts(epochMs + offsetDays * DAY_MS);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Thứ Hai tới thứ Sáu. */
function isWeekday(epochMs: number): boolean {
  const weekday = vnParts(epochMs).weekday;
  return weekday >= 1 && weekday <= 5;
}

/**
 * Phiên mà một nghi lễ làm lúc `epochMs` dự đoán: đóng cửa hôm nay nếu còn trước giờ chốt của một ngày
 * trong tuần, ngược lại là đóng cửa của ngày làm việc kế tiếp.
 */
export function targetSession(epochMs: number): string {
  const p = vnParts(epochMs);
  if (isWeekday(epochMs) && p.hour * 60 + p.minute < minutesOf(RITUAL_RULES.cutoff))
    return vnDay(epochMs);
  for (let d = 1; d <= 7; d += 1) {
    if (isWeekday(epochMs + d * DAY_MS)) return vnDay(epochMs, d);
  }
  return vnDay(epochMs, 1);
}

/** Epoch ms của `HH:MM` giờ Việt Nam trong ngày `YYYY-MM-DD`. */
export function vnTimeOn(day: string, t: { hour: number; minute: number }): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, t.hour - 7, t.minute);
}

export function isSameVnDay(a: number, b: number): boolean {
  return vnDay(a) === vnDay(b);
}

/** Phiên đã tới giờ được chấm chưa. */
export function canResolve(session: string, now: number): boolean {
  return now >= vnTimeOn(session, RITUAL_RULES.resolveAfter);
}

/** `YYYY-MM` của một ngày phiên. */
export function monthOf(session: string): string {
  return session.slice(0, 7);
}

/** Hướng quyết định đúng sai; sai số của mức điểm chỉ dùng để xếp hạng khi bằng nhau. */
export function score(
  direction: RitualDirection,
  level: number,
  close: number,
  change: number,
): { correct: boolean; error: number } {
  const actual: RitualDirection | 'flat' = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { correct: actual === direction, error: Math.abs(level - close) };
}

export const TICKER_RE = /^[A-Z0-9]{3}$/;

export function normaliseTickers(input: readonly string[]): string[] | null {
  const list = [...new Set(input.map((item) => item.trim().toUpperCase()))];
  if (list.length !== RITUAL_RULES.tickersToPray || !list.every((item) => TICKER_RE.test(item)))
    return null;
  return list;
}

export const isValidMonth = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const isValidSession = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Giờ của báo giá VCI thành epoch ms. Số là epoch (giây nếu nhỏ), chuỗi có múi giờ được đọc như
 * ISO, chuỗi không múi giờ (`YYYY-MM-DD HH:mm[:ss]`) được hiểu là giờ Việt Nam.
 */
export function parseQuoteTime(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(text);
  if (local) {
    const [, y, m, d, hh, mm, ss] = local;
    return Date.UTC(+y!, +m! - 1, +d!, +hh! - 7, +mm!, ss ? +ss : 0);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}
