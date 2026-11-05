/**
 * Nối máy trạng thái gọi nhóm (`flashback-call-engine.ts`) với socket phòng và với React. Một bộ gọi cho mỗi phòng, nằm ở
 * bộ điều khiển chung nên cuộc gọi sống tiếp từ phòng chờ sang trong ván. Rời phòng, đóng phòng hoặc unmount thì dừng mọi
 * track và đóng mọi kết nối.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { CallEngine, browserCallDeps, type CallSnapshot } from "./flashback-call-engine"
import type { CallNoticeLevel } from "./flashback-call-model"
import { useFlashbackRoomSocket } from "./use-flashback-room-socket"

export type CallApi = CallSnapshot & {
  join: () => void
  leave: () => void
  toggleMic: () => void
  toggleCamera: () => void
  toggleScreen: () => void
  setPeerMuted: (userId: string, muted: boolean) => void
  /** Dải cuộc gọi đang mở rộng (giữ qua các màn để chuyển từ phòng chờ sang ván vẫn như cũ). */
  expanded: boolean
  setExpanded: (expanded: boolean) => void
}

/** Loại thông điệp server mà bộ gọi nghe. */
const CALL_MESSAGE_TYPES = [
  "room:state",
  "call:joined",
  "call:peer-joined",
  "call:peer-left",
  "call:media",
  "rtc:signal",
  "room:closed",
] as const

const INITIAL_NAME = "Bạn"

/** Đường gửi chưa gắn vào socket: tới khi effect gắn xong thì chưa gửi được. */
const NOT_BOUND = () => false

const NOTIFY: Record<CallNoticeLevel, (text: string) => void> = {
  info: (text) => void toast.info(text),
  warning: (text) => void toast.warning(text),
  error: (text) => void toast.error(text),
}

export function useFlashbackCall({
  roomId,
  userId,
  userName,
}: {
  /** Mã phòng; null khi chưa ở phòng nào. */
  roomId: string | null
  userId: string
  userName: string
}): CallApi {
  // Một kết nối WebSocket cho mỗi phòng, dùng chung với chat ảnh (`acquireRoomSocket`).
  const socket = useFlashbackRoomSocket(roomId)
  const socketRef = useRef(socket)
  useEffect(() => {
    socketRef.current = socket
  })

  const engine = useMemo(
    () =>
      roomId && userId
        ? new CallEngine({
            ...browserCallDeps(),
            roomId,
            selfId: userId,
            selfName: INITIAL_NAME,
            send: NOT_BOUND,
            notify: (level, text) => NOTIFY[level](text),
          })
        : null,
    [roomId, userId],
  )
  useEffect(() => {
    engine?.setSelfName(userName)
  }, [engine, userName])

  const subscribeSocket = socket.subscribe
  const sendSocket = socket.send
  useEffect(() => {
    engine?.bindSend(sendSocket)
  }, [engine, sendSocket])

  useEffect(() => {
    if (!engine) return
    engine.activate()
    const unsubscribers = CALL_MESSAGE_TYPES.map((type) =>
      subscribeSocket(type, (message) => engine.handle(message)),
    )
    // `room:state` có thể đã tới trước khi bộ gọi nghe (kết nối dùng chung với chat): nạp lại trạng thái mới nhất một lần.
    const known = socketRef.current.roomState
    if (known) engine.handle(known)
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
      engine.dispose()
    }
  }, [engine, subscribeSocket])

  // Mất socket quá lâu thì rời cuộc gọi; socket dừng hẳn (bị mời ra, phòng đóng) thì dọn ngay.
  const connected = socket.ready
  const stopped = socket.status === "closed"
  useEffect(() => {
    if (!engine) return
    if (stopped) engine.handle({ type: "room:closed" })
    else if (connected) engine.socketRestored()
    else engine.socketLost()
  }, [engine, connected, stopped])

  const snapshot = useSyncExternalStore(
    engine ? engine.subscribe : NO_SUBSCRIBE,
    engine ? engine.getSnapshot : NO_SNAPSHOT,
  )

  const [expanded, setExpanded] = useState(false)

  const join = useCallback(() => void engine?.join(), [engine])
  const leave = useCallback(() => engine?.leave(), [engine])
  const toggleMic = useCallback(() => void engine?.toggleMic(), [engine])
  const toggleCamera = useCallback(() => void engine?.toggleCamera(), [engine])
  const toggleScreen = useCallback(() => void engine?.toggleScreen(), [engine])
  const setPeerMuted = useCallback((id: string, muted: boolean) => engine?.setPeerMuted(id, muted), [engine])

  return {
    ...snapshot,
    // Trình duyệt không có WebRTC thì không có thanh cuộc gọi.
    supported: snapshot.supported && typeof RTCPeerConnection !== "undefined",
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleScreen,
    setPeerMuted,
    expanded,
    setExpanded,
  }
}

const IDLE_SNAPSHOT: CallSnapshot = {
  supported: false,
  status: "idle",
  people: [],
  count: 0,
  videoCount: 0,
  screenSharerId: null,
  canShare: false,
  busy: { mic: false, camera: false, screen: false },
}
const NO_SUBSCRIBE = () => () => undefined
const NO_SNAPSHOT = () => IDLE_SNAPSHOT
