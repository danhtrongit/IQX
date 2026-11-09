import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { installResizeObserver, renderRoute } from "@/pages/admin/team-leads/test-support"

import { FlashbackDatasetSection } from "./flashback-dataset-section"
import {
  DATASET_CONFIG_WIRE,
  DATASET_SYMBOLS_WIRE,
  datasetBuildingWire,
  datasetStatusWire,
  datasetSymbolsWire,
  datasetVersionWire,
  datasetVersionsWire,
} from "./flashback-dataset-test-support"
import { defaultPatternRoute } from "./flashback-patterns-test-support"

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

type Status = ReturnType<typeof datasetStatusWire>

/** Máy chủ giả: đổi `status` giữa các lần đọc để mô phỏng một lần làm mới đang chạy. */
type Server = {
  status: Status
  symbols: ReturnType<typeof datasetSymbolsWire>
  versions: ReturnType<typeof datasetVersionsWire>
  statusError: Error | null
  refreshError: Error | null
  /** Lần gọi refresh được nhận thì máy chủ bắt đầu dựng ngay (mặc định) hay vẫn xếp hàng. */
  refreshStartsBuild: boolean
  configError: Error | null
}

let server: Server

const SYMBOLS_V2 = datasetSymbolsWire(2, "retired", DATASET_SYMBOLS_WIRE.slice(0, 2))

function resetServer(): Server {
  return {
    status: datasetStatusWire(),
    symbols: datasetSymbolsWire(),
    versions: datasetVersionsWire(),
    statusError: null,
    refreshError: null,
    refreshStartsBuild: true,
    configError: null,
  }
}

function install() {
  mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/admin/flashback/dataset") {
      if (server.statusError) throw server.statusError
      return server.status
    }
    if (path === "/admin/flashback/dataset/symbols") return server.symbols
    if (path === "/admin/flashback/dataset/symbols?version=2") return SYMBOLS_V2
    if (path === "/admin/flashback/dataset/versions") return server.versions
    if (path === "/admin/flashback/dataset/refresh" && init?.method === "POST") {
      if (server.refreshError) throw server.refreshError
      if (server.refreshStartsBuild) server.status = datasetStatusWire({ ...server.status, building: datasetBuildingWire() })
      return { accepted: true, mode: "queued", job_id: "job-1" }
    }
    if (path === "/admin/flashback/dataset/config" && init?.method === "PUT") {
      if (server.configError) throw server.configError
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      return { config: { ...DATASET_CONFIG_WIRE, ...body }, config_invalid: [] }
    }
    // Khối "Mẫu nến" (Candle Dojo v1.3) nằm cùng mục; test riêng của nó ở flashback-patterns-section.test.tsx.
    const pattern = defaultPatternRoute(path)
    if (pattern !== undefined) return pattern
    throw new Error(`Không có route giả lập: ${path}`)
  })
}

const callsTo = (path: string, method?: string) =>
  mocks.api.mock.calls.filter(([called, init]) => called === path && (method === undefined || init?.method === method))

function renderSection() {
  return renderRoute("/admin/flashback", "/admin/flashback", <FlashbackDatasetSection />)
}

/** Khối con của mục kho dữ liệu theo tiêu đề h3. */
async function block(title: string | RegExp) {
  const heading = await screen.findByRole("heading", { name: title })
  return within(heading.closest("section") as HTMLElement)
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

describe("Kho dữ liệu Flashback · phiên bản đang dùng", () => {
  it("hiện số phiên bản, ngày tạo, số mã và khoảng thời gian dữ liệu", async () => {
    renderSection()
    expect(await screen.findByRole("heading", { name: "Kho dữ liệu Flashback", level: 2 })).toBeTruthy()
    expect(await screen.findByText("Phiên bản đang dùng: 3")).toBeTruthy()
    expect(screen.getByText("20/03/2012 đến 30/10/2026")).toBeTruthy()
    expect(screen.getByText("DNSE:x1000:adjusted")).toBeTruthy()
    expect(screen.getAllByText("Dòng lệnh khi triển khai").length).toBeGreaterThan(0)
    // Số mã hợp lệ và số mã bị loại.
    const info = screen.getByText("Số mã hợp lệ").closest("div") as HTMLElement
    expect(within(info).getByText("97")).toBeTruthy()
    const excluded = screen.getByText("Số mã bị loại").closest("div") as HTMLElement
    expect(within(excluded).getByText("3")).toBeTruthy()
  })

  it("nói rõ lịch làm mới tự động và kết quả lần làm mới gần nhất", async () => {
    renderSection()
    expect(await screen.findByText(/Chưa tới hạn: kho được tạo sau kỳ cơ cấu 10\/08\/2026/)).toBeTruthy()
    expect(screen.getByText("Lần làm mới gần nhất")).toBeTruthy()
    expect(screen.getByText("Thành công")).toBeTruthy()
  })

  it("chưa có phiên bản nào: giải thích và cho tạo phiên bản đầu tiên", async () => {
    server.status = datasetStatusWire({
      active: null,
      warnings: [
        {
          code: "no_active_version",
          level: "high",
          message: 'Chưa có phiên bản kho đang dùng: phòng chơi không bắt đầu được ván. Bấm "Làm mới kho".',
          at: null,
        },
      ],
      schedule: { due: true, reason: "no_active_version", anchor: null },
    })
    server.symbols = { version: null, status: null, symbols: [] } as unknown as typeof server.symbols
    server.versions = { versions: [] }
    renderSection()
    expect((await screen.findAllByText("Chưa có kho dữ liệu đang dùng")).length).toBeGreaterThan(0)
    expect(screen.getByText(/Phòng chơi chưa bắt đầu được ván/)).toBeTruthy()
    expect(await screen.findByText("Chưa có danh sách mã: kho chưa có phiên bản nào.")).toBeTruthy()
    expect(await screen.findByText(/Chưa có phiên bản nào\. Bấm Làm mới kho/)).toBeTruthy()
    expect(screen.getByText(/Tới hạn: chưa có kho đang dùng/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("lỗi tải tổng quan: báo lỗi, khoá nút làm mới và cho thử lại", async () => {
    const user = userEvent.setup()
    server.statusError = new Error("Máy chủ không trả lời")
    renderSection()
    expect(await screen.findByText("Không tải được kho dữ liệu")).toBeTruthy()
    expect(screen.getByText("Máy chủ không trả lời")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(true)

    server.statusError = null
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByText("Phiên bản đang dùng: 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("Kho dữ liệu Flashback · danh sách mã", () => {
  it("có các cột mã, số phiên, ngày đầu, ngày cuối, trạng thái, lý do bị loại", async () => {
    renderSection()
    const symbols = await block(/Danh sách mã của phiên bản 3/)
    await symbols.findByText("FPT")
    const headers = symbols.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    expect(headers.slice(0, 6)).toEqual(["Mã", "Số phiên", "Ngày đầu", "Ngày cuối", "Trạng thái", "Lý do bị loại"])

    const fpt = symbols.getByText("FPT").closest("tr") as HTMLElement
    expect(within(fpt).getByText("3.391")).toBeTruthy()
    expect(within(fpt).getByText("20/03/2012")).toBeTruthy()
    expect(within(fpt).getByText("30/10/2026")).toBeTruthy()
    expect(within(fpt).getByText("Hợp lệ")).toBeTruthy()

    const aaa = symbols.getByText("AAA").closest("tr") as HTMLElement
    expect(within(aaa).getByText("Bị loại")).toBeTruthy()
    expect(within(aaa).getByText("Chưa đủ lịch sử (200/312 phiên)")).toBeTruthy()
    // Mã không tải được dữ liệu: không có ngày, hiện dấu gạch chứ không phải ngày giả.
    const bbb = symbols.getByText("BBB").closest("tr") as HTMLElement
    expect(within(bbb).getByText("Lỗi tải dữ liệu: timeout")).toBeTruthy()
    expect(within(bbb).getAllByText("—").length).toBeGreaterThanOrEqual(2)
    // Cơ sở tính giá trị giao dịch của mã dùng giá ước tính.
    const vnm = symbols.getByText("VNM").closest("tr") as HTMLElement
    expect(within(vnm).getByText("Ước tính từ giá nhân khối lượng")).toBeTruthy()
  })

  it("lọc theo trạng thái", async () => {
    const user = userEvent.setup()
    renderSection()
    const symbols = await block(/Danh sách mã của phiên bản 3/)
    await symbols.findByText("FPT")

    await user.click(symbols.getByRole("button", { name: "Bị loại" }))
    expect(symbols.queryByText("FPT")).toBeNull()
    expect(symbols.getByText("AAA")).toBeTruthy()
    expect(symbols.getByText("BBB")).toBeTruthy()
    expect(symbols.getByRole("button", { name: "Bị loại" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(symbols.getByRole("button", { name: "Hợp lệ" }))
    expect(symbols.queryByText("AAA")).toBeNull()
    expect(symbols.getByText("HPG")).toBeTruthy()

    await user.click(symbols.getByRole("button", { name: "Tất cả" }))
    expect(symbols.getByText("AAA")).toBeTruthy()
    expect(symbols.getByText("FPT")).toBeTruthy()
  })

  it("phân trang khi có nhiều mã hơn một trang", async () => {
    const user = userEvent.setup()
    server.symbols = datasetSymbolsWire(
      3,
      "active",
      Array.from({ length: 60 }, (_, index) => ({
        ...DATASET_SYMBOLS_WIRE[0]!,
        symbol: `M${String(index).padStart(2, "0")}`,
      })),
    )
    renderSection()
    const symbols = await block(/Danh sách mã của phiên bản 3/)
    await symbols.findByText("M00")
    expect(symbols.queryByText("M25")).toBeNull()
    expect(symbols.getByText(/Trang 1\/3/)).toBeTruthy()
    await user.click(symbols.getByRole("button", { name: "Sau" }))
    expect(await symbols.findByText("M25")).toBeTruthy()
    expect(symbols.queryByText("M00")).toBeNull()
  })
})

describe("Kho dữ liệu Flashback · cảnh báo", () => {
  it("hiện cảnh báo làm mới thất bại, kho dưới ngưỡng và ván không cắt được đề", async () => {
    server.status = datasetStatusWire({
      latest_failed: datasetVersionWire({
        version: 4,
        status: "failed",
        symbols_count: 72,
        excluded_count: 28,
        log: { outcome: "failed", error: "Kho mới chỉ có 72 mã hợp lệ (cần ít nhất 80)" },
      }),
      warnings: [
        {
          code: "too_few_symbols",
          level: "high",
          message: "Phiên bản 4 chỉ có 72 mã hợp lệ (cần ≥ 80) nên không được kích hoạt; đang giữ kho cũ.",
          at: "2026-11-04T03:20:00.000Z",
        },
        {
          code: "refresh_failed",
          level: "high",
          message: "Làm mới kho thất bại (phiên bản 4): nguồn dữ liệu không trả lời.",
          at: "2026-11-04T03:20:00.000Z",
        },
        {
          code: "no_cut",
          level: "high",
          message: "Có ván không bắt đầu được vì không tìm được điểm cắt (2 cảnh báo trong 7 ngày qua).",
          at: "2026-11-03T08:00:00.000Z",
        },
        { code: "config_invalid", level: "medium", message: "Tham số không hợp lệ đã được thay bằng mặc định: min_symbols.", at: null },
      ],
    })
    renderSection()
    const warnings = await block("Cảnh báo")
    expect(await warnings.findByText("Kho có ít mã hơn ngưỡng tối thiểu")).toBeTruthy()
    expect(warnings.getByText("Làm mới kho thất bại")).toBeTruthy()
    expect(warnings.getByText("Có ván không bắt đầu được")).toBeTruthy()
    expect(warnings.getByText("Tham số kho không hợp lệ")).toBeTruthy()
    expect(warnings.getByText(/chỉ có 72 mã hợp lệ \(cần ≥ 80\)/)).toBeTruthy()
    expect(warnings.getByText(/không tìm được điểm cắt/)).toBeTruthy()
    expect(warnings.getAllByRole("alert")).toHaveLength(4)

    // Lần làm mới gần nhất là bản thất bại, kèm lý do.
    expect(screen.getByText("Kho mới chỉ có 72 mã hợp lệ (cần ít nhất 80)")).toBeTruthy()
  })

  it("không có cảnh báo thì nói rõ", async () => {
    renderSection()
    expect(await screen.findByText("Không có cảnh báo nào về kho dữ liệu.")).toBeTruthy()
  })
})

describe("Kho dữ liệu Flashback · nút Làm mới kho", () => {
  it("hỏi xác nhận, gửi đúng một yêu cầu rồi hiện tiến độ và khoá nút", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")

    await user.click(screen.getByRole("button", { name: "Làm mới kho" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Làm mới kho dữ liệu?")).toBeTruthy()
    expect(within(dialog).getByText(/phiên bản 3, 97 mã\) và các ván đang chơi không bị ảnh hưởng/)).toBeTruthy()
    expect(within(dialog).getByText(/ít nhất 80 mã hợp lệ/)).toBeTruthy()
    // Chưa gửi gì cho tới khi xác nhận.
    expect(callsTo("/admin/flashback/dataset/refresh")).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Làm mới kho" }))
    await waitFor(() => expect(callsTo("/admin/flashback/dataset/refresh", "POST")).toHaveLength(1))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Đã gửi yêu cầu làm mới kho"))

    // Tiến độ do máy chủ báo.
    const progress = await screen.findByRole("status")
    expect(within(progress).getByText("Đang làm mới kho: phiên bản 4")).toBeTruthy()
    expect(within(progress).getByText("40/100 mã")).toBeTruthy()
    expect(within(progress).getByText(/Tải lịch sử giá và tính mảng cộng dồn từng mã/)).toBeTruthy()
    expect(within(progress).getByText(/Hợp lệ 38, bị loại 2/)).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: "Tiến độ làm mới kho" }).getAttribute("aria-valuenow")).toBe("40")

    // Không cho bấm thêm.
    const running = screen.getByRole("button", { name: "Đang làm mới kho" }) as HTMLButtonElement
    expect(running.disabled).toBe(true)
    await user.click(running)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(callsTo("/admin/flashback/dataset/refresh", "POST")).toHaveLength(1)
  })

  it("mở trang khi kho đang được làm mới: nút bị khoá ngay, không cần bấm", async () => {
    server.status = datasetStatusWire({ building: datasetBuildingWire({ trigger: "scheduled" }) })
    renderSection()
    const progress = await screen.findByRole("status")
    expect(within(progress).getByText(/Tự động theo lịch/i)).toBeTruthy()
    const button = screen.getByRole("button", { name: "Đang làm mới kho" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(callsTo("/admin/flashback/dataset/refresh")).toHaveLength(0)
  })

  it("lần dựng mất tín hiệu sống: báo có thể đã dừng và cho bấm lại", async () => {
    server.status = datasetStatusWire({ building: datasetBuildingWire({ stale: true }) })
    renderSection()
    const progress = await screen.findByRole("status")
    expect(within(progress).getByText(/không còn báo tiến độ/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("máy chủ từ chối vì đang có lần làm mới khác (409): báo lỗi, đóng hộp thoại và hiện tiến độ", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")
    // Quản trị viên khác vừa bấm trước: lần đọc kế tiếp sẽ thấy lần dựng đang chạy.
    server.refreshError = new ApiError(
      "Đang có một lần làm mới kho chạy (phiên bản 4), hãy chờ cho tới khi xong",
      409,
      "DATASET_REFRESH_RUNNING",
    )
    server.status = datasetStatusWire({ building: datasetBuildingWire({ trigger: "manual" }) })

    await user.click(screen.getByRole("button", { name: "Làm mới kho" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Làm mới kho" }))

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Đang có một lần làm mới kho chạy (phiên bản 4), hãy chờ cho tới khi xong"),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(await screen.findByText("Đang làm mới kho: phiên bản 4")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Đang làm mới kho" }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("lỗi khác khi gửi yêu cầu: báo lỗi và giữ hộp thoại để thử lại", async () => {
    const user = userEvent.setup()
    server.refreshError = new Error("Hàng đợi tác vụ không phản hồi")
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")

    await user.click(screen.getByRole("button", { name: "Làm mới kho" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Làm mới kho" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Hàng đợi tác vụ không phản hồi"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
    // Không có tiến độ giả: máy chủ không nhận yêu cầu.
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("yêu cầu đã nhận nhưng chưa thấy lần dựng nào: hiện đang chờ, khoá nút, rồi báo tác vụ nền có thể bận", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    server.refreshStartsBuild = false
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")

    await user.click(screen.getByRole("button", { name: "Làm mới kho" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Làm mới kho" }))

    expect(await screen.findByText("Đã gửi yêu cầu làm mới kho. Đang chờ tác vụ nền bắt đầu.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Đang làm mới kho" }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(91_000)
    })
    expect(await screen.findByText("Chưa thấy lần làm mới nào bắt đầu")).toBeTruthy()
    expect(screen.queryByText("Đã gửi yêu cầu làm mới kho. Đang chờ tác vụ nền bắt đầu.")).toBeNull()
    // Hết chờ thì cho bấm lại.
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("theo dõi tiến độ tới khi xong: phiên bản mới thay phiên bản cũ", async () => {
    server.status = datasetStatusWire({ building: datasetBuildingWire() })
    renderSection()
    await screen.findByText("Đang làm mới kho: phiên bản 4")
    expect(screen.getByText("Phiên bản đang dùng: 3")).toBeTruthy()

    // Máy chủ dựng xong và kích hoạt phiên bản 4.
    server.status = datasetStatusWire({
      active: datasetVersionWire({ version: 4, symbols_count: 98, excluded_count: 2, trigger: "manual" }),
    })
    server.symbols = datasetSymbolsWire(4, "active")
    server.versions = {
      versions: [datasetVersionWire({ version: 4, symbols_count: 98, excluded_count: 2 }), ...datasetVersionsWire().versions],
    }

    // Nhịp đọc khi có lần dựng đang chạy là 2 giây.
    expect(await screen.findByText("Phiên bản đang dùng: 4", {}, { timeout: 6_000 })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText("Đang làm mới kho: phiên bản 4")).toBeNull())
    expect((screen.getByRole("button", { name: "Làm mới kho" }) as HTMLButtonElement).disabled).toBe(false)
    // Danh sách mã và lịch sử tự tải lại theo phiên bản mới.
    expect(await screen.findByRole("heading", { name: /Danh sách mã của phiên bản 4/ })).toBeTruthy()
    expect(await screen.findByLabelText("Xem danh sách mã của phiên bản 4")).toBeTruthy()
  }, 15_000)
})

describe("Kho dữ liệu Flashback · lịch sử phiên bản", () => {
  it("bảng phiên bản có ngày tạo, trạng thái, số mã", async () => {
    renderSection()
    const history = await block("Lịch sử phiên bản")
    await history.findByText("#2")
    const headers = history.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    // Cột đầu là nút mở nhật ký, không có tiêu đề.
    expect(headers.slice(1, 7)).toEqual(["Phiên bản", "Ngày tạo", "Trạng thái", "Số mã", "Cách tạo", "Thời gian dựng"])

    const rows = history.getAllByRole("row").slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText("#3")).toBeTruthy()
    expect(within(rows[0]!).getByText("Đang dùng")).toBeTruthy()
    expect(within(rows[0]!).getByText("97")).toBeTruthy()
    expect(within(rows[1]!).getByText("Đã thay thế")).toBeTruthy()
    expect(within(rows[1]!).getByText("95")).toBeTruthy()
    expect(within(rows[1]!).getByText("Tự động theo lịch")).toBeTruthy()
    expect(within(rows[2]!).getByText("Thất bại")).toBeTruthy()
    expect(within(rows[2]!).getByText("Quản trị viên bấm Làm mới kho")).toBeTruthy()
    expect(within(rows[0]!).getByText("1 phút 10 giây")).toBeTruthy()
  })

  it("mở một dòng để đọc nhật ký: rổ mã, lịch phiên, nguồn, mã bị loại", async () => {
    const user = userEvent.setup()
    renderSection()
    const history = await block("Lịch sử phiên bản")
    await history.findByText("#3")

    await user.click(history.getAllByRole("button", { name: "Xem chi tiết" })[0]!)
    expect(await history.findByText("VN100: 100 mã (VCI:VN100)")).toBeTruthy()
    expect(history.getByText(/3\.400 phiên, 20\/03\/2012 đến 30\/10\/2026 \(DNSE:VNINDEX\)/)).toBeTruthy()
    expect(history.getByText("DNSE:x1000:adjusted: 97 mã")).toBeTruthy()
    expect(history.getByText("97 khớp thật, 0 một phần, 0 ước tính")).toBeTruthy()
    expect(history.getByText("120.000 điểm cắt trên 90 mã")).toBeTruthy()
    expect(history.getByText("Mã bị loại (3)")).toBeTruthy()
    expect(history.getByText("CCC").closest("li")?.textContent).toBe("CCC: Quá nhiều phiên lỗi (25%)")
    expect(history.getByText("Đủ điều kiện, đã kích hoạt")).toBeTruthy()
    expect(history.getByText("Nhật ký đầy đủ")).toBeTruthy()

    // Thu gọn lại.
    await user.click(history.getAllByRole("button", { name: "Thu gọn chi tiết" })[0]!)
    expect(history.queryByText("VN100: 100 mã (VCI:VN100)")).toBeNull()
  })

  it("nhật ký của lần thất bại nêu lý do", async () => {
    const user = userEvent.setup()
    renderSection()
    const history = await block("Lịch sử phiên bản")
    await history.findByText("#1")
    await user.click(history.getAllByRole("button", { name: "Xem chi tiết" })[2]!)
    expect(await history.findByText("Thất bại: Kho mới chỉ có 60 mã hợp lệ (cần ít nhất 80)")).toBeTruthy()
    expect(history.getByText("admin-1")).toBeTruthy()
  })

  it("Xem mã của một phiên bản cũ đổi danh sách mã và cho quay về bản đang dùng", async () => {
    const user = userEvent.setup()
    renderSection()
    const history = await block("Lịch sử phiên bản")
    await history.findByText("#2")
    expect(callsTo("/admin/flashback/dataset/symbols?version=2")).toHaveLength(0)

    await user.click(history.getByRole("button", { name: "Xem danh sách mã của phiên bản 2" }))
    await waitFor(() => expect(callsTo("/admin/flashback/dataset/symbols?version=2")).toHaveLength(1))
    const symbols = await block(/Danh sách mã của phiên bản 2/)
    await waitFor(() => expect(symbols.queryByText("VNM")).toBeNull())
    expect(symbols.getByText("FPT")).toBeTruthy()
    expect(symbols.getByText(/Đã thay thế: 2 mã hợp lệ, 0 mã bị loại/)).toBeTruthy()

    await user.click(symbols.getByRole("button", { name: "Xem bản đang dùng" }))
    const back = await block(/Danh sách mã của phiên bản 3/)
    expect(await back.findByText("VNM")).toBeTruthy()
  })

  it("Xem mã của chính bản đang dùng quay về danh sách mặc định", async () => {
    const user = userEvent.setup()
    renderSection()
    const history = await block("Lịch sử phiên bản")
    await history.findByText("#3")
    await user.click(history.getByRole("button", { name: "Xem danh sách mã của phiên bản 3" }))
    expect(callsTo("/admin/flashback/dataset/symbols?version=3")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Xem bản đang dùng" })).toBeNull()
  })
})

describe("Kho dữ liệu Flashback · tham số", () => {
  it("bảng tham số hiện giá trị hiện hành cạnh mặc định", async () => {
    server.status = datasetStatusWire({
      config: { ...DATASET_CONFIG_WIRE, min_symbols: 85, price_sources: ["VCI", "DNSE"] },
    })
    renderSection()
    const params = await block("Tham số kho dữ liệu")
    await params.findByText("Rổ mã")
    const minSymbols = params.getByText("Số mã tối thiểu để kích hoạt kho").closest("tr") as HTMLElement
    expect(within(minSymbols).getByText("85 mã")).toBeTruthy()
    expect(within(minSymbols).getByText("80 mã")).toBeTruthy()
    const liquidity = params.getByText("Thanh khoản bình quân tối thiểu").closest("tr") as HTMLElement
    expect(within(liquidity).getAllByText("3 tỷ đồng/phiên")).toHaveLength(2)
    const sources = params.getByText("Nguồn nến ngày").closest("tr") as HTMLElement
    expect(within(sources).getByText("VCI trước, DNSE dự phòng")).toBeTruthy()
    expect(within(sources).getByText("DNSE trước, VCI dự phòng")).toBeTruthy()
    const months = params.getByText("Tháng có kỳ cơ cấu VN100").closest("tr") as HTMLElement
    expect(within(months).getAllByText("tháng 2, tháng 8")).toHaveLength(2)
  })

  it("tham số sai giá trị đã bị thay bằng mặc định: nêu tên khoá", async () => {
    server.status = datasetStatusWire({ config_invalid: ["min_symbols", "warmup_sessions"] })
    renderSection()
    expect(await screen.findByText(/đang dùng mặc định: min_symbols, warmup_sessions/)).toBeTruthy()
  })

  it("đổi tham số: chỉ gửi khoá đã đổi, tỷ lệ và tiền đổi về đơn vị của máy chủ", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")
    await user.click(screen.getByRole("button", { name: "Sửa tham số" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Sửa tham số kho dữ liệu")).toBeTruthy()

    const save = within(dialog).getByRole("button", { name: "Lưu tham số" }) as HTMLButtonElement
    // Chưa đổi gì thì chưa lưu được.
    expect(save.disabled).toBe(true)
    const minSymbols = within(dialog).getByLabelText("Số mã tối thiểu để kích hoạt kho") as HTMLInputElement
    expect(minSymbols.value).toBe("80")
    expect((within(dialog).getByLabelText("Thanh khoản bình quân tối thiểu") as HTMLInputElement).value).toBe("3")
    expect((within(dialog).getByLabelText("Tỷ lệ phiên khối lượng 0 tối đa") as HTMLInputElement).value).toBe("2.5")

    await user.clear(minSymbols)
    await user.type(minSymbols, "85")
    const liquidity = within(dialog).getByLabelText("Thanh khoản bình quân tối thiểu")
    await user.clear(liquidity)
    await user.type(liquidity, "2.5")
    await user.click(within(dialog).getByRole("radio", { name: /VCI trước, DNSE dự phòng/ }))
    expect(save.disabled).toBe(false)
    await user.click(save)

    await waitFor(() => expect(callsTo("/admin/flashback/dataset/config", "PUT")).toHaveLength(1))
    const [, init] = callsTo("/admin/flashback/dataset/config", "PUT")[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      min_symbols: 85,
      min_liquidity_vnd: 2_500_000_000,
      price_sources: ["VCI", "DNSE"],
    })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu tham số kho dữ liệu"))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("giá trị ngoài khoảng: báo lỗi ngay tại ô và không cho lưu", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")
    await user.click(screen.getByRole("button", { name: "Sửa tham số" }))
    const dialog = await screen.findByRole("dialog")

    const warmup = within(dialog).getByLabelText("Số phiên khởi tạo chỉ báo (W)")
    await user.clear(warmup)
    await user.type(warmup, "99")
    expect(within(dialog).getByText("Nhập số từ 100 đến 500.")).toBeTruthy()
    expect(warmup.getAttribute("aria-invalid")).toBe("true")
    expect((within(dialog).getByRole("button", { name: "Lưu tham số" }) as HTMLButtonElement).disabled).toBe(true)

    await user.clear(warmup)
    expect(within(dialog).getByText("Nhập một số.")).toBeTruthy()

    await user.type(warmup, "300")
    expect(within(dialog).queryByText("Nhập số từ 100 đến 500.")).toBeNull()
    expect((within(dialog).getByRole("button", { name: "Lưu tham số" }) as HTMLButtonElement).disabled).toBe(false)
    expect(callsTo("/admin/flashback/dataset/config")).toHaveLength(0)
  })

  it("máy chủ từ chối tham số: báo lỗi và giữ hộp thoại", async () => {
    const user = userEvent.setup()
    server.configError = new ApiError("min_symbols phải từ 1 đến 500", 400, "VALIDATION_ERROR")
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")
    await user.click(screen.getByRole("button", { name: "Sửa tham số" }))
    const dialog = await screen.findByRole("dialog")
    const minSymbols = within(dialog).getByLabelText("Số mã tối thiểu để kích hoạt kho")
    await user.clear(minSymbols)
    await user.type(minSymbols, "90")
    await user.click(within(dialog).getByRole("button", { name: "Lưu tham số" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("min_symbols phải từ 1 đến 500"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("mở lại hộp thoại thì bắt đầu từ giá trị hiện hành của máy chủ, không giữ bản nháp cũ", async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText("Phiên bản đang dùng: 3")
    await user.click(screen.getByRole("button", { name: "Sửa tham số" }))
    let dialog = await screen.findByRole("dialog")
    const minSymbols = within(dialog).getByLabelText("Số mã tối thiểu để kích hoạt kho")
    await user.clear(minSymbols)
    await user.type(minSymbols, "99")
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await user.click(screen.getByRole("button", { name: "Sửa tham số" }))
    dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByLabelText("Số mã tối thiểu để kích hoạt kho") as HTMLInputElement).value).toBe("80")
  })
})
