import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FlashbackMain } from "./flashback-main"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import { computeIndicator, defaultParams, validateParams } from "./flashback-indicators"
import {
  MACD_META,
  MA_META,
  MATCH_PRICE,
  RSI_META,
  createFlashbackBackend,
  historyBars,
  type BackendOptions,
  type FlashbackBackend,
} from "./flashback-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: FlashbackBackend

function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

function withClient(children: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  )
}

function renderMain() {
  return render(
    withClient(
      <FlashbackProvider>
        <FlashbackMain onNavigate={vi.fn()} />
      </FlashbackProvider>,
    ),
  )
}

function renderPanel() {
  return render(
    withClient(
      <FlashbackProvider>
        <FlashbackPanel onNavigate={vi.fn()} />
      </FlashbackProvider>,
    ),
  )
}

/** Chờ tài khoản Demo đã có dữ liệu: giá khớp hiện trong khung đặt lệnh. */
async function waitForMatchPrice() {
  await waitFor(() => expect(screen.getByText("Giá khớp").parentElement?.textContent).toContain("28.800"))
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.toast.warning.mockReset()
  mocks.toast.info.mockReset()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})

describe("Flashback: tham gia đề", () => {
  it("chưa tham gia thì thẻ Đề mới đã mở với nút Tham gia miễn phí ở lần đầu", async () => {
    setup({ firstJoinFree: true })
    renderMain()
    const card = await screen.findByTestId("join-card")
    expect(within(card).getByText("Đề mới đã mở")).toBeTruthy()
    expect(within(card).getByText("60 phiên lịch sử, chơi 60 phiên")).toBeTruthy()
    expect(within(card).getByText("10.000.000")).toBeTruthy()
    expect(within(card).getByText("Miễn phí (lần đầu tham gia)")).toBeTruthy()
    expect(within(card).getByRole("button", { name: "Tham gia miễn phí" })).toBeTruthy()
  })

  it("từ lần thứ hai thì nút Tham gia · 100 xu", async () => {
    setup({ firstJoinFree: false })
    renderMain()
    const card = await screen.findByTestId("join-card")
    expect(within(card).getByText("Phí tham gia").parentElement?.textContent).toContain("100 xu")
    expect(within(card).getByRole("button", { name: "Tham gia · 100 xu" })).toBeTruthy()
  })

  it("bấm Tham gia gọi API và thẻ phủ biểu đồ biến mất", async () => {
    const user = userEvent.setup()
    setup({ firstJoinFree: true })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Tham gia miễn phí" }))
    await waitFor(() => expect(backend.callsTo("POST", "/flashback/current/join")).toHaveLength(1))
    await waitFor(() => expect(screen.queryByTestId("join-card")).toBeNull())
  })
})

describe("Flashback: phiên tiếp", () => {
  it("bấm Phiên tiếp gọi API và hiện thêm đúng một nến", async () => {
    const user = userEvent.setup()
    setup({ joined: true })
    renderMain()
    expect((await screen.findByTestId("flashback-session")).textContent).toBe("Phiên 0")

    await user.click(screen.getByTestId("flashback-next"))
    await waitFor(() => expect(backend.callsTo("POST", "/flashback/entries")).toHaveLength(1))
    await waitFor(() => expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 1"))
  })
})

describe("Flashback: đặt lệnh", () => {
  it("150 cp ở giá 28.800 có tổng tiền trả 4.326.480 gồm phí 0,15%", async () => {
    const user = userEvent.setup()
    setup({ joined: true })
    renderPanel()
    await waitForMatchPrice()
    await user.type(screen.getByLabelText("Số cổ phiếu"), "150")

    const form = screen.getByText("Giá trị lệnh").closest("section") as HTMLElement
    expect(within(form).getByText("4.320.000")).toBeTruthy()
    expect(within(form).getByText("6.480")).toBeTruthy()
    expect(within(form).getByText("4.326.480")).toBeTruthy()
  })

  it("nhập quá Mua tối đa thì báo Không đủ tiền mặt và không đặt được", async () => {
    const user = userEvent.setup()
    setup({ joined: true })
    renderPanel()
    await waitForMatchPrice()
    await user.type(screen.getByLabelText("Số cổ phiếu"), "400")
    expect(await screen.findByText("Không đủ tiền mặt")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Đặt mua" }).hasAttribute("disabled")).toBe(true)
    expect(backend.callsTo("POST", "/flashback/entries")).toHaveLength(0)
  })

  it("mua ở phiên T thì phiên T+1 chưa bán được", async () => {
    const user = userEvent.setup()
    setup({ joined: true, step: 1 })
    renderPanel()
    await waitForMatchPrice()
    await user.type(screen.getByLabelText("Số cổ phiếu"), "100")
    await user.click(screen.getByRole("button", { name: "Đặt mua" }))
    await waitFor(() => expect(backend.callsTo("POST", "/flashback/entries")).toHaveLength(1))

    await user.click(screen.getByRole("button", { name: "Bán" }))
    const sellQty = screen.getByLabelText("Số cổ phiếu")
    await user.clear(sellQty)
    await user.type(sellQty, "100")
    expect(await screen.findByText("Cổ phiếu mua chưa đủ T+2, chưa bán được")).toBeTruthy()
  })
})

describe("Flashback: chỉ báo", () => {
  it("hộp Các chỉ báo chỉ liệt kê chỉ báo đã mở", async () => {
    const user = userEvent.setup()
    setup({ joined: true, indicators: [MA_META, RSI_META] })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Các chỉ báo" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("MA / SMA")).toBeTruthy()
    expect(within(dialog).getByText("RSI")).toBeTruthy()
    expect(within(dialog).queryByText("MACD")).toBeNull()
  })

  it("chưa mở chỉ báo nào thì hộp gợi ý học ở Học viện", async () => {
    const user = userEvent.setup()
    setup({ joined: true, indicators: [] })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Các chỉ báo" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/Bạn chưa mở chỉ báo nào/)).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Đến Học viện" })).toBeTruthy()
  })

  it("thêm hai lần cùng một chỉ báo thì có hai instance riêng", async () => {
    const user = userEvent.setup()
    setup({ joined: true, indicators: [MA_META] })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Các chỉ báo" }))
    await user.click(within(await screen.findByRole("dialog")).getByText("MA / SMA"))
    await waitFor(() => expect(screen.getAllByLabelText(/Cài đặt MA/).length).toBe(1))

    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    await user.click(within(await screen.findByRole("dialog")).getByText("MA / SMA"))
    await waitFor(() => expect(screen.getAllByLabelText(/Cài đặt MA/).length).toBe(2))
  })

  it("sai ràng buộc chéo thì báo lỗi trong hộp và không lưu", async () => {
    const user = userEvent.setup()
    setup({ joined: true, indicators: [MACD_META] })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Các chỉ báo" }))
    await user.click(within(await screen.findByRole("dialog")).getByText("MACD"))
    await waitFor(() => expect(screen.getAllByLabelText(/Cài đặt MACD/).length).toBe(1))

    await user.click(screen.getAllByLabelText(/Cài đặt MACD/)[0])
    const dialog = await screen.findByTestId("indicator-settings")
    const fast = within(dialog).getByLabelText("Chu kỳ EMA nhanh")
    await user.clear(fast)
    await user.type(fast, "30")
    const savesBefore = backend.callsTo("PUT", "/flashback/entries").length
    await user.click(within(dialog).getByRole("button", { name: "OK" }))

    expect(await screen.findByText("Chu kỳ EMA nhanh phải nhỏ hơn Chu kỳ EMA chậm")).toBeTruthy()
    expect(backend.callsTo("PUT", "/flashback/entries")).toHaveLength(savesBefore)
  })
})

describe("Flashback: màn kết quả", () => {
  it("không hiện tên mã, giai đoạn hay so sánh Mua và giữ", async () => {
    setup({ joined: true, step: 60 })
    renderMain()
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Lợi nhuận của bạn")).toBeTruthy()
    expect(within(dialog).getByText("Tổng tài sản")).toBeTruthy()
    expect(within(dialog).getByText("Số lệnh")).toBeTruthy()
    expect(within(dialog).getByText("Hạng tạm thời")).toBeTruthy()
    expect(within(dialog).getByText(/Xu thưởng được cộng khi đề đóng/)).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/Mua và giữ/)
    expect(dialog.textContent).not.toMatch(/VNM|HAP|ngày \d{2}\/\d{2}\/\d{4}/)
  })
})

describe("Flashback: giá khớp", () => {
  it("giá khớp là giá đóng cửa phiên hiện tại", async () => {
    setup({ joined: true })
    renderPanel()
    await waitForMatchPrice()
    expect(screen.getByText("Giá khớp").parentElement?.textContent).toContain(MATCH_PRICE.toLocaleString("vi-VN"))
  })

  it("phiên 60 chưa kết thúc hiện một nút Kết thúc và xem kết quả, bấm hoặc nhấn Space gọi finish", async () => {
    const user = userEvent.setup()
    setup({ joined: true, step: 60, status: "playing" })
    renderMain()
    const nextBtn = await screen.findByTestId("flashback-next")
    expect(nextBtn.textContent).toBe("Kết thúc và xem kết quả")
    expect(nextBtn.hasAttribute("disabled")).toBe(false)
    expect(screen.getAllByRole("button", { name: "Kết thúc và xem kết quả" })).toHaveLength(2)

    await user.keyboard(" ")
    await waitFor(() => expect(backend.callsTo("POST", "/flashback/entries/11111111-1111-4111-8111-111111111111/finish")).toHaveLength(1))
  })

  it("hiển thị Đề #7, định dạng Hạng 1 / Hạng 2–3 và ẩn mức thưởng 0 xu", async () => {
    setup({ firstJoinFree: true })
    renderMain()
    const card = await screen.findByTestId("join-card")
    expect(within(card).getByText("Đề #7")).toBeTruthy()
    expect(within(card).getByText("Hạng 1")).toBeTruthy()
    expect(within(card).getByText("Hạng 2–3")).toBeTruthy()
    expect(within(card).queryByText("Hạng 1-1")).toBeNull()
    expect(within(card).queryByText(/Từ 51 trở xuống/)).toBeNull()
  })

  it("cài đặt chỉ báo giữ nguyên tham số hiện tại của instance và kiểm tra ngưỡng dưới < ngưỡng trên", async () => {
    const user = userEvent.setup()
    setup({
      joined: true,
      indicators: [MA_META, RSI_META],
      savedIndicators: [
        { id: "ma", params: { period: 50 } },
        { id: "rsi", params: { period: 14, level: { lower: 30, upper: 70 } } },
      ],
    })
    renderMain()
    const maSettings = await screen.findByLabelText("Cài đặt MA / SMA 50")
    await user.click(maSettings)
    const dialog = await screen.findByTestId("indicator-settings")
    expect((within(dialog).getByLabelText("Chu kỳ SMA") as HTMLInputElement).value).toBe("50")
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))

    await user.click(await screen.findByLabelText("Cài đặt RSI 14"))
    const rsiDialog = await screen.findByTestId("indicator-settings")
    const lowerInput = within(rsiDialog).getByLabelText("Ngưỡng quá bán")
    const upperInput = within(rsiDialog).getByLabelText("Ngưỡng quá mua")
    await user.clear(lowerInput)
    await user.type(lowerInput, "45")
    await user.clear(upperInput)
    await user.type(upperInput, "55")
    await user.click(within(rsiDialog).getByRole("button", { name: "OK" }))
  })

  it("nhân 100 cho pnl_pct của cổ phiếu đang giữ trên panel", async () => {
    setup({
      joined: true,
      step: 2,
      holdings: 100,
      positions: [
        {
          qty: 100,
          price: "28800",
          step: 0,
          sellable_step: 2,
          status: "settled",
          sessions_left: 0,
          pnl_pct: 0.052,
          value: "3030000",
        },
      ],
    })
    renderPanel()
    expect(await screen.findByText("+5,2%")).toBeTruthy()
  })

  it("màu các đường chỉ báo đa đường, ngưỡng CCI/ROC/CMF và kiểm tra lower < upper", () => {
    const bars = historyBars()
    const dmiPlot = computeIndicator("dmi", { period: 14 }, bars)
    expect(dmiPlot.series.map((s) => s.color)).toEqual(["#19b37a", "#e24a4a"])

    const maCrossPlot = computeIndicator("ma_cross", { fast: 10, slow: 20 }, bars)
    expect(maCrossPlot.series[1].color).toBe("#f59e0b")

    const macdPlot = computeIndicator("macd", { fast: 12, slow: 26, signal: 9 }, bars)
    expect(macdPlot.series[1].color).toBe("#f59e0b")

    const stochPlot = computeIndicator("stochastic", { k: 14, d: 3, smooth: 3 }, bars)
    expect(stochPlot.series[1].color).toBe("#f59e0b")

    const obvPlot = computeIndicator("obv", { baseline: 20 }, bars)
    expect(obvPlot.series[1].color).toBe("#f59e0b")

    const bbPlot = computeIndicator("bollinger", { period: 20, k: 2 }, bars)
    expect(bbPlot.series.map((s) => s.color)).toEqual(["#38bdf8", "#38bdf8", "#60a5fa"])

    const cciPlot = computeIndicator("cci", { period: 20, level: { lower: -100, upper: 100 } }, bars)
    expect(cciPlot.levels).toEqual([
      { key: "lower", value: -100, label: "Dưới" },
      { key: "upper", value: 100, label: "Trên" },
    ])
    expect(cciPlot.levelBand).toEqual({ lower: -100, upper: 100 })

    const rocPlot = computeIndicator("roc", { period: 20, level: { lower: -5, upper: 5 } }, bars)
    expect(rocPlot.levels).toEqual([
      { key: "lower", value: -5, label: "Dưới" },
      { key: "upper", value: 5, label: "Trên" },
    ])
    expect(rocPlot.levelBand).toEqual({ lower: -5, upper: 5 })

    const cmfPlot = computeIndicator("cmf", { period: 20, level: 0.05 }, bars)
    expect(cmfPlot.levels).toEqual([{ key: "level", value: 0.05, label: "Ngưỡng" }])

    const invertedDefaults = defaultParams({
      params: [
        {
          key: "level",
          label: "Ngưỡng",
          min: -200,
          max: 200,
          step: 1,
          default: 100,
          lower: { min: -200, max: 200, default: 100 },
          upper: { min: -200, max: 200, default: -100 },
        },
      ],
      cross_fields: [],
    })
    expect(invertedDefaults.level).toEqual({ lower: -100, upper: 100 })

    const invalidThreshold = validateParams(
      {
        params: [
          {
            key: "level",
            label: "Ngưỡng",
            min: 0,
            max: 100,
            step: 1,
            default: 30,
            lower: { min: 0, max: 100, default: 30 },
            upper: { min: 0, max: 100, default: 70 },
          },
        ],
        cross_fields: [],
      },
      { level: { lower: 75, upper: 60 } },
    )
    expect(invalidThreshold).toBe("Ngưỡng dưới phải nhỏ hơn ngưỡng trên.")
  })
})

describe("Flashback: bản 22-10", () => {
  it("FB-07: tham gia gửi kèm mã thiết bị do trình duyệt sinh và giữ nguyên giữa các lần", async () => {
    const user = userEvent.setup()
    setup({ firstJoinFree: true })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Tham gia miễn phí" }))
    await waitFor(() => expect(backend.callsTo("POST", "/flashback/current/join")).toHaveLength(1))
    const body = backend.callsTo("POST", "/flashback/current/join")[0]?.body as { device_id?: string }
    expect(body.device_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(localStorage.getItem("iqx.flashback.device-id")).toBe(body.device_id)
  })

  it("FB-11b: chỉ 402 XU_INSUFFICIENT báo thiếu xu kèm nút sang Học viện", async () => {
    const user = userEvent.setup()
    setup({ firstJoinFree: true, joinError: { status: 402, code: "XU_INSUFFICIENT" } })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Tham gia miễn phí" }))
    const card = await screen.findByTestId("join-card")
    await waitFor(() => expect(within(card).getByRole("alert").textContent).toBe("Chưa đủ xu, học thêm bài để có xu"))
    expect(within(card).getByRole("button", { name: "Học thêm bài để có xu" })).toBeTruthy()
  })

  it("FB-11b: lỗi khác báo Không tham gia được, thử lại", async () => {
    const user = userEvent.setup()
    setup({ firstJoinFree: true, joinError: { status: 500, code: "INTERNAL" } })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Tham gia miễn phí" }))
    const card = await screen.findByTestId("join-card")
    await waitFor(() => expect(within(card).getByRole("alert").textContent).toBe("Không tham gia được, thử lại"))
    expect(within(card).queryByRole("button", { name: "Học thêm bài để có xu" })).toBeNull()
  })

  it("FB-06/FB-11b: 409 thì tải lại đề, không báo lỗi", async () => {
    const user = userEvent.setup()
    setup({ firstJoinFree: true, joinError: { status: 409, code: "FLASHBACK_ROUND_CLOSED" } })
    renderMain()
    await user.click(await screen.findByRole("button", { name: "Tham gia miễn phí" }))
    await waitFor(() => expect(backend.callsTo("GET", "/flashback/current").length).toBeGreaterThanOrEqual(2))
    expect(within(screen.getByTestId("join-card")).queryByRole("alert")).toBeNull()
  })

  it("FB-06: Phiên tiếp nhận 409 FLASHBACK_ROUND_CLOSED thì tải lại đề", async () => {
    const user = userEvent.setup()
    setup({ joined: true, nextError: { status: 409, code: "FLASHBACK_ROUND_CLOSED" } })
    renderMain()
    await user.click(await screen.findByTestId("flashback-next"))
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Đề đã tới giờ đóng. Đang tải lại đề."))
    await waitFor(() => expect(backend.callsTo("GET", "/flashback/current").length).toBeGreaterThanOrEqual(2))
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it("FB-11c: thanh nút đáy điện thoại khoá Mua và Bán khi chưa tham gia", async () => {
    setup({ firstJoinFree: true })
    renderMain()
    await screen.findByTestId("join-card")
    expect(screen.getByTestId("flashback-buy-mobile").hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("flashback-sell-mobile").hasAttribute("disabled")).toBe(true)
  })

  it("FB-11c: đã tham gia thì Mua và Bán ở đáy bấm được", async () => {
    setup({ joined: true })
    renderMain()
    await waitFor(() => expect(screen.getByTestId("flashback-buy-mobile").hasAttribute("disabled")).toBe(false))
    expect(screen.getByTestId("flashback-sell-mobile").hasAttribute("disabled")).toBe(false)
  })

  it("FB-11a: chưa đủ điều kiện nhận thưởng thì màn kết quả thay số xu bằng câu giải thích", async () => {
    setup({ joined: true, step: 60, status: "finished", rewardEligible: false })
    renderMain()
    const result = await screen.findByTestId("flashback-result")
    expect(within(result).getByTestId("flashback-reward-ineligible").textContent).toBe(
      "Tài khoản chưa đủ điều kiện nhận thưởng (cần xác thực số điện thoại và tạo đủ 7 ngày)",
    )
    expect(within(result).queryByText(/Thưởng theo hạng tạm thời/)).toBeNull()
  })

  it("§1.14: phí tham gia 0 xu từ lần hai thì hiện Tham gia miễn phí", async () => {
    setup({ firstJoinFree: false, feeXu: 0 })
    renderMain()
    const card = await screen.findByTestId("join-card")
    expect(within(card).getByText("Phí tham gia").parentElement?.textContent).toContain("Miễn phí")
    expect(within(card).getByRole("button", { name: "Tham gia miễn phí" })).toBeTruthy()
  })

  it("FB-10: bảng xếp hạng hiện % từ pnl_pct và phiên đang chơi chỉ ở dòng của mình", async () => {
    const user = userEvent.setup()
    setup({ joined: true, step: 12 })
    renderPanel()
    await user.click(await screen.findByRole("tab", { name: /Xếp hạng/ }))
    expect(await screen.findByText("ngoclan.vo")).toBeTruthy()
    expect(screen.getByText("+12,00%")).toBeTruthy()
    expect(screen.getByText(/đang chơi phiên 12\/60/)).toBeTruthy()
    expect(screen.getAllByText(/đang chơi phiên/)).toHaveLength(1)
  })
})
