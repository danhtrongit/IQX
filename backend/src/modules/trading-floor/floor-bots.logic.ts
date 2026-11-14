/**
 * Phần thuần (không timer, không socket) của các nhân vật tự động trên Khu giao dịch: sức chứa, số nhân
 * vật mong muốn theo giờ Việt Nam, khung giờ trong ngày, nhận ý câu nói của người thật và câu trả lời.
 *
 * Câu nói luôn bám ngữ cảnh: chào lại đúng tên người vừa vào hoặc vừa chào, trả lời VN-Index bằng số
 * đang chạy, nói theo khung giờ (trước phiên, trong phiên, nghỉ trưa, ATC, sau phiên, tối, cuối tuần).
 * Không nói gì khi không hiểu ý: im lặng tự nhiên hơn một câu lạc đề.
 */

import { vnParts } from './floor-ritual.logic.js';
import { FLOOR_EMOTE_MAX } from './floor-profile.logic.js';
import type { FloorAvatarId, FloorOutfitColorId } from './floor-types.js';

/** Số nhân vật tối đa đứng trong sảnh (người thật và nhân vật tự động). */
export const FLOOR_CAPACITY = 50;
/** Giờ cao điểm. */
export const FLOOR_BOTS_PEAK = 10;
export const FLOOR_BOTS_MIN = 2;
export const FLOOR_BOTS_MAX_QUIET = 5;

export type Rand = () => number;

export const pick = <T>(list: readonly T[], rand: Rand): T =>
  list[Math.floor(rand() * list.length) % list.length]!;
export const between = (a: number, b: number, rand: Rand): number => a + rand() * (b - a);

// ================================================================== số lượng

/** Số nhân vật tự động được đứng trong sảnh: nhường hết chỗ cho người thật khi đông. */
export function botsAllowed(target: number, humans: number, capacity = FLOOR_CAPACITY): number {
  return Math.max(0, Math.min(target, capacity - humans));
}

const minutesOfDay = (epochMs: number): number => {
  const p = vnParts(epochMs);
  return p.hour * 60 + p.minute;
};
const isWeekday = (epochMs: number): boolean => {
  const w = vnParts(epochMs).weekday;
  return w >= 1 && w <= 5;
};

/** Băm nhỏ ổn định của một số nguyên (để số nhân vật ngoài giờ cao điểm đổi dần theo từng 30 phút). */
const slotHash = (n: number): number => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};

/**
 * Số nhân vật tự động mong muốn lúc `epochMs`: 10 trong giờ giao dịch các ngày trong tuần (9:00–11:30,
 * 13:00–14:45), 7 lúc sát giờ mở/đóng cửa, còn lại 2–5 đổi dần theo từng nửa giờ (đêm khuya 2–3).
 */
export function botTarget(epochMs: number): number {
  const m = minutesOfDay(epochMs);
  if (isWeekday(epochMs)) {
    if ((m >= 9 * 60 && m < 11 * 60 + 30) || (m >= 13 * 60 && m < 14 * 60 + 45))
      return FLOOR_BOTS_PEAK;
    if ((m >= 8 * 60 + 30 && m < 9 * 60) || (m >= 14 * 60 + 45 && m < 15 * 60 + 15)) return 7;
  }
  const slot = Math.floor(epochMs / 1_800_000);
  const night = m < 6 * 60 || m >= 23 * 60 + 30;
  const span = night ? 2 : FLOOR_BOTS_MAX_QUIET - FLOOR_BOTS_MIN + 1;
  return FLOOR_BOTS_MIN + (slotHash(slot) % span);
}

// ================================================================== khung giờ

export type DayPhase =
  'preopen' | 'session' | 'lunch' | 'atc' | 'closed' | 'evening' | 'night' | 'weekend';

export function dayPhase(epochMs: number): DayPhase {
  const m = minutesOfDay(epochMs);
  if (m < 6 * 60 || m >= 23 * 60) return 'night';
  if (!isWeekday(epochMs)) return 'weekend';
  if (m < 9 * 60) return 'preopen';
  if (m < 11 * 60 + 30) return 'session';
  if (m < 13 * 60) return 'lunch';
  if (m < 14 * 60 + 30) return 'session';
  if (m < 14 * 60 + 45) return 'atc';
  if (m < 18 * 60) return 'closed';
  return 'evening';
}

// ================================================================== danh tính

const FIRST_MALE = [
  'Minh',
  'Hùng',
  'Tuấn',
  'Phúc',
  'Khoa',
  'Quân',
  'Dũng',
  'Long',
  'Sơn',
  'Bảo',
  'Đức',
  'Nam',
  'Huy',
  'Thắng',
  'Việt',
  'Hải',
  'Trung',
  'Khánh',
  'Toàn',
  'Lâm',
];
const FIRST_FEMALE = [
  'Lan',
  'Thảo',
  'Ngọc',
  'Mai',
  'Linh',
  'Hà',
  'Trang',
  'Vy',
  'Yến',
  'Nhi',
  'Hạnh',
  'Thu',
  'Hương',
  'Quỳnh',
  'Giang',
  'Phương',
  'Chi',
  'Anh',
  'Hằng',
  'Ly',
];
const LAST = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Ngô',
  'Dương',
  'Phan',
  'Huỳnh',
  'Võ',
];
const MIDDLE_MALE = ['Văn', 'Đức', 'Minh', 'Quốc', 'Thành', 'Hữu'];
const MIDDLE_FEMALE = ['Thị', 'Thu', 'Ngọc', 'Thanh', 'Minh', 'Phương'];
const COLORS: readonly FloorOutfitColorId[] = [
  'default',
  'default',
  'default',
  'navy',
  'charcoal',
  'burgundy',
  'forest',
  'cobalt',
  'beige',
  'teal',
];

export interface BotIdentity {
  name: string;
  avatar: FloorAvatarId;
  color: FloorOutfitColorId;
}

/**
 * Tên và nhân vật kiểu người dùng thật: tên đầy đủ, hai chữ hoặc chỉ tên gọi. Không trùng tên đang có
 * trên sàn (`taken`).
 */
export function botIdentity(taken: ReadonlySet<string>, rand: Rand): BotIdentity {
  for (let i = 0; i < 30; i++) {
    const female = rand() < 0.45;
    const first = pick(female ? FIRST_FEMALE : FIRST_MALE, rand);
    const last = pick(LAST, rand);
    const style = rand();
    const name =
      style < 0.4
        ? `${last} ${first}`
        : style < 0.7
          ? `${last} ${pick(female ? MIDDLE_FEMALE : MIDDLE_MALE, rand)} ${first}`
          : style < 0.85
            ? `${first} ${last}`
            : first;
    if (taken.has(name) || taken.has(first)) continue;
    const n = 1 + Math.floor(rand() * 5);
    return {
      name,
      avatar: `${female ? 'female' : 'male'}0${n}` as FloorAvatarId,
      color: pick(COLORS, rand),
    };
  }
  return {
    name: `${pick(LAST, rand)} ${pick(FIRST_MALE, rand)} ${Math.floor(rand() * 90 + 10)}`,
    avatar: 'male01',
    color: 'default',
  };
}

/** Tên gọi (chữ cuối) của một tên hiển thị. */
export function callName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.at(-1) ?? name;
}

// ================================================================== hiểu câu nói

export type Intent =
  | { kind: 'greet' }
  | { kind: 'market' }
  | { kind: 'thanks' }
  | { kind: 'ticker'; symbol: string }
  | { kind: 'none' };

const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const GREET = /(^|[^a-z])(xin chao|chao|hello|helo|hi|alo|hey)([^a-z]|$)/;
const MARKET =
  /(vn-?index|vni([^a-z]|$)|thi truong|thi truon|chi so|index|len hay xuong|xanh hay do|hom nay sao|the nao roi)/;
const THANKS = /(cam on|thank|tks|thanks)/;
const TICKER = /\b[A-Z][A-Z0-9]{2}\b/g;
/** Viết hoa nhưng không phải mã: tránh hiểu nhầm "ATC" hay "ATO" là cổ phiếu. */
const NOT_TICKERS = new Set([
  'ATC',
  'ATO',
  'VNI',
  'OK',
  'USD',
  'VND',
  'ETF',
  'IPO',
  'CEO',
  'GDP',
  'FED',
]);

/** Ý chính của một câu người thật vừa nói; `listed` là tập mã niêm yết (null: không kiểm được). */
export function classify(text: string, listed: ReadonlySet<string> | null): Intent {
  const folded = fold(text);
  if (MARKET.test(folded)) return { kind: 'market' };
  for (const match of text.match(TICKER) ?? []) {
    if (NOT_TICKERS.has(match)) continue;
    if (listed && !listed.has(match)) continue;
    if (!listed && !/^[A-Z]{3}$/.test(match)) continue;
    return { kind: 'ticker', symbol: match };
  }
  if (GREET.test(folded)) return { kind: 'greet' };
  if (THANKS.test(folded)) return { kind: 'thanks' };
  return { kind: 'none' };
}

// ================================================================== câu nói

export interface IndexView {
  value: number;
  change: number;
}

const fmtPoint = (n: number): string =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtChange = (n: number): string => `${n >= 0 ? '+' : '−'}${fmtPoint(Math.abs(n))}`;

const fit = (text: string): string =>
  text.length <= FLOOR_EMOTE_MAX ? text : `${text.slice(0, FLOOR_EMOTE_MAX - 1)}…`;

export function greetLine(name: string, rand: Rand): string {
  const who = callName(name);
  return fit(
    pick(
      [
        `Chào ${who} 👋`,
        `Hello ${who}!`,
        `${who} vào rồi à, chào nhé`,
        `Chào ${who}, hôm nay thế nào?`,
        `Hi ${who} 😄`,
      ],
      rand,
    ),
  );
}

export function greetBackLine(name: string, rand: Rand): string {
  const who = callName(name);
  return fit(
    pick([`Chào ${who}!`, `Chào ${who} nhé 👋`, `Hello ${who}`, `Chào bạn ${who} 😄`], rand),
  );
}

export function thanksLine(rand: Rand): string {
  return pick(['Không có gì 😄', 'Có gì đâu', '👍'], rand);
}

/** Câu về VN-Index với số thật; `live`: đang trong phiên (nói "đang"), ngược lại nói giá chốt. */
export function marketLine(index: IndexView | null, live: boolean, rand: Rand): string | null {
  if (!index) return null;
  const v = fmtPoint(index.value);
  const c = fmtChange(index.change);
  if (!live) {
    return fit(
      pick(
        [
          `VNINDEX chốt ${v}, ${c} điểm`,
          `Phiên gần nhất chốt ${v} (${c})`,
          `Đóng cửa ${v}, ${c} điểm đó`,
        ],
        rand,
      ),
    );
  }
  const tail =
    index.change >= 8
      ? pick(['xanh đẹp ghê', 'đừng FOMO nhé 😄', 'ngon đấy'], rand)
      : index.change >= 1
        ? pick(['nhích nhẹ', 'xanh nhẹ thôi', 'cũng ổn'], rand)
        : index.change > -1
          ? pick(['đi ngang', 'lình xình quá', 'chưa rõ xu hướng'], rand)
          : index.change > -8
            ? pick(['hơi đỏ, bình tĩnh', 'đỏ nhẹ thôi', 'chỉnh nhẹ'], rand)
            : pick(
                ['đỏ khá mạnh, giữ kỷ luật nhé', 'rung lắc mạnh đấy', 'bình tĩnh nha mọi người'],
                rand,
              );
  return fit(pick([`VNINDEX đang ${v}, ${c} điểm, ${tail}`, `Đang ${v} (${c}), ${tail}`], rand));
}

export function tickerLine(symbol: string, rand: Rand): string {
  return fit(
    pick(
      [
        `${symbol} mình cũng đang theo dõi, chưa vào`,
        `${symbol} thì phải xem thêm nền giá đã`,
        `${symbol} nhiều người để ý đợt này`,
        `Mình không cầm ${symbol}, đợi tín hiệu rõ hơn`,
        `${symbol} nhớ đặt điểm cắt lỗ nhé`,
      ],
      rand,
    ),
  );
}

export function ritualLine(name: string, que: string, luck: number, rand: Rand): string | null {
  const who = callName(name);
  if (luck >= 4)
    return fit(
      pick(
        [
          `Quẻ ${que} đẹp đấy ${who} 🙏`,
          `Chúc mừng ${who}, quẻ ${que}!`,
          `${who} xin được quẻ đẹp ghê`,
        ],
        rand,
      ),
    );
  if (luck <= 2)
    return fit(
      pick([`Quẻ nào cũng là lời nhắc thôi ${who} 😄`, `Không sao ${who}, cẩn thận là được`], rand),
    );
  return null;
}

const AMBIENT: Record<DayPhase, readonly string[]> = {
  preopen: [
    'Sáng nay mọi người tính canh mã nào?',
    'Cà phê xong rồi, chờ ATO thôi ☕',
    'Đọc tin sáng chưa mọi người?',
    'Hôm nay nhớ đặt điểm cắt lỗ trước nhé',
    'Xin quẻ Thần Tài đầu ngày đã 🙏',
  ],
  session: [
    'Thanh khoản hôm nay thế nào nhỉ?',
    'Mọi người xin quẻ Thần Tài chưa?',
    'Nhóm ngân hàng hôm nay sao rồi?',
    'Đang canh điểm mua, chưa vội',
    'Giữ kỷ luật là chính 💪',
  ],
  lunch: [
    'Nghỉ trưa thôi, chiều tính tiếp',
    'Ăn trưa chưa mọi người?',
    'Sáng nay ai lãi khoe đi 😄',
    'Trưa rồi, đi cà phê không?',
  ],
  atc: ['Sắp ATC rồi, ai còn lệnh không?', 'Chốt phiên đến nơi rồi', 'ATC hôm nay chắc sôi động'],
  closed: [
    'Hết phiên rồi, về xem lại nhật ký thôi',
    'Mai lại chiến tiếp 💪',
    'Hôm nay ai xin quẻ đúng không?',
    'Xong phiên, nghỉ ngơi chút',
  ],
  evening: [
    'Tối rồi vẫn ngồi xem chart à 😄',
    'Tối nay xem lại biểu đồ tuần thôi',
    'Mai mọi người tính làm gì?',
    'Đọc báo cáo phân tích chút rồi ngủ',
  ],
  night: [
    'Khuya rồi, ngủ sớm mai còn vào phiên',
    'Cú đêm cả à 😄',
    'Muộn rồi, chúc mọi người ngủ ngon',
  ],
  weekend: [
    'Cuối tuần thong thả ghê',
    'Cuối tuần đọc lại nhật ký giao dịch thôi',
    'Tuần sau chắc thị trường sôi động',
    'Cuối tuần ai đi cà phê không?',
  ],
};

export function ambientLines(phase: DayPhase): readonly string[] {
  return AMBIENT[phase];
}

/** Hai nhân vật nói với nhau: câu hỏi, rồi câu đáp vài giây sau. */
const DIALOGUES: Record<'trading' | 'any', ReadonlyArray<readonly [string, string]>> = {
  trading: [
    ['Có mua thêm gì không?', 'Thôi, đợi tín hiệu rõ hơn đã'],
    ['Còn giữ hàng không?', 'Còn ít, vẫn trong kế hoạch'],
    ['Hôm qua chốt lời chưa?', 'Chốt một nửa rồi 😄'],
    ['Thị trường này nên làm gì nhỉ?', 'Giữ tỷ trọng thấp thôi'],
    ['Có vào lệnh sáng nay không?', 'Có, mua thăm dò chút'],
  ],
  any: [
    ['Cà phê không?', 'Đi, đợi chút ☕'],
    ['Tuần này lãi không?', 'Hòa vốn là vui rồi 😄'],
    ['Học viện có bài mới đấy', 'Ừ, tối nay mình xem'],
  ],
};

export function dialogue(phase: DayPhase, rand: Rand): readonly [string, string] {
  const trading = phase === 'session' || phase === 'preopen' || phase === 'lunch';
  return pick(trading && rand() < 0.7 ? DIALOGUES.trading : DIALOGUES.any, rand);
}

// ================================================================== đi lại

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Khoảng sàn trống (đơn vị thế giới); mọi đường đi giữa hai khu đều qua sảnh giữa. */
export const FLOOR_CENTRAL: Box = { x0: 800, x1: 1320, y0: 560, y1: 1270 };
export const FLOOR_ZONES: readonly Box[] = [
  FLOOR_CENTRAL,
  FLOOR_CENTRAL,
  { x0: 260, x1: 1800, y0: 500, y1: 560 },
  { x0: 110, x1: 700, y0: 1030, y1: 1200 },
  { x0: 1390, x1: 1940, y0: 1190, y1: 1290 },
];

export const inBox = (b: Box, rand: Rand): { x: number; y: number } => ({
  x: Math.round(between(b.x0, b.x1, rand)),
  y: Math.round(between(b.y0, b.y1, rand)),
});

/** Đường đi tới một điểm ngẫu nhiên: qua sảnh giữa nếu đích ở khu khác. */
export function route(rand: Rand): Array<{ x: number; y: number }> {
  const target = pick(FLOOR_ZONES, rand);
  const path = target === FLOOR_CENTRAL ? [] : [inBox(FLOOR_CENTRAL, rand)];
  path.push(inBox(target, rand));
  return path;
}

const FACINGS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export const facingOf = (dx: number, dy: number): (typeof FACINGS)[number] =>
  FACINGS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8]!;
