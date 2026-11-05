/**
 * Máy trạng thái gọi nhóm WebRTC của phòng Flashback (lưới ngang hàng, không ghi âm, không ghi hình, không lưu gì).
 *
 * - Mỗi người trong cuộc gọi có một RTCPeerConnection tới mọi người khác. Mỗi kết nối có ba kênh cố định theo thứ tự
 *   thoại, camera, màn hình (ba m-line sendrecv). Bật tắt camera hay màn hình chỉ là `replaceTrack` vào kênh có sẵn, nên
 *   không cần đàm phán lại SDP và bên nhận biết chắc track nào là camera, track nào là màn hình theo vị trí m-line.
 * - "Perfect negotiation": bên lịch sự (userId lớn hơn) không tạo kênh trước mà chờ offer đầu tiên của bên kia, nên hai bên
 *   không bao giờ va nhau ở offer đầu. Offer về sau (ICE restart, `negotiationneeded`) từ cả hai bên đều qua cùng một bộ
 *   xử lý va chạm: bên không lịch sự bỏ qua offer đang va, bên lịch sự rollback rồi trả lời.
 * - ICE restart khi `failed` hoặc `disconnected` quá lâu; quá số lần cho phép thì báo "Mất kết nối" với người đó.
 * - Mọi đường ra (Rời, `room:closed`, mất socket quá lâu, unmount) đều dừng mọi track và đóng mọi kết nối.
 *
 * Không có React ở đây: hook `use-flashback-call.ts` nối máy này với socket phòng, test thay RTCPeerConnection và
 * getUserMedia bằng bản giả.
 */
import {
  AUDIO_CONSTRAINTS,
  CALL_SLOTS,
  CALL_TEXT,
  CAMERA_CONSTRAINTS,
  CAMERA_LIMIT,
  DEFAULT_ICE_SERVERS,
  ICE_DISCONNECT_GRACE_MS,
  MAX_CALL_SCREENS,
  MAX_CALL_VIDEOS,
  MAX_ICE_RESTARTS,
  NO_MEDIA,
  PENDING_SIGNAL_MS,
  SCREEN_CONSTRAINTS,
  SCREEN_LIMIT,
  SOCKET_LOST_LEAVE_MS,
  SPEAKING_HOLD_MS,
  SPEAKING_POLL_MS,
  SPEAKING_THRESHOLD,
  describeMediaError,
  isPolite,
  normalizeMedia,
  normalizeParticipant,
  type CallClientMessage,
  type CallMedia,
  type CallNoticeLevel,
  type CallParticipant,
  type CallSlot,
  type MediaDevice,
  type RtcSignalData,
} from "./flashback-call-model"

export type CallConnection = "self" | "connecting" | "connected" | "failed"
export type CallStatus = "idle" | "joining" | "joined"

/** Một người trong cuộc gọi, kèm luồng để gắn vào thẻ video và phần tử audio. */
export type CallPersonView = {
  userId: string
  name: string
  me: boolean
  media: CallMedia
  speaking: boolean
  /** Phía mình đã tắt tiếng người này. */
  muted: boolean
  connection: CallConnection
  audio: MediaStream | null
  camera: MediaStream | null
  screen: MediaStream | null
}

export type CallSnapshot = {
  /** Server có gửi `call` trong `room:state`: chưa có thì không hiện thanh cuộc gọi. */
  supported: boolean
  status: CallStatus
  /** Những người trong cuộc gọi: mình đứng đầu khi đã vào. */
  people: CallPersonView[]
  /** Số người trong cuộc gọi (kể cả mình khi đã vào). */
  count: number
  videoCount: number
  /** Người đang chia sẻ màn hình (kể cả mình). */
  screenSharerId: string | null
  /** Trình duyệt có `getDisplayMedia` (điện thoại thường không có). */
  canShare: boolean
  /** Đang chờ trình duyệt hỏi quyền hoặc mở thiết bị. */
  busy: { mic: boolean; camera: boolean; screen: boolean }
}

export type CallDeps = {
  roomId: string
  selfId: string
  selfName: string
  send: (message: CallClientMessage) => boolean | void
  notify: (level: CallNoticeLevel, text: string) => void
  createPeerConnection: (config: RTCConfiguration) => RTCPeerConnection
  createStream: (tracks: MediaStreamTrack[]) => MediaStream
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  getDisplayMedia?: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>
  createAudioContext?: () => AudioContext | null
}

/** Đối tượng trình duyệt thật cho `CallDeps` (đọc lúc gọi để test có thể thay). */
export function browserCallDeps(): Pick<
  CallDeps,
  "createPeerConnection" | "createStream" | "getUserMedia" | "getDisplayMedia" | "createAudioContext"
> {
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices
  return {
    createPeerConnection: (config) => new RTCPeerConnection(config),
    createStream: (tracks) => new MediaStream(tracks),
    getUserMedia: devices?.getUserMedia ? (constraints) => devices.getUserMedia(constraints) : undefined,
    getDisplayMedia: devices?.getDisplayMedia ? (constraints) => devices.getDisplayMedia(constraints) : undefined,
    createAudioContext: () => {
      const Context =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      return Context ? new Context() : null
    },
  }
}

type Streams = Record<CallSlot, MediaStream | null>

type Peer = {
  id: string
  pc: RTCPeerConnection
  polite: boolean
  slots: RTCRtpTransceiver[]
  makingOffer: boolean
  ignoreOffer: boolean
  restartPending: boolean
  restarts: number
  queue: Promise<void>
  streams: Streams
  connection: "connecting" | "connected" | "failed"
  disconnectTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
  /** Dựng vì tín hiệu của người kia tới trước `peer-joined`. */
  fromSignal: boolean
  born: number
}

type Meter = { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; buffer: Uint8Array<ArrayBuffer>; until: number }

type Pending = { at: number; items: RtcSignalData[] }

type LocalState = {
  audio: MediaStream | null
  camera: MediaStream | null
  screen: MediaStream | null
  media: CallMedia
  cameraSince: number
  screenSince: number
}

const emptyLocal = (): LocalState => ({ audio: null, camera: null, screen: null, media: { ...NO_MEDIA }, cameraSince: 0, screenSince: 0 })

/** Trong ngần này sau khi mình bật camera hoặc màn hình, một xung đột với người khác được coi là cùng lúc. */
const CONFLICT_WINDOW_MS = 3_000

const NO_STREAMS = (): Streams => ({ audio: null, camera: null, screen: null })
const noop = () => undefined

export class CallEngine {
  private deps: CallDeps
  private listeners = new Set<() => void>()
  private snapshot: CallSnapshot

  private roster = new Map<string, CallParticipant>()
  private supported = false
  private status: CallStatus = "idle"
  private epoch = 0
  private disposed = false
  private iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS

  private local: LocalState = emptyLocal()
  private busy = { mic: false, camera: false, screen: false }

  private peers = new Map<string, Peer>()
  private pending = new Map<string, Pending>()
  private mutedPeers = new Set<string>()
  private speaking = new Set<string>()

  private audioContext: AudioContext | null = null
  private meters = new Map<string, Meter>()
  private meterTimer: ReturnType<typeof setInterval> | null = null

  private socketTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: CallDeps) {
    this.deps = deps
    this.snapshot = this.build()
  }

  // ------------------------------------------------------------------ trạng thái cho giao diện

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CallSnapshot => this.snapshot

  /** Đổi tên hiển thị của mình (hồ sơ đổi tên giữa chừng thì cuộc gọi không bị dựng lại). */
  setSelfName(name: string) {
    if (this.deps.selfName === name) return
    this.deps = { ...this.deps, selfName: name }
    this.publish()
  }

  /** Đổi đường gửi (socket phòng đổi sau mỗi lần nối lại). */
  bindSend(send: CallDeps["send"]) {
    this.deps = { ...this.deps, send }
  }

  private publish() {
    if (this.disposed) return
    this.snapshot = this.build()
    for (const listener of [...this.listeners]) listener()
  }

  private build(): CallSnapshot {
    const joined = this.status === "joined"
    const people: CallPersonView[] = []
    if (joined) {
      people.push({
        userId: this.deps.selfId,
        name: this.deps.selfName,
        me: true,
        media: { ...this.local.media },
        speaking: this.speaking.has(this.deps.selfId),
        muted: false,
        connection: "self",
        audio: null,
        camera: this.local.camera,
        screen: this.local.screen,
      })
    }
    for (const person of this.roster.values()) {
      const peer = this.peers.get(person.userId)
      people.push({
        userId: person.userId,
        name: person.name,
        me: false,
        media: person.media,
        speaking: this.speaking.has(person.userId),
        muted: this.mutedPeers.has(person.userId),
        connection: peer ? peer.connection : "connecting",
        audio: peer?.streams.audio ?? null,
        camera: peer?.streams.camera ?? null,
        screen: peer?.streams.screen ?? null,
      })
    }
    return {
      supported: this.supported,
      status: this.status,
      people,
      count: people.length,
      videoCount: people.filter((person) => person.media.video).length,
      screenSharerId: people.find((person) => person.media.screen)?.userId ?? null,
      canShare: typeof this.deps.getDisplayMedia === "function",
      busy: { ...this.busy },
    }
  }

  // ------------------------------------------------------------------ thông điệp từ server

  handle(message: { type?: unknown; [key: string]: unknown }) {
    if (this.disposed) return
    switch (message.type) {
      case "room:state":
        this.onRoomState(message)
        return
      case "call:joined": {
        // Trả lời `call:join` của mình: danh sách người đang gọi (không gồm mình), dựng kết nối tới từng người.
        if (this.status !== "joined" || !Array.isArray(message.peers)) return
        this.roster = new Map(
          message.peers
            .map(normalizeParticipant)
            .filter((item): item is CallParticipant => item !== null && item.userId !== this.deps.selfId)
            .map((person) => [person.userId, person]),
        )
        for (const id of [...this.peers.keys()]) if (!this.roster.has(id)) this.closePeer(id)
        this.syncPeers()
        this.enforceLimits()
        this.publish()
        return
      }
      case "call:peer-joined": {
        const person = normalizeParticipant(message)
        if (!person || person.userId === this.deps.selfId) return
        this.supported = true
        this.roster.set(person.userId, person)
        if (this.status === "joined") {
          // Tín hiệu của người này có thể tới trước `peer-joined`: kết nối dựng từ tín hiệu đó còn mới thì giữ lại.
          const existing = this.peers.get(person.userId)
          if (!existing || !existing.fromSignal || Date.now() - existing.born > PENDING_SIGNAL_MS) this.openPeer(person.userId)
          this.enforceLimits()
        }
        this.publish()
        return
      }
      case "call:peer-left": {
        const userId = typeof message.userId === "string" ? message.userId : ""
        if (!userId || userId === this.deps.selfId) return
        this.roster.delete(userId)
        this.pending.delete(userId)
        this.closePeer(userId)
        this.speaking.delete(userId)
        this.publish()
        return
      }
      case "call:media": {
        const userId = typeof message.userId === "string" ? message.userId : ""
        if (!userId || userId === this.deps.selfId) return
        const known = this.roster.get(userId)
        if (known) this.roster.set(userId, { ...known, media: normalizeMedia(message.media) })
        this.enforceLimits()
        this.publish()
        return
      }
      case "rtc:signal": {
        const from = typeof message.from === "string" ? message.from : ""
        if (from && from !== this.deps.selfId) this.onSignal(from, message.data)
        return
      }
      case "room:closed":
        this.roster.clear()
        this.pending.clear()
        this.teardown()
        return
      default:
    }
  }

  private onRoomState(message: { [key: string]: unknown }) {
    if (Array.isArray(message.iceServers) && message.iceServers.length > 0) {
      this.iceServers = message.iceServers as RTCIceServer[]
    }
    if (!Array.isArray(message.call)) return
    this.supported = true
    // Server chỉ gửi `room:state` khi mình (nối lại) vào phòng; trong cuộc gọi thì nó cho biết kết nối mới chưa ở trong
    // cuộc gọi, nên vào lại bằng kết nối mới (người khác đã đóng kết nối cũ khi thấy `peer-left`).
    if (this.status === "joined") {
      this.rejoin()
      return
    }
    const listed = message.call.map(normalizeParticipant).filter((item): item is CallParticipant => item !== null)
    this.roster = new Map(listed.filter((person) => person.userId !== this.deps.selfId).map((person) => [person.userId, person]))
    this.publish()
  }

  /** Socket mất: nếu quá lâu thì rời cuộc gọi hẳn. */
  socketLost() {
    if (this.disposed || this.status === "idle" || this.socketTimer) return
    this.socketTimer = setTimeout(() => {
      this.socketTimer = null
      this.deps.notify("warning", CALL_TEXT.socketLost)
      this.teardown()
    }, SOCKET_LOST_LEAVE_MS)
  }

  /** Socket nối lại kịp: giữ cuộc gọi; `room:state` kế tiếp sẽ đưa mình vào lại cuộc gọi của server. */
  socketRestored() {
    if (!this.socketTimer) return
    clearTimeout(this.socketTimer)
    this.socketTimer = null
  }

  // ------------------------------------------------------------------ vào, rời

  async join() {
    if (this.disposed || this.status !== "idle") return
    const epoch = ++this.epoch
    this.status = "joining"
    this.busy.mic = true
    this.publish()

    let stream: MediaStream | null = null
    if (this.deps.getUserMedia) {
      try {
        stream = await this.deps.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false })
      } catch (error) {
        const notice = describeMediaError(error, "mic")
        this.deps.notify(notice.level, `${notice.text} ${CALL_TEXT.listenOnly}`)
      }
    } else {
      this.deps.notify("error", `${CALL_TEXT.unsupported} ${CALL_TEXT.listenOnly}`)
    }
    if (this.disposed || this.epoch !== epoch) {
      stopStream(stream)
      return
    }
    this.busy.mic = false
    if (stream && stream.getAudioTracks().length > 0) {
      this.local.audio = stream
      this.local.media.audio = true
      this.startAudioContext()
      this.startMeter(this.deps.selfId, stream)
    } else {
      stopStream(stream)
      this.startAudioContext()
    }
    this.status = "joined"
    this.publish()
    if (this.deps.send({ type: "call:join", roomId: this.deps.roomId, media: { ...this.local.media } }) === false) {
      this.deps.notify("error", CALL_TEXT.notConnected)
      this.teardown()
    }
  }

  /** Bấm Rời: báo server rồi dọn sạch. */
  leave() {
    if (this.disposed || this.status === "idle") return
    this.deps.send({ type: "call:leave", roomId: this.deps.roomId })
    this.teardown()
  }

  /** Dùng lại sau `dispose` (React StrictMode chạy effect hai lần): máy đã sạch nên chỉ cần mở lại. */
  activate() {
    this.disposed = false
  }

  /** Huỷ máy trạng thái (unmount): báo rời nếu còn trong cuộc gọi, dừng mọi track, đóng mọi kết nối. */
  dispose() {
    if (this.disposed) return
    if (this.status === "joined") this.deps.send({ type: "call:leave", roomId: this.deps.roomId })
    this.teardown()
    this.disposed = true
  }

  /** Dừng mọi track, đóng mọi kết nối, đóng AudioContext và về trạng thái chưa vào. */
  private teardown() {
    this.epoch += 1
    if (this.socketTimer) clearTimeout(this.socketTimer)
    this.socketTimer = null
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.pending.clear()
    // Server chỉ báo thay đổi cho người trong cuộc gọi, nên danh sách cũ không còn đúng sau khi rời.
    this.roster.clear()
    for (const stream of [this.local.audio, this.local.camera, this.local.screen]) stopStream(stream)
    this.local = emptyLocal()
    this.busy = { mic: false, camera: false, screen: false }
    this.stopMeters()
    this.speaking.clear()
    this.status = "idle"
    this.publish()
  }

  /** Vào lại sau khi server đã quên mình: kết nối cũ không dùng được nữa; `call:joined` sẽ dựng lại từng kết nối. */
  private rejoin() {
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.pending.clear()
    this.roster.clear()
    this.deps.send({ type: "call:join", roomId: this.deps.roomId, media: { ...this.local.media } })
    this.publish()
  }

  // ------------------------------------------------------------------ micrô, camera, màn hình

  async toggleMic() {
    if (this.status !== "joined" || this.busy.mic) return
    const track = this.local.audio?.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      this.local.media.audio = track.enabled
      this.publishMedia()
      return
    }
    const stream = await this.acquire("mic", () => this.deps.getUserMedia?.({ audio: AUDIO_CONSTRAINTS, video: false }))
    if (!stream) return
    this.local.audio = stream
    this.local.media.audio = true
    this.startAudioContext()
    this.startMeter(this.deps.selfId, stream)
    this.applyLocalTracksToAll()
    this.publishMedia()
  }

  async toggleCamera() {
    if (this.status !== "joined" || this.busy.camera) return
    if (this.local.media.video) {
      this.stopCamera()
      return
    }
    if (this.othersWith("video").length >= MAX_CALL_VIDEOS) {
      this.deps.notify("warning", CALL_TEXT.videoFull)
      return
    }
    const stream = await this.acquire("camera", () => this.deps.getUserMedia?.({ video: CAMERA_CONSTRAINTS, audio: false }))
    if (!stream) return
    // Trong lúc chờ quyền, có thể đã đủ 6 người.
    if (this.othersWith("video").length >= MAX_CALL_VIDEOS) {
      stopStream(stream)
      this.deps.notify("warning", CALL_TEXT.videoFull)
      return
    }
    const track = stream.getVideoTracks()[0]
    if (!track) {
      stopStream(stream)
      return
    }
    track.onended = () => this.stopCamera()
    this.local.camera = stream
    this.local.cameraSince = Date.now()
    this.local.media.video = true
    this.applyLocalTracksToAll()
    this.publishMedia()
  }

  async toggleScreen() {
    if (this.status !== "joined" || this.busy.screen) return
    if (this.local.media.screen) {
      this.stopScreen()
      return
    }
    const sharer = this.othersWith("screen")[0]
    if (sharer && this.othersWith("screen").length >= MAX_CALL_SCREENS) {
      this.deps.notify("warning", CALL_TEXT.screenTaken(sharer.name))
      return
    }
    const stream = await this.acquire("screen", () => this.deps.getDisplayMedia?.(SCREEN_CONSTRAINTS))
    if (!stream) return
    const taken = this.othersWith("screen")[0]
    if (taken) {
      stopStream(stream)
      this.deps.notify("warning", CALL_TEXT.screenTaken(taken.name))
      return
    }
    const track = stream.getVideoTracks()[0]
    if (!track) {
      stopStream(stream)
      return
    }
    // Người dùng bấm "Dừng chia sẻ" của trình duyệt thì track tự kết thúc.
    track.onended = () => this.stopScreen()
    try {
      track.contentHint = "detail"
    } catch {
      // Trình duyệt không hỗ trợ gợi ý nội dung: bỏ qua.
    }
    this.local.screen = stream
    this.local.screenSince = Date.now()
    this.local.media.screen = true
    this.applyLocalTracksToAll()
    this.publishMedia()
  }

  /** Tắt tiếng một người chỉ ở phía mình. */
  setPeerMuted(userId: string, muted: boolean) {
    if (muted) this.mutedPeers.add(userId)
    else this.mutedPeers.delete(userId)
    this.publish()
  }

  private stopCamera() {
    if (!this.local.camera) return
    stopStream(this.local.camera)
    this.local.camera = null
    this.local.media.video = false
    this.applyLocalTracksToAll()
    this.publishMedia()
  }

  private stopScreen() {
    if (!this.local.screen) return
    stopStream(this.local.screen)
    this.local.screen = null
    this.local.media.screen = false
    this.applyLocalTracksToAll()
    this.publishMedia()
  }

  /**
   * Server không kiểm giới hạn: hai người bật cùng lúc thì chỉ người bật sau (trong 3 giây) tự nhường theo thứ tự userId.
   * Người đã bật từ trước không bao giờ bị nhường.
   */
  private enforceLimits() {
    const fresh = (since: number) => Date.now() - since < CONFLICT_WINDOW_MS
    if (this.local.media.screen && fresh(this.local.screenSince)) {
      const rival = this.othersWith("screen").find((person) => person.userId < this.deps.selfId)
      if (rival) {
        this.stopScreen()
        this.deps.notify("warning", CALL_TEXT.screenTaken(rival.name))
      }
    }
    if (this.local.media.video && fresh(this.local.cameraSince)) {
      const ranked = [...this.othersWith("video").map((person) => person.userId), this.deps.selfId].sort()
      if (ranked.indexOf(this.deps.selfId) >= MAX_CALL_VIDEOS) {
        this.stopCamera()
        this.deps.notify("warning", CALL_TEXT.videoFull)
      }
    }
  }

  private othersWith(key: keyof CallMedia): CallParticipant[] {
    return [...this.roster.values()].filter((person) => person.media[key])
  }

  /** Hỏi thiết bị, giữ cờ bận, báo lỗi tiếng Việt; trả về luồng nếu còn đúng phiên gọi sau khi chờ. */
  private async acquire(device: MediaDevice, request: () => Promise<MediaStream> | undefined): Promise<MediaStream | null> {
    const key = device === "mic" ? "mic" : device === "camera" ? "camera" : "screen"
    const epoch = this.epoch
    this.busy[key] = true
    this.publish()
    try {
      const pending = request()
      if (!pending) {
        this.deps.notify("error", CALL_TEXT.unsupported)
        return null
      }
      const stream = await pending
      if (this.disposed || this.epoch !== epoch || this.status !== "joined") {
        stopStream(stream)
        return null
      }
      return stream
    } catch (error) {
      if (!this.disposed && this.epoch === epoch) {
        const notice = describeMediaError(error, device)
        this.deps.notify(notice.level, notice.text)
      }
      return null
    } finally {
      if (this.epoch === epoch) {
        this.busy[key] = false
        this.publish()
      }
    }
  }

  private publishMedia() {
    this.deps.send({ type: "call:media", roomId: this.deps.roomId, media: { ...this.local.media } })
    this.publish()
  }

  // ------------------------------------------------------------------ kết nối ngang hàng

  /** Dựng kết nối tới mọi người trong danh sách phòng gọi mà mình chưa có. */
  private syncPeers() {
    if (this.status !== "joined") return
    for (const id of this.roster.keys()) if (!this.peers.has(id)) this.openPeer(id)
  }

  private openPeer(id: string, fromSignal = false): Peer {
    this.closePeer(id)
    const pc = this.deps.createPeerConnection({ iceServers: this.iceServers })
    const peer: Peer = {
      id,
      pc,
      polite: isPolite(this.deps.selfId, id),
      slots: [],
      makingOffer: false,
      ignoreOffer: false,
      restartPending: false,
      restarts: 0,
      queue: Promise.resolve(),
      streams: NO_STREAMS(),
      connection: "connecting",
      disconnectTimer: null,
      closed: false,
      fromSignal,
      born: Date.now(),
    }
    this.peers.set(id, peer)

    pc.onicecandidate = (event) => {
      if (peer.closed || !event.candidate) return
      this.sendSignal(id, { candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate })
    }
    pc.onnegotiationneeded = () => {
      void this.negotiate(peer)
    }
    pc.ontrack = (event) => this.onTrack(peer, event)
    pc.oniceconnectionstatechange = () => this.onIceState(peer)

    // Bên không lịch sự dựng ba kênh và gửi offer đầu tiên; bên lịch sự nhận kênh từ offer đó.
    if (!peer.polite) {
      const tracks = this.localTracks()
      peer.slots = CALL_SLOTS.map((slot, index) =>
        pc.addTransceiver(tracks[index] ?? (slot === "audio" ? "audio" : "video"), { direction: "sendrecv" }),
      )
      this.limitSenders(peer)
    }
    this.flushPending(id)
    return peer
  }

  private closePeer(id: string) {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.closed = true
    this.peers.delete(id)
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer)
    peer.disconnectTimer = null
    peer.pc.onicecandidate = null
    peer.pc.onnegotiationneeded = null
    peer.pc.ontrack = null
    peer.pc.oniceconnectionstatechange = null
    try {
      peer.pc.close()
    } catch {
      // Đã đóng rồi.
    }
    this.removeMeter(id)
  }

  private async negotiate(peer: Peer) {
    if (peer.closed) return
    const pc = peer.pc
    try {
      peer.makingOffer = true
      if (peer.restartPending) {
        peer.restartPending = false
        const offer = await pc.createOffer({ iceRestart: true })
        if (pc.signalingState !== "stable") return
        await pc.setLocalDescription(offer)
      } else {
        await pc.setLocalDescription()
      }
      if (!peer.closed) this.sendDescription(peer)
    } catch {
      // Va chạm hoặc kết nối vừa đóng: `negotiationneeded` kế tiếp sẽ thử lại.
    } finally {
      peer.makingOffer = false
    }
  }

  private sendDescription(peer: Peer) {
    const description = peer.pc.localDescription
    if (!description || (description.type !== "offer" && description.type !== "answer")) return
    this.sendSignal(peer.id, { description: { type: description.type, sdp: description.sdp } })
  }

  private sendSignal(to: string, data: RtcSignalData) {
    this.deps.send({ type: "rtc:signal", roomId: this.deps.roomId, to, data })
  }

  /** Tín hiệu của người chưa có trong danh sách phòng gọi được giữ lại ít giây (có thể tới trước `peer-joined`). */
  private onSignal(from: string, raw: unknown) {
    if (this.status !== "joined") return
    const data = parseSignal(raw)
    if (!data) return
    const peer = this.peers.get(from)
    if (peer) {
      this.enqueue(peer, data)
      return
    }
    if (this.roster.has(from)) {
      this.enqueue(this.openPeer(from, true), data)
      this.publish()
      return
    }
    const now = Date.now()
    for (const [id, entry] of this.pending) if (now - entry.at > PENDING_SIGNAL_MS) this.pending.delete(id)
    const entry = this.pending.get(from) ?? { at: now, items: [] }
    if (entry.items.length < 64) entry.items.push(data)
    this.pending.set(from, entry)
  }

  private flushPending(id: string) {
    const entry = this.pending.get(id)
    const peer = this.peers.get(id)
    if (!entry || !peer) return
    this.pending.delete(id)
    if (Date.now() - entry.at > PENDING_SIGNAL_MS) return
    for (const data of entry.items) this.enqueue(peer, data)
  }

  /** Tín hiệu của một người xử lý lần lượt: ICE candidate không được tới trước khi offer đặt xong. */
  private enqueue(peer: Peer, data: RtcSignalData) {
    peer.queue = peer.queue.then(() => this.processSignal(peer, data)).catch(noop)
  }

  private async processSignal(peer: Peer, data: RtcSignalData) {
    if (peer.closed) return
    const pc = peer.pc
    if ("description" in data) {
      const { description } = data
      const collision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable")
      peer.ignoreOffer = !peer.polite && collision
      if (peer.ignoreOffer) return
      // Bên lịch sự: `setRemoteDescription(offer)` tự rollback offer đang chờ của mình.
      await pc.setRemoteDescription(description)
      if (peer.closed) return
      if (description.type === "offer") {
        // Nhận kênh từ offer rồi gắn track của mình vào chính những kênh đó trước khi trả lời.
        if (peer.slots.length === 0) peer.slots = pc.getTransceivers().slice(0, CALL_SLOTS.length)
        for (const transceiver of peer.slots) transceiver.direction = "sendrecv"
        this.applyLocalTracks(peer)
        await pc.setLocalDescription()
        if (!peer.closed) this.sendDescription(peer)
      }
      return
    }
    try {
      await pc.addIceCandidate(data.candidate)
    } catch (error) {
      // Candidate của offer đã bị bỏ qua thì lỗi là bình thường.
      if (!peer.ignoreOffer) throw error
    }
  }

  private onTrack(peer: Peer, event: RTCTrackEvent) {
    const index = peer.pc.getTransceivers().indexOf(event.transceiver)
    const slot = CALL_SLOTS[index]
    if (!slot || peer.closed) return
    const current = peer.streams[slot]
    if (current && current.getTracks().includes(event.track)) return
    const stream = this.deps.createStream([event.track])
    peer.streams[slot] = stream
    if (slot === "audio") this.startMeter(peer.id, stream)
    this.publish()
  }

  // ------------------------------------------------------------------ ICE restart

  private onIceState(peer: Peer) {
    if (peer.closed) return
    const state = peer.pc.iceConnectionState
    if (state === "connected" || state === "completed") {
      if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer)
      peer.disconnectTimer = null
      peer.restarts = 0
      peer.connection = "connected"
      this.limitSenders(peer)
      this.publish()
      return
    }
    if (state === "disconnected") {
      if (peer.disconnectTimer) return
      peer.disconnectTimer = setTimeout(() => {
        peer.disconnectTimer = null
        if (!peer.closed && peer.pc.iceConnectionState === "disconnected") this.restartIce(peer)
      }, ICE_DISCONNECT_GRACE_MS)
      return
    }
    if (state === "failed") this.restartIce(peer)
  }

  private restartIce(peer: Peer) {
    if (peer.closed) return
    if (peer.restarts >= MAX_ICE_RESTARTS) {
      peer.connection = "failed"
      this.publish()
      return
    }
    peer.restarts += 1
    peer.connection = "connecting"
    this.publish()
    if (typeof peer.pc.restartIce === "function") {
      peer.pc.restartIce()
    } else {
      peer.restartPending = true
      void this.negotiate(peer)
    }
  }

  // ------------------------------------------------------------------ track của mình vào các kênh

  private localTracks(): (MediaStreamTrack | null)[] {
    return [
      this.local.audio?.getAudioTracks()[0] ?? null,
      this.local.camera?.getVideoTracks()[0] ?? null,
      this.local.screen?.getVideoTracks()[0] ?? null,
    ]
  }

  private applyLocalTracksToAll() {
    for (const peer of this.peers.values()) this.applyLocalTracks(peer)
  }

  private applyLocalTracks(peer: Peer) {
    const tracks = this.localTracks()
    peer.slots.forEach((transceiver, index) => {
      const track = tracks[index] ?? null
      if (transceiver.sender.track === track) return
      void transceiver.sender
        .replaceTrack(track)
        .then(() => {
          if (!peer.closed) this.limitSender(transceiver.sender, CALL_SLOTS[index], track)
        })
        .catch(noop)
    })
  }

  private limitSenders(peer: Peer) {
    const tracks = this.localTracks()
    peer.slots.forEach((transceiver, index) => this.limitSender(transceiver.sender, CALL_SLOTS[index], tracks[index] ?? null))
  }

  /** Hạ độ phân giải, tốc độ khung hình và bitrate của kênh video về mức mesh chịu được (làm hết sức, lỗi thì bỏ qua). */
  private limitSender(sender: RTCRtpSender, slot: CallSlot, track: MediaStreamTrack | null) {
    if (!track || slot === "audio" || typeof sender.getParameters !== "function") return
    try {
      const parameters = sender.getParameters()
      const settings = track.getSettings?.() ?? {}
      const width = settings.width ?? 0
      const height = settings.height ?? 0
      const scale =
        slot === "camera"
          ? Math.max(1, width / CAMERA_LIMIT.width, height / CAMERA_LIMIT.height)
          : Math.max(1, Math.max(width, height) / SCREEN_LIMIT.longEdge)
      const base = parameters.encodings?.[0] ?? {}
      const encoding: RTCRtpEncodingParameters = {
        ...base,
        maxBitrate: slot === "camera" ? CAMERA_LIMIT.maxBitrate : SCREEN_LIMIT.maxBitrate,
        maxFramerate: slot === "camera" ? CAMERA_LIMIT.frameRate : SCREEN_LIMIT.frameRate,
        scaleResolutionDownBy: scale,
      }
      void Promise.resolve(sender.setParameters({ ...parameters, encodings: [encoding] })).catch(noop)
    } catch {
      // Chưa đàm phán xong nên chưa có encodings: giới hạn sẽ được áp lại khi kết nối lên.
    }
  }

  // ------------------------------------------------------------------ ai đang nói

  private startAudioContext() {
    if (this.audioContext || !this.deps.createAudioContext) return
    try {
      this.audioContext = this.deps.createAudioContext()
      void this.audioContext?.resume?.().catch(noop)
    } catch {
      this.audioContext = null
    }
  }

  private startMeter(id: string, stream: MediaStream) {
    const context = this.audioContext
    if (!context || this.meters.has(id) || stream.getAudioTracks().length === 0) return
    try {
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.3
      // Chỉ đo, không nối ra loa: tiếng phát bằng phần tử audio.
      source.connect(analyser)
      this.meters.set(id, { source, analyser, buffer: new Uint8Array(analyser.fftSize), until: 0 })
    } catch {
      return
    }
    if (!this.meterTimer) this.meterTimer = setInterval(() => this.measure(), SPEAKING_POLL_MS)
  }

  private removeMeter(id: string) {
    const meter = this.meters.get(id)
    if (!meter) return
    this.meters.delete(id)
    try {
      meter.source.disconnect()
    } catch {
      // Đã ngắt.
    }
    if (this.speaking.delete(id)) this.publish()
    if (this.meters.size === 0 && this.meterTimer) {
      clearInterval(this.meterTimer)
      this.meterTimer = null
    }
  }

  private stopMeters() {
    for (const id of [...this.meters.keys()]) this.removeMeter(id)
    if (this.meterTimer) clearInterval(this.meterTimer)
    this.meterTimer = null
    const context = this.audioContext
    this.audioContext = null
    if (context && typeof context.close === "function") void context.close().catch(noop)
  }

  private measure() {
    const now = Date.now()
    const next = new Set<string>()
    for (const [id, meter] of this.meters) {
      meter.analyser.getByteTimeDomainData(meter.buffer)
      let sum = 0
      for (const value of meter.buffer) {
        const centred = (value - 128) / 128
        sum += centred * centred
      }
      if (Math.sqrt(sum / meter.buffer.length) > SPEAKING_THRESHOLD) meter.until = now + SPEAKING_HOLD_MS
      const mine = id === this.deps.selfId
      if (now < meter.until && (!mine || this.local.media.audio)) next.add(id)
    }
    if (next.size === this.speaking.size && [...next].every((id) => this.speaking.has(id))) return
    this.speaking = next
    this.publish()
  }
}

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.onended = null
    track.stop()
  }
}

function parseSignal(raw: unknown): RtcSignalData | null {
  if (typeof raw !== "object" || raw === null) return null
  const data = raw as { description?: unknown; candidate?: unknown }
  const description = data.description as { type?: unknown; sdp?: unknown } | undefined
  if (description && (description.type === "offer" || description.type === "answer") && typeof description.sdp === "string") {
    return { description: { type: description.type, sdp: description.sdp } }
  }
  if (typeof data.candidate === "object" && data.candidate !== null) return { candidate: data.candidate as RTCIceCandidateInit }
  return null
}
