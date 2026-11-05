/**
 * Ảnh trong phòng Flashback: các quy tắc thuần, không đụng socket hay cơ sở dữ liệu.
 *
 * Ảnh KHÔNG được lưu ở đâu cả: chỉ nằm trong bộ nhớ tiến trình API theo phòng (`FbImageStore`), mất
 * khi phòng đóng hoặc tiến trình khởi động lại. Ở đây có giới hạn kích thước, kiểm byte đầu và kích
 * thước khung thật của ảnh, giới hạn tốc độ gửi và kho ảnh trong bộ nhớ với trần theo phòng và toàn
 * tiến trình.
 */

export const FB_IMAGE_MIMES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type FbImageMime = (typeof FB_IMAGE_MIMES)[number];

/** Dữ liệu ảnh sau giải mã tối đa bấy nhiêu byte. */
export const FB_IMAGE_MAX_BYTES = 1_500_000;
/** Cạnh khung tối đa (px). */
export const FB_IMAGE_MAX_DIMENSION = 4096;
/** Mỗi phòng giữ tối đa bấy nhiêu ảnh gần nhất. */
export const FB_IMAGE_ROOM_MAX_COUNT = 50;
/** Tổng dữ liệu ảnh tối đa mỗi phòng. */
export const FB_IMAGE_ROOM_MAX_BYTES = 30_000_000;
/** Tổng dữ liệu ảnh tối đa của cả tiến trình. */
export const FB_IMAGE_TOTAL_MAX_BYTES = 200_000_000;
/** Mỗi người 1 ảnh mỗi 2 giây. */
export const FB_IMAGE_MIN_INTERVAL_MS = 2000;
/** Mỗi người tối đa 20 ảnh mỗi phút. */
export const FB_IMAGE_PER_MINUTE = 20;
/** Chiều dài tối đa của chuỗi base64 hợp lệ cho FB_IMAGE_MAX_BYTES byte. */
export const FB_IMAGE_MAX_BASE64 = Math.ceil(FB_IMAGE_MAX_BYTES / 3) * 4;

/** Một thông điệp WebSocket tối đa: ảnh base64 cộng phần bao JSON. */
export const FB_WS_MAX_PAYLOAD = FB_IMAGE_MAX_BASE64 + 4096;

export type FbMediaState = { audio: boolean; video: boolean; screen: boolean };

export const sanitizeMedia = (value: unknown): FbMediaState | null => {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  return { audio: raw.audio === true, video: raw.video === true, screen: raw.screen === true };
};

// ------------------------------------------------------------------ định dạng ảnh

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

/** Byte đầu có đúng định dạng khai báo không (PNG, JPEG, WebP). */
export function matchesMime(buffer: Buffer, mime: FbImageMime): boolean {
  if (mime === 'image/png')
    return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff]);
  // RIFF....WEBP
  return (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  );
}

const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  let index = 2;
  while (index + 4 <= buffer.length) {
    if (buffer[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = buffer[index + 1]!;
    if (marker === 0xff) {
      index += 1;
      continue;
    }
    // Marker không có độ dài.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    if (JPEG_SOF.has(marker)) {
      if (index + 9 > buffer.length) return null;
      return { height: buffer.readUInt16BE(index + 5), width: buffer.readUInt16BE(index + 7) };
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    index += 2 + buffer.readUInt16BE(index + 2);
  }
  return null;
}

function webpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X')
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  if (kind === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const b0 = buffer[21]!;
    const b1 = buffer[22]!;
    const b2 = buffer[23]!;
    const b3 = buffer[24]!;
    return {
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
    };
  }
  if (kind === 'VP8 ') {
    if (!startsWith(buffer, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Kích thước khung thật đọc từ phần đầu tệp; null nếu không đọc được. */
export function readImageSize(
  buffer: Buffer,
  mime: FbImageMime,
): { width: number; height: number } | null {
  if (mime === 'image/png') {
    if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return mime === 'image/jpeg' ? jpegSize(buffer) : webpSize(buffer);
}

export type FbImageCheck =
  | { ok: true; buffer: Buffer; width: number; height: number }
  | { ok: false; code: 'IMAGE_INVALID' | 'IMAGE_TOO_LARGE'; message: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Kiểm một ảnh client gửi lên: loại, độ dài, base64, byte đầu và kích thước khung thật. */
export function checkImage(input: { mime: unknown; data: unknown }): FbImageCheck {
  const invalid = (message: string): FbImageCheck => ({
    ok: false,
    code: 'IMAGE_INVALID',
    message,
  });
  const { mime, data } = input;
  if (typeof mime !== 'string' || !(FB_IMAGE_MIMES as readonly string[]).includes(mime))
    return invalid('Chỉ gửi được ảnh WebP, JPEG hoặc PNG');
  if (typeof data !== 'string' || data.length === 0) return invalid('Ảnh trống');
  if (data.length > FB_IMAGE_MAX_BASE64)
    return {
      ok: false,
      code: 'IMAGE_TOO_LARGE',
      message: 'Ảnh quá lớn, tối đa 1,5 MB sau khi nén',
    };
  if (data.length % 4 !== 0 || !BASE64.test(data)) return invalid('Dữ liệu ảnh không hợp lệ');
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > FB_IMAGE_MAX_BYTES)
    return {
      ok: false,
      code: 'IMAGE_TOO_LARGE',
      message: 'Ảnh quá lớn, tối đa 1,5 MB sau khi nén',
    };
  if (!matchesMime(buffer, mime as FbImageMime))
    return invalid('Nội dung ảnh không đúng định dạng đã khai báo');
  const size = readImageSize(buffer, mime as FbImageMime);
  if (!size || size.width < 1 || size.height < 1) return invalid('Không đọc được kích thước ảnh');
  if (size.width > FB_IMAGE_MAX_DIMENSION || size.height > FB_IMAGE_MAX_DIMENSION)
    return invalid(`Ảnh tối đa ${FB_IMAGE_MAX_DIMENSION} × ${FB_IMAGE_MAX_DIMENSION} px`);
  return { ok: true, buffer, width: size.width, height: size.height };
}

// ------------------------------------------------------------------ giới hạn tốc độ

export type FbImageRateResult =
  { ok: true } | { ok: false; code: 'IMAGE_TOO_FAST' | 'IMAGE_RATE_LIMIT'; retryAfterMs: number };

/** 1 ảnh mỗi 2 giây và 20 ảnh mỗi phút cho mỗi người; mọi lần thử đều được tính. */
export class FbImageRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  take(userId: string, now: number): FbImageRateResult {
    const recent = (this.attempts.get(userId) ?? []).filter((at) => now - at < 60_000);
    const last = recent.at(-1);
    if (last !== undefined && now - last < FB_IMAGE_MIN_INTERVAL_MS) {
      this.attempts.set(userId, recent);
      return {
        ok: false,
        code: 'IMAGE_TOO_FAST',
        retryAfterMs: FB_IMAGE_MIN_INTERVAL_MS - (now - last),
      };
    }
    if (recent.length >= FB_IMAGE_PER_MINUTE) {
      this.attempts.set(userId, recent);
      return { ok: false, code: 'IMAGE_RATE_LIMIT', retryAfterMs: 60_000 - (now - recent[0]!) };
    }
    recent.push(now);
    this.attempts.set(userId, recent);
    return { ok: true };
  }

  /** Bỏ người đã im quá một phút để Map không phình mãi. */
  prune(now: number): void {
    for (const [userId, times] of this.attempts)
      if (times.length === 0 || now - times[times.length - 1]! >= 60_000)
        this.attempts.delete(userId);
  }

  get size(): number {
    return this.attempts.size;
  }
}

// ------------------------------------------------------------------ kho ảnh trong bộ nhớ

export interface FbStoredImage {
  readonly id: string;
  readonly seq: number;
  readonly roomCode: string;
  readonly userId: string;
  readonly name: string;
  /** Ván của người gửi lúc gửi; null: phòng chờ. */
  readonly matchId: string | null;
  readonly phien: number;
  readonly mime: FbImageMime;
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly sentAt: string;
}

/**
 * Ảnh theo phòng, chỉ trong bộ nhớ. Vượt 50 ảnh hoặc 30 MB của phòng thì bỏ ảnh cũ nhất của phòng;
 * vượt 200 MB toàn tiến trình thì bỏ ảnh cũ nhất của toàn tiến trình.
 */
export class FbImageStore {
  private readonly rooms = new Map<string, FbStoredImage[]>();
  private total = 0;
  private counter = 0;

  constructor(
    private readonly limits = {
      roomCount: FB_IMAGE_ROOM_MAX_COUNT,
      roomBytes: FB_IMAGE_ROOM_MAX_BYTES,
      totalBytes: FB_IMAGE_TOTAL_MAX_BYTES,
    },
  ) {}

  nextSeq(): number {
    this.counter += 1;
    return this.counter;
  }

  /** Thêm ảnh; trả các ảnh đã bị bỏ để dọn tham chiếu. */
  add(image: FbStoredImage): FbStoredImage[] {
    const list = this.rooms.get(image.roomCode) ?? [];
    list.push(image);
    this.rooms.set(image.roomCode, list);
    this.total += image.buffer.length;
    const dropped: FbStoredImage[] = [];
    let roomBytes = list.reduce((sum, item) => sum + item.buffer.length, 0);
    while (
      list.length > 1 &&
      (list.length > this.limits.roomCount || roomBytes > this.limits.roomBytes)
    ) {
      const old = list.shift()!;
      roomBytes -= old.buffer.length;
      this.total -= old.buffer.length;
      dropped.push(old);
    }
    while (this.total > this.limits.totalBytes) {
      let oldest: { code: string; seq: number } | null = null;
      for (const [code, items] of this.rooms)
        if (items[0] && (!oldest || items[0].seq < oldest.seq))
          oldest = { code, seq: items[0].seq };
      if (!oldest) break;
      const items = this.rooms.get(oldest.code)!;
      const old = items.shift()!;
      this.total -= old.buffer.length;
      dropped.push(old);
      if (items.length === 0) this.rooms.delete(oldest.code);
    }
    return dropped;
  }

  list(roomCode: string): readonly FbStoredImage[] {
    return this.rooms.get(roomCode) ?? [];
  }

  /** Xoá hết ảnh của phòng ngay; trả số ảnh đã xoá. */
  clearRoom(roomCode: string): number {
    const list = this.rooms.get(roomCode);
    if (!list) return 0;
    for (const item of list) this.total -= item.buffer.length;
    this.rooms.delete(roomCode);
    return list.length;
  }

  get totalBytes(): number {
    return this.total;
  }

  roomCodes(): string[] {
    return [...this.rooms.keys()];
  }
}
