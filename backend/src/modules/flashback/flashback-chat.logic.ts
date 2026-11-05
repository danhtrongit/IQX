/**
 * Chat phòng Flashback (spec v2.4 §3): các quy tắc thuần, không đụng cơ sở dữ liệu.
 *
 * Quy tắc quan trọng nhất là `chatVisibleTo` (§3.4): mỗi người tự bấm "Phiên tiếp" nên đi nhanh chậm
 * khác nhau, tin của người đi trước có thể lộ diễn biến tương lai. Server chỉ giao một tin khi người
 * nhận đã tới phiên của tin; tin chưa tới lượt không rời khỏi server dưới bất kỳ dạng nào.
 */

/** Tin nhắn tối đa bấy nhiêu ký tự (§3.3). */
export const FB_CHAT_MAX_LENGTH = 200;
/** Mỗi người 1 tin mỗi 2 giây (§3.5). */
export const FB_CHAT_COOLDOWN_MS = 2000;
/** Lưu 7 ngày rồi xoá (§3.6). */
export const FB_CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Mỗi lần đọc trả tối đa bấy nhiêu tin gần nhất đã tới lượt. */
export const FB_CHAT_LIST_LIMIT = 200;
/** Số tin gần nhất của phòng được xét mỗi lần đọc (trước khi lọc theo người nhận). */
export const FB_CHAT_SCAN_LIMIT = 1000;
/** Báo cáo kèm bấy nhiêu tin trước đó (§3.5). */
export const FB_CHAT_REPORT_CONTEXT = 10;
/** Danh sách từ cấm tối đa. */
export const FB_CHAT_BANNED_MAX = 2000;
export const FB_CHAT_BANNED_WORD_MAX_LENGTH = 64;

export const FB_CHAT_TOO_FAST_MESSAGE = 'Từ từ thôi 😄 Mỗi 2 giây một tin.';

export interface FbChatDelivery {
  readonly userId: string;
  /** null: gửi ở phòng chờ. */
  readonly matchId: string | null;
  readonly phien: number;
}

export interface FbChatViewer {
  readonly userId: string;
  /** Ván đang chơi của phòng; null khi không có ván nào đang chơi. */
  readonly liveMatchId: string | null;
  /** Phiên hiện tại của người nhận trong ván đang chơi; null khi người này không có lượt trong ván. */
  readonly step: number | null;
}

/**
 * Tin có được giao cho người nhận không (§3.4):
 * - tin ở phòng chờ và tin của chính mình: luôn giao;
 * - tin của một ván đã kết thúc: giao cho tất cả;
 * - tin của ván đang chơi: chỉ giao khi `phiên người nhận >= phien của tin`.
 */
export function chatVisibleTo(message: FbChatDelivery, viewer: FbChatViewer): boolean {
  if (message.matchId === null) return true;
  if (message.userId === viewer.userId) return true;
  if (message.matchId !== viewer.liveMatchId) return true;
  return viewer.step !== null && viewer.step >= message.phien;
}

export interface FbChatOrdered {
  readonly id: string;
  readonly phien: number;
  readonly createdAt: Date;
  /** Giờ bắt đầu của ván chứa tin; null với tin ở phòng chờ. */
  readonly matchStartedAt: Date | null;
}

/**
 * Thứ tự hiện (§3.4): theo `phien`, cùng phiên thì theo giờ gửi. Một luồng chat có thể đi qua nhiều
 * ván ("Chơi lại" giữ nguyên luồng) và số phiên của mỗi ván lại bắt đầu từ 0, nên các tin được xếp
 * theo từng chặng trước: tin phòng chờ đứng tại giờ gửi, tin của một ván đứng tại giờ bắt đầu ván.
 */
export function compareChat(a: FbChatOrdered, b: FbChatOrdered): number {
  const anchorA = (a.matchStartedAt ?? a.createdAt).getTime();
  const anchorB = (b.matchStartedAt ?? b.createdAt).getTime();
  return (
    anchorA - anchorB ||
    a.phien - b.phien ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Chuẩn hoá tin trước khi kiểm tra độ dài: NFC, bỏ ký tự điều khiển, gộp khoảng trắng. */
export function normalizeChatText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Thay từ cấm bằng `***` (§3.5): không phân biệt hoa thường và chỉ khớp nguyên từ, để một từ cấm ngắn
 * không làm hỏng các từ dài hơn có chứa nó. Từ dài được thử trước để cụm từ che trọn.
 */
export function maskBannedWords(text: string, words: readonly string[]): string {
  const patterns = words
    .map((word) => word.normalize('NFC').trim())
    .filter((word) => word.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (patterns.length === 0) return text;
  const matcher = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${patterns.join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  return text.replace(matcher, '***');
}

/** Chuẩn hoá danh sách từ cấm admin gửi lên: bỏ trùng (không phân biệt hoa thường), bỏ dòng trống. */
export function normalizeBannedWords(words: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const raw of words) {
    const word = normalizeChatText(raw).toLowerCase();
    if (word) unique.set(word, word);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}
