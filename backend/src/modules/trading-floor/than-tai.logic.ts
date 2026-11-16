/**
 * Luật thuần của Thần Tài v2 (lắc quẻ Kinh Dịch hằng ngày): giờ Việt Nam và hạn 11:30, can chi + nạp âm
 * của ngày từ số ngày Julian, quan hệ hợp/kiêng giữa các hành, rút hạng quẻ theo trọng số, vòng không lặp
 * lá, suy ra trạng thái/bước và chuẩn hoá mã cầu. Không chạm cơ sở dữ liệu; mọi ngẫu nhiên đi qua `Rng`
 * truyền vào để test cố định được. Hợp đồng tên/kiểu: `backend/docs/than-tai/CONTRACT.md`.
 */

// ================================================================== kiểu và hằng

export const HANG_LIST = ['dai_cat', 'thuong_cat', 'trung_cat', 'tieu_cat', 'than_trong'] as const;
export type Hang = (typeof HANG_LIST)[number];

export const HANH_LIST = ['kim', 'moc', 'thuy', 'hoa', 'tho'] as const;
export type Hanh = (typeof HANH_LIST)[number];

export const DIRECTIONS = ['up', 'flat', 'down'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type ThanTaiStatus = 'chua_khan' | 'dang_do' | 'da_xong' | 'het_gio';
export type ThanTaiStep = 1 | 2 | 3 | 4;

export const HANG_LABEL: Readonly<Record<Hang, string>> = {
  dai_cat: 'Đại cát',
  thuong_cat: 'Thượng cát',
  trung_cat: 'Trung cát',
  tieu_cat: 'Tiểu cát',
  than_trong: 'Thận trọng',
};

/** Tỷ lệ rút hạng (%): 35/30/20/10/5. */
export const HANG_WEIGHT: Readonly<Record<Hang, number>> = {
  dai_cat: 35,
  thuong_cat: 30,
  trung_cat: 20,
  tieu_cat: 10,
  than_trong: 5,
};

export const HANH_LABEL: Readonly<Record<Hanh, string>> = {
  kim: 'Kim',
  moc: 'Mộc',
  thuy: 'Thủy',
  hoa: 'Hỏa',
  tho: 'Thổ',
};

/** Quẻ đơn: khoá lưu trong `tf_kd_que.que_tren/que_duoi` → tên và ký hiệu hiển thị. */
export const TRIGRAMS: Readonly<Record<string, { ten: string; symbol: string }>> = {
  can: { ten: 'Càn', symbol: '☰' },
  khon: { ten: 'Khôn', symbol: '☷' },
  chan: { ten: 'Chấn', symbol: '☳' },
  kham: { ten: 'Khảm', symbol: '☵' },
  can_son: { ten: 'Cấn', symbol: '☶' },
  ton: { ten: 'Tốn', symbol: '☴' },
  ly: { ten: 'Ly', symbol: '☲' },
  doai: { ten: 'Đoài', symbol: '☱' },
};

export const TRIGRAM_KEYS = Object.keys(TRIGRAMS) as [string, ...string[]];

export const THAN_TAI_RULES = {
  /** Mọi bước phải xác nhận trước giờ này (giờ Việt Nam). */
  deadline: { hour: 11, minute: 30 },
  /** Tối đa số mã cầu mỗi lượt. */
  maxTickers: 3,
  /** Số mã hiện trong kết quả. */
  topTickers: 5,
  /** Số ngành tối đa mỗi hành trên lá quẻ. */
  nganhOnCard: 4,
} as const;

export interface HanhMau {
  ten: string;
  hex: string;
}

export interface HanhConfig {
  hanh: Hanh;
  nganh: string[];
  mau: HanhMau[];
  huong: string;
}

export interface HanhGroup {
  hanh: Hanh;
  label: string;
  nganh: string[];
}

export interface ThanTaiDay {
  date: string;
  canChi: string;
  napAm: string;
  hanh: Hanh;
  hanhLabel: string;
  hop: HanhGroup[];
  kieng: HanhGroup[];
  mau: HanhMau[];
  huong: string;
}

export interface TrigramView {
  key: string;
  ten: string;
  symbol: string;
}

export interface ThanTaiLa {
  id: number;
  hang: Hang;
  hangLabel: string;
  que: {
    id: number;
    ten: string;
    chuHan: string;
    /** 6 ký tự '0'/'1', từ dưới lên. */
    hao: string;
    tren: TrigramView;
    duoi: TrigramView;
    tuong: string;
    thoan: string;
    thoanNghia: string;
  };
  haoDong: { so: number; ten: string; van: string; nghia: string };
  luan: string;
  chot: string;
}

export interface ThanTaiToday {
  status: ThanTaiStatus;
  step: ThanTaiStep;
  serverTime: number;
  deadline: number;
  day: ThanTaiDay;
  vnindexRef: number | null;
  la: ThanTaiLa | null;
  prediction: Direction | null;
  tickers: string[] | null;
}

export interface ThanTaiResults {
  total: number;
  up: number;
  flat: number;
  down: number;
  top5: Array<{ ticker: string; count: number }>;
  asOf: number;
}

// ================================================================== giờ Việt Nam

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

/** Các thành phần lịch của một thời điểm theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
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

/** `YYYY-MM-DD` của ngày theo giờ Việt Nam, `offsetDays` ngày sau ngày của `epochMs`. */
export function vnDay(epochMs: number, offsetDays = 0): string {
  const p = vnParts(epochMs + offsetDays * DAY_MS);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Epoch ms của `HH:MM` giờ Việt Nam trong ngày `YYYY-MM-DD`. */
export function vnTimeOn(day: string, t: { hour: number; minute: number }): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, t.hour - 7, t.minute);
}

export function isSameVnDay(a: number, b: number): boolean {
  return vnDay(a) === vnDay(b);
}

/** Mốc 11:30 giờ Việt Nam của ngày `YYYY-MM-DD`, epoch ms. */
export function deadlineOf(day: string): number {
  return vnTimeOn(day, THAN_TAI_RULES.deadline);
}

/** Còn được khấn: trước 11:30:00 của chính ngày giờ Việt Nam chứa `nowMs`. 11:29:59 còn, 11:30:00 hết. */
export function isBeforeDeadline(nowMs: number): boolean {
  return nowMs < deadlineOf(vnDay(nowMs));
}

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

// ================================================================== can chi, nạp âm, ngũ hành

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'] as const;
const CHI = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
] as const;

/** 30 nạp âm của vòng Giáp Tý, mỗi nạp âm chung cho hai can chi liền nhau. Chữ cuối là hành. */
const NAP_AM = [
  'Hải Trung Kim',
  'Lô Trung Hỏa',
  'Đại Lâm Mộc',
  'Lộ Bàng Thổ',
  'Kiếm Phong Kim',
  'Sơn Đầu Hỏa',
  'Giản Hạ Thủy',
  'Thành Đầu Thổ',
  'Bạch Lạp Kim',
  'Dương Liễu Mộc',
  'Tuyền Trung Thủy',
  'Ốc Thượng Thổ',
  'Tích Lịch Hỏa',
  'Tùng Bách Mộc',
  'Trường Lưu Thủy',
  'Sa Trung Kim',
  'Sơn Hạ Hỏa',
  'Bình Địa Mộc',
  'Bích Thượng Thổ',
  'Kim Bạch Kim',
  'Phú Đăng Hỏa',
  'Thiên Hà Thủy',
  'Đại Trạch Thổ',
  'Thoa Xuyến Kim',
  'Tang Đố Mộc',
  'Đại Khê Thủy',
  'Sa Trung Thổ',
  'Thiên Thượng Hỏa',
  'Thạch Lựu Mộc',
  'Đại Hải Thủy',
] as const;

const HANH_BY_LAST_WORD: Readonly<Record<string, Hanh>> = {
  Kim: 'kim',
  Mộc: 'moc',
  Thủy: 'thuy',
  Hỏa: 'hoa',
  Thổ: 'tho',
};

/** Số ngày Julian (nửa đêm UTC, số nguyên) của ngày dương lịch `YYYY-MM-DD`. 2000-01-01 → 2451545. */
export function julianDayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    date +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export interface DayCalendar {
  canChi: string;
  napAm: string;
  hanh: Hanh;
}

/**
 * Can chi ngày, nạp âm và hành của ngày dương lịch `YYYY-MM-DD` (ngày theo giờ Việt Nam). Chỉ số trong
 * vòng 60 là `(JDN + 49) mod 60`: can = chỉ số mod 10 (Giáp = 0), chi = chỉ số mod 12 (Tý = 0).
 */
export function dayCalendar(day: string): DayCalendar {
  const index = (((julianDayNumber(day) + 49) % 60) + 60) % 60;
  const napAm = NAP_AM[Math.floor(index / 2)]!;
  const last = napAm.slice(napAm.lastIndexOf(' ') + 1);
  return {
    canChi: `${CAN[index % 10]!} ${CHI[index % 12]!}`,
    napAm,
    hanh: HANH_BY_LAST_WORD[last]!,
  };
}

/** Sinh: Mộc → Hỏa → Thổ → Kim → Thủy → Mộc. */
const SINH: Readonly<Record<Hanh, Hanh>> = {
  moc: 'hoa',
  hoa: 'tho',
  tho: 'kim',
  kim: 'thuy',
  thuy: 'moc',
};

/** Khắc: Mộc → Thổ → Thủy → Hỏa → Kim → Mộc. */
const KHAC: Readonly<Record<Hanh, Hanh>> = {
  moc: 'tho',
  tho: 'thuy',
  thuy: 'hoa',
  hoa: 'kim',
  kim: 'moc',
};

const overcomerOf = (hanh: Hanh): Hanh => HANH_LIST.find((other) => KHAC[other] === hanh)!;

/** Hành hợp với ngày: cùng hành và hành được ngày sinh ra. */
export function hopHanh(day: Hanh): [Hanh, Hanh] {
  return [day, SINH[day]];
}

/** Hành kiêng của ngày: hành bị ngày khắc rồi hành khắc ngày. */
export function kiengHanh(day: Hanh): [Hanh, Hanh] {
  return [KHAC[day], overcomerOf(day)];
}

/** Dữ liệu cả ngày (dòng ngày, hợp, kiêng, màu, hướng) từ ngày và cấu hình 5 hành. */
export function buildDay(
  date: string,
  configs: Readonly<Partial<Record<Hanh, HanhConfig>>>,
): ThanTaiDay {
  const cal = dayCalendar(date);
  const group = (hanh: Hanh): HanhGroup => ({
    hanh,
    label: HANH_LABEL[hanh],
    nganh: (configs[hanh]?.nganh ?? []).slice(0, THAN_TAI_RULES.nganhOnCard),
  });
  const own = configs[cal.hanh];
  return {
    date,
    canChi: cal.canChi,
    napAm: cal.napAm,
    hanh: cal.hanh,
    hanhLabel: HANH_LABEL[cal.hanh],
    hop: hopHanh(cal.hanh).map(group),
    kieng: kiengHanh(cal.hanh).map(group),
    mau: own?.mau ?? [],
    huong: own?.huong ?? '',
  };
}

// ================================================================== rút quẻ

/** Nguồn ngẫu nhiên trong [0, 1); tiêm vào để test cố định được. */
export type Rng = () => number;

const randomBelow = (n: number, rng: Rng): number => Math.min(n - 1, Math.floor(rng() * n));

/**
 * Rút hạng theo trọng số 35/30/20/10/5 trong số các hạng còn lá đang bật. Rút hạng trên cả 5 rồi rút lại
 * khi hạng đó hết lá cho cùng phân phối với rút thẳng trên các hạng còn lá, nên chỉ cần một lần rút.
 * Trả null khi không hạng nào còn lá.
 */
export function drawHang(available: readonly Hang[], rng: Rng): Hang | null {
  const ranks = HANG_LIST.filter((hang) => available.includes(hang));
  if (ranks.length === 0) return null;
  const total = ranks.reduce((sum, hang) => sum + HANG_WEIGHT[hang], 0);
  let point = rng() * total;
  for (const hang of ranks) {
    point -= HANG_WEIGHT[hang];
    if (point < 0) return hang;
  }
  return ranks[ranks.length - 1]!;
}

/**
 * Chọn một lá ngẫu nhiên trong hạng, ưu tiên lá người này chưa gặp. Khi mọi lá của hạng đã gặp thì
 * `resetSeen` là true (người gọi xoá danh sách đã gặp của hạng) và chọn lại trong toàn bộ lá của hạng.
 */
export function pickLa(
  candidates: readonly number[],
  seen: ReadonlySet<number>,
  rng: Rng,
): { laId: number; resetSeen: boolean } | null {
  if (candidates.length === 0) return null;
  const unseen = candidates.filter((id) => !seen.has(id));
  if (unseen.length > 0)
    return { laId: unseen[randomBelow(unseen.length, rng)]!, resetSeen: false };
  return { laId: candidates[randomBelow(candidates.length, rng)]!, resetSeen: true };
}

// ================================================================== trạng thái và bước

export interface KhanProgress {
  duDoan: Direction | null;
  /** null = chưa làm, [] = đã bỏ qua. */
  maCau: readonly string[] | null;
}

/** Bước kế tiếp: 1 gieo quẻ, 2 dự đoán, 3 cầu mã, 4 xong (xem kết quả). `row` null = chưa gieo. */
export function stepOf(row: KhanProgress | null): ThanTaiStep {
  if (!row) return 1;
  if (row.duDoan === null) return 2;
  if (row.maCau === null) return 3;
  return 4;
}

/**
 * `da_xong` khi đã qua bước 3 (kể cả bỏ qua); chưa xong thì `het_gio` từ 11:30 và `chua_khan`/`dang_do`
 * trước đó tuỳ đã gieo quẻ hay chưa.
 */
export function statusOf(row: KhanProgress | null, nowMs: number): ThanTaiStatus {
  const step = stepOf(row);
  if (step === 4) return 'da_xong';
  if (!isBeforeDeadline(nowMs)) return 'het_gio';
  return row ? 'dang_do' : 'chua_khan';
}

// ================================================================== mã cầu

export const TICKER_RE = /^[A-Z0-9]{3}$/;

export type TickerCheck =
  { ok: true; tickers: string[] } | { ok: false; code: 'QUA_3_MA' | 'MA_KHONG_HOP_LE' };

/**
 * Chuẩn hoá danh sách mã cầu: viết hoa, 3 ký tự `[A-Z0-9]`, không trùng, tối đa 3 (mảng rỗng = bỏ qua).
 * Quá 3 phần tử thì `QUA_3_MA` (kiểm tra trước); sai định dạng hoặc trùng thì `MA_KHONG_HOP_LE`.
 */
export function normaliseTickers(input: readonly string[]): TickerCheck {
  if (input.length > THAN_TAI_RULES.maxTickers) return { ok: false, code: 'QUA_3_MA' };
  const tickers = input.map((item) => item.trim().toUpperCase());
  if (!tickers.every((ticker) => TICKER_RE.test(ticker))) {
    return { ok: false, code: 'MA_KHONG_HOP_LE' };
  }
  if (new Set(tickers).size !== tickers.length) return { ok: false, code: 'MA_KHONG_HOP_LE' };
  return { ok: true, tickers };
}

/** Mã không có trong danh sách niêm yết; danh sách null (không đọc được) thì nhận mọi mã đúng định dạng. */
export function unlistedTickers(
  tickers: readonly string[],
  listed: ReadonlySet<string> | null,
): string[] {
  return listed ? tickers.filter((ticker) => !listed.has(ticker)) : [];
}

/**
 * Giá tham chiếu VNINDEX của phiên hôm nay = điểm hiện tại trừ thay đổi trong phiên; null khi chưa có báo
 * giá. Báo giá còn của một ngày trước (cuối tuần, trước giờ mở cửa) thì điểm đó chính là giá đóng cửa
 * liền trước, tức tham chiếu của phiên kế tiếp.
 */
export function vnindexReference(
  quote: { value: number; change: number; time: number | null } | null,
  nowMs: number,
): number | null {
  if (!quote) return null;
  const stale = quote.time !== null && !isSameVnDay(quote.time, nowMs);
  const ref = Math.round((stale ? quote.value : quote.value - quote.change) * 100) / 100;
  return Number.isFinite(ref) && ref > 0 ? ref : null;
}

// ================================================================== bảng vinh danh theo tháng

export const LEADERBOARD_RULES = {
  /** Số người trả về. */
  top: 10,
  /** Từ giờ này (giờ Việt Nam) nến của chính hôm nay mới được coi là đã chốt, dù bảng đã có nến. */
  settledAt: { hour: 15, minute: 0 },
} as const;

/** `YYYY-MM` hợp lệ (năm 2020–2099, tháng 01–12). */
export const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

export interface LeaderRow {
  rank: number;
  name: string;
  avatar: string;
  color: string;
  correct: number;
  total: number;
}

export interface ThanTaiLeaderboard {
  /** Tháng được xếp hạng, `YYYY-MM`. */
  month: string;
  /** Số ngày giao dịch của tháng đã có giá đóng cửa chốt (số ngày đã chấm). */
  scoredDays: number;
  rows: LeaderRow[];
  /** Dòng của người gọi (kèm hạng thật); null với khách hoặc khi chưa có lượt nào được chấm. */
  me: LeaderRow | null;
  asOf: number;
}

/** Tháng (`YYYY-MM`) của ngày `YYYY-MM-DD`. */
export const monthOfDay = (day: string): string => day.slice(0, 7);

/** Tháng liền sau `month`, `YYYY-MM`. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/**
 * Kết quả của một ngày từ chênh lệch giá đóng cửa so với nến liền trước: tăng, giảm, hoặc đi ngang khi
 * đúng bằng 0 (cùng nghĩa với các lựa chọn ở bước 2: "Đóng cửa cao hơn / thấp hơn tham chiếu", "Thay đổi
 * đúng bằng 0"). null khi chưa biết chênh lệch (không có nến trước): ngày đó không được chấm.
 */
export function outcomeOf(change: number | null): Direction | null {
  if (change === null || !Number.isFinite(change)) return null;
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/**
 * Ngày giao dịch mới nhất có thể đã chốt tại `nowMs`: hôm nay từ 15:00 giờ Việt Nam, trước đó là hôm qua.
 * Nến sau ngày này (nếu có) không được chấm.
 */
export function lastSettledDay(nowMs: number): string {
  const today = vnDay(nowMs);
  return nowMs >= vnTimeOn(today, LEADERBOARD_RULES.settledAt) ? today : vnDay(nowMs, -1);
}

/** Một lượt dự đoán của tài khoản trong một ngày đã chốt, kèm chênh lệch của ngày đó. */
export interface ScoredCall {
  actorKey: string;
  ngay: string;
  duDoan: Direction;
  change: number | null;
}

export interface MonthTally {
  actorKey: string;
  correct: number;
  total: number;
  /** Ngày đạt tới số lần đúng cuối cùng (ngày của lần đúng gần nhất); '' khi chưa đúng lần nào. */
  reachedOn: string;
}

/** Gộp các lượt thành một dòng mỗi người. Lượt của ngày không có kết quả (không rõ chênh lệch) bị bỏ qua. */
export function tallyCalls(calls: readonly ScoredCall[]): MonthTally[] {
  const byActor = new Map<string, MonthTally>();
  for (const call of calls) {
    const outcome = outcomeOf(call.change);
    if (outcome === null) continue;
    let row = byActor.get(call.actorKey);
    if (!row) {
      row = { actorKey: call.actorKey, correct: 0, total: 0, reachedOn: '' };
      byActor.set(call.actorKey, row);
    }
    row.total += 1;
    if (call.duDoan === outcome) {
      row.correct += 1;
      if (call.ngay > row.reachedOn) row.reachedOn = call.ngay;
    }
  }
  return [...byActor.values()];
}

/**
 * Thứ tự xếp hạng: nhiều lần đúng hơn, rồi chính xác hơn (đúng/tổng, so bằng nhân chéo để không dính số
 * thực), rồi đạt số lần đúng đó sớm hơn, rồi `actorKey` để thứ tự luôn xác định.
 */
export function compareTallies(a: MonthTally, b: MonthTally): number {
  if (a.correct !== b.correct) return b.correct - a.correct;
  const accuracy = b.correct * a.total - a.correct * b.total;
  if (accuracy !== 0) return accuracy > 0 ? 1 : -1;
  if (a.reachedOn !== b.reachedOn) return a.reachedOn < b.reachedOn ? -1 : 1;
  return a.actorKey < b.actorKey ? -1 : a.actorKey > b.actorKey ? 1 : 0;
}

/** Bảng xếp hạng đầy đủ (hạng 1, 2, 3, ... liên tục). Chỉ giữ người có hồ sơ trên sàn. */
export function rankTallies(
  tallies: readonly MonthTally[],
  profiles: ReadonlyMap<string, { name: string; avatar: string; color: string }>,
): Array<LeaderRow & { actorKey: string }> {
  return tallies
    .filter((row) => profiles.has(row.actorKey) && row.total > 0)
    .sort(compareTallies)
    .map((row, index) => {
      const profile = profiles.get(row.actorKey)!;
      return {
        actorKey: row.actorKey,
        rank: index + 1,
        name: profile.name,
        avatar: profile.avatar,
        color: profile.color,
        correct: row.correct,
        total: row.total,
      };
    });
}
