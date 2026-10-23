import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { FlashbackPage } from "./flashback-page"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: mocks.api,
}))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin-1", role: "admin" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

installResizeObserver()

/** Hai đề: một đang mở, một đã trả thưởng và từng phải dùng phương án dự phòng. */
const ROUNDS = [
  {
    id: "round-open",
    round_no: 8,
    status: "open",
    scheduled_open_at: "2026-10-20T13:00:00.000Z",
    opens_at: "2026-10-20T13:00:00.000Z",
    closes_at: "2026-10-22T13:00:00.000Z",
    player_count: 42,
    total_fee_xu: 8400,
    total_reward_xu: 6000,
    held_reward_xu: 0,
    fallback_level: 0,
  },
  {
    id: "round-closed",
    round_no: 7,
    status: "paid",
    scheduled_open_at: "2026-10-18T13:00:00.000Z",
    opens_at: "2026-10-18T13:00:00.000Z",
    closes_at: "2026-10-20T13:00:00.000Z",
    player_count: 30,
    total_fee_xu: 6000,
    total_reward_xu: 5000,
    held_reward_xu: 1000,
    fallback_level: 2,
    symbol: "VIC",
    start_date: "2015-03-02",
  },
]

const ALERTS = [
  {
    run_at: "2026-10-20T13:00:05.000Z",
    step: "alert",
    round_id: null,
    result: "Không tạo được đề mới: đã thử hết các mức nới điều kiện.",
    error: null,
    level: "high",
    level_label: "Cao",
  },
]

const SUSPECTS = [
  {
    round_id: "round-open",
    reason: "same_ip",
    shared: "203.0.113.7",
    user_count: 3,
    usernames: ["minh.tran", "lan.nguyen"],
  },
]

const HOLDS = [
  {
    id: "hold-1",
    round_id: "round-closed",
    round_no: 7,
    user_id: "user-9",
    username: "lan.nguyen",
    amount: 1000,
    reason: "same_phone",
    status: "held",
    created_at: "2026-10-20T13:01:00.000Z",
    decided_at: null,
    decided_by: null,
  },
]

const SETTINGS = [
  { key: "round_duration_hours", label: "Thời lượng một đề (giờ)", value: 48, default_value: 48 },
  { key: "entry_fee_xu", label: "Phí tham gia (xu)", value: 0, default_value: 100 },
]

/** Trạng thái tạm dừng mà máy chủ trả về; mỗi phép thử đổi được. */
let pausedOnServer = false
/** Người đang xem có trong SUPER_ADMIN_USER_IDS hay không. */
let superAdminOnServer = true

function install() {
  const handler = async (path: string, init?: RequestInit) => {
    if (path === "/admin/flashback/rounds") return { rounds: ROUNDS }
    if (path === "/admin/flashback/alerts") return { alerts: ALERTS }
    if (path === "/admin/flashback/suspects") return { suspects: SUSPECTS }
    if (path === "/admin/flashback/pause") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { paused?: boolean }
        pausedOnServer = body.paused === true
        return { paused: pausedOnServer }
      }
      return { paused: pausedOnServer, super_admin: superAdminOnServer }
    }
    if (path === "/admin/flashback/reward-holds?status=held") return { holds: HOLDS }
    if (path === "/admin/flashback/reward-holds/hold-1/release" && init?.method === "POST") {
      return { ...HOLDS[0], status: "released", decided_at: "2026-10-21T00:00:00.000Z", decided_by: "admin-1" }
    }
    if (path === "/admin/flashback/settings") return { settings: SETTINGS }
    if (path.includes("/reveal")) {
      return { round_no: 7, symbol: "VIC", start_date: "2015-03-02", session_range: "2015-03-02..2015-08-28" }
    }
    throw new Error(`Không có route giả lập: ${path}`)
  }
  mocks.api.mockImplementation(handler)
  return handler
}

function callsTo(path: string) {
  return mocks.api.mock.calls.filter(([called]) => called === path)
}

function renderPage() {
  return renderRoute("/admin/flashback", "/admin/flashback", <FlashbackPage />)
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  pausedOnServer = false
  superAdminOnServer = true
  install()
})

describe("màn quản trị Flashback", () => {
  it("bảng đề có đúng các cột quản trị và không lộ mã hay giai đoạn", async () => {
    renderPage()
    const table = (await screen.findAllByRole("table"))[0]
    // Chờ số liệu về: bảng lúc đang tải chỉ có hàng skeleton.
    await within(table).findByText("#8")
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    expect(headers.slice(0, 7)).toEqual([
      "Số đề",
      "Trạng thái",
      "Giờ mở",
      "Giờ đóng",
      "Người chơi",
      "Phí thu (xu)",
      "Thưởng đã trả (xu)",
    ])
    expect(headers.join(" ")).not.toMatch(/mã|giai đoạn/i)
    // Mã của đề đã đóng không được hiện, kể cả khi máy chủ gửi kèm trong câu trả lời.
    expect(screen.queryByText("VIC")).toBeNull()
    expect(screen.queryByText("2015-03-02")).toBeNull()
    expect(within(table).getByText("#8")).toBeTruthy()
    expect(within(table).getByText("Đang mở")).toBeTruthy()
    expect(within(table).getByText("42")).toBeTruthy()
  })

  it("bảng cảnh báo hiện mức độ do máy chủ gửi", async () => {
    renderPage()
    const table = (await screen.findAllByRole("table"))[1]
    await within(table).findByText("Cao")
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    expect(headers[0]).toBe("Mức độ")
    expect(within(table).getByText("Cao")).toBeTruthy()
    expect(within(table).getByText(/Không tạo được đề mới/)).toBeTruthy()
  })

  it("nút Xem mã và giai đoạn chỉ hiện với đề đã đóng", async () => {
    renderPage()
    await screen.findByRole("button", { name: "Xem mã và giai đoạn của đề #7" })
    const buttons = screen.getAllByRole("button", { name: /Xem mã và giai đoạn/ })
    expect(buttons).toHaveLength(1)
    expect(buttons[0].getAttribute("aria-label")).toBe("Xem mã và giai đoạn của đề #7")
  })

  it("nút Tạm dừng Flashback hỏi xác nhận rồi mới gọi máy chủ", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole("table")

    // Nút chỉ hiện khi máy chủ báo super_admin (FB-08).
    await user.click(await screen.findByRole("button", { name: "Tạm dừng Flashback" }))
    // Chưa gọi POST: trạng thái tạm dừng vẫn chỉ được đọc bằng GET.
    expect(callsTo("/admin/flashback/pause").some(([, init]) => init?.method === "POST")).toBe(false)

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Tạm dừng Flashback?")).toBeTruthy()
    expect(within(dialog).getByText(/Đề đang mở vẫn chạy tới giờ đóng/)).toBeTruthy()

    await user.click(within(dialog).getByRole("button", { name: "Tạm dừng" }))
    await waitFor(() =>
      expect(callsTo("/admin/flashback/pause").some(([, init]) => init?.method === "POST")).toBe(true),
    )
    const [, pauseInit] = callsTo("/admin/flashback/pause").find(([, init]) => init?.method === "POST") as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(pauseInit.body))).toEqual({ paused: true })
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã tạm dừng Flashback")
  })

  it("nút tạm dừng phản ánh trạng thái tạm dừng của máy chủ", async () => {
    const user = userEvent.setup()
    pausedOnServer = true
    renderPage()
    await screen.findAllByRole("table")

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Chạy lại Flashback" })).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: "Tạm dừng Flashback" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Chạy lại Flashback" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Chạy lại Flashback?")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: "Chạy lại" }))
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Flashback đã chạy lại"),
    )
    // Nút bám trạng thái máy chủ sau khi cache được làm mới.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tạm dừng Flashback" })).toBeTruthy(),
    )
  })

  it("chỉ gọi endpoint xem mã khi bấm nút, và kết quả hiện trong hộp thoại", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole("table")
    await screen.findByRole("button", { name: "Xem mã và giai đoạn của đề #7" })
    expect(callsTo("/admin/flashback/rounds/round-closed/reveal")).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: "Xem mã và giai đoạn của đề #7" }))
    await waitFor(() => expect(callsTo("/admin/flashback/rounds/round-closed/reveal")).toHaveLength(1))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Mã và giai đoạn của đề #7")).toBeTruthy()
    expect(within(dialog).getByText("Mỗi lần xem được ghi nhật ký để đối soát khi có khiếu nại.")).toBeTruthy()
    expect(within(dialog).getByText("VIC")).toBeTruthy()
  })

  it("lỗi tải danh sách đề hiện nút Thử lại", async () => {
    const user = userEvent.setup()
    const healthy = install()
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/admin/flashback/rounds") throw new Error("Máy chủ không trả lời")
      return healthy(path, init)
    })
    renderPage()
    expect(await screen.findByText("Không tải được danh sách đề")).toBeTruthy()

    const retry = screen.getByRole("button", { name: "Thử lại" })
    await user.click(retry)
    await waitFor(() => expect(callsTo("/admin/flashback/rounds").length).toBeGreaterThan(1))
  })

  it("FB-08: không có trong SUPER_ADMIN_USER_IDS thì ẩn nút tạm dừng và xem mã, dù vai trò là admin", async () => {
    superAdminOnServer = false
    renderPage()
    const table = (await screen.findAllByRole("table"))[0]
    await within(table).findByText("#7")
    await waitFor(() => expect(callsTo("/admin/flashback/pause").length).toBeGreaterThan(0))
    expect(screen.queryByRole("button", { name: /Tạm dừng Flashback/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Xem mã và giai đoạn của đề #7" })).toBeNull()
  })

  it("FB-07: bảng đề hiện thưởng tạm giữ và danh sách giữ có nút Trả thưởng cần xác nhận", async () => {
    const user = userEvent.setup()
    renderPage()
    const roundsTable = (await screen.findAllByRole("table"))[0]
    await within(roundsTable).findByText("#7")
    expect(within(roundsTable).getByText("Thưởng tạm giữ (xu)")).toBeTruthy()

    const release = await screen.findByRole("button", { name: "Trả thưởng đề #7 cho lan.nguyen" })
    expect(screen.getAllByText("Cùng số điện thoại").length).toBeGreaterThan(0)
    await user.click(release)
    expect(callsTo("/admin/flashback/reward-holds/hold-1/release")).toHaveLength(0)
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Trả thưởng" }))
    await waitFor(() => expect(callsTo("/admin/flashback/reward-holds/hold-1/release")).toHaveLength(1))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Đã trả thưởng"))
  })

  it("FB-11i: bảng Tham số vận hành chỉ đọc", async () => {
    renderPage()
    expect(await screen.findByText("Thời lượng một đề (giờ)")).toBeTruthy()
    expect(screen.getByText("entry_fee_xu")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
