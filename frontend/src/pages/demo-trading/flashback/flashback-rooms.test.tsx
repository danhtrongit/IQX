/**
 * Sảnh, hộp tạo phòng, hộp mật khẩu và phòng chờ của Flashback v2 (spec §2, §3, §4).
 */
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FlashbackMain } from "./flashback-main"
import { FlashbackProvider } from "./flashback-provider"
import {
  HOA,
  ME,
  MINH,
  ROOM_CODE,
  createFlashbackBackend,
  listingRow,
  type BackendOptions,
  type FlashbackBackend,
} from "./flashback-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  openAuth: vi.fn(),
  balance: { value: 1_000 as number | null },
  signedIn: { value: true },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mocks.signedIn.value ? { id: "user-1" } : null,
    isAuthenticated: mocks.signedIn.value,
    openAuth: mocks.openAuth,
  }),
}))
vi.mock("../shop/use-shop", () => ({
  useShopState: () => ({ data: mocks.balance.value === null ? undefined : { wallet: { balance: mocks.balance.value } } }),
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: FlashbackBackend

function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

function renderFlashback() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FlashbackProvider>
        <FlashbackMain />
      </FlashbackProvider>
    </QueryClientProvider>,
  )
}

const OPEN_ROOM = listingRow({ id: "111111", owner: { name: "Minh", avatar_url: null }, member_count: 2, stake_xu: 100 })
const LOCKED_ROOM = listingRow({ id: "222222", locked: true, owner: { name: "Hòa", avatar_url: null }, stake_xu: 0 })
const PLAYING_ROOM = listingRow({ id: "333333", status: "playing", member_count: 3 })
const FULL_ROOM = listingRow({ id: "444444", full: true, member_count: 4 })

const LISTING = [OPEN_ROOM, LOCKED_ROOM, PLAYING_ROOM, FULL_ROOM]

async function findLobby() {
  await screen.findByRole("button", { name: "Chơi phòng bất kỳ" })
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.openAuth.mockReset()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  mocks.balance.value = 1_000
  mocks.signedIn.value = true
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Flashback: vào màn hình", () => {
  it("khách chưa đăng nhập được mời đăng nhập và không gọi API", async () => {
    mocks.signedIn.value = false
    setup()
    const user = userEvent.setup()
    renderFlashback()
    expect(screen.getByText("Đăng nhập để chơi Flashback")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    expect(mocks.openAuth).toHaveBeenCalledWith("login")
    expect(backend.calls).toHaveLength(0)
  })

  it("không ở phòng nào thì mở sảnh; đang ở phòng chờ thì mở thẳng phòng chờ", async () => {
    setup({ listing: LISTING })
    const { unmount } = renderFlashback()
    await findLobby()
    expect(backend.callsTo("GET", "/flashback/rooms/me")).toHaveLength(1)
    unmount()

    setup({ room: { status: "waiting" } })
    renderFlashback()
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    expect(screen.queryByRole("button", { name: "Chơi phòng bất kỳ" })).toBeNull()
  })

  it("thông báo một lần của server (bị đưa ra vì thiếu xu) hiện thành toast", async () => {
    setup({ notice: "Bạn đã bị đưa ra khỏi phòng vì không đủ xu" })
    renderFlashback()
    await findLobby()
    expect(mocks.toast.info).toHaveBeenCalledWith("Bạn đã bị đưa ra khỏi phòng vì không đủ xu")
  })

  it("lỗi khi hỏi phòng đang ở thì có nút Thử lại", async () => {
    setup()
    backend.fail("GET /flashback/rooms/me", { status: 503, code: "UNAVAILABLE", message: "Máy chủ bận" })
    const user = userEvent.setup()
    renderFlashback()
    await screen.findByText("Chưa tải được Flashback")
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    await findLobby()
  })
})

describe("Flashback: sảnh", () => {
  it("liệt kê phòng với ID, ổ khoá, chủ phòng, thiết lập, số người và cược", async () => {
    setup({ listing: LISTING })
    renderFlashback()
    await findLobby()
    const rows = await screen.findAllByTestId("flashback-room-row")
    expect(rows).toHaveLength(4)

    const open = within(rows[0])
    expect(open.getByText("111111")).toBeTruthy()
    expect(open.getByText("Minh")).toBeTruthy()
    expect(open.getByText("60 / 30 phiên · 10 phút")).toBeTruthy()
    expect(open.getByText("2/4 người")).toBeTruthy()
    expect(open.getByText("100 xu")).toBeTruthy()
    expect(open.getByRole("button", { name: "Vào phòng 111111" })).toBeTruthy()

    const locked = within(rows[1])
    expect(locked.getByRole("img", { name: "Phòng có mật khẩu" })).toBeTruthy()
    expect(locked.getByText("Không cược")).toBeTruthy()

    expect(within(rows[2]).getByText("Đang chơi")).toBeTruthy()
    expect(within(rows[2]).queryByRole("button")).toBeNull()
    expect(within(rows[3]).getByText("Đủ người")).toBeTruthy()
    expect(within(rows[3]).queryByRole("button")).toBeNull()
  })

  it("bộ lọc Tất cả, Đang chờ, Đang chơi gọi lại danh sách theo trạng thái", async () => {
    setup({ listing: LISTING })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    expect(screen.getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(screen.getByRole("button", { name: "Đang chơi" }))
    await waitFor(() => expect(screen.getAllByTestId("flashback-room-row")).toHaveLength(1))
    expect(screen.getByRole("button", { name: "Đang chơi" }).getAttribute("aria-pressed")).toBe("true")
    expect(backend.callsTo("GET", "/flashback/rooms?status=playing").length).toBeGreaterThan(0)

    await user.click(screen.getByRole("button", { name: "Đang chờ" }))
    await waitFor(() => expect(screen.getAllByTestId("flashback-room-row")).toHaveLength(3))
  })

  it("danh sách rỗng báo Không có phòng phù hợp", async () => {
    setup({ listing: [] })
    renderFlashback()
    expect(await screen.findByText("Không có phòng phù hợp")).toBeTruthy()
  })

  it("danh sách tự làm mới mỗi 3 giây", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ listing: [OPEN_ROOM] })
    renderFlashback()
    await findLobby()
    await waitFor(() => expect(screen.getAllByTestId("flashback-room-row")).toHaveLength(1))

    backend.state.listing.push(listingRow({ id: "555555", owner: { name: "Hòa", avatar_url: null } }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
    await waitFor(() => expect(screen.getAllByTestId("flashback-room-row")).toHaveLength(2))
  })

  it("ID phòng không đủ 6 chữ số thì báo ID phòng gồm 6 chữ số và không gọi server", async () => {
    setup({ listing: LISTING })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()

    await user.type(screen.getByLabelText("ID phòng"), "12345")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    expect(mocks.toast.error).toHaveBeenCalledWith("ID phòng gồm 6 chữ số")
    expect(backend.callsTo("POST", "/flashback/rooms/")).toHaveLength(0)

    await user.clear(screen.getByLabelText("ID phòng"))
    await user.type(screen.getByLabelText("ID phòng"), "12a456")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    expect(mocks.toast.error).toHaveBeenCalledTimes(2)
    expect(backend.callsTo("POST", "/flashback/rooms/")).toHaveLength(0)
  })

  it("nhập đúng ID thì vào phòng chờ", async () => {
    setup({ listing: LISTING })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()

    await user.type(screen.getByLabelText("ID phòng"), "111111")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe("111111")
    expect(backend.callsTo("POST", "/flashback/rooms/111111/join")).toHaveLength(1)
  })

  it("ID không có thật hoặc phòng đã đủ người thì hiện đúng câu của server", async () => {
    setup({ listing: LISTING })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()

    await user.type(screen.getByLabelText("ID phòng"), "999999")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Không tìm thấy phòng"))

    await user.clear(screen.getByLabelText("ID phòng"))
    await user.type(screen.getByLabelText("ID phòng"), "444444")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Phòng đã đủ người"))
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("không đủ xu để vào phòng cược thì báo lỗi của server và ở lại sảnh", async () => {
    setup({ listing: [OPEN_ROOM] })
    backend.fail("POST /flashback/rooms/:code/join", {
      status: 409,
      code: "XU_INSUFFICIENT",
      message: "Không đủ xu để vào phòng cược 100 xu",
    })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Vào phòng 111111" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Không đủ xu để vào phòng cược 100 xu"))
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("Chơi phòng bất kỳ: có phòng mở thì vào; không có thì báo hãy tạo phòng", async () => {
    setup({ listing: [LOCKED_ROOM, PLAYING_ROOM, FULL_ROOM] })
    const user = userEvent.setup()
    const { unmount } = renderFlashback()
    await findLobby()
    await user.click(screen.getByRole("button", { name: "Chơi phòng bất kỳ" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Chưa có phòng mở phù hợp, hãy tạo phòng"))
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
    unmount()

    setup({ listing: [OPEN_ROOM] })
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Chơi phòng bất kỳ" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe("111111")
  })
})

describe("Flashback: phòng có mật khẩu", () => {
  it("bấm phòng có khoá mở hộp mật khẩu; sai mật khẩu báo ngay trong hộp, đúng thì vào phòng", async () => {
    setup({ listing: [LOCKED_ROOM], passwords: { "222222": "abcd" } })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Vào phòng 222222" }))

    const dialog = await screen.findByTestId("flashback-password")
    expect(within(dialog).getByText("Phòng 222222")).toBeTruthy()
    await user.type(within(dialog).getByLabelText("Mật khẩu phòng"), "sai")
    await user.click(within(dialog).getByRole("button", { name: "Vào phòng" }))
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Mật khẩu không đúng")

    await user.clear(within(dialog).getByLabelText("Mật khẩu phòng"))
    expect(within(dialog).queryByRole("alert")).toBeNull()
    await user.type(within(dialog).getByLabelText("Mật khẩu phòng"), "abcd")
    await user.click(within(dialog).getByRole("button", { name: "Vào phòng" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe("222222")
    expect(screen.queryByTestId("flashback-password")).toBeNull()
    expect(backend.callsTo("POST", "/flashback/rooms/222222/join").map((call) => call.body)).toEqual([{ password: "sai" }, { password: "abcd" }])
  })

  it("nhập ID phòng có khoá cũng hỏi mật khẩu", async () => {
    setup({ listing: [LOCKED_ROOM], passwords: { "222222": "abcd" } })
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await user.type(screen.getByLabelText("ID phòng"), "222222")
    await user.click(screen.getByRole("button", { name: "Vào phòng" }))
    expect(await screen.findByTestId("flashback-password")).toBeTruthy()
  })

  it("Hủy đóng hộp mà không vào phòng", async () => {
    setup({ listing: [LOCKED_ROOM], passwords: { "222222": "abcd" } })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Vào phòng 222222" }))
    const dialog = await screen.findByTestId("flashback-password")
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-password")).toBeNull())
    expect(backend.callsTo("POST", "/flashback/rooms/222222/join")).toHaveLength(0)
  })
})

describe("Flashback: hộp tạo phòng", () => {
  async function openCreate() {
    const user = userEvent.setup()
    renderFlashback()
    await findLobby()
    await user.click(screen.getByRole("button", { name: "Tạo phòng" }))
    const dialog = await screen.findByTestId("flashback-create-room")
    return { user, dialog: within(dialog) }
  }

  it("mở với giá trị mặc định, không có chữ hướng dẫn phụ dưới các ô", async () => {
    setup()
    const { dialog } = await openCreate()
    expect((dialog.getByLabelText("Số phiên xem") as HTMLInputElement).value).toBe("60")
    expect((dialog.getByLabelText("Số phiên chơi") as HTMLInputElement).value).toBe("30")
    expect(dialog.getByLabelText("Thời gian chơi").textContent).toBe("10 phút")
    expect(dialog.getByLabelText("Số người tối đa").textContent).toBe("4 người")
    expect((dialog.getByLabelText("Xu cược mỗi người") as HTMLInputElement).value).toBe("100")
    expect((dialog.getByLabelText("Mật khẩu phòng") as HTMLInputElement).value).toBe("")
    expect(dialog.queryByRole("alert")).toBeNull()
  })

  it("chọn 1 người thì khoá ô cược; tạo phòng gửi stake null rồi vào phòng chờ", async () => {
    setup()
    const { user, dialog } = await openCreate()
    expect((dialog.getByLabelText("Xu cược mỗi người") as HTMLInputElement).disabled).toBe(false)

    await user.click(dialog.getByLabelText("Số người tối đa"))
    await user.click(await screen.findByRole("option", { name: "1 người" }))
    expect((dialog.getByLabelText("Xu cược mỗi người") as HTMLInputElement).disabled).toBe(true)

    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    expect(backend.callsTo("POST", "/flashback/rooms").find((call) => call.path === "/flashback/rooms")?.body).toEqual({
      view_bars: 60,
      play_bars: 30,
      minutes: 10,
      max_players: 1,
      stake_xu: null,
      password: null,
    })
  })

  it("giá trị sai báo đúng một dòng lỗi trong hộp, không gọi server, và gõ lại thì dòng lỗi biến mất", async () => {
    setup()
    const { user, dialog } = await openCreate()

    await user.clear(dialog.getByLabelText("Số phiên xem"))
    await user.type(dialog.getByLabelText("Số phiên xem"), "10")
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect(dialog.getAllByRole("alert")).toHaveLength(1)
    expect(dialog.getByRole("alert").textContent).toBe("Số phiên xem phải từ 30 đến 120")
    expect(backend.callsTo("POST", "/flashback/rooms")).toHaveLength(0)

    await user.clear(dialog.getByLabelText("Số phiên xem"))
    await user.type(dialog.getByLabelText("Số phiên xem"), "60")
    expect(dialog.queryByRole("alert")).toBeNull()

    await user.clear(dialog.getByLabelText("Xu cược mỗi người"))
    await user.type(dialog.getByLabelText("Xu cược mỗi người"), "15")
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect(dialog.getByRole("alert").textContent).toBe("Số xu cược tối thiểu 10, là bội số của 10")

    await user.clear(dialog.getByLabelText("Xu cược mỗi người"))
    await user.type(dialog.getByLabelText("Xu cược mỗi người"), "20")
    await user.type(dialog.getByLabelText("Mật khẩu phòng"), "abc")
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect(dialog.getByRole("alert").textContent).toBe("Mật khẩu từ 4 đến 12 ký tự")
    expect(backend.callsTo("POST", "/flashback/rooms")).toHaveLength(0)
  })

  it("cược nhiều hơn số xu đang có thì báo Bạn chỉ có n xu", async () => {
    mocks.balance.value = 50
    setup()
    const { user, dialog } = await openCreate()
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect(dialog.getByRole("alert").textContent).toBe("Bạn chỉ có 50 xu")
    expect(backend.callsTo("POST", "/flashback/rooms")).toHaveLength(0)
  })

  it("câu lỗi của server (ROOM_INVALID) hiện nguyên văn thành dòng lỗi của hộp và hộp vẫn mở", async () => {
    setup()
    backend.fail("POST /flashback/rooms", { status: 422, code: "ROOM_INVALID", message: "Bạn chỉ có 50 xu" })
    mocks.balance.value = null
    const { user, dialog } = await openCreate()
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    expect((await dialog.findByRole("alert")).textContent).toBe("Bạn chỉ có 50 xu")
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("phòng có mật khẩu: gửi mật khẩu và phòng chờ hiện ổ khoá", async () => {
    setup()
    const { user, dialog } = await openCreate()
    await user.type(dialog.getByLabelText("Mật khẩu phòng"), "  1234 ")
    await user.click(dialog.getByRole("button", { name: "Tạo phòng" }))
    await screen.findByTestId("flashback-room-id")
    expect(screen.getByRole("img", { name: "Phòng có mật khẩu" })).toBeTruthy()
    expect(backend.callsTo("POST", "/flashback/rooms").find((call) => call.path === "/flashback/rooms")?.body).toMatchObject({
      password: "1234",
      stake_xu: 100,
      max_players: 4,
    })
  })

  it("Hủy đóng hộp mà không tạo phòng", async () => {
    setup()
    const { user, dialog } = await openCreate()
    await user.click(dialog.getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-create-room")).toBeNull())
    expect(backend.callsTo("POST", "/flashback/rooms")).toHaveLength(0)
  })
})

describe("Flashback: phòng chờ", () => {
  it("ID cỡ lớn, bốn ô thông số và bốn ô người chơi, không có chữ hướng dẫn", async () => {
    setup({ room: { status: "waiting", members: [ME], settings: { stake_xu: 250 } } })
    renderFlashback()
    expect((await screen.findByTestId("flashback-room-id")).textContent).toBe(ROOM_CODE)
    expect(screen.queryByRole("img", { name: "Phòng có mật khẩu" })).toBeNull()

    const tiles = screen.getByRole("region", { name: "Thông số phòng" })
    expect(within(tiles).getByText("Phiên xem").nextElementSibling?.textContent).toBe("60")
    expect(within(tiles).getByText("Phiên chơi").nextElementSibling?.textContent).toBe("30")
    expect(within(tiles).getByText("Thời gian").nextElementSibling?.textContent).toBe("10 phút")
    expect(within(tiles).getByText("Cược").nextElementSibling?.textContent).toBe("250 xu")

    const slots = screen.getByRole("region", { name: "Người chơi" })
    expect(within(slots).getAllByTestId("flashback-slot")).toHaveLength(1)
    expect(within(slots).getAllByTestId("flashback-slot-empty")).toHaveLength(3)
    expect(within(slots).getByText("Linh")).toBeTruthy()
    expect(within(slots).getByText("Chủ phòng")).toBeTruthy()
    expect(screen.getAllByText("Đang chờ người chơi")).toHaveLength(3)
  })

  it("ô vượt số người tối đa bị làm mờ, không mời thêm người", async () => {
    setup({ room: { status: "waiting", members: [ME], settings: { max_players: 2, stake_xu: 0 } } })
    renderFlashback()
    await screen.findByTestId("flashback-room-id")
    expect(screen.getAllByTestId("flashback-slot-empty")).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="flashback-slot-off"]')).toHaveLength(2)
    const tiles = screen.getByRole("region", { name: "Thông số phòng" })
    expect(within(tiles).getByText("Cược").nextElementSibling?.textContent).toBe("Không cược")
  })

  it("chủ phòng thấy nút Bắt đầu; người vào sau chỉ có Rời phòng", async () => {
    setup({ room: { status: "waiting", members: [ME] } })
    const { unmount } = renderFlashback()
    expect(await screen.findByRole("button", { name: "Bắt đầu" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Rời phòng" })).toBeTruthy()
    unmount()

    setup({ room: { status: "waiting", owner: MINH, members: [MINH, ME] } })
    renderFlashback()
    await screen.findByTestId("flashback-room-id")
    expect(screen.getByRole("button", { name: "Rời phòng" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Bắt đầu" })).toBeNull()
    expect(screen.getByText("Chủ phòng").closest("[data-testid='flashback-slot']")?.textContent).toContain("Minh")
  })

  it("Sao chép ID chép đúng ID phòng và báo bằng toast", async () => {
    setup({ room: { status: "waiting" } })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Sao chép ID" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(`Đã sao chép ID ${ROOM_CODE}`))
    expect(await navigator.clipboard.readText()).toBe(ROOM_CODE)
  })

  it("Rời phòng gọi server rồi về sảnh", async () => {
    setup({ room: { status: "waiting" }, listing: [OPEN_ROOM] })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Rời phòng" }))
    await findLobby()
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/leave`)).toHaveLength(1)
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("báo ngắn khi có người vào hoặc rời phòng chờ (làm mới mỗi 2 giây), không báo cho chính mình", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ room: { status: "waiting", members: [ME] } })
    renderFlashback()
    await screen.findByTestId("flashback-room-id")
    expect(mocks.toast.info).not.toHaveBeenCalled()

    backend.addMember(MINH)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100)
    })
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Minh đã vào phòng"))
    await waitFor(() => expect(screen.getAllByTestId("flashback-slot")).toHaveLength(2))

    backend.addMember(HOA)
    backend.removeMember(MINH.user_id)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100)
    })
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Hòa đã vào phòng"))
    expect(mocks.toast.info).toHaveBeenCalledWith("Minh đã rời phòng")
    expect(mocks.toast.info).toHaveBeenCalledTimes(3)
  })

  it("chủ phòng bắt đầu một mình: ván chơi một mình, không trừ xu, sang màn chơi", async () => {
    setup({ room: { status: "waiting", members: [ME] } })
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Bắt đầu" }))
    expect(await screen.findByTestId("flashback-clock")).toBeTruthy()
    expect(backend.callsTo("POST", `/flashback/rooms/${ROOM_CODE}/start`)).toHaveLength(1)
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Bắt đầu chơi"))
    expect(screen.queryByTestId("flashback-room-id")).toBeNull()
  })

  it("bắt đầu phòng có cược: báo đã trừ xu; người thiếu xu bị đưa ra và được báo", async () => {
    setup({ room: { status: "waiting", members: [ME, MINH, HOA] } })
    backend.state.removedOnStart = [{ message: "Không đủ xu", name: "Hòa", user_id: HOA.user_id }]
    const user = userEvent.setup()
    renderFlashback()
    await user.click(await screen.findByRole("button", { name: "Bắt đầu" }))
    await screen.findByTestId("flashback-clock")
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Bắt đầu · đã trừ 100 xu"))
    expect(mocks.toast.info).toHaveBeenCalledWith("Hòa đã rời phòng")
    expect(screen.getAllByTestId("flashback-player")).toHaveLength(2)
  })

  it("người không phải chủ phòng sang màn chơi khi chủ phòng bắt đầu, và ví xu được làm mới vì cược đã bị trừ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries")
    try {
      setup({ room: { status: "waiting", owner: MINH, members: [MINH, ME] } })
      renderFlashback()
      await screen.findByTestId("flashback-room-id")
      invalidate.mockClear()

      backend.startByOwner()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_100)
      })
      expect(await screen.findByTestId("flashback-clock")).toBeTruthy()
      expect(screen.queryByTestId("flashback-room-id")).toBeNull()
      await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Bắt đầu · đã trừ 100 xu"))
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shop"] }))
    } finally {
      invalidate.mockRestore()
    }
  })

  it("bị đưa ra khỏi phòng thì về sảnh kèm thông báo của server", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ room: { status: "waiting", owner: MINH, members: [MINH, ME] }, listing: [OPEN_ROOM] })
    renderFlashback()
    await screen.findByTestId("flashback-room-id")

    backend.state.room = null
    backend.state.notice = "Bạn đã bị đưa ra khỏi phòng vì không đủ xu"
    backend.fail(`GET /flashback/rooms/:code`, { status: 403, code: "NOT_IN_ROOM", message: "Bạn không ở trong phòng này" })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100)
    })
    await findLobby()
    expect(mocks.toast.info).toHaveBeenCalledWith("Bạn đã bị đưa ra khỏi phòng vì không đủ xu")
  })
})
