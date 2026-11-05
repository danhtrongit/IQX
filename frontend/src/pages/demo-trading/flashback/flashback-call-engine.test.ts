/**
 * Máy trạng thái gọi nhóm (`flashback-call-engine.ts`) với RTCPeerConnection, getUserMedia, getDisplayMedia và AudioContext
 * giả: vào, rời, giới hạn 6 video, một người chia sẻ màn hình, dọn khi đóng phòng, mất socket, ICE restart, va offer
 * ("perfect negotiation") và chỉ báo ai đang nói. Hai engine nối qua một server giả cho các ca nhiều người.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CallEngine, type CallPersonView } from "./flashback-call-engine"
import {
  CALL_TEXT,
  ICE_DISCONNECT_GRACE_MS,
  MAX_CALL_VIDEOS,
  MAX_ICE_RESTARTS,
  SOCKET_LOST_LEAVE_MS,
  SPEAKING_HOLD_MS,
  SPEAKING_POLL_MS,
  describeMediaError,
  isPolite,
  type CallMedia,
} from "./flashback-call-model"
import { FakeAudioContext, FakeCallServer, FakePeerConnection, createEndpoint, settle, type Endpoint } from "./flashback-call-fakes"

const ROOM = "123456"
const MEDIA_OFF: CallMedia = { audio: false, video: false, screen: false }

beforeEach(() => {
  FakePeerConnection.all = []
  FakeAudioContext.loud.clear()
})
afterEach(() => {
  vi.useRealTimers()
})

function solo(selfId = "u1", selfName = "Tôi") {
  const endpoint = createEndpoint({ selfId, selfName })
  const engine = new CallEngine(endpoint.deps)
  engine.handle({ type: "room:state", roomId: ROOM, images: [], call: [], iceServers: [{ urls: "stun:example.test" }] })
  return { endpoint, engine }
}

const peer = (userId: string, media: Partial<CallMedia> = {}) => ({ userId, name: `Tên ${userId}`, media: { ...MEDIA_OFF, ...media } })
const joined = (peers: ReturnType<typeof peer>[]) => ({ type: "call:joined", roomId: ROOM, peers })
const others = (engine: CallEngine) => engine.getSnapshot().people.filter((person) => !person.me)
const personOf = (engine: CallEngine, id: string): CallPersonView => {
  const person = engine.getSnapshot().people.find((item) => item.userId === id)
  if (!person) throw new Error(`không có ${id}`)
  return person
}
const signals = (endpoint: Endpoint) => endpoint.sent.filter((message) => message.type === "rtc:signal")
const denied = (name = "NotAllowedError") => Object.assign(new Error(name), { name })

describe("vào và rời cuộc gọi", () => {
  it("room:state có call thì hiện được thanh gọi, chưa có thì không", () => {
    const endpoint = createEndpoint({ selfId: "u1" })
    const engine = new CallEngine(endpoint.deps)
    expect(engine.getSnapshot().supported).toBe(false)
    engine.handle({ type: "room:state", roomId: ROOM, images: [], iceServers: [] })
    expect(engine.getSnapshot().supported).toBe(false)
    engine.handle({ type: "room:state", roomId: ROOM, images: [], call: [], iceServers: [] })
    expect(engine.getSnapshot().supported).toBe(true)
    expect(engine.getSnapshot().canShare).toBe(true)
  })

  it("vào gọi: lấy mic, gửi call:join với trạng thái thật, dựng kết nối tới người đang gọi bằng iceServers của server", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    expect(engine.getSnapshot().status).toBe("joined")
    expect(endpoint.media.getUserMedia.calls).toHaveLength(1)
    expect(endpoint.media.getUserMedia.calls[0]).toMatchObject({ video: false })
    expect(endpoint.sent).toEqual([{ type: "call:join", roomId: ROOM, media: { audio: true, video: false, screen: false } }])
    expect(personOf(engine, "u1")).toMatchObject({ me: true, media: { audio: true } })

    engine.handle(joined([peer("u2", { audio: true })]))
    expect(endpoint.pcs).toHaveLength(1)
    expect(endpoint.pcs[0].config).toEqual({ iceServers: [{ urls: "stun:example.test" }] })
    expect(engine.getSnapshot().count).toBe(2)
  })

  it("mic bị từ chối: báo tiếng Việt rõ ràng, vẫn vào để nghe, call:join mang audio false", async () => {
    const { endpoint, engine } = solo()
    endpoint.media.getUserMedia.fail.error = denied()
    await engine.join()
    expect(engine.getSnapshot().status).toBe("joined")
    expect(endpoint.notices).toHaveLength(1)
    expect(endpoint.notices[0].level).toBe("error")
    expect(endpoint.notices[0].text).toContain("Chưa có quyền dùng micrô")
    expect(endpoint.notices[0].text).toContain(CALL_TEXT.listenOnly)
    expect(endpoint.sent[0]).toMatchObject({ type: "call:join", media: { audio: false } })
  })

  it("lỗi thiết bị thành câu tiếng Việt riêng cho từng nguyên nhân", () => {
    expect(describeMediaError(denied(), "camera").text).toContain("Chưa có quyền dùng camera")
    expect(describeMediaError(denied("NotFoundError"), "mic").text).toBe("Không tìm thấy micrô trên thiết bị này.")
    expect(describeMediaError(denied("NotReadableError"), "camera").text).toContain("đang được ứng dụng khác dùng")
    expect(describeMediaError(denied("NotAllowedError"), "screen")).toEqual({ level: "info", text: CALL_TEXT.screenCancelled })
    expect(describeMediaError(new Error("lạ"), "camera").text).toBe("Chưa bật được camera. Thử lại sau.")
  })

  it("send trả false khi socket chưa mở: báo lỗi và không treo ở trạng thái đã vào", async () => {
    const endpoint = createEndpoint({ selfId: "u1" })
    endpoint.deps.send = () => false
    const engine = new CallEngine(endpoint.deps)
    engine.handle({ type: "room:state", call: [] })
    await engine.join()
    expect(engine.getSnapshot().status).toBe("idle")
    expect(endpoint.notices.at(-1)?.text).toBe(CALL_TEXT.notConnected)
    expect(endpoint.media.tracks.every((track) => track.stopCount === 1)).toBe(true)
  })

  it("Rời: gửi call:leave, dừng mọi track, đóng mọi kết nối, về trạng thái chưa vào", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2"), peer("u3")]))
    await engine.toggleCamera()
    await engine.toggleScreen()
    expect(endpoint.media.tracks).toHaveLength(3)
    engine.leave()
    expect(endpoint.sent.at(-1)).toEqual({ type: "call:leave", roomId: ROOM })
    expect(endpoint.media.tracks.every((track) => track.readyState === "ended" && track.stopCount === 1)).toBe(true)
    expect(endpoint.pcs).toHaveLength(2)
    expect(endpoint.pcs.every((pc) => pc.closed)).toBe(true)
    expect(engine.getSnapshot()).toMatchObject({ status: "idle", count: 0, people: [] })
  })

  it("room:closed: dừng mọi track, đóng mọi kết nối, không gửi call:leave nữa", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    await engine.toggleCamera()
    const before = endpoint.sent.length
    engine.handle({ type: "room:closed", roomId: ROOM })
    expect(endpoint.media.tracks.every((track) => track.readyState === "ended")).toBe(true)
    expect(endpoint.pcs.every((pc) => pc.closed)).toBe(true)
    expect(engine.getSnapshot().status).toBe("idle")
    expect(endpoint.sent).toHaveLength(before)
  })

  it("unmount (dispose) khi đang gọi: báo rời, dọn sạch; activate dùng lại được (StrictMode)", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    engine.dispose()
    expect(endpoint.sent.at(-1)).toEqual({ type: "call:leave", roomId: ROOM })
    expect(endpoint.pcs.every((pc) => pc.closed)).toBe(true)
    expect(endpoint.media.tracks.every((track) => track.readyState === "ended")).toBe(true)
    engine.activate()
    await engine.join()
    expect(engine.getSnapshot().status).toBe("joined")
  })

  it("peer-left đóng kết nối của người đó và bỏ khỏi danh sách", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2"), peer("u3")]))
    engine.handle({ type: "call:peer-left", userId: "u2" })
    expect(endpoint.pcs[0].closed).toBe(true)
    expect(endpoint.pcs[1].closed).toBe(false)
    expect(others(engine).map((person) => person.userId)).toEqual(["u3"])
  })
})

describe("mic, camera, màn hình", () => {
  it("tắt bật mic chỉ đổi track.enabled và báo call:media", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    await engine.toggleMic()
    expect(endpoint.media.tracks[0].enabled).toBe(false)
    expect(endpoint.sent.at(-1)).toEqual({ type: "call:media", roomId: ROOM, media: { audio: false, video: false, screen: false } })
    await engine.toggleMic()
    expect(endpoint.media.tracks[0].enabled).toBe(true)
    expect(personOf(engine, "u1").media.audio).toBe(true)
  })

  it("camera 640x360 15fps: gắn vào kênh camera đang có, không phải đàm phán lại, hạ bitrate và khung hình", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    await settle()
    const offers = signals(endpoint).length
    await engine.toggleCamera()
    await settle()
    expect(endpoint.media.getUserMedia.calls[1]).toMatchObject({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } },
      audio: false,
    })
    const [, camera, screen] = endpoint.pcs[0].transceivers
    expect(camera.sender.track).toBe(endpoint.media.tracks[1])
    expect(screen.sender.track).toBeNull()
    expect(camera.sender.parameters.encodings[0]).toMatchObject({ maxFramerate: 15, maxBitrate: 450_000 })
    expect(signals(endpoint)).toHaveLength(offers)
    expect(endpoint.sent.at(-1)).toMatchObject({ type: "call:media", media: { video: true } })
    await engine.toggleCamera()
    expect(camera.sender.track).toBeNull()
    expect(endpoint.media.tracks[1].stopCount).toBe(1)
    expect(personOf(engine, "u1").media.video).toBe(false)
  })

  it("tối đa 6 người bật camera: người thứ 7 thấy thông báo, không mở camera", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    const six = Array.from({ length: MAX_CALL_VIDEOS }, (_, index) => peer(`v${index}`, { video: true }))
    engine.handle(joined([...six, peer("u9")]))
    await engine.toggleCamera()
    expect(endpoint.notices.at(-1)).toEqual({ level: "warning", text: CALL_TEXT.videoFull })
    expect(endpoint.media.getUserMedia.calls).toHaveLength(1)
    expect(personOf(engine, "u1").media.video).toBe(false)
    expect(engine.getSnapshot().count).toBe(1 + MAX_CALL_VIDEOS + 1)

    // Một người tắt camera thì người thứ 7 bật được.
    engine.handle({ type: "call:media", userId: "v0", media: MEDIA_OFF })
    await engine.toggleCamera()
    expect(personOf(engine, "u1").media.video).toBe(true)
    expect(engine.getSnapshot().videoCount).toBe(MAX_CALL_VIDEOS)
  })

  it("thoại không bị giới hạn: 30 người trong cuộc gọi vẫn nghe và nói", async () => {
    const { endpoint, engine } = solo("u00")
    await engine.join()
    engine.handle(joined(Array.from({ length: 29 }, (_, index) => peer(`u${String(index + 1).padStart(2, "0")}`, { audio: true }))))
    expect(engine.getSnapshot().count).toBe(30)
    expect(endpoint.pcs).toHaveLength(29)
    expect(endpoint.notices).toEqual([])
  })

  it("hai người bật camera cùng lúc làm vượt 6: chỉ người bật sau theo thứ tự userId tự nhường", async () => {
    const { endpoint, engine } = solo("u5")
    await engine.join()
    engine.handle(joined(Array.from({ length: 5 }, (_, index) => peer(`a${index}`, { video: true }))))
    await engine.toggleCamera()
    expect(personOf(engine, "u5").media.video).toBe(true)
    // Người khác (userId nhỏ hơn mình) cũng vừa bật: mình là người thứ 7 theo thứ tự nên nhường.
    engine.handle(joined([...Array.from({ length: 5 }, (_, index) => peer(`a${index}`, { video: true })), peer("a9", { video: true })]))
    expect(personOf(engine, "u5").media.video).toBe(false)
    expect(endpoint.notices.at(-1)?.text).toBe(CALL_TEXT.videoFull)
  })

  it("chia sẻ màn hình tối đa 1280 px và 10 khung hình, gắn vào kênh màn hình và hạ bitrate", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    await engine.toggleScreen()
    expect(endpoint.media.getDisplayMedia.calls[0]).toMatchObject({
      video: { width: { max: 1280 }, height: { max: 1280 }, frameRate: { ideal: 10, max: 10 } },
      audio: false,
    })
    expect(endpoint.notices).toEqual([])
    expect(engine.getSnapshot().screenSharerId).toBe("u1")
    await settle()
    expect(endpoint.pcs[0].transceivers[2].sender.track).toBe(endpoint.media.tracks[1])
    expect(endpoint.pcs[0].transceivers[2].sender.parameters.encodings[0]).toMatchObject({ maxFramerate: 10, maxBitrate: 900_000 })
  })

  it("một người chia sẻ một lúc: người thứ hai bấm thì báo ai đang chia sẻ, không mở hộp chọn màn hình", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2", { screen: true })]))
    await engine.toggleScreen()
    expect(endpoint.notices.at(-1)).toEqual({ level: "warning", text: CALL_TEXT.screenTaken("Tên u2") })
    expect(endpoint.media.getDisplayMedia.calls).toHaveLength(0)
    expect(engine.getSnapshot().screenSharerId).toBe("u2")
    // Người kia dừng thì mình chia sẻ được.
    engine.handle({ type: "call:media", userId: "u2", media: MEDIA_OFF })
    await engine.toggleScreen()
    expect(engine.getSnapshot().screenSharerId).toBe("u1")
  })

  it("hai người bấm cùng lúc: người có userId lớn hơn nhường", async () => {
    const lose = solo("u5")
    await lose.engine.join()
    await lose.engine.toggleScreen()
    lose.engine.handle({ type: "call:peer-joined", userId: "u1", name: "Một", media: { ...MEDIA_OFF, screen: true } })
    expect(lose.engine.getSnapshot().screenSharerId).toBe("u1")
    expect(lose.endpoint.notices.at(-1)?.text).toBe(CALL_TEXT.screenTaken("Một"))

    const win = solo("u1")
    await win.engine.join()
    await win.engine.toggleScreen()
    win.engine.handle({ type: "call:peer-joined", userId: "u5", name: "Năm", media: { ...MEDIA_OFF, screen: true } })
    expect(win.engine.getSnapshot().people.find((person) => person.me)?.media.screen).toBe(true)
  })

  it("người dùng bấm 'Dừng chia sẻ' của trình duyệt: dừng track và báo call:media", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    await engine.toggleScreen()
    endpoint.media.tracks[1].end()
    expect(endpoint.media.tracks[1].stopCount).toBe(1)
    expect(personOf(engine, "u1").media.screen).toBe(false)
    expect(endpoint.sent.at(-1)).toMatchObject({ type: "call:media", media: { screen: false } })
  })

  it("hộp chọn màn hình bị đóng: thông báo nhẹ, không phải lỗi", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    endpoint.media.getDisplayMedia.fail.error = denied()
    await engine.toggleScreen()
    expect(endpoint.notices.at(-1)).toEqual({ level: "info", text: CALL_TEXT.screenCancelled })
  })

  it("trình duyệt không có getDisplayMedia: canShare false (nút chia sẻ bị ẩn)", () => {
    const endpoint = createEndpoint({ selfId: "u1", overrides: { getDisplayMedia: undefined } })
    const engine = new CallEngine(endpoint.deps)
    expect(engine.getSnapshot().canShare).toBe(false)
  })

  it("tắt tiếng một người chỉ ở phía mình", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2", { audio: true })]))
    engine.setPeerMuted("u2", true)
    expect(personOf(engine, "u2").muted).toBe(true)
    expect(endpoint.sent.filter((message) => message.type === "call:media")).toHaveLength(0)
    engine.setPeerMuted("u2", false)
    expect(personOf(engine, "u2").muted).toBe(false)
  })
})

describe("mất socket", () => {
  it("mất quá lâu thì rời cuộc gọi và dọn sạch; nối lại kịp thì giữ", async () => {
    vi.useFakeTimers()
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))

    engine.socketLost()
    await vi.advanceTimersByTimeAsync(SOCKET_LOST_LEAVE_MS - 1_000)
    engine.socketRestored()
    await vi.advanceTimersByTimeAsync(SOCKET_LOST_LEAVE_MS * 2)
    expect(engine.getSnapshot().status).toBe("joined")

    engine.socketLost()
    await vi.advanceTimersByTimeAsync(SOCKET_LOST_LEAVE_MS)
    expect(engine.getSnapshot().status).toBe("idle")
    expect(endpoint.notices.at(-1)).toEqual({ level: "warning", text: CALL_TEXT.socketLost })
    expect(endpoint.pcs.every((pc) => pc.closed)).toBe(true)
    expect(endpoint.media.tracks.every((track) => track.readyState === "ended")).toBe(true)
  })

  it("nối lại socket: room:state mới khi đang gọi thì vào lại bằng kết nối mới", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    engine.handle({ type: "room:state", roomId: ROOM, images: [], call: [peer("u2")], iceServers: [] })
    expect(endpoint.pcs[0].closed).toBe(true)
    expect(endpoint.sent.filter((message) => message.type === "call:join")).toHaveLength(2)
    engine.handle(joined([peer("u2")]))
    expect(endpoint.pcs).toHaveLength(2)
    expect(endpoint.pcs[1].closed).toBe(false)
  })
})

describe("ICE restart", () => {
  it("failed: restartIce; kết nối lại được thì đếm lại từ đầu; quá số lần thì báo mất kết nối", async () => {
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    const pc = endpoint.pcs[0]
    pc.setIceState("connected")
    expect(personOf(engine, "u2").connection).toBe("connected")

    pc.setIceState("failed")
    expect(pc.restartCount).toBe(1)
    expect(personOf(engine, "u2").connection).toBe("connecting")
    pc.setIceState("connected")
    pc.setIceState("failed")
    expect(pc.restartCount).toBe(2)

    for (let index = 0; index < MAX_ICE_RESTARTS; index += 1) pc.setIceState("failed")
    // Hai lần restart trước đó (một lần đã hồi phục) cộng MAX_ICE_RESTARTS - 1 lần của chuỗi sau; lần cuối thì từ bỏ.
    expect(pc.restartCount).toBe(2 + MAX_ICE_RESTARTS - 1)
    expect(personOf(engine, "u2").connection).toBe("failed")
  })

  it("disconnected quá lâu thì restart, tự hồi phục trong thời gian chờ thì không", async () => {
    vi.useFakeTimers()
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2")]))
    const pc = endpoint.pcs[0]
    pc.setIceState("disconnected")
    await vi.advanceTimersByTimeAsync(ICE_DISCONNECT_GRACE_MS - 500)
    pc.setIceState("connected")
    await vi.advanceTimersByTimeAsync(ICE_DISCONNECT_GRACE_MS * 2)
    expect(pc.restartCount).toBe(0)

    pc.setIceState("disconnected")
    await vi.advanceTimersByTimeAsync(ICE_DISCONNECT_GRACE_MS + 10)
    expect(pc.restartCount).toBe(1)
  })
})

describe("ai đang nói", () => {
  it("đo mức âm: người nói hiện đang nói, ngừng nói thì tắt sau độ trễ giữ", async () => {
    vi.useFakeTimers()
    const { endpoint, engine } = solo()
    await engine.join()
    engine.handle(joined([peer("u2", { audio: true })]))
    await engine.toggleMic() // tắt mic của mình
    await engine.toggleMic() // bật lại
    // Mình nói.
    FakeAudioContext.loud.add(endpoint.media.streams[0])
    await vi.advanceTimersByTimeAsync(SPEAKING_POLL_MS + 10)
    expect(personOf(engine, "u1").speaking).toBe(true)
    // Người kia nói (luồng thu về từ kết nối).
    endpoint.pcs[0].setIceState("connected")
    await vi.advanceTimersByTimeAsync(10)
    expect(others(engine)).toHaveLength(1)
    FakeAudioContext.loud.clear()
    await vi.advanceTimersByTimeAsync(SPEAKING_HOLD_MS + SPEAKING_POLL_MS * 2)
    expect(personOf(engine, "u1").speaking).toBe(false)
  })

  it("mic của mình đang tắt thì không bao giờ báo mình đang nói", async () => {
    vi.useFakeTimers()
    const { endpoint, engine } = solo()
    await engine.join()
    await engine.toggleMic()
    FakeAudioContext.loud.add(endpoint.media.streams[0])
    await vi.advanceTimersByTimeAsync(SPEAKING_POLL_MS * 3)
    expect(personOf(engine, "u1").speaking).toBe(false)
  })
})

describe("perfect negotiation (hai engine qua server giả)", () => {
  async function pair() {
    const server = new FakeCallServer()
    const a = createEndpoint({ selfId: "a", selfName: "An" })
    const b = createEndpoint({ selfId: "b", selfName: "Bình" })
    a.deps.send = (message) => (a.sent.push(message), server.route("a")(message), true)
    b.deps.send = (message) => (b.sent.push(message), server.route("b")(message), true)
    const engineA = new CallEngine(a.deps)
    const engineB = new CallEngine(b.deps)
    server.connect("a", "An", (message) => engineA.handle(message))
    server.connect("b", "Bình", (message) => engineB.handle(message))
    await engineA.join()
    await settle()
    await engineB.join()
    await settle()
    await settle()
    return { server, a, b, engineA, engineB }
  }

  it("so sánh userId: người lớn hơn là bên lịch sự", () => {
    expect(isPolite("b", "a")).toBe(true)
    expect(isPolite("a", "b")).toBe(false)
  })

  it("vào lần lượt: bên không lịch sự đề nghị trước, hai bên thu được thoại, camera và màn hình của nhau", async () => {
    const { a, b, engineA, engineB } = await pair()
    expect(a.pcs).toHaveLength(1)
    expect(b.pcs).toHaveLength(1)
    const [pcA] = a.pcs
    const [pcB] = b.pcs
    expect(pcA.transceivers).toHaveLength(3)
    expect(pcB.transceivers).toHaveLength(3)
    // A (a < b) là bên không lịch sự: đề nghị đầu tiên và chỉ có một lần.
    expect(pcA.localDescription?.type).toBe("offer")
    expect(pcB.localDescription?.type).toBe("answer")
    expect(pcB.rollbacks).toBe(0)
    for (const person of [personOf(engineA, "b"), personOf(engineB, "a")]) {
      expect(person.audio).not.toBeNull()
      expect(person.camera).not.toBeNull()
      expect(person.screen).not.toBeNull()
    }
    // Thoại của mình đã gắn vào kênh thoại ở cả hai phía.
    expect(pcA.transceivers[0].sender.track).toBe(a.media.tracks[0])
    expect(pcB.transceivers[0].sender.track).toBe(b.media.tracks[0])
  })

  it("bật camera và màn hình: bên kia nhận call:media; track chạy qua kênh có sẵn", async () => {
    const { b, engineA, engineB } = await pair()
    await engineB.toggleCamera()
    await engineB.toggleScreen()
    await settle()
    expect(personOf(engineA, "b").media).toEqual({ audio: true, video: true, screen: true })
    expect(engineA.getSnapshot().screenSharerId).toBe("b")
    expect(engineA.getSnapshot().videoCount).toBe(1)
    expect(b.pcs[0].transceivers[1].sender.track).toBe(b.media.tracks[1])
    expect(b.pcs[0].transceivers[2].sender.track).toBe(b.media.tracks[2])
    // Bên kia thấy người thứ hai chia sẻ thì bị chặn.
    await engineA.toggleScreen()
    expect(engineA.getSnapshot().screenSharerId).toBe("b")
  })

  it("va offer: cả hai cùng ICE restart, bên không lịch sự bỏ offer của bên lịch sự, bên lịch sự rollback và trả lời", async () => {
    const { a, b } = await pair()
    const [pcA] = a.pcs
    const [pcB] = b.pcs
    const remoteSetsA = pcA.remoteSets.length
    pcA.setIceState("failed")
    pcB.setIceState("failed")
    await settle()
    await settle()
    expect(pcA.restartCount).toBe(1)
    expect(pcB.restartCount).toBe(1)
    expect(pcA.signalingState).toBe("stable")
    expect(pcB.signalingState).toBe("stable")
    // A (không lịch sự) chỉ nhận thêm answer, không bao giờ nhận offer đang va.
    expect(pcA.remoteSets.slice(remoteSetsA)).toEqual(["answer"])
    // B (lịch sự) rollback offer của mình rồi nhận offer của A.
    expect(pcB.rollbacks).toBe(1)
    expect(pcB.remoteSets.at(-1)).toBe("offer")
    expect(pcB.localDescription?.type).toBe("answer")
  })

  it("chỉ báo ai đang nói thấy cả người ở xa (luồng thu về từ kết nối)", async () => {
    const { engineA, engineB } = await pair()
    FakeAudioContext.loud.add(personOf(engineA, "b").audio)
    await vi.waitFor(() => expect(personOf(engineA, "b").speaking).toBe(true), { timeout: 2_000 })
    expect(personOf(engineB, "a").speaking).toBe(false)
    FakeAudioContext.loud.clear()
    await vi.waitFor(() => expect(personOf(engineA, "b").speaking).toBe(false), { timeout: 3_000 })
  })

  it("ICE candidate được chuyển và đặt sau khi đã có offer", async () => {
    const { a, b } = await pair()
    a.pcs[0].emitCandidate("candidate:A")
    b.pcs[0].emitCandidate("candidate:B")
    await settle()
    expect(b.pcs[0].candidates).toEqual([{ candidate: "candidate:A", sdpMid: "0", sdpMLineIndex: 0 }])
    expect(a.pcs[0].candidates).toEqual([{ candidate: "candidate:B", sdpMid: "0", sdpMLineIndex: 0 }])
  })

  it("tín hiệu tới trước call:joined được giữ lại rồi xử lý khi dựng kết nối", async () => {
    const { endpoint, engine } = solo("b")
    await engine.join()
    engine.handle({ type: "rtc:signal", from: "a", data: { description: { type: "offer", sdp: "fake-sdp;from=99;slots=3" } } })
    engine.handle({ type: "rtc:signal", from: "a", data: { candidate: { candidate: "candidate:early", sdpMid: "0", sdpMLineIndex: 0 } } })
    expect(endpoint.pcs).toHaveLength(0)
    engine.handle(joined([peer("a")]))
    await settle()
    expect(endpoint.pcs).toHaveLength(1)
    expect(endpoint.pcs[0].remoteSets).toEqual(["offer"])
    expect(endpoint.pcs[0].candidates).toHaveLength(1)
    expect(signals(endpoint).at(-1)).toMatchObject({ to: "a", data: { description: { type: "answer" } } })
  })

  it("tín hiệu rác hoặc từ chính mình bị bỏ qua", async () => {
    const { endpoint, engine } = solo("b")
    await engine.join()
    engine.handle(joined([peer("a")]))
    engine.handle({ type: "rtc:signal", from: "a", data: "rác" })
    engine.handle({ type: "rtc:signal", from: "a", data: { description: { type: "rollback", sdp: "" } } })
    engine.handle({ type: "rtc:signal", from: "b", data: { candidate: {} } })
    await settle()
    expect(endpoint.pcs[0].remoteSets).toEqual([])
  })

  it("người kia rời và vào lại: kết nối cũ đóng, kết nối mới dựng lại và nối được", async () => {
    const { b, engineA, engineB } = await pair()
    const oldPc = b.pcs[0]
    engineA.leave()
    await settle()
    expect(oldPc.closed).toBe(true)
    expect(others(engineB)).toHaveLength(0)
    await engineA.join()
    await settle()
    await settle()
    expect(b.pcs).toHaveLength(2)
    expect(b.pcs[1].closed).toBe(false)
    expect(personOf(engineB, "a").audio).not.toBeNull()
  })

  it("Rời ở một phía làm bên kia đóng kết nối và dọn người đó", async () => {
    const { a, b, engineA, engineB } = await pair()
    engineA.leave()
    await settle()
    expect(a.pcs[0].closed).toBe(true)
    expect(b.pcs[0].closed).toBe(true)
    expect(others(engineB)).toEqual([])
    expect(engineA.getSnapshot().status).toBe("idle")
  })
})
