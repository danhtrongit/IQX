/**
 * Ảnh trong chat phòng Flashback: nén phía trình duyệt, đọc ảnh từ clipboard hoặc kéo thả, đổi qua lại
 * giữa Blob và base64, xếp ảnh xen với tin chữ. Không lưu ảnh ở đâu: chỉ Blob và object URL trong bộ
 * nhớ trình duyệt.
 */
import type { FlashbackChatMessage } from "./flashback-api"
import type { ImageMime } from "./room-socket-protocol"

/** Cạnh dài tối đa sau khi nén. */
export const IMAGE_MAX_SIDE = 1600
/** Mục tiêu dung lượng sau khi nén. */
export const IMAGE_TARGET_BYTES = 600 * 1024
/** Trần cứng của server (1,5 MB sau giải mã); vượt thì từ chối thay vì gửi. */
export const IMAGE_HARD_LIMIT_BYTES = 1_500_000
/** Ảnh gốc lớn hơn mức này thì không cố giải mã (tránh treo máy). */
export const IMAGE_INPUT_LIMIT_BYTES = 30 * 1024 * 1024
/** Mỗi người 1 ảnh mỗi 2 giây (khớp server). */
export const IMAGE_COOLDOWN_MS = 2_000

export const IMAGE_TOO_FAST = "Từ từ thôi, mỗi 2 giây một ảnh."
export const IMAGE_NOT_SUPPORTED = "Chỉ gửi được ảnh (PNG, JPEG, WebP, GIF)."
export const IMAGE_UNREADABLE = "Không đọc được ảnh này. Hãy thử ảnh khác."
export const IMAGE_TOO_BIG = "Ảnh quá lớn, hãy chọn ảnh nhỏ hơn."

export class ChatImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChatImageError"
  }
}

export type CompressedImage = { blob: Blob; mime: ImageMime; width: number; height: number }

/** Ảnh đã giải mã sẵn để vẽ lên canvas. */
export type DecodedImage = { width: number; height: number; source: unknown; dispose?: () => void }

/** Phần phụ thuộc trình duyệt của việc nén; test thay bằng bản giả. */
export type ImageCodec = {
  decode(blob: Blob): Promise<DecodedImage>
  /** Vẽ ảnh vào khung `width x height` rồi mã hoá; trả null nếu trình duyệt không mã hoá được. */
  encode(image: DecodedImage, width: number, height: number, mime: ImageMime, quality: number): Promise<Blob | null>
}

export const browserImageCodec: ImageCodec = {
  async decode(blob) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob)
      return { width: bitmap.width, height: bitmap.height, source: bitmap, dispose: () => bitmap.close() }
    }
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight, source: image }
    } finally {
      URL.revokeObjectURL(url)
    }
  },
  async encode(image, width, height, mime, quality) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return null
    // JPEG không có nền trong suốt: ảnh PNG trong suốt sẽ ra nền đen nếu không tô trắng trước.
    if (mime === "image/jpeg") {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(image.source as CanvasImageSource, 0, 0, width, height)
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
  },
}

const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45]
const SHRINK = 0.8
const MIN_SIDE = 320

/** Đưa ảnh về cạnh dài tối đa `maxSide` mà không phóng to. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Nén ảnh: cạnh dài tối đa 1600 px, WebP (JPEG nếu trình duyệt không mã hoá được WebP), giảm chất
 * lượng rồi giảm kích thước cho tới khi dưới 600 KB. Ném `ChatImageError` với câu tiếng Việt.
 */
export async function compressImage(file: Blob, codec: ImageCodec = browserImageCodec): Promise<CompressedImage> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new ChatImageError(IMAGE_NOT_SUPPORTED)
  if (file.size > IMAGE_INPUT_LIMIT_BYTES) throw new ChatImageError(IMAGE_TOO_BIG)
  let decoded: DecodedImage
  try {
    decoded = await codec.decode(file)
  } catch {
    throw new ChatImageError(IMAGE_UNREADABLE)
  }
  try {
    if (!(decoded.width > 0 && decoded.height > 0)) throw new ChatImageError(IMAGE_UNREADABLE)
    let size = fitWithin(decoded.width, decoded.height, IMAGE_MAX_SIDE)
    let mime: ImageMime = "image/webp"
    let best: CompressedImage | null = null
    for (let round = 0; round < 4; round += 1) {
      for (const quality of QUALITIES) {
        let blob = await codec.encode(decoded, size.width, size.height, mime, quality)
        // Trình duyệt không hỗ trợ WebP sẽ trả PNG hoặc null: chuyển sang JPEG.
        if (mime === "image/webp" && (!blob || blob.type !== "image/webp")) {
          mime = "image/jpeg"
          blob = await codec.encode(decoded, size.width, size.height, mime, quality)
        }
        if (!blob || blob.size === 0) throw new ChatImageError(IMAGE_UNREADABLE)
        best = { blob, mime, width: size.width, height: size.height }
        if (blob.size <= IMAGE_TARGET_BYTES) return best
      }
      if (Math.max(size.width, size.height) * SHRINK < MIN_SIDE) break
      size = { width: Math.max(1, Math.round(size.width * SHRINK)), height: Math.max(1, Math.round(size.height * SHRINK)) }
    }
    if (best && best.blob.size <= IMAGE_HARD_LIMIT_BYTES) return best
    throw new ChatImageError(IMAGE_TOO_BIG)
  } finally {
    decoded.dispose?.()
  }
}

// ------------------------------------------------------------------ Blob và base64

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new ChatImageError(IMAGE_UNREADABLE))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

// ------------------------------------------------------------------ clipboard và kéo thả

type ClipboardLike = {
  files?: ArrayLike<File> | null
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null
  types?: ArrayLike<string> | readonly string[] | null
}

const isImageFile = (file: File | null | undefined): file is File => !!file && file.type.startsWith("image/")

/**
 * Ảnh trong clipboard khi dán. Nếu clipboard có cả chữ thì trả null để người dùng dán chữ như thường
 * (ví dụ copy từ bảng tính có kèm ảnh chụp ô).
 */
export function imageFromClipboard(data: ClipboardLike | null | undefined): File | null {
  if (!data) return null
  const types = Array.from(data.types ?? [])
  if (types.includes("text/plain") || types.includes("text/html")) return null
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (isImageFile(file)) return file
    }
  }
  for (const file of Array.from(data.files ?? [])) if (isImageFile(file)) return file
  return null
}

/** Ảnh đầu tiên trong thao tác thả tệp. */
export function imageFromDrop(data: ClipboardLike | null | undefined): File | null {
  if (!data) return null
  for (const file of Array.from(data.files ?? [])) if (isImageFile(file)) return file
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (isImageFile(file)) return file
    }
  }
  return null
}

/** Thao tác kéo có mang tệp không (để hiện vùng thả). */
export function dragHasFiles(data: { types?: ArrayLike<string> | readonly string[] | null } | null | undefined): boolean {
  return Array.from(data?.types ?? []).includes("Files")
}

// ------------------------------------------------------------------ dòng chat có ảnh

export type ChatImageStatus = "sending" | "sent" | "failed"

/** Một ảnh trong luồng chat. `id` là khoá hiển thị (id server khi đã gửi, `clientId` khi chưa). */
export type ChatImageItem = {
  id: string
  clientId: string | null
  userId: string
  name: string
  isMe: boolean
  /** Object URL trong bộ nhớ trình duyệt; được thu hồi khi rời phòng. */
  url: string
  width: number
  height: number
  /** ISO 8601. */
  sentAt: string
  status: ChatImageStatus
  error?: string
}

export type ChatTimelineEntry =
  | { kind: "message"; key: string; message: FlashbackChatMessage }
  | { kind: "image"; key: string; image: ChatImageItem }

/**
 * Xếp ảnh xen với tin chữ theo thời gian. Thứ tự tin chữ giữ nguyên như server trả (đã theo phiên,
 * §3.4); mỗi ảnh đứng ngay trước tin chữ đầu tiên gửi muộn hơn ảnh, nên ảnh gửi trước mọi tin thì
 * đứng đầu và ảnh mới nhất đứng cuối.
 */
export function mergeTimeline(messages: readonly FlashbackChatMessage[], images: readonly ChatImageItem[]): ChatTimelineEntry[] {
  const ordered = [...images].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  const entries: ChatTimelineEntry[] = []
  let next = 0
  const flushBefore = (limit: number) => {
    while (next < ordered.length && Date.parse(ordered[next]!.sentAt) < limit) {
      const image = ordered[next]!
      entries.push({ kind: "image", key: `image:${image.id}`, image })
      next += 1
    }
  }
  for (const message of messages) {
    flushBefore(Date.parse(message.created_at))
    entries.push({ kind: "message", key: `message:${message.id}`, message })
  }
  flushBefore(Number.POSITIVE_INFINITY)
  return entries
}
