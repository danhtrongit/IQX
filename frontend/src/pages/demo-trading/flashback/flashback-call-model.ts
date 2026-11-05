/**
 * Mô hình gọi nhóm trong phòng Flashback: kiểu thông điệp tín hiệu, hằng số giới hạn, ràng buộc thiết bị và các câu
 * thông báo tiếng Việt. Không có React ở đây để máy trạng thái cuộc gọi (`flashback-call-engine.ts`) chạy được trong test.
 */

/** Ai đang bật gì trong cuộc gọi. `audio` là micrô đang mở (không phải đang tắt tiếng). */
export type CallMedia = { audio: boolean; video: boolean; screen: boolean }

export const NO_MEDIA: CallMedia = { audio: false, video: false, screen: false }

/** Một người trong cuộc gọi của phòng, đúng như server báo trong `room:state.call`. */
export type CallParticipant = { userId: string; name: string; media: CallMedia }

/** Tối đa 6 người bật camera cùng lúc; người thứ 7 thấy thông báo. Thoại thì cả phòng (tới 30) đều vào được. */
export const MAX_CALL_VIDEOS = 6
/** Một người chia sẻ màn hình một lúc trong cả phòng. */
export const MAX_CALL_SCREENS = 1

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }]

/** Mất socket quá ngần này thì rời cuộc gọi (đóng mọi kết nối, tắt mọi track). */
export const SOCKET_LOST_LEAVE_MS = 20_000
/** ICE ở trạng thái `disconnected` quá ngần này thì thử ICE restart. */
export const ICE_DISCONNECT_GRACE_MS = 4_000
/** Số lần ICE restart liên tiếp trước khi báo "Mất kết nối" với một người. */
export const MAX_ICE_RESTARTS = 3
/** Thời gian giữ tín hiệu của người chưa có trong danh sách phòng gọi (tín hiệu tới trước `peer-joined`). */
export const PENDING_SIGNAL_MS = 8_000

/** Chu kỳ đo mức âm và độ trễ giữ trạng thái "đang nói" để chỉ báo không nhấp nháy. */
export const SPEAKING_POLL_MS = 120
export const SPEAKING_HOLD_MS = 450
/** Mức RMS (0 đến 1) coi là đang nói. */
export const SPEAKING_THRESHOLD = 0.03

/** Ba kênh cố định của mỗi kết nối: thứ tự m-line là thứ tự này ở cả hai phía. */
export const CALL_SLOTS = ["audio", "camera", "screen"] as const
export type CallSlot = (typeof CALL_SLOTS)[number]

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

/** Camera 640x360, 15 khung hình/giây. */
export const CAMERA_LIMIT = { width: 640, height: 360, frameRate: 15, maxBitrate: 450_000 }
export const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: CAMERA_LIMIT.width },
  height: { ideal: CAMERA_LIMIT.height },
  frameRate: { ideal: CAMERA_LIMIT.frameRate, max: CAMERA_LIMIT.frameRate },
  facingMode: "user",
}

/** Màn hình: cạnh dài tối đa 1280 px, 10 khung hình/giây. */
export const SCREEN_LIMIT = { longEdge: 1280, frameRate: 10, maxBitrate: 900_000 }
export const SCREEN_CONSTRAINTS: DisplayMediaStreamOptions = {
  video: {
    width: { max: SCREEN_LIMIT.longEdge },
    height: { max: SCREEN_LIMIT.longEdge },
    frameRate: { ideal: SCREEN_LIMIT.frameRate, max: SCREEN_LIMIT.frameRate },
  },
  audio: false,
}

/** Dữ liệu của `rtc:signal`: mô tả phiên (offer/answer) hoặc một ICE candidate. */
export type RtcSignalData =
  | { description: { type: "offer" | "answer"; sdp: string } }
  | { candidate: RTCIceCandidateInit }

export type CallClientMessage =
  | { type: "call:join"; roomId: string; media: CallMedia }
  | { type: "call:leave"; roomId: string }
  | { type: "call:media"; roomId: string; media: CallMedia }
  | { type: "rtc:signal"; roomId: string; to: string; data: RtcSignalData }

export type CallNoticeLevel = "info" | "warning" | "error"

export const CALL_TEXT = {
  videoFull: `Đã đủ ${MAX_CALL_VIDEOS} người bật camera. Đợi một người tắt rồi thử lại.`,
  screenTaken: (name: string) => `${name} đang chia sẻ màn hình. Đợi bạn ấy dừng rồi chia sẻ.`,
  screenCancelled: "Bạn chưa chọn màn hình để chia sẻ.",
  screenWarning: "Màn hình bạn chia sẻ có thể làm lộ thông tin với người chơi khác trong ván.",
  unsupported: "Trình duyệt này chưa hỗ trợ gọi nhóm hoặc trang chưa chạy trên HTTPS.",
  notConnected: "Chưa kết nối tới phòng. Thử lại sau vài giây.",
  socketLost: "Mất kết nối tới phòng quá lâu, cuộc gọi đã dừng.",
  listenOnly: "Bạn vẫn nghe được mọi người.",
} as const

export type MediaDevice = "mic" | "camera" | "screen"

const DEVICE_NAME: Record<MediaDevice, string> = { mic: "micrô", camera: "camera", screen: "màn hình" }

/** Lỗi `getUserMedia` / `getDisplayMedia` thành một câu tiếng Việt rõ ràng. */
export function describeMediaError(error: unknown, device: MediaDevice): { level: CallNoticeLevel; text: string } {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : ""
  const label = DEVICE_NAME[device]
  if (device === "screen" && (name === "NotAllowedError" || name === "AbortError")) {
    return { level: "info", text: CALL_TEXT.screenCancelled }
  }
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return {
      level: "error",
      text: `Chưa có quyền dùng ${label}. Cho phép ${label} ở biểu tượng ổ khoá cạnh thanh địa chỉ rồi thử lại.`,
    }
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return { level: "error", text: `Không tìm thấy ${label} trên thiết bị này.` }
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return { level: "error", text: `${label[0].toUpperCase()}${label.slice(1)} đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.` }
  }
  if (name === "TypeError" || name === "NotSupportedError") return { level: "error", text: CALL_TEXT.unsupported }
  return { level: "error", text: `Chưa bật được ${label}. Thử lại sau.` }
}

/** Người đứng sau trong so sánh userId là bên lịch sự (chịu rollback khi hai bên cùng gửi offer). */
export function isPolite(selfId: string, otherId: string): boolean {
  return selfId > otherId
}

/** Mọi thứ server gửi trong `call` có thể thiếu trường: ép về dạng chắc chắn. */
export function normalizeMedia(value: unknown): CallMedia {
  const media = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof CallMedia, unknown>>
  return { audio: media.audio === true, video: media.video === true, screen: media.screen === true }
}

export function normalizeParticipant(value: unknown): CallParticipant | null {
  if (typeof value !== "object" || value === null) return null
  const item = value as { userId?: unknown; name?: unknown; media?: unknown }
  if (typeof item.userId !== "string" || !item.userId) return null
  return {
    userId: item.userId,
    name: typeof item.name === "string" && item.name ? item.name : "Người chơi",
    media: normalizeMedia(item.media),
  }
}
