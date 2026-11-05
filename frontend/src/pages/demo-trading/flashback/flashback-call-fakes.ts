/**
 * Bản giả của RTCPeerConnection, MediaStream, getUserMedia và AudioContext cho test gọi nhóm (jsdom không có WebRTC), cùng
 * một "server" giả chuyển tín hiệu giống `flashback-media.hub.ts` (call:join trả call:joined, peer-joined, rtc:signal).
 *
 * `FakePeerConnection` mô phỏng đủ máy trạng thái SDP của "perfect negotiation": offer đặt local vào `have-local-offer`,
 * offer tới khi đang `have-local-offer` thì tự rollback, answer đưa về `stable`, `restartIce` và `addTransceiver` gọi
 * `negotiationneeded`. SDP giả chỉ chứa số kênh để bên kia dựng bộ thu.
 */
import type { CallDeps } from "./flashback-call-engine"
import type { CallClientMessage, CallMedia } from "./flashback-call-model"

export class FakeTrack {
  enabled = true
  readyState: "live" | "ended" = "live"
  onended: (() => void) | null = null
  contentHint = ""
  stopCount = 0
  readonly kind: "audio" | "video"
  constructor(kind: "audio" | "video") {
    this.kind = kind
  }
  stop() {
    this.stopCount += 1
    this.readyState = "ended"
  }
  getSettings() {
    return this.kind === "video" ? { width: 640, height: 360 } : {}
  }
  /** Mô phỏng người dùng bấm "Dừng chia sẻ" của trình duyệt. */
  end() {
    this.readyState = "ended"
    this.onended?.()
  }
}

export class FakeStream {
  readonly tracks: FakeTrack[]
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks
  }
  getTracks() {
    return this.tracks
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio")
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video")
  }
}

class FakeSender {
  track: FakeTrack | null
  parameters: { encodings: RTCRtpEncodingParameters[] } = { encodings: [{}] }
  replaced: (FakeTrack | null)[] = []
  constructor(track: FakeTrack | null) {
    this.track = track
  }
  async replaceTrack(track: FakeTrack | null) {
    this.track = track
    this.replaced.push(track)
  }
  getParameters() {
    return { ...this.parameters, encodings: this.parameters.encodings.map((item) => ({ ...item })) }
  }
  async setParameters(parameters: { encodings: RTCRtpEncodingParameters[] }) {
    this.parameters = parameters
  }
}

class FakeTransceiver {
  direction = "sendrecv"
  sender: FakeSender
  receiver: { track: FakeTrack }
  readonly kind: "audio" | "video"
  constructor(kind: "audio" | "video", track: FakeTrack | null) {
    this.kind = kind
    this.sender = new FakeSender(track)
    this.receiver = { track: new FakeTrack(kind) }
  }
}

let nextId = 1

export class FakePeerConnection {
  static all: FakePeerConnection[] = []
  readonly id = nextId++
  signalingState: "stable" | "have-local-offer" | "have-remote-offer" | "closed" = "stable"
  iceConnectionState: RTCIceConnectionState = "new"
  localDescription: { type: "offer" | "answer"; sdp: string } | null = null
  remoteDescription: { type: "offer" | "answer"; sdp: string } | null = null
  transceivers: FakeTransceiver[] = []
  closed = false
  restartCount = 0
  rollbacks = 0
  remoteSets: ("offer" | "answer")[] = []
  candidates: unknown[] = []
  onicecandidate: ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null
  onnegotiationneeded: (() => void) | null = null
  ontrack: ((event: { transceiver: FakeTransceiver; track: FakeTrack }) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  readonly config: RTCConfiguration
  private wantsNegotiation = false

  constructor(config: RTCConfiguration) {
    this.config = config
    FakePeerConnection.all.push(this)
  }

  addTransceiver(source: FakeTrack | "audio" | "video", init?: { direction?: string }) {
    const track = typeof source === "string" ? null : source
    const kind = typeof source === "string" ? source : source.kind
    const transceiver = new FakeTransceiver(kind, track)
    if (init?.direction) transceiver.direction = init.direction
    this.transceivers.push(transceiver)
    this.requestNegotiation()
    return transceiver
  }

  getTransceivers() {
    return this.transceivers
  }

  restartIce() {
    this.restartCount += 1
    this.requestNegotiation()
  }

  private requestNegotiation() {
    if (this.wantsNegotiation || this.closed) return
    this.wantsNegotiation = true
    queueMicrotask(() => {
      this.wantsNegotiation = false
      if (!this.closed && this.signalingState === "stable") this.onnegotiationneeded?.()
    })
  }

  async setLocalDescription(description?: { type: "offer" | "answer" }) {
    if (this.closed) throw new Error("InvalidStateError: closed")
    const type = description?.type ?? (this.signalingState === "have-remote-offer" ? "answer" : "offer")
    if (type === "offer" && this.signalingState !== "stable") throw new Error("InvalidStateError: not stable")
    this.localDescription = { type, sdp: `fake-sdp;from=${this.id};slots=${this.transceivers.length}` }
    this.signalingState = type === "offer" ? "have-local-offer" : "stable"
  }

  async setRemoteDescription(description: { type: "offer" | "answer"; sdp: string }) {
    if (this.closed) throw new Error("InvalidStateError: closed")
    if (description.type === "offer") {
      // Offer tới khi mình đang chờ answer: rollback ngầm (chỉ bên lịch sự gọi tới đây).
      if (this.signalingState === "have-local-offer") {
        this.rollbacks += 1
        this.signalingState = "stable"
      }
      this.remoteSets.push("offer")
      this.remoteDescription = description
      this.signalingState = "have-remote-offer"
      const slots = Number(/slots=(\d+)/.exec(description.sdp)?.[1] ?? 0)
      while (this.transceivers.length < slots) {
        const index = this.transceivers.length
        this.transceivers.push(new FakeTransceiver(index === 0 ? "audio" : "video", null))
        this.transceivers[index].direction = "recvonly"
      }
      for (const transceiver of this.transceivers) this.ontrack?.({ transceiver, track: transceiver.receiver.track })
      return
    }
    if (this.signalingState !== "have-local-offer") throw new Error("InvalidStateError: no offer")
    this.remoteSets.push("answer")
    this.remoteDescription = description
    this.signalingState = "stable"
    for (const transceiver of this.transceivers) this.ontrack?.({ transceiver, track: transceiver.receiver.track })
  }

  async addIceCandidate(candidate: unknown) {
    if (!this.remoteDescription) throw new Error("InvalidStateError: no remote description")
    this.candidates.push(candidate)
  }

  /** Mô phỏng trình duyệt tìm được một ICE candidate. */
  emitCandidate(text = "candidate:1 1 udp 1 127.0.0.1 9 typ host") {
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: text, sdpMid: "0", sdpMLineIndex: 0 }) } })
  }

  setIceState(state: RTCIceConnectionState) {
    this.iceConnectionState = state
    this.oniceconnectionstatechange?.()
  }

  close() {
    this.closed = true
    this.signalingState = "closed"
  }
}

export type FakeMedia = {
  getUserMedia: ReturnType<typeof createGetUserMedia>
  getDisplayMedia: ReturnType<typeof createGetDisplayMedia>
  streams: FakeStream[]
  tracks: FakeTrack[]
}

export function createGetUserMedia(log: FakeMedia["streams"], tracks: FakeTrack[]) {
  const calls: MediaStreamConstraints[] = []
  const fail: { error: Error | null; kind: "audio" | "video" | null } = { error: null, kind: null }
  const fn = async (constraints: MediaStreamConstraints) => {
    calls.push(constraints)
    const kind = constraints.video ? "video" : "audio"
    if (fail.error && (fail.kind === null || fail.kind === kind)) throw fail.error
    const track = new FakeTrack(kind)
    tracks.push(track)
    const stream = new FakeStream([track])
    log.push(stream)
    return stream as unknown as MediaStream
  }
  return Object.assign(fn, { calls, fail })
}

export function createGetDisplayMedia(log: FakeMedia["streams"], tracks: FakeTrack[]) {
  const calls: DisplayMediaStreamOptions[] = []
  const fail: { error: Error | null } = { error: null }
  const fn = async (constraints: DisplayMediaStreamOptions) => {
    calls.push(constraints)
    if (fail.error) throw fail.error
    const track = new FakeTrack("video")
    tracks.push(track)
    const stream = new FakeStream([track])
    log.push(stream)
    return stream as unknown as MediaStream
  }
  return Object.assign(fn, { calls, fail })
}

/** AudioContext giả: `loud` là tập luồng đang "có tiếng nói". */
export class FakeAudioContext {
  static loud = new Set<unknown>()
  closed = false
  createMediaStreamSource(stream: unknown) {
    return {
      stream,
      disconnected: false,
      connect(target: { source?: unknown }) {
        target.source = this
      },
      disconnect() {
        this.disconnected = true
      },
    }
  }
  createAnalyser() {
    return {
      fftSize: 2048,
      smoothingTimeConstant: 0,
      source: undefined as undefined | { stream: unknown },
      getByteTimeDomainData(buffer: Uint8Array) {
        const loud = this.source !== undefined && FakeAudioContext.loud.has(this.source.stream)
        for (let index = 0; index < buffer.length; index += 1) buffer[index] = loud ? (index % 2 === 0 ? 220 : 36) : 128
      },
    }
  }
  async resume() {}
  async close() {
    this.closed = true
  }
}

type DepsOverrides = Partial<Pick<CallDeps, "getUserMedia" | "getDisplayMedia" | "createAudioContext">>

export type Endpoint = {
  deps: CallDeps
  sent: CallClientMessage[]
  notices: { level: string; text: string }[]
  media: FakeMedia
  pcs: FakePeerConnection[]
}

/** Phần phụ thuộc giả cho một CallEngine; `send` ghi lại thông điệp (và chuyển cho `route` nếu có). */
export function createEndpoint(
  options: {
    roomId?: string
    selfId: string
    selfName?: string
    route?: (message: CallClientMessage) => void
    overrides?: DepsOverrides
  },
): Endpoint {
  const sent: CallClientMessage[] = []
  const notices: { level: string; text: string }[] = []
  const streams: FakeStream[] = []
  const tracks: FakeTrack[] = []
  const media: FakeMedia = {
    getUserMedia: createGetUserMedia(streams, tracks),
    getDisplayMedia: createGetDisplayMedia(streams, tracks),
    streams,
    tracks,
  }
  const pcs: FakePeerConnection[] = []
  const deps: CallDeps = {
    roomId: options.roomId ?? "123456",
    selfId: options.selfId,
    selfName: options.selfName ?? options.selfId,
    send: (message) => {
      sent.push(message)
      options.route?.(message)
      return true
    },
    notify: (level, text) => notices.push({ level, text }),
    createPeerConnection: (config) => {
      const pc = new FakePeerConnection(config)
      pcs.push(pc)
      return pc as unknown as RTCPeerConnection
    },
    createStream: (list) => new FakeStream(list as unknown as FakeTrack[]) as unknown as MediaStream,
    getUserMedia: media.getUserMedia as unknown as CallDeps["getUserMedia"],
    getDisplayMedia: media.getDisplayMedia as unknown as CallDeps["getDisplayMedia"],
    createAudioContext: () => new FakeAudioContext() as unknown as AudioContext,
    ...options.overrides,
  }
  return { deps, sent, notices, media, pcs }
}

/**
 * "Server" giả theo `flashback-media.hub.ts`: `call:join` trả `call:joined` và báo `call:peer-joined`, `call:media` và
 * `rtc:signal` chỉ tới người trong cuộc gọi. Mỗi người vào bằng `connect(id, handle)`; `route(from)` là hàm `send`.
 */
export class FakeCallServer {
  private readonly roomId: string
  private members = new Map<string, { name: string; media: CallMedia; inCall: boolean; handle: (message: Record<string, unknown>) => void }>()

  constructor(roomId = "123456") {
    this.roomId = roomId
  }

  connect(userId: string, name: string, handle: (message: Record<string, unknown>) => void) {
    this.members.set(userId, { name, media: { audio: false, video: false, screen: false }, inCall: false, handle })
    handle({ type: "room:state", roomId: this.roomId, images: [], call: this.list(userId), iceServers: [] })
  }

  /** Socket đóng: rời cuộc gọi và báo người khác (như `detach` của hub). */
  disconnect(userId: string) {
    const me = this.members.get(userId)
    if (!me) return
    if (me.inCall) this.toCall(userId, { type: "call:peer-left", userId })
    this.members.delete(userId)
  }

  /** Phòng đóng: báo mọi người (như `closeRoomState` của hub). */
  closeRoom() {
    for (const item of this.members.values()) item.handle({ type: "room:closed", roomId: this.roomId })
    this.members.clear()
  }

  private list(except: string) {
    return [...this.members.entries()]
      .filter(([id, item]) => item.inCall && id !== except)
      .map(([userId, item]) => ({ userId, name: item.name, media: item.media }))
  }

  private toCall(from: string, message: Record<string, unknown>) {
    for (const [id, item] of this.members) if (id !== from && item.inCall) item.handle(message)
  }

  route(from: string) {
    return (message: CallClientMessage) => {
      const me = this.members.get(from)
      if (!me) return
      // Giao bất đồng bộ như mạng thật.
      queueMicrotask(() => {
        switch (message.type) {
          case "call:join":
            me.inCall = true
            me.media = message.media
            me.handle({ type: "call:joined", roomId: message.roomId, peers: this.list(from) })
            this.toCall(from, { type: "call:peer-joined", userId: from, name: me.name, media: message.media })
            return
          case "call:leave":
            if (!me.inCall) return
            me.inCall = false
            this.toCall(from, { type: "call:peer-left", userId: from })
            return
          case "call:media":
            me.media = message.media
            this.toCall(from, { type: "call:media", userId: from, media: message.media })
            return
          case "rtc:signal":
            this.members.get(message.to)?.handle({ type: "rtc:signal", from, data: message.data })
            return
          default:
        }
      })
    }
  }
}

/** Đợi hết chuỗi microtask của tín hiệu bất đồng bộ (mọi thứ trong bản giả đều là microtask, nên một macrotask là đủ). */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
