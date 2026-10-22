import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FlashbackMain } from "./flashback-main"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import {
  MACD_META,
  MA_META,
  MATCH_PRICE,
  RSI_META,
  createFlashbackBackend,
  type BackendOptions,
  type FlashbackBackend,
} from "./flashback-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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
})
