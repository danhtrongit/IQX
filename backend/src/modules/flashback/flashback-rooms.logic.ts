/**
 * Luật thuần (không I/O) của Flashback v2 · Phòng chơi (docs/flashback-v2-rooms/IQX-Flashback-SPEC.md).
 *
 * Mọi quyết định có thể kiểm thử độc lập nằm ở đây: kiểm tra thiết lập phòng (§3), thứ tự kiểm tra
 * khi vào phòng (§2.3), lọc "Chơi phòng bất kỳ" (§2.1), giá trị tài sản theo phiên và % của người
 * khác tại `min(phiên của họ, phiên của mình)` (§6.1), chốt ván khi hết giờ (§7.1), xếp hạng có hoà
 * và chia xu (§7.2), tiêu đề cửa sổ kết quả (§7.3) và chuyển nến sang dạng gửi trình duyệt (§5).
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { FLASHBACK_INITIAL_CASH_VND } from './flashback.constants.js';
import type { FlashbackBar } from './flashback.types.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// ------------------------------------------------------------------ hằng số (§3, §4, §6)

export const FB_ROOM_BARS_MIN = 30;
export const FB_ROOM_BARS_MAX = 120;
export const FB_ROOM_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;
export const FB_ROOM_MAX_PLAYERS_MIN = 1;
export const FB_ROOM_MAX_PLAYERS_MAX = 4;
export const FB_ROOM_STAKE_MIN = 10;
export const FB_ROOM_STAKE_STEP = 10;
export const FB_ROOM_PASSWORD_MIN = 4;
export const FB_ROOM_PASSWORD_MAX = 12;

/** Giá trị mặc định của hộp tạo phòng (§3). */
export const FB_ROOM_DEFAULTS = {
  viewBars: 60,
  playBars: 30,
  minutes: 10,
  maxPlayers: 4,
  stakeXu: 100,
} as const;

/** Phòng chờ tự đóng sau 30 phút chưa bắt đầu (DESIGN #3). */
export const FB_ROOM_WAITING_TTL_MS = 30 * 60_000;

/** Phòng đã có kết quả mà không ai bấm "Chơi lại" cũng đóng sau 30 phút. */
export const FB_ROOM_ENDED_TTL_MS = 30 * 60_000;

/** Vốn mỗi người mỗi ván (§6.3). */
export const FB_INITIAL_CASH_VND = FLASHBACK_INITIAL_CASH_VND;

/** Số xu theo kiểu Việt Nam: 1.000. */
export function formatXu(value: number): string {
  return Math.trunc(value).toLocaleString('vi-VN');
}

// ------------------------------------------------------------------ §3 tạo phòng

export interface FbRoomSettingsInput {
  readonly view_bars?: number | null;
  readonly play_bars?: number | null;
  readonly minutes?: number | null;
  readonly max_players?: number | null;
  readonly stake_xu?: number | null;
  readonly password?: string | null;
}

export interface FbRoomSettings {
  readonly viewBars: number;
  readonly playBars: number;
  readonly minutes: number;
  readonly maxPlayers: number;
  /** 0 khi phòng 1 người (ô cược bị khoá). */
  readonly stakeXu: number;
  /** Mật khẩu đã cắt khoảng trắng hai đầu; null = không khoá. */
  readonly password: string | null;
}

export type FbValidation<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

const isIntIn = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * Kiểm tra thiết lập phòng theo §3, báo đúng một dòng lỗi (thứ tự như bản mẫu). Trường không gửi
 * dùng giá trị mặc định của hộp tạo phòng.
 */
export function validateRoomSettings(
  input: FbRoomSettingsInput,
  balanceXu: number,
): FbValidation<FbRoomSettings> {
  const viewBars = input.view_bars ?? FB_ROOM_DEFAULTS.viewBars;
  const playBars = input.play_bars ?? FB_ROOM_DEFAULTS.playBars;
  const minutes = input.minutes ?? FB_ROOM_DEFAULTS.minutes;
  const maxPlayers = input.max_players ?? FB_ROOM_DEFAULTS.maxPlayers;
  const rawStake = input.stake_xu ?? FB_ROOM_DEFAULTS.stakeXu;
  const password = (input.password ?? '').trim();

  if (!isIntIn(viewBars, FB_ROOM_BARS_MIN, FB_ROOM_BARS_MAX))
    return { ok: false, message: 'Số phiên xem phải từ 30 đến 120' };
  if (!isIntIn(playBars, FB_ROOM_BARS_MIN, FB_ROOM_BARS_MAX))
    return { ok: false, message: 'Số phiên chơi phải từ 30 đến 120' };
  if (!(FB_ROOM_MINUTES as readonly number[]).includes(minutes))
    return { ok: false, message: 'Thời gian chơi phải là 5, 10, 15, 20, 30, 45 hoặc 60 phút' };
  if (!isIntIn(maxPlayers, FB_ROOM_MAX_PLAYERS_MIN, FB_ROOM_MAX_PLAYERS_MAX))
    return { ok: false, message: 'Số người tối đa phải từ 1 đến 4' };
  // Chọn 1 người thì ô cược bị khoá: ván không cược, bỏ qua giá trị gửi lên.
  const stakeXu = maxPlayers === 1 ? 0 : rawStake;
  if (
    maxPlayers > 1 &&
    (!Number.isInteger(stakeXu) ||
      stakeXu < FB_ROOM_STAKE_MIN ||
      stakeXu % FB_ROOM_STAKE_STEP !== 0)
  )
    return { ok: false, message: 'Số xu cược tối thiểu 10, là bội số của 10' };
  if (stakeXu > balanceXu) return { ok: false, message: `Bạn chỉ có ${formatXu(balanceXu)} xu` };
  if (
    password &&
    (password.length < FB_ROOM_PASSWORD_MIN || password.length > FB_ROOM_PASSWORD_MAX)
  )
    return { ok: false, message: 'Mật khẩu từ 4 đến 12 ký tự' };
  return {
    ok: true,
    value: { viewBars, playBars, minutes, maxPlayers, stakeXu, password: password || null },
  };
}

/** Kiểm tra định dạng ID phòng (§2.1). */
export function isRoomCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

// ------------------------------------------------------------------ mật khẩu phòng

/** Băm mật khẩu phòng bằng scrypt: `scrypt$<salt hex>$<hash hex>`. */
export async function hashRoomPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyRoomPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password.trim(), Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ------------------------------------------------------------------ §2.3 vào phòng

export type FbJoinErrorCode =
  | 'ROOM_PLAYING'
  | 'ROOM_FULL'
  | 'XU_INSUFFICIENT'
  | 'PASSWORD_REQUIRED'
  | 'WRONG_PASSWORD'
  | 'ALREADY_IN_ROOM';

export interface FbJoinError {
  readonly code: FbJoinErrorCode;
  readonly message: string;
}

export interface FbJoinCheckInput {
  readonly status: 'waiting' | 'playing' | 'closed';
  readonly memberCount: number;
  readonly maxPlayers: number;
  readonly stakeXu: number;
  readonly balanceXu: number;
  readonly locked: boolean;
  /** Người dùng có gửi mật khẩu không (chuỗi rỗng = không). */
  readonly passwordGiven: boolean;
  /** Mật khẩu gửi lên khớp (chỉ có nghĩa khi `passwordGiven`). */
  readonly passwordOk: boolean;
  /** Người dùng đang ở một phòng khác chưa rời. */
  readonly inOtherRoom: boolean;
}

/**
 * Kiểm tra vào phòng theo đúng thứ tự §2.3: đang chơi → đủ người → thiếu xu → mật khẩu, rồi tới
 * quy tắc mỗi tài khoản một phòng (DESIGN #1). Trả `null` khi được vào.
 */
export function joinCheck(input: FbJoinCheckInput): FbJoinError | null {
  if (input.status !== 'waiting')
    return { code: 'ROOM_PLAYING', message: 'Phòng đang chơi, chưa vào được' };
  if (input.memberCount >= input.maxPlayers)
    return { code: 'ROOM_FULL', message: 'Phòng đã đủ người' };
  if (input.stakeXu > input.balanceXu)
    return {
      code: 'XU_INSUFFICIENT',
      message: `Không đủ xu để vào phòng cược ${formatXu(input.stakeXu)} xu`,
    };
  if (input.locked && !input.passwordGiven)
    return { code: 'PASSWORD_REQUIRED', message: 'Phòng có mật khẩu' };
  if (input.locked && !input.passwordOk)
    return { code: 'WRONG_PASSWORD', message: 'Mật khẩu không đúng' };
  if (input.inOtherRoom)
    return {
      code: 'ALREADY_IN_ROOM',
      message: 'Bạn đang ở một phòng khác, hãy rời phòng đó trước',
    };
  return null;
}

export interface FbRandomJoinRoom {
  readonly status: 'waiting' | 'playing' | 'closed';
  readonly locked: boolean;
  readonly memberCount: number;
  readonly maxPlayers: number;
  readonly stakeXu: number;
}

/** "Chơi phòng bất kỳ" (§2.1): đang chờ, không khoá, còn chỗ, cược không vượt số xu đang có. */
export function randomJoinCandidates<T extends FbRandomJoinRoom>(
  rooms: readonly T[],
  balanceXu: number,
): T[] {
  return rooms.filter(
    (room) =>
      room.status === 'waiting' &&
      !room.locked &&
      room.memberCount < room.maxPlayers &&
      room.stakeXu <= balanceXu,
  );
}

// ------------------------------------------------------------------ nến và tài sản (§5, §6.1)

/** Nến gửi trình duyệt: không có ngày, không có mã. */
export interface FbPublicBar {
  /** Lịch sử: −(view−1)..0, phiên chơi: 1..play, khởi tạo chỉ báo: nhỏ hơn lịch sử. */
  readonly session: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export function toPublicBar(bar: FlashbackBar, session: number): FbPublicBar {
  return { session, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v };
}

/** Nến biểu đồ tại một bước: bước 0 là nến lịch sử cuối cùng, bước `play` là nến cuối. */
export function barAtStep(
  bars: readonly FlashbackBar[],
  viewBars: number,
  step: number,
): FlashbackBar {
  const bar = bars[viewBars - 1 + step];
  if (!bar) throw new Error(`Ván thiếu nến tại bước ${step}`);
  return bar;
}

/** Giá khớp (đồng, số nguyên) tại một bước. */
export function priceAtStep(bars: readonly FlashbackBar[], viewBars: number, step: number): bigint {
  return BigInt(Math.round(barAtStep(bars, viewBars, step).c));
}

export interface FbPublicChart {
  readonly warmup: FbPublicBar[];
  readonly history: FbPublicBar[];
  readonly played: FbPublicBar[];
}

/** Nến được phép gửi cho người đang ở bước `step` (§9: không có nến tương lai). */
export function publicChart(
  match: {
    readonly viewBars: number;
    readonly warmupBars: readonly FlashbackBar[];
    readonly bars: readonly FlashbackBar[];
  },
  step: number,
): FbPublicChart {
  const view = match.viewBars;
  const warmupCount = match.warmupBars.length;
  const warmup = match.warmupBars.map((bar, index) =>
    toPublicBar(bar, index - warmupCount - (view - 1)),
  );
  const history = match.bars
    .slice(0, view)
    .map((bar, index) => toPublicBar(bar, index - (view - 1)));
  const played: FbPublicBar[] = [];
  for (let at = 1; at <= step; at += 1)
    played.push(toPublicBar(barAtStep(match.bars, view, at), at));
  return { warmup, history, played };
}

/** Tổng tài sản = tiền mặt + mọi cổ phiếu đang giữ (kể cả chưa về T+2) × giá. */
export function navOf(cash: bigint, holdings: number, price: bigint): bigint {
  return cash + BigInt(holdings) * price;
}

/** % lợi nhuận dạng phân số: tổng tài sản / vốn − 1. */
export function pnlFraction(nav: bigint, initialCash: bigint = FB_INITIAL_CASH_VND): number {
  return Number(nav - initialCash) / Number(initialCash);
}

/** % lợi nhuận làm tròn 2 chữ số thập phân, tính bằng phần trăm nhân 100 (1,23% → 123). */
export function pnlKey(nav: bigint, initialCash: bigint = FB_INITIAL_CASH_VND): number {
  const key = Math.round((Number(nav - initialCash) * 10_000) / Number(initialCash));
  return Object.is(key, -0) ? 0 : key;
}

/** Bước dùng để hiện % của một người cho người xem đang ở `viewerStep` (§6.1, DESIGN #5). */
export function visibleStep(playerStep: number, viewerStep: number): number {
  return Math.max(0, Math.min(playerStep, viewerStep));
}

/**
 * Tổng tài sản của một người tại bước `step` từ lịch sử `navByStep`. Lịch sử thiếu (không nên xảy
 * ra) thì lấy phần tử cuối có trước bước đó.
 */
export function navAtStep(navByStep: readonly bigint[], step: number): bigint {
  if (navByStep.length === 0) return FB_INITIAL_CASH_VND;
  const index = Math.max(0, Math.min(step, navByStep.length - 1));
  return navByStep[index]!;
}

// ------------------------------------------------------------------ §7 chốt ván

export interface FbSettlementPlayer {
  readonly entryId: string;
  readonly userId: string;
  readonly joinedAt: Date;
  readonly step: number;
  readonly cash: bigint;
  /** Tổng cổ phiếu đang giữ, kể cả lô chưa đủ T+2 (§7.1). */
  readonly holdings: number;
  readonly navByStep: readonly bigint[];
  readonly finished: boolean;
  readonly initialCash?: bigint;
}

export interface FbSettlementOutcome {
  readonly entryId: string;
  readonly userId: string;
  readonly finalNav: bigint;
  readonly pnlPct: number;
  readonly pnlKey: number;
  readonly rank: number;
  readonly winner: boolean;
  readonly winXu: number;
  readonly refundXu: number;
  /** Lịch sử tài sản đã kéo tới phiên cuối (người chưa xong giữ nguyên vị thế). */
  readonly navByStep: bigint[];
  /** true khi người này chưa tới phiên cuối và được server kéo tới (hết giờ). */
  readonly autoFinished: boolean;
}

export interface FbSettlement {
  /** Theo thứ tự hiển thị: hạng tăng dần, cùng hạng thì người vào trước đứng trước. */
  readonly outcomes: FbSettlementOutcome[];
  readonly potXu: number;
  /** Số xu mỗi người thắng nhận (0 khi không cược). */
  readonly shareXu: number;
  /** Mọi người hoà ở 0%: mỗi người nhận lại đúng số đã cược (DESIGN #7). */
  readonly refund: boolean;
}

/**
 * Chốt ván (§7): kéo người chưa xong tới phiên cuối giữ nguyên tiền mặt và cổ phiếu (không tự
 * bán, cổ phiếu chưa về vẫn tính), tính tài sản theo giá đóng cửa phiên cuối, xếp hạng theo % làm
 * tròn 2 chữ số (hoà cùng hạng), người thắng là mọi người hạng 1 và chia đều tổng cược làm tròn
 * xuống. Mọi người hoà ở 0% thì hoàn cược.
 */
export function settleMatch(input: {
  readonly players: readonly FbSettlementPlayer[];
  readonly playBars: number;
  /** Giá đóng cửa (đồng) tại bước `step` (0..playBars). */
  readonly priceAt: (step: number) => bigint;
  /** Cược mỗi người của ván (0 khi chơi một mình hoặc không cược). */
  readonly stakeXu: number;
}): FbSettlement {
  const { players, playBars, priceAt, stakeXu } = input;
  const lastPrice = priceAt(playBars);
  const valued = players.map((player) => {
    const initial = player.initialCash ?? FB_INITIAL_CASH_VND;
    const navByStep = player.navByStep.slice(0, player.step + 1);
    while (navByStep.length < player.step + 1)
      navByStep.push(navAtStep(player.navByStep, navByStep.length));
    for (let step = player.step + 1; step <= playBars; step += 1)
      navByStep.push(navOf(player.cash, player.holdings, priceAt(step)));
    const finalNav = navOf(player.cash, player.holdings, lastPrice);
    navByStep[playBars] = finalNav;
    return {
      player,
      finalNav,
      navByStep,
      pnlPct: pnlFraction(finalNav, initial),
      key: pnlKey(finalNav, initial),
    };
  });
  const sorted = [...valued].sort(
    (left, right) =>
      right.key - left.key ||
      left.player.joinedAt.getTime() - right.player.joinedAt.getTime() ||
      left.player.userId.localeCompare(right.player.userId),
  );
  const topKey = sorted[0]?.key ?? 0;
  const winners = sorted.filter((item) => item.key === topKey);
  const staked = stakeXu > 0 && players.length > 1;
  const potXu = staked ? stakeXu * players.length : 0;
  const shareXu = staked && winners.length > 0 ? Math.floor(potXu / winners.length) : 0;
  const refund = staked && winners.length === players.length && topKey === 0;
  const outcomes = sorted.map((item): FbSettlementOutcome => {
    const rank = 1 + sorted.filter((other) => other.key > item.key).length;
    const winner = item.key === topKey;
    return {
      entryId: item.player.entryId,
      userId: item.player.userId,
      finalNav: item.finalNav,
      pnlPct: item.pnlPct,
      pnlKey: item.key,
      rank,
      winner,
      winXu: winner && staked && !refund ? shareXu : 0,
      refundXu: winner && refund ? stakeXu : 0,
      navByStep: item.navByStep,
      autoFinished: !item.player.finished,
    };
  });
  return { outcomes, potXu, shareXu, refund };
}

/** Tiêu đề cửa sổ kết quả cho người xem (§7.3). */
export function resultTitle(input: {
  readonly solo: boolean;
  readonly winners: readonly { readonly userId: string; readonly name: string }[];
  readonly viewerId: string;
}): string {
  if (input.solo) return 'Kết quả';
  if (input.winners.length > 1) return 'Hoà';
  const winner = input.winners[0];
  if (!winner) return 'Kết quả';
  return winner.userId === input.viewerId ? 'Bạn thắng' : `${winner.name} thắng`;
}

/** Nhãn xu của một dòng kết quả: chỉ người thắng có nhãn (§7.3, DESIGN #7). */
export function resultXuLabel(outcome: {
  readonly winXu: number;
  readonly refundXu: number;
}): string | null {
  if (outcome.refundXu > 0) return 'Hoàn xu cược';
  if (outcome.winXu > 0) return `+${formatXu(outcome.winXu)} xu`;
  return null;
}
