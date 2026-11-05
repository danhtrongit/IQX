/**
 * Giao thức WebSocket của phòng Flashback: `/api/v2/flashback/ws`, JSON, một socket một phòng.
 *
 * `roomId` trên dây là MÃ PHÒNG 6 chữ số (`FlashbackRoom.id`), giống `rooms/:code` của HTTP.
 * `userId` là id người dùng (uuid). Backend: `backend/src/modules/flashback/flashback-media.hub.ts`.
 *
 * Luồng: kết nối xong gửi `auth`; server trả `ready` (hoặc đóng với mã 4401); gửi `room:join`; server
 * trả `room:state`. Ảnh chỉ nằm trong bộ nhớ server và trình duyệt, không lưu ở đâu.
 */

export const ROOM_SOCKET_PATH = "/flashback/ws"

/** Mã đóng socket do server đặt. */
export const CLOSE_AUTH = 4401
/** Bị mời ra hoặc đã rời phòng. */
export const CLOSE_LEFT_ROOM = 4403
/** Phòng giải tán hoặc kết thúc. */
export const CLOSE_ROOM_CLOSED = 4410

export type MediaState = { audio: boolean; video: boolean; screen: boolean }

export type IceServer = { urls: string | string[]; username?: string; credential?: string }

export type ImageMime = "image/webp" | "image/jpeg" | "image/png"

/** Một người đang ở trong cuộc gọi của phòng. */
export type CallPeer = { userId: string; name: string; media: MediaState }

/** Mã lỗi server có thể trả trong `error`. */
export type RoomSocketErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "BAD_MESSAGE"
  | "NOT_JOINED"
  | "ALREADY_JOINED"
  | "NOT_IN_ROOM"
  | "ROOM_NOT_FOUND"
  | "CHAT_DISABLED"
  | "IMAGE_INVALID"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_TOO_FAST"
  | "IMAGE_RATE_LIMIT"
  | "NOT_IN_CALL"
  | "PEER_NOT_IN_CALL"
  | "RATE_LIMIT"
  | "INTERNAL"

// ------------------------------------------------------------------ client gửi

export type AuthMessage = { type: "auth"; token: string }
export type RoomJoinMessage = { type: "room:join"; roomId: string }
export type ImageSendMessage = {
  type: "image:send"
  roomId: string
  /** Id do client sinh để nhận lại kết quả (ảnh đã gửi hoặc lỗi). */
  clientId: string
  mime: ImageMime
  /** Base64, không có tiền tố `data:`. */
  data: string
  width: number
  height: number
}
export type CallJoinMessage = { type: "call:join"; roomId: string; media: MediaState }
export type CallLeaveMessage = { type: "call:leave"; roomId: string }
export type CallMediaMessage = { type: "call:media"; roomId: string; media: MediaState }
export type RtcSignalSend = { type: "rtc:signal"; roomId: string; to: string; data: unknown }
/** Giữ kết nối sống và phát hiện kết nối chết; server trả `pong`. */
export type PingMessage = { type: "ping" }

export type ClientMessage =
  | AuthMessage
  | RoomJoinMessage
  | ImageSendMessage
  | CallJoinMessage
  | CallLeaveMessage
  | CallMediaMessage
  | RtcSignalSend
  | PingMessage

// ------------------------------------------------------------------ server gửi

export type ReadyMessage = { type: "ready"; userId: string }

/** Ảnh server đã nhận và giao. `clientId` chỉ có ở bản trả cho người gửi, còn lại là null. */
export type RoomImage = {
  id: string
  clientId: string | null
  roomId: string
  userId: string
  name: string
  mime: ImageMime
  data: string
  width: number
  height: number
  /** ISO 8601. */
  sentAt: string
}

export type RoomStateMessage = {
  type: "room:state"
  roomId: string
  /** Chỉ những ảnh đã tới lượt mình (quy tắc phiên), không có ảnh của người mình đã tắt tiếng. */
  images: RoomImage[]
  call: CallPeer[]
  iceServers: IceServer[]
}

export type ImageMessage = { type: "image" } & RoomImage

export type ErrorMessage = {
  type: "error"
  /** Có khi lỗi là của một `image:send`. */
  clientId?: string
  code: RoomSocketErrorCode | (string & {})
  message: string
}

/** Trả riêng cho người vừa `call:join`: danh sách người đang trong cuộc gọi (không gồm mình). */
export type CallJoinedMessage = { type: "call:joined"; roomId: string; peers: CallPeer[] }
export type CallPeerJoinedMessage = { type: "call:peer-joined"; userId: string; name: string; media: MediaState }
export type CallPeerLeftMessage = { type: "call:peer-left"; userId: string }
export type CallMediaEvent = { type: "call:media"; userId: string; media: MediaState }
export type RtcSignalReceive = { type: "rtc:signal"; from: string; data: unknown }
export type RoomClosedMessage = { type: "room:closed"; roomId: string }
export type PongMessage = { type: "pong" }

export type ServerMessage =
  | ReadyMessage
  | RoomStateMessage
  | ImageMessage
  | ErrorMessage
  | CallJoinedMessage
  | CallPeerJoinedMessage
  | CallPeerLeftMessage
  | CallMediaEvent
  | RtcSignalReceive
  | RoomClosedMessage
  | PongMessage

export type ServerMessageType = ServerMessage["type"]
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>

/** Thông điệp từ server có đúng dạng tối thiểu (là object có `type` chuỗi) không. */
export function isServerMessage(value: unknown): value is ServerMessage {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"
}

export const NO_MEDIA: MediaState = { audio: false, video: false, screen: false }
