/**
 * Quy tắc thuần của ba hành động trên sàn: Xả xui, Gáy, Tán lộc (`docs/trading-floor-fx/SPEC.md`).
 * Không đụng cơ sở dữ liệu hay socket, để test trực tiếp.
 */

/** Xả xui: mỗi nhân vật cách nhau tối thiểu bấy nhiêu ms. */
export const FX_XAXUI_COOLDOWN_MS = 8_000;
/** Gáy: mỗi nhân vật cách nhau tối thiểu bấy nhiêu ms. */
export const FX_GAY_COOLDOWN_MS = 20_000;
export const FX_GAY_TEXT_MAX = 80;

/** Một đồng xu trong mưa lộc đáng bấy nhiêu xu. */
export const RAIN_COIN_VALUE = 10;
export const RAIN_MIN = 50;
export const RAIN_MAX = 1_000;
/** Mưa lộc sống bấy nhiêu ms; hết giờ thì đồng chưa ai nhặt được hoàn cho người tán. */
export const RAIN_TTL_MS = 45_000;
/** Tối đa bấy nhiêu cơn mưa cùng lúc trên sàn (mỗi người tán tối đa một). */
export const RAIN_MAX_LIVE = 3;
/** Nhân vật phải đứng cách đồng xu không quá bấy nhiêu đơn vị mới nhặt được. */
export const RAIN_GRAB_REACH = 96;
/** Điểm rơi do client chọn phải cách người tán không quá bấy nhiêu đơn vị. */
export const RAIN_SPOT_RADIUS = 360;

/** Khung sàn đi được: mọi đồng xu rơi trong khung này. */
export const RAIN_BOX = { minX: 40, maxX: 2_008, minY: 260, maxY: 1_368 } as const;
/** Server tự rải: vành khuyên quanh người tán. */
export const RAIN_SCATTER_MIN = 60;
export const RAIN_SCATTER_MAX = 300;

export interface FxPoint {
  readonly x: number;
  readonly y: number;
}

export interface CoinSpot {
  readonly i: number;
  readonly x: number;
  readonly y: number;
}

/** Câu Gáy: làm sạch như emote (bỏ ký tự điều khiển và `<>`), gộp khoảng trắng, 1..80 ký tự. */
export function cleanGayText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .normalize('NFC')
    // Xuống dòng thành khoảng trắng trước khi bỏ ký tự điều khiển, để hai từ không dính vào nhau.
    .replace(/\s+/gu, ' ')
    .replace(/[\p{C}<>]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, FX_GAY_TEXT_MAX)
    .trim();
  return text || null;
}

/** Số xu tán: số nguyên, bội của 10, từ 50 đến 1000. */
export function validAmount(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= RAIN_MIN &&
    n <= RAIN_MAX &&
    n % RAIN_COIN_VALUE === 0
  );
}

export function withinReach(a: FxPoint, b: FxPoint, reach: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= reach;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const inBox = (x: number, y: number): boolean =>
  x >= RAIN_BOX.minX && x <= RAIN_BOX.maxX && y >= RAIN_BOX.minY && y <= RAIN_BOX.maxY;

/** Điểm rơi client gửi; null khi có bất kỳ điểm nào sai (sai số lượng, ngoài khung, quá xa). */
function clientSpots(count: number, giver: FxPoint, client: unknown): CoinSpot[] | null {
  if (!Array.isArray(client) || client.length !== count) return null;
  const spots: CoinSpot[] = [];
  for (const [i, item] of client.entries()) {
    if (typeof item !== 'object' || item === null) return null;
    const { x, y } = item as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !inBox(x, y)) return null;
    if (!withinReach(giver, { x, y }, RAIN_SPOT_RADIUS)) return null;
    spots.push({ i, x: round1(x), y: round1(y) });
  }
  return spots;
}

/**
 * Chỗ rơi của `amount / 10` đồng xu. Giữ điểm do client chọn (trên nền đi được) khi tất cả hợp lệ,
 * ngược lại server tự rải trong vành 60..300 quanh người tán, kẹp trong khung sàn.
 */
export function coinSpots(
  amount: number,
  giver: FxPoint,
  client: unknown,
  random: () => number = Math.random,
): CoinSpot[] {
  const count = Math.floor(amount / RAIN_COIN_VALUE);
  const accepted = clientSpots(count, giver, client);
  if (accepted) return accepted;
  const spots: CoinSpot[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = RAIN_SCATTER_MIN + random() * (RAIN_SCATTER_MAX - RAIN_SCATTER_MIN);
    spots.push({
      i,
      x: round1(clamp(giver.x + Math.cos(angle) * r, RAIN_BOX.minX, RAIN_BOX.maxX)),
      y: round1(clamp(giver.y + Math.sin(angle) * r, RAIN_BOX.minY, RAIN_BOX.maxY)),
    });
  }
  return spots;
}
