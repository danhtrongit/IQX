import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import {
  PATTERN_PATHS,
  patternLookupWire,
  patternOverviewWire,
  patternRunWire,
  patternStatusWire,
} from "./flashback-patterns-test-support"
import { FlashbackPatternsSection } from "./flashback-patterns-section"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: mocks.api,
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

installResizeObserver()

type Server = {
  status: ReturnType<typeof patternStatusWire>
  lookup: ReturnType<typeof patternLookupWire>
  overview: ReturnType<typeof patternOverviewWire>
  statusError: Error | null
  lookupError: Error | null
  recomputeError: Error | null
  /** Lần gọi tính lại được nhận thì máy chủ bắt đầu một lần chạy ngay (mặc định) hay chưa có gì xuất hiện. */
  recomputeStartsRun: boolean
}

let server: Server

const RUNNING = patternRunWire({
  id: 12,
  trigger: "admin",
  status: "running",
  finished_at: null,
  duration_ms: null,
  symbols_done: 40,
  symbols_total: 97,
  patterns_count: 150_000,
})

function resetServer(): Server {
  return {
    status: patternStatusWire(),
    lookup: patternLookupWire(),
    overview: patternOverviewWire(),
    statusError: null,
    lookupError: null,
    recomputeError: null,
    recomputeStartsRun: true,
  }
}

function install() {
  mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === PATTERN_PATHS.status) {
      if (server.statusError) throw server.statusError
      return server.status
    }
    if (path.startsWith(`${PATTERN_PATHS.lookup}?`)) {
      if (server.lookupError) throw server.lookupError
      return server.lookup
    }
    if (path === PATTERN_PATHS.overview) return server.overview
    if (path === PATTERN_PATHS.recompute && init?.method === "POST") {
      if (server.recomputeError) throw server.recomputeError
      if (server.recomputeStartsRun) {
        server.status = patternStatusWire({ running: RUNNING, latest: RUNNING })
      }
      return { accepted: true, mode: "inline", version: 3, detector_version: 1 }
    }
    throw new Error(`Không có route giả lập: ${path}`)
  })
}

const callsTo = (path: string, method?: string) =>
  mocks.api.mock.calls.filter(
    ([called, init]) =>
      (called === path || String(called).startsWith(`${path}?`)) && (method === undefined || init?.method === method),
  )

function renderSection(symbolOptions?: string[]) {
  return renderRoute(
    "/admin/flashback",
    "/admin/flashback",
    <FlashbackPatternsSection datasetSignature="3.0.0" symbolOptions={symbolOptions} />,
  )
}

/** Giá trị (dd) của một ô trong danh sách chi tiết theo nhãn (dt). */
function field(label: string): string {
  return screen.getByText(label).closest("div")?.querySelector("dd")?.textContent ?? ""
}

const recomputeButton = (name = "Tính lại mẫu nến") => screen.getByRole("button", { name }) as HTMLButtonElement

/** Điền ô tra cứu theo nhãn. */
function fillLookup({ symbol, from, to }: { symbol?: string; from?: string; to?: string }) {
  if (symbol !== undefined) fireEvent.change(screen.getByLabelText("Mã"), { target: { value: symbol } })
  if (from !== undefined) fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: from } })
  if (to !== undefined) fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: to } })
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  server = resetServer()
  install()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Mẫu nến · trạng thái", () => {
  it("lần tính xong: hiện phiên bản kho, bộ nhận diện, thời gian, tổng số mẫu, số mã lỗi và giá gốc", async () => {
    renderSection()
    expect(await screen.findByRole("heading", { name: "Mẫu nến", level: 3 })).toBeTruthy()
    expect(await screen.findByText("Mẫu nến của kho phiên bản 3")).toBeTruthy()
    expect(screen.getByText("Đã xong")).toBeTruthy()
    expect(field("Phiên bản kho")).toBe("3")
    expect(field("Bộ nhận diện của mã nguồn")).toBe("1")
    expect(field("Bộ nhận diện đang dùng")).toBe("1")
    expect(field("Lần tính gần nhất")).toMatch(/^Chạy bù cho kho đã có/)
    expect(field("Thời gian tính")).toBe("2 phút 5 giây")
    expect(field("Tổng số mẫu")).toBe("482.310")
    expect(field("Số mã tính lỗi")).toBe("0")
    expect(field("Giá gốc cho 4 thẻ Việt Nam")).toBe("97 mã, 320.000 phiên")
    expect(recomputeButton().disabled).toBe(false)
    // Không có cảnh báo thì không hiện gì.
    expect(screen.queryAllByRole("alert")).toHaveLength(0)
  })

  it("lần tính đang chạy: hiện tiến độ, khoá nút và tự đọc lại tới khi xong", async () => {
    server.status = patternStatusWire({ running: RUNNING, latest: RUNNING })
    renderSection()
    const progress = await screen.findByRole("status")
    expect(within(progress).getByText("Đang tính mẫu nến: kho phiên bản 3, bộ nhận diện 1")).toBeTruthy()
    expect(within(progress).getByText("40/97 mã")).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: "Tiến độ tính mẫu nến" }).getAttribute("aria-valuenow")).toBe("41")
    // Tổng số mẫu và số mã lỗi là của lần tính đang dùng cho ván, không phải lần đang chạy dở.
    expect(field("Tổng số mẫu")).toBe("482.310")
    const button = recomputeButton("Đang tính mẫu nến")
    expect(button.disabled).toBe(true)
    expect(callsTo(PATTERN_PATHS.overview)).toHaveLength(1)

    // Máy chủ tính xong; nhịp đọc khi có lần tính đang chạy là 3 giây.
    const finished = patternRunWire({ id: 12, trigger: "admin", patterns_count: 500_000, failed_count: 2 })
    server.status = patternStatusWire({ latest: finished, used: finished })
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 6_000 })
    expect(recomputeButton().disabled).toBe(false)
    expect(field("Tổng số mẫu")).toBe("500.000")
    expect(field("Số mã tính lỗi")).toBe("2")
    // Tổng quan tự tải lại theo lần tính mới đang dùng.
    await waitFor(() => expect(callsTo(PATTERN_PATHS.overview)).toHaveLength(2))
  }, 15_000)

  it("lần tính gần nhất thất bại và bộ nhận diện đã đổi: hiện lý do và nhãn Cần tính lại", async () => {
    const failed = patternRunWire({
      id: 12,
      status: "failed",
      trigger: "detector",
      patterns_count: 0,
      log: { error: "Kết nối cơ sở dữ liệu bị ngắt" },
    })
    server.status = patternStatusWire({ detector_version: 2, outdated: true, latest: failed })
    renderSection()
    expect(await screen.findByText("Lần tính gần nhất thất bại: Kết nối cơ sở dữ liệu bị ngắt.")).toBeTruthy()
    expect(screen.getByText("Thất bại")).toBeTruthy()
    expect(screen.getByText("Cần tính lại")).toBeTruthy()
    expect(field("Bộ nhận diện của mã nguồn")).toBe("2")
    expect(field("Bộ nhận diện đang dùng")).toBe("1")
    expect(recomputeButton().disabled).toBe(false)
  })

  it("chưa có kho đang dùng: giải thích, khoá nút và không hiện tra cứu", async () => {
    server.status = patternStatusWire({ version: null, latest: null, used: null, raw: { symbols: 0, sessions: 0 } })
    renderSection()
    expect(await screen.findByText("Chưa có kho dữ liệu đang dùng")).toBeTruthy()
    expect(recomputeButton().disabled).toBe(true)
    expect(screen.queryByLabelText("Mã")).toBeNull()
    expect(callsTo(PATTERN_PATHS.overview)).toHaveLength(0)
  })

  it("lỗi tải trạng thái: báo lỗi, khoá nút và cho thử lại", async () => {
    const user = userEvent.setup()
    server.statusError = new Error("Máy chủ không trả lời")
    renderSection()
    expect(await screen.findByText("Không tải được trạng thái mẫu nến")).toBeTruthy()
    expect(screen.getByText("Máy chủ không trả lời")).toBeTruthy()
    expect(recomputeButton().disabled).toBe(true)

    server.statusError = null
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByText("Mẫu nến của kho phiên bản 3")).toBeTruthy()
    expect(recomputeButton().disabled).toBe(false)
  })
})

describe("Mẫu nến · Tính lại mẫu nến", () => {
  it("hỏi xác nhận, gửi đúng một yêu cầu rồi hiện tiến độ và khoá nút", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")

    await user.click(recomputeButton())
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Tính lại mẫu nến?")).toBeTruthy()
    expect(within(dialog).getByText(/kho phiên bản 3 bằng bộ nhận diện 1/)).toBeTruthy()
    expect(within(dialog).getByText(/Ván chơi vẫn chạy bình thường trong lúc tính/)).toBeTruthy()
    // Chưa gửi gì cho tới khi xác nhận.
    expect(callsTo(PATTERN_PATHS.recompute)).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Tính lại mẫu nến" }))
    await waitFor(() => expect(callsTo(PATTERN_PATHS.recompute, "POST")).toHaveLength(1))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Đã gửi yêu cầu tính lại mẫu nến"))

    const progress = await screen.findByRole("status")
    expect(within(progress).getByText("40/97 mã")).toBeTruthy()
    const locked = recomputeButton("Đang tính mẫu nến")
    expect(locked.disabled).toBe(true)
    await user.click(locked)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(callsTo(PATTERN_PATHS.recompute, "POST")).toHaveLength(1)
  })

  it("máy chủ báo đang có lần tính khác (409): báo rõ và đóng hộp thoại; lỗi khác giữ hộp thoại mở", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")

    server.recomputeError = new ApiError("Đang có một lần tính mẫu nến chạy", 409, { code: "PATTERN_RUN_RUNNING" })
    await user.click(recomputeButton())
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Tính lại mẫu nến" }))
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Đang có một lần tính mẫu nến chạy. Hãy chờ cho tới khi xong rồi bấm lại.",
      ),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // Trạng thái được đọc lại để thấy lần tính đang chạy.
    await waitFor(() => expect(callsTo(PATTERN_PATHS.status).length).toBeGreaterThan(1))

    mocks.toast.error.mockReset()
    server.recomputeError = new ApiError("Service Unavailable", 503, { code: "SERVICE_UNAVAILABLE" })
    await user.click(recomputeButton())
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Tính lại mẫu nến" }))
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Máy chủ chưa nhận được yêu cầu tính lại mẫu nến. Hãy thử lại sau ít phút.",
      ),
    )
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("yêu cầu đã nhận nhưng chưa thấy lần tính nào: hiện đang chờ, khoá nút, rồi báo máy chủ có thể bận", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    server.recomputeStartsRun = false
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")

    await user.click(recomputeButton())
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Tính lại mẫu nến" }))

    expect(await screen.findByText("Đã gửi yêu cầu tính lại mẫu nến. Đang chờ máy chủ bắt đầu.")).toBeTruthy()
    expect(recomputeButton("Đang tính mẫu nến").disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000)
    })
    expect(await screen.findByText("Chưa thấy lần tính nào bắt đầu")).toBeTruthy()
    expect(screen.queryByText("Đã gửi yêu cầu tính lại mẫu nến. Đang chờ máy chủ bắt đầu.")).toBeNull()
    // Hết chờ thì cho bấm lại.
    expect(recomputeButton().disabled).toBe(false)
  })
})

describe("Mẫu nến · tra cứu", () => {
  it("gửi mã viết hoa và khoảng ngày, hiện bảng theo bậc có màu bậc, tên thẻ, số lần và dòng tổng", async () => {
    const user = userEvent.setup()
    const { container } = renderSection(["HPG", "FPT"])
    await screen.findByText("Mẫu nến của kho phiên bản 3")
    // Gợi ý mã lấy từ kho đang dùng.
    expect(container.querySelectorAll("datalist option")).toHaveLength(2)

    fillLookup({ symbol: "hpg", from: "2025-03-01", to: "2025-06-30" })
    await user.click(screen.getByRole("button", { name: "Tra cứu" }))

    const table = await screen.findByRole("table", { name: "Số lần theo từng thẻ" })
    expect(callsTo(PATTERN_PATHS.lookup)).toHaveLength(1)
    expect(callsTo(PATTERN_PATHS.lookup)[0]![0]).toBe(
      `${PATTERN_PATHS.lookup}?symbol=HPG&from=2025-03-01&to=2025-06-30`,
    )
    expect(screen.getByText("HPG, 01/03/2025 đến 30/06/2025: 26 mẫu")).toBeTruthy()

    // Bậc 1 có màu bậc 1 và tổng 14 + 6.
    const tier1 = table.querySelector("[data-tier='1']") as HTMLElement
    expect(within(tier1).getByText("1 NẾN")).toBeTruthy()
    expect(within(tier1).getByText("2 thẻ")).toBeTruthy()
    expect(within(tier1).getByText("20")).toBeTruthy()
    expect((tier1.querySelector("[aria-hidden='true']") as HTMLElement).style.backgroundColor).toBe("rgb(47, 123, 245)")
    expect(table.querySelector("[data-tier='2']")?.textContent).toContain("2 NẾN")
    expect(table.querySelector("[data-tier='3']")?.textContent).toContain("3 NẾN")

    const doji = within(table).getByText("Doji").closest("tr") as HTMLElement
    expect(within(doji).getByText("14")).toBeTruthy()
    const total = within(table).getByText("Tổng cộng").closest("tr") as HTMLElement
    expect(within(total).getByText("26")).toBeTruthy()
  })

  it("chọn Tất cả mã thì không gửi mã; kết quả rỗng được giải thích", async () => {
    const user = userEvent.setup()
    server.lookup = patternLookupWire({ symbol: null, rows: [] })
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")

    await user.click(screen.getByRole("button", { name: "Tất cả mã" }))
    expect(screen.getByRole("button", { name: "Tất cả mã" }).getAttribute("aria-pressed")).toBe("true")
    // Chọn Tất cả mã thì ô mã biến mất.
    expect(screen.queryByLabelText("Mã")).toBeNull()
    fillLookup({ from: "2025-03-01", to: "2025-03-31" })
    await user.click(screen.getByRole("button", { name: "Tra cứu" }))

    expect(await screen.findByText(/Không có mẫu nến nào trong khoảng ngày này/)).toBeTruthy()
    expect(callsTo(PATTERN_PATHS.lookup)[0]![0]).toBe(`${PATTERN_PATHS.lookup}?from=2025-03-01&to=2025-03-31`)
    expect(screen.getByText("Tất cả mã, 01/03/2025 đến 31/03/2025: 0 mẫu")).toBeTruthy()
  })

  it("kiểm tra ô nhập trước khi gọi máy chủ", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")
    const submit = screen.getByRole("button", { name: "Tra cứu" })

    await user.click(submit)
    expect(screen.getByText("Nhập mã cổ phiếu hoặc chọn Tất cả mã.")).toBeTruthy()

    fillLookup({ symbol: "HPG" })
    await user.click(submit)
    expect(screen.getByText("Chọn ngày bắt đầu.")).toBeTruthy()

    fillLookup({ from: "2025-06-30", to: "2025-03-01" })
    await user.click(submit)
    expect(screen.getByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeTruthy()

    expect(callsTo(PATTERN_PATHS.lookup)).toHaveLength(0)

    // Sửa đúng thì gọi máy chủ và xoá thông báo lỗi.
    fillLookup({ from: "2025-03-01", to: "2025-06-30" })
    await user.click(submit)
    await screen.findByRole("table", { name: "Số lần theo từng thẻ" })
    expect(screen.queryByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeNull()
  })

  it("lỗi từ máy chủ: báo lỗi và cho thử lại", async () => {
    const user = userEvent.setup()
    server.lookupError = new ApiError("Ngày phải có dạng YYYY-MM-DD", 400, { code: "INVALID_DATE" })
    renderSection()
    await screen.findByText("Mẫu nến của kho phiên bản 3")

    fillLookup({ symbol: "HPG", from: "2025-03-01", to: "2025-06-30" })
    await user.click(screen.getByRole("button", { name: "Tra cứu" }))
    expect(await screen.findByText("Không tra cứu được")).toBeTruthy()
    expect(screen.getByText("Ngày phải có dạng YYYY-MM-DD")).toBeTruthy()

    server.lookupError = null
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("table", { name: "Số lần theo từng thẻ" })).toBeTruthy()
  })
})

describe("Mẫu nến · tổng quan kho", () => {
  it("nhóm theo bậc, tô thẻ 0 lần và cho lọc riêng các thẻ đó", async () => {
    const user = userEvent.setup()
    renderSection()
    const table = await screen.findByRole("table", { name: "Số lần gặp của từng thẻ trên cả kho" })
    expect(screen.getByText("20.600 mẫu trên 4 thẻ")).toBeTruthy()
    expect(screen.getByText("2 thẻ chưa gặp lần nào")).toBeTruthy()
    expect(within(table).getByText("Số nến của mẫu")).toBeTruthy()
    expect(table.querySelector("[data-tier='1']")?.textContent).toContain("12.400")
    expect(table.querySelector("[data-tier='2']")?.textContent).toContain("8.200")

    const zeroRow = within(table).getByText("Hammer").closest("tr") as HTMLElement
    expect(within(zeroRow).getByText("Chưa gặp")).toBeTruthy()
    expect(zeroRow.className).toContain("bg-status-warning")
    // Thẻ Việt Nam 0 lần được ghi chú để biết thường do thiếu giá gốc.
    const vnRow = within(table).getByText("Limit Up Lock").closest("tr") as HTMLElement
    expect(within(vnRow).getByText("Thẻ Việt Nam")).toBeTruthy()
    expect(within(vnRow).getByText("Chưa gặp")).toBeTruthy()
    // Thẻ có số lần thì không tô.
    const okRow = within(table).getByText("Doji").closest("tr") as HTMLElement
    expect(within(okRow).queryByText("Chưa gặp")).toBeNull()
    expect(okRow.className).not.toContain("bg-status-warning")

    await user.click(screen.getByRole("button", { name: "Chỉ thẻ 0 lần" }))
    expect(screen.getByRole("button", { name: "Chỉ thẻ 0 lần" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(table).queryByText("Doji")).toBeNull()
    expect(within(table).getByText("Hammer")).toBeTruthy()
    expect(within(table).getByText("Limit Up Lock")).toBeTruthy()
  })

  it("kho chưa có mẫu nến tính sẵn thì nói rõ thay vì hiện toàn số 0", async () => {
    server.status = patternStatusWire({ latest: null, used: null, outdated: true })
    server.overview = patternOverviewWire([], null)
    renderSection()
    expect(await screen.findByText("Kho chưa có mẫu nến tính sẵn")).toBeTruthy()
    expect(screen.queryByRole("table", { name: "Số lần gặp của từng thẻ trên cả kho" })).toBeNull()
    expect(screen.getByText("Chưa có lần tính nào hoàn tất: ván vẫn chơi bình thường, chỉ chưa hiện thẻ.", { exact: false })).toBeTruthy()
  })
})

describe("Mẫu nến · cảnh báo", () => {
  it("hiện cảnh báo tính lỗi và thiếu giá gốc, mức cao và mức vừa có kiểu khác nhau", async () => {
    server.status = patternStatusWire({
      warnings: [
        {
          code: "pattern_failed",
          level: "high",
          message: "Tính mẫu nến thất bại (bộ nhận diện 1): hết bộ nhớ",
          at: "2026-11-05T02:05:00.000Z",
        },
        {
          code: "pattern_raw_missing",
          level: "medium",
          message: "Thiếu giá gốc nên 4 thẻ Việt Nam không xét được ở 3 mã và 1.200 phiên.",
          at: null,
        },
      ],
    })
    renderSection()
    expect(await screen.findByText("Tính mẫu nến thất bại")).toBeTruthy()
    expect(screen.getByText("Thiếu giá gốc cho 4 thẻ Việt Nam")).toBeTruthy()
    expect(screen.getByText(/hết bộ nhớ/)).toBeTruthy()
    expect(screen.getByText(/ở 3 mã và 1\.200 phiên/)).toBeTruthy()

    const alerts = screen.getAllByRole("alert")
    expect(alerts).toHaveLength(2)
    expect(alerts[0]!.className).toContain("text-destructive")
    expect(alerts[1]!.className).toContain("border-status-warning")
    expect(alerts[1]!.className).not.toContain("text-destructive")
  })
})
