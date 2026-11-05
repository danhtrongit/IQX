/**
 * Gọi nhóm WebRTC trong phòng Flashback, hai trang thật trong cùng một Chromium (thiết bị giả: `--use-fake-device-for-media-stream`
 * và `--use-fake-ui-for-media-stream`). API giả như `flashback-support.ts`; WebSocket `/api/v2/flashback/ws` giả bằng
 * `page.routeWebSocket` với MỘT server giả chuyển tín hiệu giữa hai trang (`FakeCallServer`, cùng quy tắc với `flashback-media.hub.ts`).
 * Video đi qua kết nối WebRTC thật giữa hai trang.
 *
 * Ảnh chụp chỉ ghi khi đặt FLASHBACK_CALL_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import path from "node:path"
import type { Browser, BrowserContext, Page, Route } from "@playwright/test"
import { FakeCallServer } from "../src/pages/demo-trading/flashback/flashback-call-fakes"
import { expect, test } from "./fixtures"
import { MATCH_ID, ROOM_ID, noHorizontalOverflow, mockFlashback } from "./flashback-support"

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen"] },
})

const SHOTS = process.env.FLASHBACK_CALL_SHOTS
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

type Viewer = { id: string; name: string; username: string }
const AN: Viewer = { id: "member-1", name: "Nhà đầu tư thử nghiệm", username: "member" }
const MINH: Viewer = { id: "member-2", name: "Minh", username: "minh" }

type Stage = "waiting" | "playing"
type Player = { page: Page; context: BrowserContext }

function roomFor(viewer: Viewer, stage: Stage) {
  const member = (who: Viewer, owner: boolean) => ({
    avatar_url: null,
    is_me: who.id === viewer.id,
    is_owner: owner,
    joined_at: "2026-10-30T01:00:00.000Z",
    name: who.name,
    ready: true,
    user_id: who.id,
  })
  return {
    auto_close_at: null,
    chat_enabled: true,
    created_at: "2026-10-30T01:00:00.000Z",
    id: ROOM_ID,
    is_owner: viewer.id === AN.id,
    locked: false,
    match:
      stage === "playing"
        ? { ends_at: "2026-10-30T01:10:00.000Z", id: MATCH_ID, joined: true, started_at: "2026-10-30T01:00:00.000Z", status: "playing" }
        : null,
    max_players: 4,
    members: [member(AN, true), member(MINH, false)],
    minutes: 10,
    owner_id: AN.id,
    play_bars: 30,
    server_now: "2026-10-30T01:00:30.000Z",
    stake_xu: 100,
    status: stage,
    view_bars: 60,
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

/** Ghi lại mọi track và RTCPeerConnection của trang để kiểm tra "dừng mọi track, đóng mọi kết nối". */
function instrument(options: { phone: boolean }) {
  const w = window as unknown as { __tracks: MediaStreamTrack[]; __pcs: RTCPeerConnection[] }
  w.__tracks = []
  w.__pcs = []
  // Điện thoại không có chia sẻ màn hình (gỡ trước khi bọc để bản bọc không tạo lại nó).
  if (options.phone) Object.defineProperty(MediaDevices.prototype, "getDisplayMedia", { value: undefined, configurable: true })
  const devices = navigator.mediaDevices
  for (const name of ["getUserMedia", "getDisplayMedia"] as const) {
    const original = devices[name]?.bind(devices)
    if (!original) continue
    ;(devices as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      const stream: MediaStream = await (original as (...a: unknown[]) => Promise<MediaStream>)(...args)
      for (const track of stream.getTracks()) w.__tracks.push(track)
      return stream
    }
  }
  const Original = window.RTCPeerConnection
  const Wrapped = function (this: unknown, ...args: ConstructorParameters<typeof RTCPeerConnection>) {
    const pc = new Original(...args)
    w.__pcs.push(pc)
    return pc
  } as unknown as typeof RTCPeerConnection
  Wrapped.prototype = Original.prototype
  window.RTCPeerConnection = Wrapped
}

async function openPlayer(
  browser: Browser,
  baseURL: string,
  viewer: Viewer,
  server: FakeCallServer,
  options: { width: number; height: number; stage?: Stage; phone?: boolean; light?: boolean },
): Promise<Player> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: options.width, height: options.height },
    permissions: ["camera", "microphone"],
  })
  const page = await context.newPage()
  const stage = options.stage ?? "waiting"
  await page.addInitScript(() => {
    sessionStorage.setItem("iqx.v2.access_token", "e2e-member-token")
    sessionStorage.setItem("iqx.v2.refresh_token", "e2e-refresh-token")
    sessionStorage.setItem("iqx.v2.remember", "false")
  })
  await page.addInitScript(instrument, { phone: options.phone === true })
  if (options.light) {
    await page.emulateMedia({ colorScheme: "light" })
    await page.addInitScript(() => localStorage.setItem("theme", "light"))
  }

  // Thứ tự đăng ký: nền, rồi Flashback dùng chung, rồi phần riêng của từng người (đăng ký sau thì được gọi trước).
  await page.route("**/api/v2/**", async (route) => {
    const url = new URL(route.request().url())
    const apiPath = url.pathname.replace(/^.*\/api\/v2/, "")
    if (apiPath === "/auth/me") {
      return json(route, { id: viewer.id, email: `${viewer.username}@example.com`, username: viewer.username, full_name: viewer.name, role: "user" })
    }
    if (apiPath === "/auth/refresh") return json(route, { access_token: "e2e-member-token", refresh_token: "e2e-refresh-token", token_type: "bearer" })
    if (apiPath === "/premium/me") return json(route, { is_premium: false })
    if (apiPath.startsWith("/market-data") || apiPath.startsWith("/stocks") || apiPath.startsWith("/market")) return json(route, { items: [], total: 0 })
    return json(route, {})
  })
  await mockFlashback(page)
  await page.route("**/api/v2/flashback/**", async (route) => {
    const apiPath = new URL(route.request().url()).pathname.replace(/^.*\/api\/v2/, "")
    if (apiPath === "/flashback/rooms/me") return json(route, { room: roomFor(viewer, stage), notice: null, kicked: false })
    if (apiPath === `/flashback/rooms/${ROOM_ID}` && route.request().method() === "GET") return json(route, roomFor(viewer, stage))
    return route.fallback()
  })

  await page.routeWebSocket(/\/api\/v2\/flashback\/ws/, (ws) => {
    const send = (message: Record<string, unknown>) => ws.send(JSON.stringify(message))
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type: string }
      if (message.type === "auth") send({ type: "ready", userId: viewer.id })
      else if (message.type === "ping") send({ type: "pong" })
      else if (message.type === "room:join") server.connect(viewer.id, viewer.name, send)
      else server.route(viewer.id)(message as never)
    })
    ws.onClose(() => server.disconnect(viewer.id))
  })

  await page.goto("/demo-trading?view=flashback")
  return { page, context }
}

const bar = (page: Page) => page.getByTestId("flashback-call")
const chip = (page: Page, userId: string) => page.locator(`[data-testid="flashback-call-person"][data-user-id="${userId}"]`)
const tile = (page: Page, userId: string) => page.locator(`[data-testid="flashback-call-tile"][data-user-id="${userId}"]`)
const videoWidth = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => (element as HTMLVideoElement).videoWidth)

async function joinCall(page: Page) {
  await page.getByTestId("flashback-call-join").click()
  await expect(page.getByTestId("flashback-call-leave")).toBeVisible()
}

async function mediaState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __tracks: MediaStreamTrack[]; __pcs: RTCPeerConnection[] }
    return {
      tracks: w.__tracks.length,
      liveTracks: w.__tracks.filter((track) => track.readyState === "live").length,
      pcs: w.__pcs.length,
      openPcs: w.__pcs.filter((pc) => pc.signalingState !== "closed").length,
    }
  })
}

test("hai người gọi nhóm: thoại, camera, tắt tiếng một người, chia sẻ màn hình, rời (máy tính 1366x768)", async ({ browser }, testInfo) => {
  test.setTimeout(90_000)
  const baseURL = String(testInfo.project.use.baseURL)
  const server = new FakeCallServer(ROOM_ID)
  const a = await openPlayer(browser, baseURL, AN, server, { width: 1366, height: 768 })
  const b = await openPlayer(browser, baseURL, MINH, server, { width: 1366, height: 768 })

  // Phòng chờ có thanh gọi dưới ID phòng; chưa vào thì chỉ có nút Tham gia gọi.
  await expect(a.page.getByTestId("flashback-room-id")).toHaveText(ROOM_ID)
  await expect(a.page.getByTestId("flashback-call-join")).toBeVisible()
  await expect(a.page.getByRole("button", { name: "Bật mic" })).toHaveCount(0)
  await shot(a.page, "call-desktop-1-chua-vao")

  await joinCall(a.page)
  await expect(chip(a.page, AN.id)).toHaveCount(1)
  await joinCall(b.page)
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId("flashback-call-person")).toHaveCount(2)
  }

  // Thoại: thiết bị giả phát tiếng bíp, chỉ báo ai đang nói phải sáng lên ở phía bên kia.
  await expect.poll(() => chip(b.page, AN.id).getAttribute("data-speaking"), { timeout: 20_000 }).toBe("true")
  // Kết nối ngang hàng thật đã lên.
  await expect
    .poll(() => b.page.evaluate(() => (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.some((pc) => pc.connectionState === "connected")), {
      timeout: 20_000,
    })
    .toBe(true)

  // Camera của An: Minh thấy hình thật (videoWidth > 0), kích thước camera không vượt 640x360.
  await a.page.getByRole("button", { name: "Bật camera" }).click()
  await expect(chip(b.page, AN.id)).toHaveAttribute("data-video", "true")
  const anCamera = `[data-testid="flashback-call-person"][data-user-id="${AN.id}"] video`
  await expect.poll(() => videoWidth(b.page, anCamera), { timeout: 20_000 }).toBeGreaterThan(0)
  expect(await videoWidth(b.page, anCamera)).toBeLessThanOrEqual(640)
  // Camera của Minh: An thấy hình thật.
  await b.page.getByRole("button", { name: "Bật camera" }).click()
  const minhCamera = `[data-testid="flashback-call-person"][data-user-id="${MINH.id}"] video`
  await expect.poll(() => videoWidth(a.page, minhCamera), { timeout: 20_000 }).toBeGreaterThan(0)

  // Mở rộng: lưới ô video, mỗi người có nút tắt tiếng riêng.
  await a.page.getByRole("button", { name: "Mở rộng cuộc gọi" }).click()
  await b.page.getByRole("button", { name: "Mở rộng cuộc gọi" }).click()
  await expect(tile(b.page, AN.id)).toBeVisible()
  await expect.poll(() => videoWidth(b.page, `[data-testid="flashback-call-tile"][data-user-id="${AN.id}"] video`)).toBeGreaterThan(0)
  await shot(b.page, "call-desktop-2-mo-rong-hai-camera")
  await b.page.getByRole("button", { name: `Tắt tiếng ${AN.name}` }).click()
  await expect(b.page.locator("audio[data-muted='true']")).toHaveCount(1)
  await expect(b.page.getByRole("button", { name: `Bật tiếng ${AN.name}` })).toBeVisible()
  await b.page.getByRole("button", { name: `Bật tiếng ${AN.name}` }).click()
  await expect(b.page.locator("audio[data-muted='true']")).toHaveCount(0)

  // Tắt mic của An: Minh thấy biểu tượng tắt mic của An.
  await a.page.getByRole("button", { name: "Tắt mic" }).click()
  await expect(chip(b.page, AN.id)).toHaveAttribute("data-mic", "false")
  await a.page.getByRole("button", { name: "Bật mic" }).click()
  await expect(chip(b.page, AN.id)).toHaveAttribute("data-mic", "true")

  // Chia sẻ màn hình (nếu Chromium chạy ở chế độ này hỗ trợ getDisplayMedia).
  await b.page.getByRole("button", { name: "Chia sẻ màn hình" }).click()
  const shared = await b.page
    .getByRole("button", { name: "Dừng chia sẻ màn hình" })
    .waitFor({ timeout: 6_000 })
    .then(() => true)
    .catch(() => false)
  if (shared) {
    await expect(a.page.getByTestId("flashback-call-screen")).toBeVisible()
    await expect.poll(() => videoWidth(a.page, '[data-testid="flashback-call-screen"] video'), { timeout: 20_000 }).toBeGreaterThan(0)
    expect(await videoWidth(a.page, '[data-testid="flashback-call-screen"] video')).toBeLessThanOrEqual(1280)
    await shot(a.page, "call-desktop-3-man-hinh-chia-se")
    // An bấm chia sẻ khi Minh đang chia sẻ: chỉ báo, không mở hộp chọn màn hình.
    await a.page.getByRole("button", { name: "Chia sẻ màn hình" }).click()
    await expect(a.page.getByText(`${MINH.name} đang chia sẻ màn hình. Đợi bạn ấy dừng rồi chia sẻ.`)).toBeVisible()
    await b.page.getByRole("button", { name: "Dừng chia sẻ màn hình" }).click()
    await expect(a.page.getByTestId("flashback-call-screen")).toHaveCount(0)
  } else {
    testInfo.annotations.push({ type: "bỏ qua", description: "Chromium này không hỗ trợ getDisplayMedia, chưa kiểm chia sẻ màn hình" })
  }

  // Rời: An dừng mọi track, đóng mọi kết nối; Minh thấy An biến mất.
  const before = await mediaState(a.page)
  expect(before.liveTracks).toBeGreaterThan(0)
  expect(before.openPcs).toBeGreaterThan(0)
  await a.page.getByRole("button", { name: "Rời cuộc gọi" }).click()
  await expect(a.page.getByTestId("flashback-call-join")).toBeVisible()
  await expect(b.page.getByTestId("flashback-call-person")).toHaveCount(1)
  expect(await mediaState(a.page)).toMatchObject({ liveTracks: 0, openPcs: 0 })
  await shot(b.page, "call-desktop-4-sau-khi-an-roi")

  await a.context.close()
  await b.context.close()
})

test("đóng phòng giữa cuộc gọi: dừng mọi track và đóng mọi kết nối ở cả hai trang", async ({ browser }, testInfo) => {
  test.setTimeout(60_000)
  const baseURL = String(testInfo.project.use.baseURL)
  const server = new FakeCallServer(ROOM_ID)
  const a = await openPlayer(browser, baseURL, AN, server, { width: 1366, height: 768 })
  const b = await openPlayer(browser, baseURL, MINH, server, { width: 1366, height: 768 })
  await joinCall(a.page)
  await joinCall(b.page)
  await a.page.getByRole("button", { name: "Bật camera" }).click()
  await expect(chip(b.page, AN.id)).toHaveAttribute("data-video", "true")
  expect((await mediaState(a.page)).liveTracks).toBeGreaterThan(1)
  server.closeRoom()
  await expect(a.page.getByTestId("flashback-call-join")).toBeVisible()
  await expect(b.page.getByTestId("flashback-call-join")).toBeVisible()
  for (const page of [a.page, b.page]) expect(await mediaState(page)).toMatchObject({ liveTracks: 0, openPcs: 0 })
  await a.context.close()
  await b.context.close()
})

test("trong ván có cảnh báo lộ thông tin khi bắt đầu chia sẻ màn hình (máy tính)", async ({ browser }, testInfo) => {
  test.setTimeout(60_000)
  const baseURL = String(testInfo.project.use.baseURL)
  const server = new FakeCallServer(ROOM_ID)
  const a = await openPlayer(browser, baseURL, AN, server, { width: 1366, height: 768, stage: "playing", light: true })
  await expect(a.page.getByTestId("flashback-profit")).toBeVisible()
  await expect(bar(a.page)).toBeVisible()
  await joinCall(a.page)
  await a.page.getByRole("button", { name: "Chia sẻ màn hình" }).click()
  const shared = await a.page
    .getByRole("button", { name: "Dừng chia sẻ màn hình" })
    .waitFor({ timeout: 6_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!shared, "Chromium này không hỗ trợ getDisplayMedia")
  await expect(a.page.getByTestId("flashback-call-sharing")).toContainText("làm lộ thông tin với người chơi khác")
  await expect(a.page.getByText("Màn hình bạn chia sẻ có thể làm lộ thông tin với người chơi khác trong ván.").first()).toBeVisible()
  await a.page.waitForTimeout(400)
  await shot(a.page, "call-desktop-5-canh-bao-trong-van-sang")
  await a.context.close()
})

test("điện thoại 390x844: thanh gọi gọn trong phòng chờ và trong ván, không tràn ngang, không che nút đặt lệnh", async ({ browser }, testInfo) => {
  test.setTimeout(90_000)
  const baseURL = String(testInfo.project.use.baseURL)
  const server = new FakeCallServer(ROOM_ID)
  const phone = await openPlayer(browser, baseURL, AN, server, { width: 390, height: 844, stage: "waiting", phone: true })
  const friend = await openPlayer(browser, baseURL, MINH, server, { width: 1100, height: 760 })

  // Phòng chờ.
  await expect(phone.page.getByTestId("flashback-call-join")).toBeVisible()
  expect(await noHorizontalOverflow(phone.page)).toBe(true)
  await shot(phone.page, "call-mobile-1-phong-cho-chua-vao")
  await joinCall(phone.page)
  await joinCall(friend.page)
  await expect(phone.page.getByTestId("flashback-call-person")).toHaveCount(2)
  await friend.page.getByRole("button", { name: "Bật camera" }).click()
  await expect(chip(phone.page, MINH.id)).toHaveAttribute("data-video", "true")
  await expect.poll(() => videoWidth(phone.page, `[data-testid="flashback-call-person"][data-user-id="${MINH.id}"] video`), { timeout: 20_000 }).toBeGreaterThan(0)
  // Không có getDisplayMedia thì không có nút chia sẻ màn hình.
  await expect(phone.page.getByRole("button", { name: /Chia sẻ màn hình/ })).toHaveCount(0)
  expect(await noHorizontalOverflow(phone.page)).toBe(true)
  const waitingBar = (await bar(phone.page).boundingBox())!
  expect(waitingBar.width).toBeLessThanOrEqual(390)
  expect(waitingBar.height).toBeLessThanOrEqual(64)
  await shot(phone.page, "call-mobile-2-phong-cho-da-vao")
  await phone.page.getByRole("button", { name: "Mở rộng cuộc gọi" }).click()
  await expect(tile(phone.page, MINH.id)).toBeVisible()
  await expect.poll(() => videoWidth(phone.page, `[data-testid="flashback-call-tile"][data-user-id="${MINH.id}"] video`), { timeout: 20_000 }).toBeGreaterThan(0)
  expect(await noHorizontalOverflow(phone.page)).toBe(true)
  await shot(phone.page, "call-mobile-3-phong-cho-mo-rong")
  await phone.page.getByRole("button", { name: "Thu gọn cuộc gọi" }).click()

  // Trong ván: mở lại trang ở trạng thái đang chơi (cuộc gọi dựng lại bằng kết nối mới).
  await phone.context.close()
  const match = await openPlayer(browser, baseURL, AN, server, { width: 390, height: 844, stage: "playing", phone: true })
  await expect(match.page.getByTestId("flashback-profit")).toBeVisible()
  const chartTopIdle = (await match.page.locator("section[aria-label='Số liệu ván chơi']").boundingBox())!.y
  await expect(match.page.getByTestId("flashback-call-join")).toBeVisible()
  await joinCall(match.page)
  await expect(match.page.getByTestId("flashback-call-person")).toHaveCount(2)
  await expect(chip(match.page, MINH.id)).toHaveAttribute("data-video", "true")
  await expect.poll(() => videoWidth(match.page, `[data-testid="flashback-call-person"][data-user-id="${MINH.id}"] video`), { timeout: 20_000 }).toBeGreaterThan(0)
  expect(await noHorizontalOverflow(match.page)).toBe(true)
  const callBox = (await bar(match.page).boundingBox())!
  expect(callBox.width).toBeLessThanOrEqual(390)
  expect(callBox.height).toBeLessThanOrEqual(64)
  // Cố định đáy (Mua, Bán, Phiên tiếp) vẫn bấm được: điểm giữa nút là chính nút, không bị thanh gọi che.
  for (const id of ["flashback-buy-mobile", "flashback-sell-mobile", "flashback-next-mobile"]) {
    const box = (await match.page.getByTestId(id).boundingBox())!
    const topElement = await match.page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      [box.x + box.width / 2, box.y + box.height / 2] as const,
    )
    expect(topElement).toBe(id)
  }
  // Thanh gọi thu gọn chỉ đẩy số liệu xuống đúng chiều cao của nó (không phủ lên).
  const chartTopWithCall = (await match.page.locator("section[aria-label='Số liệu ván chơi']").boundingBox())!.y
  expect(chartTopWithCall - chartTopIdle).toBeLessThanOrEqual(64 + 12)
  await shot(match.page, "call-mobile-4-trong-van-thu-gon")
  await match.page.getByRole("button", { name: "Mở rộng cuộc gọi" }).click()
  await expect(tile(match.page, MINH.id)).toBeVisible()
  await expect.poll(() => videoWidth(match.page, `[data-testid="flashback-call-tile"][data-user-id="${MINH.id}"] video`), { timeout: 20_000 }).toBeGreaterThan(0)
  expect(await noHorizontalOverflow(match.page)).toBe(true)
  await shot(match.page, "call-mobile-5-trong-van-mo-rong")

  await match.context.close()
  await friend.context.close()
})
