/**
 * Ảnh trong chat phòng Flashback: nhận qua WebSocket của phòng, gửi ảnh đã nén, giữ trong bộ nhớ trình
 * duyệt (object URL) và thu hồi khi rời phòng. Server áp quy tắc phiên, tắt tiếng và `chat_enabled`
 * như tin chữ nên ở đây chỉ hiện đúng những ảnh server giao.
 *
 * Trạng thái nằm trong `ChatImageStore` (một đối tượng thường, có subscribe) để việc tạo và thu hồi
 * object URL không phụ thuộc vào vòng render của React.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import {
  base64ToBlob,
  blobToBase64,
  ChatImageError,
  compressImage,
  IMAGE_COOLDOWN_MS,
  IMAGE_TOO_FAST,
  type ChatImageItem,
} from "./chat-image"
import type { ImageMessage, RoomImage, RoomStateMessage } from "./room-socket-protocol"
import { useFlashbackRoomSocket } from "./use-flashback-room-socket"

/** Số ảnh giữ trong bộ nhớ (khớp server). */
export const MAX_IMAGES = 50
/** Quá hạn này mà server chưa trả ảnh hay lỗi thì coi là gửi hỏng. */
export const SEND_TIMEOUT_MS = 20_000

export const IMAGE_OFFLINE = "Chưa kết nối được phòng. Thử lại sau giây lát."
export const IMAGE_SEND_FAILED = "Chưa gửi được ảnh. Thử lại."

export type ChatImagesApi = {
  images: ChatImageItem[]
  /** Kết nối phòng đã sẵn sàng, gửi ảnh được. */
  imagesReady: boolean
  /** Đang nén ảnh. */
  imageBusy: boolean
  sendImage: (file: Blob) => Promise<boolean>
  /** Bỏ một ảnh gửi hỏng khỏi luồng chat. */
  dismissImage: (id: string) => void
  /** Số ảnh mới của người khác khi khung chat đang đóng. */
  imageUnread: number
}

const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

type StoreSnapshot = { readonly items: readonly ChatImageItem[]; readonly unread: number; readonly busy: boolean }

/** Ảnh của một phòng trong bộ nhớ trình duyệt. */
export class ChatImageStore {
  private items: ChatImageItem[] = []
  private urls = new Set<string>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private unread = 0
  private busy = false
  private watching = true
  private userId = ""
  private mutedIds: ReadonlySet<string> = new Set()
  private snapshot: StoreSnapshot = { items: [], unread: 0, busy: false }
  private readonly listeners = new Set<() => void>()
  private lastSentAt = 0

  /** Còn trong 2 giây kể từ ảnh trước thì true; ngược lại ghi nhận lần gửi này và trả false. */
  tooFast(): boolean {
    if (Date.now() - this.lastSentAt < IMAGE_COOLDOWN_MS) return true
    this.lastSentAt = Date.now()
    return false
  }

  /** Ảnh không đi được thì không tính vào giới hạn 2 giây. */
  releaseCooldown(): void {
    this.lastSentAt = 0
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): StoreSnapshot => this.snapshot

  private commit(): void {
    this.snapshot = { items: this.items, unread: this.unread, busy: this.busy }
    for (const listener of [...this.listeners]) listener()
  }

  setContext(userId: string, mutedIds: ReadonlySet<string>): void {
    this.userId = userId
    this.mutedIds = mutedIds
  }

  setWatching(watching: boolean): void {
    this.watching = watching
    if (watching && this.unread !== 0) {
      this.unread = 0
      this.commit()
    }
  }

  setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.commit()
  }

  private url(blobOrImage: RoomImage | Blob): string {
    const blob = blobOrImage instanceof Blob ? blobOrImage : base64ToBlob(blobOrImage.data, blobOrImage.mime)
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  private revoke(url: string): void {
    if (this.urls.delete(url)) URL.revokeObjectURL(url)
  }

  private fromServer(image: RoomImage, existing?: ChatImageItem): ChatImageItem {
    return {
      id: image.id,
      clientId: image.clientId,
      userId: image.userId,
      name: image.name,
      isMe: image.userId === this.userId,
      url: existing?.url ?? this.url(image),
      width: image.width,
      height: image.height,
      sentAt: image.sentAt,
      status: "sent",
    }
  }

  /** Giữ tối đa MAX_IMAGES ảnh đã gửi, bỏ ảnh cũ nhất và thu hồi URL của nó. */
  private trim(): void {
    const sent = this.items.filter((item) => item.status === "sent")
    if (sent.length <= MAX_IMAGES) return
    const drop = new Set(sent.slice(0, sent.length - MAX_IMAGES).map((item) => item.id))
    for (const item of this.items) if (drop.has(item.id)) this.revoke(item.url)
    this.items = this.items.filter((item) => !drop.has(item.id))
  }

  /** Vào phòng xong (kể cả sau khi kết nối lại): dựng lại danh sách từ `room:state`, giữ ảnh đang gửi. */
  applyRoomState(state: RoomStateMessage): void {
    const known = new Map(this.items.filter((item) => item.status === "sent").map((item) => [item.id, item]))
    const next = state.images.map((image) => this.fromServer(image, known.get(image.id)))
    const keep = new Set(next.map((item) => item.id))
    for (const item of this.items) if (item.status === "sent" && !keep.has(item.id)) this.revoke(item.url)
    this.items = [...next, ...this.items.filter((item) => item.status !== "sent")]
    this.trim()
    this.commit()
  }

  /** Ảnh mới: của mình (có clientId, thay dòng "đang gửi") hoặc của người khác. */
  onImage(message: ImageMessage): void {
    const { type: _type, ...image } = message
    void _type
    this.clearTimer(image.clientId)
    const mine = image.userId === this.userId
    if (!mine && this.mutedIds.has(image.userId)) return
    if (this.items.some((item) => item.id === image.id)) return
    const pending = image.clientId ? this.items.find((item) => item.clientId === image.clientId && item.status !== "sent") : undefined
    if (pending) this.items = this.items.map((item) => (item === pending ? this.fromServer(image, pending) : item))
    else this.items = [...this.items, this.fromServer(image)]
    this.trim()
    if (!mine && !this.watching) this.unread += 1
    this.commit()
  }

  addLocal(item: ChatImageItem, blob: Blob): ChatImageItem {
    const local = { ...item, url: this.url(blob) }
    this.items = [...this.items, local]
    this.commit()
    return local
  }

  startTimer(clientId: string): void {
    this.timers.set(
      clientId,
      setTimeout(() => this.fail(clientId, IMAGE_SEND_FAILED), SEND_TIMEOUT_MS),
    )
  }

  private clearTimer(clientId: string | null): void {
    if (!clientId) return
    const timer = this.timers.get(clientId)
    if (timer) clearTimeout(timer)
    this.timers.delete(clientId)
  }

  /** Dòng ảnh đang gửi chuyển sang lỗi với lý do (của server hoặc của máy). */
  fail(clientId: string, error: string): void {
    this.clearTimer(clientId)
    let changed = false
    this.items = this.items.map((item) => {
      if (item.clientId !== clientId || item.status !== "sending") return item
      changed = true
      return { ...item, status: "failed", error }
    })
    if (changed) this.commit()
  }

  dismiss(id: string): void {
    const target = this.items.find((item) => item.id === id)
    if (!target) return
    this.clearTimer(target.clientId)
    this.revoke(target.url)
    this.items = this.items.filter((item) => item.id !== id)
    this.commit()
  }

  /** Giải phóng mọi ảnh, URL và đồng hồ chờ (rời phòng, đổi phòng, phòng đóng). */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
    this.items = []
    this.unread = 0
    this.commit()
  }
}

export function useChatImages({
  roomCode,
  enabled,
  userId,
  mutedIds,
  watching,
}: {
  roomCode: string | null
  /** Phòng có bật chat và đã đăng nhập. */
  enabled: boolean
  userId: string
  /** Người mình đã tắt tiếng: ảnh đã nhận của họ cũng được ẩn ngay. */
  mutedIds: ReadonlySet<string>
  /** Khung chat đang hiện nên ảnh mới coi như đã đọc. */
  watching: boolean
}): ChatImagesApi {
  const { subscribe, send, ready, roomState } = useFlashbackRoomSocket(roomCode, enabled && !!userId)
  const [store] = useState(() => new ChatImageStore())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    store.setContext(userId, mutedIds)
    store.setWatching(watching)
  }, [store, userId, mutedIds, watching])

  // Đọc từ snapshot nên nơi dùng mount sau khi phòng đã vào xong vẫn nhận được danh sách.
  useEffect(() => {
    if (roomState) store.applyRoomState(roomState)
  }, [store, roomState])

  useEffect(() => subscribe("image", (message) => store.onImage(message)), [store, subscribe])

  // Server từ chối ảnh: dòng "đang gửi" chuyển sang lỗi với đúng lý do server nêu.
  useEffect(
    () =>
      subscribe("error", (message) => {
        if (message.clientId) store.fail(message.clientId, message.message)
      }),
    [store, subscribe],
  )

  // Phòng đóng: bỏ hết ảnh trong bộ nhớ.
  useEffect(() => subscribe("room:closed", () => store.clear()), [store, subscribe])

  // Rời phòng, đổi phòng hoặc gỡ màn: giải phóng mọi ảnh, URL và đồng hồ chờ.
  useEffect(() => () => store.clear(), [store, roomCode])

  const sendImage = useCallback(
    async (file: Blob): Promise<boolean> => {
      if (!roomCode) return false
      if (!ready) {
        toast.error(IMAGE_OFFLINE)
        return false
      }
      if (store.tooFast()) {
        toast.info(IMAGE_TOO_FAST)
        return false
      }
      store.setBusy(true)
      try {
        const compressed = await compressImage(file)
        const data = await blobToBase64(compressed.blob)
        const clientId = newId()
        store.addLocal(
          {
            id: clientId,
            clientId,
            userId,
            name: "",
            isMe: true,
            url: "",
            width: compressed.width,
            height: compressed.height,
            sentAt: new Date().toISOString(),
            status: "sending",
          },
          compressed.blob,
        )
        const sent = send({
          type: "image:send",
          roomId: roomCode,
          clientId,
          mime: compressed.mime,
          data,
          width: compressed.width,
          height: compressed.height,
        })
        if (!sent) {
          store.fail(clientId, IMAGE_OFFLINE)
          return false
        }
        store.startTimer(clientId)
        return true
      } catch (error) {
        store.releaseCooldown()
        toast.error(error instanceof ChatImageError ? error.message : IMAGE_SEND_FAILED)
        return false
      } finally {
        store.setBusy(false)
      }
    },
    [roomCode, ready, send, store, userId],
  )

  const dismissImage = useCallback((id: string) => store.dismiss(id), [store])

  const images = useMemo(
    () => snapshot.items.filter((item) => item.isMe || !mutedIds.has(item.userId)),
    [snapshot.items, mutedIds],
  )

  return { images, imagesReady: ready, imageBusy: snapshot.busy, sendImage, dismissImage, imageUnread: snapshot.unread }
}
