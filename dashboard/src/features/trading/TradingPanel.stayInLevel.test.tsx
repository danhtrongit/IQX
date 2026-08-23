import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★★ BA LỐI THOÁT NẰM NGAY TRONG PANEL ĐẶT LỆNH.
 *
 * 1. `StockHeader` — nút mã cổ phiếu ở đầu panel `navigate('/co-phieu/:sym')`.
 *    User đang điền form kế hoạch, bấm vào mã để xem lại → mất sạch form và
 *    rời cấp. Có HAI nhánh render (bản skin mockup Cấp 0/1 và bản Arco cũ mà
 *    Cấp 2→8 dùng) và cả hai đều thủng — vá một nhánh là để lỗ hổng kia mở.
 *
 * 2. `OrderEntry` catch — lệnh bị BE từ chối vì Premium thì TỰ ĐỘNG
 *    `navigate('/nang-cap')`. User bấm MUA, không bấm gì liên quan nâng cấp,
 *    vẫn bị chuyển trang.
 *
 * 3. `AccountStrip.handleActivate` — y hệt, ở nút «Kích hoạt Đấu trường ảo»
 *    (rất dễ chạm ở Cấp 0/1: nhiệm vụ bảo user bấm đúng nút đó).
 *
 * Hai prop, mặc định = HÀNH VI CŨ, nên /bieu-do & /co-phieu không đổi gì.
 * `RightSidebar` (chỗ duy nhất biết có shell cấp nào đang mount) truyền chúng.
 */

const { messageErrorMock } = vi.hoisted(() => ({ messageErrorMock: vi.fn() }))

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: vi.fn() }),
}))

const priceData = {
  symbol: "VNM",
  exchange: "HOSE",
  closePrice: 62.4,
  referencePrice: 61.8,
  ceilingPrice: 67.9,
  floorPrice: 59.3,
  priceChange: 0.6,
  percentChange: 0.97,
  totalVolume: 1,
  totalValue: 1,
  foreignBuy: 0,
  foreignSell: 0,
  bid: [{ price: 61.8, volume: 100 }],
  ask: [{ price: 62.4, volume: 200 }],
}
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: priceData, isLoading: false }),
}))

const placeOrderMock = vi.fn()
const activateMock = vi.fn()
let accountIsError = false
vi.mock("./hooks", () => ({
  useAccount: () => ({
    data: accountIsError
      ? undefined
      : { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 },
    isLoading: false,
    isError: accountIsError,
  }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: activateMock, isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))
vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: vi.fn(),
      warning: vi.fn(),
      error: messageErrorMock,
      info: vi.fn(),
    },
  }
})

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/http/client")>()
  return {
    ...actual,
    api: {
      get: (...a: unknown[]) => get(...a),
      post: (...a: unknown[]) => post(...a),
      patch: (...a: unknown[]) => patch(...a),
    },
    unwrap: <T,>(r: T) => r,
  }
})

/* ── Cờ cấp, bật/tắt từng test ────────────────────────────────────────────── */
let isCap0ActiveFlag = false
let isCap1ActiveFlag = false
let isCap2ActiveFlag = false

vi.mock("@/features/cap0", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap0")>()
  return {
    ...actual,
    useCap0Events: () => ({
      isCap0Active: isCap0ActiveFlag,
      requireReasonBeforeOrder: false,
      onReasonPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onStarToggled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useCap0Progress: () => ({ data: undefined }),
    useRecordCap0Kehoach: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    PlanBlock: () => <div data-testid="plan-block-mock" />,
  }
})

vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: isCap1ActiveFlag,
      onLyDoPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onDocChiTietClicked: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoach: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    // `sauLyDo` = slot mà `TradingPanel` truyền `AiThanhTra` xuống (mockup vẽ
    // AI Thanh tra BÊN TRONG thẻ KẾ HOẠCH, giữa trường ① và ②). Mock PHẢI
    // render nó ra: nuốt slot thì mọi assert về `ai-thanh-tra-mock` — cả
    // chiều có lẫn chiều không — đều xanh vô điều kiện.
    PlanFormCap1: (props: { sauLyDo?: React.ReactNode; truocLyDo?: React.ReactNode }) => (
      <div data-testid="plan-form-cap1-mock">
        {props.truocLyDo}
        {props.sauLyDo}
      </div>
    ),
    AiThanhTra: () => <div data-testid="ai-thanh-tra-mock" />,
  }
})

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: isCap2ActiveFlag,
      onSlTpPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap2: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    SlTpBlock: () => <div data-testid="sltp-block-mock" />,
  }
})

import { TradingPanel } from "./TradingPanel"

function renderPanel(props: React.ComponentProps<typeof TradingPanel> = {}) {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TradingPanel {...props} />
    </QueryClientProvider>,
  )
}

/** Nút mã ở đầu panel — cả hai nhánh render đều đặt mã làm nội dung của nó. */
function tickerNode() {
  return screen.getAllByText("VNM").find((el) => el.closest("[data-tour-id='cap0-tour-stock-header']"))!
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  navigateMock.mockReset()
  messageErrorMock.mockReset()
  placeOrderMock.mockReset()
  activateMock.mockReset()
  accountIsError = false
  isCap0ActiveFlag = false
  isCap1ActiveFlag = false
  isCap2ActiveFlag = false
})

describe("TradingPanel — symbolLink (nút mã ở đầu panel Đặt lệnh)", () => {
  it('★★ nhánh SKIN (Cấp 0): symbolLink="none" → bấm mã KHÔNG navigate', () => {
    isCap0ActiveFlag = true
    renderPanel({ symbolLink: "none" })

    fireEvent.click(tickerNode())

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('★★ nhánh KHÔNG SKIN (Cấp 2 — skin tắt): symbolLink="none" → bấm mã KHÔNG navigate', () => {
    // Cấp 2 bật cả `isCap1Active`, và `useMockupPanelSkin()` trả null khi
    // `isCap2Active` — tức Cấp 2→8 đi ĐÚNG nhánh render thứ hai. Vá một nhánh
    // là để lỗ hổng kia mở nguyên.
    isCap1ActiveFlag = true
    isCap2ActiveFlag = true
    renderPanel({ symbolLink: "none" })

    fireEvent.click(tickerNode())

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ mặc định (không prop) trên /bieu-do & /co-phieu: bấm mã vẫn navigate như cũ", () => {
    renderPanel()

    fireEvent.click(tickerNode())

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })

  it('★ mặc định ở nhánh SKIN cũng vẫn navigate khi không có prop', () => {
    isCap0ActiveFlag = true
    renderPanel()

    fireEvent.click(tickerNode())

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })
})

describe("TradingPanel — onPremiumRequired (không tự đá sang /nang-cap)", () => {
  it("★★ đặt lệnh bị BE từ chối vì Premium + có onPremiumRequired → báo lỗi, KHÔNG navigate", async () => {
    placeOrderMock.mockRejectedValue(new Error("Tính năng này cần gói Premium"))
    const onPremiumRequired = vi.fn()
    renderPanel({ onPremiumRequired })

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onPremiumRequired).toHaveBeenCalled())
    expect(navigateMock).not.toHaveBeenCalled()
    expect(messageErrorMock).toHaveBeenCalled()
  })

  it("★★ cùng lỗi đó, KHÔNG prop (/bieu-do & /co-phieu): giữ nguyên navigate('/nang-cap')", async () => {
    placeOrderMock.mockRejectedValue(new Error("Tính năng này cần gói Premium"))
    renderPanel()

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/nang-cap"))
  })

  it("★★ kích hoạt Đấu trường ảo lỗi Premium + có onPremiumRequired → KHÔNG navigate", async () => {
    accountIsError = true
    activateMock.mockRejectedValue(new Error("Cần gói Premium để kích hoạt"))
    const onPremiumRequired = vi.fn()
    renderPanel({ onPremiumRequired })

    fireEvent.click(screen.getByText("Kích hoạt Đấu trường ảo"))

    await waitFor(() => expect(onPremiumRequired).toHaveBeenCalled())
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ kích hoạt lỗi Premium, KHÔNG prop: giữ nguyên navigate('/nang-cap')", async () => {
    accountIsError = true
    activateMock.mockRejectedValue(new Error("Cần gói Premium để kích hoạt"))
    renderPanel()

    fireEvent.click(screen.getByText("Kích hoạt Đấu trường ảo"))

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/nang-cap"))
  })

  it("lỗi KHÔNG phải Premium: không ai điều hướng, chỉ báo lỗi (cả hai chiều)", async () => {
    placeOrderMock.mockRejectedValue(new Error("Số dư không đủ"))
    const onPremiumRequired = vi.fn()
    renderPanel({ onPremiumRequired })

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith("Số dư không đủ"))
    expect(onPremiumRequired).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
