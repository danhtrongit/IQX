/**
 * Quy tắc thuần của Nhắn tin với SACO (port từ `shared/chat.ts` và `server/chat.ts` của IQX-KhuGiaoDich):
 * làm sạch tin, giới hạn tần suất, biểu tượng SACO, đổi chỗ trong hàng khớp và chọn SACO khi không ai
 * nhận lời.
 */

export const CHAT_RULES = {
  /** Thời gian một SACO có để nhận lời mời từ Chat SACO. */
  inviteMs: 5_000,
  maxText: 1_000,
  /** Số tin trả về khi mở một cuộc trò chuyện. */
  history: 200,
  /** Khoảng cách tối thiểu giữa hai tin của một người. */
  sendMinMs: 250,
  /** Số cuộc trò chuyện tối đa trong hộp thư của một bên. */
  inboxLimit: 200,
  /** Giới hạn của các danh sách quản trị. */
  staffLimit: 300,
  /** Số tin tối đa khi trưởng nhóm xem lại một cuộc chat. */
  staffHistory: 5_000,
} as const;

/** Chat SACO nhắn trước: số tin tối đa chờ trong một lượt phân phối, độ dài bản xem trước trên lời mời. */
export const DISPATCH_RULES = {
  maxQueued: 5,
  previewMax: 120,
} as const;

/** Bản xem trước của tin đầu tiên trên lời mời gửi SACO: một dòng, tối đa 120 ký tự (kể cả dấu "…"). */
export function invitePreview(text: string, max: number = DISPATCH_RULES.previewMax): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line;
}

/** Một SACO trong thứ hạng khi chọn người nhận cuộc chat không ai nhận lời. */
export interface DispatchCandidate {
  readonly id: string;
  readonly userId: string;
  readonly active: boolean;
  readonly onDuty: boolean;
  /** Chủ tài khoản đang có socket. */
  readonly online: boolean;
}

/**
 * Người nhận khi không SACO nào nhận lời (hoặc không ai đang trực): SACO còn hoạt động xếp cao nhất đang
 * có socket (trực hay không đều được), không có thì SACO còn hoạt động xếp cao nhất. Không bao giờ là
 * chính người chat. `ranking` theo đúng thứ tự khớp; null khi không còn SACO nào.
 */
export function pickFallbackSaco(
  ranking: readonly DispatchCandidate[],
  ownerId: string,
): string | null {
  const eligible = ranking.filter((saco) => saco.active && saco.userId !== ownerId);
  return (eligible.find((saco) => saco.online) ?? eligible[0])?.id ?? null;
}

/** Bộ thời gian có thể sửa để test rút ngắn cửa sổ lời mời (KGD `timing`). */
export const floorChatTiming = { inviteMs: CHAT_RULES.inviteMs as number };

export const SACO_NAME_MIN = 2;
export const SACO_NAME_MAX = 40;

/** Biểu tượng tự gán cho SACO mới theo số SACO đã có (KGD `ICONS`). */
export const SACO_ICONS = ['🦁', '🐻', '🐸', '🦉', '🐧', '🦄', '🐬', '🦅', '🐳', '🐝'] as const;

export function pickSacoIcon(existingCount: number): string {
  return SACO_ICONS[Math.max(0, existingCount) % SACO_ICONS.length]!;
}

/**
 * Tin nhắn: NFC, xuống dòng chuẩn `\n`, bỏ ký tự điều khiển (trừ xuống dòng), tối đa hai dòng trống
 * liên tiếp, cắt hai đầu. Trống hoặc dài quá giới hạn thì null.
 */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{C}\n]/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text && text.length <= CHAT_RULES.maxText ? text : null;
}

/** Tên người chat hiển thị cho SACO và quản trị: khách chưa đăng nhập được đánh dấu để không lẫn với tài khoản. */
export const guestLabel = (name: string, guest: boolean): string =>
  guest ? `${name || 'Khách'} (khách)` : name;

/** Trường văn bản ngắn (tên hiển thị SACO): bỏ ký tự điều khiển và `<>`, gộp khoảng trắng, cắt độ dài. */
export function cleanField(raw: unknown, max: number): string {
  return typeof raw === 'string'
    ? raw
        .normalize('NFC')
        .replace(/[\p{C}<>]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

/** Tên hiển thị SACO hợp lệ hoặc null. */
export function cleanSacoName(raw: unknown): string | null {
  const name = cleanField(raw, SACO_NAME_MAX);
  return name.length >= SACO_NAME_MIN ? name : null;
}

export interface OrderEntry {
  readonly id: string;
  readonly leadUserId: string;
}

/**
 * Thứ tự mới của hàng khớp sau một lần bấm ▲▼.
 *
 * - `scopeLeadId` null (quản trị viên): đổi chỗ với SACO liền trên hoặc liền dưới, bất kể nhóm.
 * - `scopeLeadId` có giá trị (trưởng nhóm): đổi chỗ với SACO cùng nhóm gần nhất phía trên hoặc phía
 *   dưới; các vị trí của nhóm khác giữ nguyên.
 *
 * Trả về cùng thứ tự khi đã ở đầu hoặc cuối (hoặc `id` không có trong danh sách).
 */
export function moveInOrder(
  order: readonly OrderEntry[],
  id: string,
  dir: 'up' | 'down',
  scopeLeadId: string | null,
): string[] {
  const ids = order.map((entry) => entry.id);
  const index = ids.indexOf(id);
  if (index < 0) return ids;
  const slots =
    scopeLeadId === null
      ? ids.map((_, position) => position)
      : order.flatMap((entry, position) => (entry.leadUserId === scopeLeadId ? [position] : []));
  const at = slots.indexOf(index);
  const target = at + (dir === 'up' ? -1 : 1);
  if (at < 0 || target < 0 || target >= slots.length) return ids;
  const from = slots[at]!;
  const to = slots[target]!;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];
  return ids;
}
