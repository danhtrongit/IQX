/**
 * Quy tắc thuần của hồ sơ và vị trí trên sàn (port từ `server/index.ts` của IQX-KhuGiaoDich):
 * làm sạch tên, kiểm tra trạng thái di chuyển, làm sạch emote, giới hạn tần suất.
 */

import {
  FLOOR_AVATARS,
  FLOOR_FACINGS,
  FLOOR_OUTFIT_COLORS,
  FLOOR_RESERVED_AVATARS,
  type FloorAvatarId,
  type FloorFacing,
  type FloorOutfitColorId,
  type FloorPeerState,
} from './floor-types.js';

export const FLOOR_NAME_MIN = 2;
export const FLOOR_NAME_MAX = 20;
export const FLOOR_EMOTE_MAX = 60;
/** Toạ độ lớn nhất chấp nhận (giống `WORLD_MAX` của KGD). */
export const FLOOR_WORLD_MAX = 10_000;

/** Khách: mỗi IP tạo tối đa bấy nhiêu nhân vật trong một giờ. */
export const FLOOR_GUEST_CREATE_MAX = 10;
export const FLOOR_GUEST_CREATE_WINDOW_MS = 60 * 60 * 1000;

/** Giới hạn tần suất của một kết nối (ms). */
export const FLOOR_STATE_MIN_MS = 50;
export const FLOOR_EMOTE_MIN_MS = 1500;
export const FLOOR_TYPING_MIN_MS = 1000;

const FACINGS = new Set<string>(FLOOR_FACINGS);

/** Tên hiển thị: chuẩn hoá NFC, bỏ ký tự điều khiển và `<>`, gộp khoảng trắng, cắt còn 20 ký tự; ít nhất 2. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw
    .normalize('NFC')
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FLOOR_NAME_MAX)
    .trim();
  return name.length >= FLOOR_NAME_MIN ? name : null;
}

/** Tên gợi ý lúc tạo hồ sơ: họ tên rồi tới tên đăng nhập; không đủ 2 ký tự thì "Khách". */
export function suggestName(fullName: unknown, username: unknown): string {
  return cleanName(fullName) ?? cleanName(username) ?? 'Khách';
}

export function cleanAvatar(raw: unknown): FloorAvatarId | null {
  return typeof raw === 'string' && (FLOOR_AVATARS as readonly string[]).includes(raw)
    ? (raw as FloorAvatarId)
    : null;
}

/** Nhân vật riêng chỉ dành cho đúng username chủ; khách (username null) không được mặc. */
export function avatarAllowedFor(avatar: FloorAvatarId, username: string | null | undefined): boolean {
  const owner = FLOOR_RESERVED_AVATARS[avatar];
  return !owner || (typeof username === 'string' && username.toLowerCase() === owner);
}

export function cleanOutfitColor(raw: unknown): FloorOutfitColorId {
  return typeof raw === 'string' && (FLOOR_OUTFIT_COLORS as readonly string[]).includes(raw)
    ? (raw as FloorOutfitColorId)
    : 'default';
}

/** Trạng thái di chuyển hợp lệ, toạ độ làm tròn 0,1 và kẹp trong [0, WORLD_MAX]. */
export function cleanState(value: unknown): FloorPeerState | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, facing, moving } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  if (typeof facing !== 'string' || !FACINGS.has(facing)) return null;
  const clamp = (n: number) => Math.max(0, Math.min(FLOOR_WORLD_MAX, Math.round(n * 10) / 10));
  return { x: clamp(x), y: clamp(y), facing: facing as FloorFacing, moving: moving === true };
}

/** Emote hiển thị trên đầu nhân vật; rỗng sau khi làm sạch thì bỏ. */
export function cleanEmote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\p{C}<>]/gu, '').trim().slice(0, FLOOR_EMOTE_MAX);
  return text || null;
}

/**
 * Có nên phát trạng thái này không. Bắt đầu đi, dừng, đổi hướng luôn đi qua (bỏ một lần dừng làm
 * nhân vật đi tại chỗ trên màn hình người khác); còn lại giữ tối thiểu 50 ms giữa hai lần.
 */
export function stateGate(
  previous: Pick<FloorPeerState, 'moving' | 'facing'>,
  next: Pick<FloorPeerState, 'moving' | 'facing'>,
  lastAt: number,
  now: number,
): { allow: boolean; reliable: boolean } {
  const change = next.moving !== previous.moving || next.facing !== previous.facing;
  if (!change && now - lastAt < FLOOR_STATE_MIN_MS) return { allow: false, reliable: false };
  return { allow: true, reliable: change };
}

/**
 * Hạn mức tạo nhân vật khách theo IP (cửa sổ trượt, trong bộ nhớ của tiến trình API). `take` ghi nhận
 * một lần tạo và trả false khi IP đã dùng hết hạn mức trong cửa sổ.
 */
export class GuestCreateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = FLOOR_GUEST_CREATE_MAX,
    private readonly windowMs = FLOOR_GUEST_CREATE_WINDOW_MS,
    private readonly maxKeys = 5_000,
  ) {}

  take(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}
