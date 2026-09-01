import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Panel đặt lệnh mặc ÁO của mockup `iqx-cap0-datlenh.html` /
 * `iqx-cap1-datlenh.html` — và CHỈ ở Cấp 0 với Cấp 1.
 *
 * Cái test được ở đây là PHẠM VI, không phải màu: vitest chạy với `css: false`
 * nên jsdom không bao giờ thấy một luật nào trong `order-panel.css`
 * (`toHaveStyle` sẽ luôn rỗng). Thứ duy nhất quan sát được — và cũng là thứ
 * duy nhất dễ hỏng — là các class có được gắn ĐÚNG CẤP hay không.
 *
 * ★ Ranh giới cần canh (ĐÃ ĐỔI 08/2026): áo mặc cho MỌI shell cấp — Cấp 0 lấy
 * accent `--brand`, Cấp 1 trở lên lấy accent đồng `--copper`. Thứ phải chặn là
 * ranh giới NGOÀI shell cấp: trên /bieu-do và /co-phieu panel đi theo theme
 * sáng/tối của app và có chrome riêng, nên thẻ tối cứng đặt vào đó là chửi nhau.
 *
 * Bản trước còn loại trừ Cấp 2 trở lên (`isCap1Active && !isCap2Active`) vì hồi
 * đó chưa có mockup Cấp 2. Lý do đó hết hiệu lực — xem doc-comment của
 * `useMockupPanelSkin` trong `TradingPanel.tsx`.
 */

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

vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))

let isPremiumFlag = true
vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: isPremiumFlag, isLoading: false }),
}))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: { shortName: "Công ty Cổ phần Sữa Việt Nam" } }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))

/* ── Ba cờ cấp, bật/tắt từng test ─────────────────────────────────────────── */
let isCap0ActiveFlag = false
let isCap1ActiveFlag = false
let isCap2ActiveFlag = false

/** Cấp 0 đã xong nhiệm vụ ① → ô Giá + dropdown loại lệnh hiện (spec §8). */
const cap0Progress = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  entered_at: "2026-07-21T00:00:00Z",
  virtual_balance_init: 250_000_000,
  task_1_done_at: "2026-07-21T01:00:00Z",
  task_2_done_at: null,
  task_3_done_at: null,
  task_4_done_at: null,
  task4_debrief_done: false,
  graduated_at: null,
  time_to_graduate_hours: null,
}

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
    useCap0Progress: () => ({ data: isCap0ActiveFlag ? cap0Progress : undefined }),
    useRecordCap0Kehoach: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
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

function renderPanel() {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TradingPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  isPremiumFlag = true
  isCap0ActiveFlag = false
  isCap1ActiveFlag = false
  isCap2ActiveFlag = false
})

/** Mọi khối mockup vẽ trong thẻ 360px — đủ để biết cái áo đã mặc trọn vẹn. */
const KHOI_MOCKUP = [
  ".op-panel",
  ".op-tabs",
  ".op-ticker",
  ".op-refs",
  ".op-balance",
  ".op-field",
  ".op-fee",
  ".op-btn",
] as const

describe("Panel đặt lệnh — áo mockup mặc trong shell cấp, KHÔNG mặc ngoài /bieu-do · /co-phieu", () => {
  it("★ Cấp 0: mặc đủ cả 8 khối của mockup, và KHÔNG lấy accent đồng của Cấp 1", async () => {
    isCap0ActiveFlag = true
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    for (const sel of KHOI_MOCKUP) {
      expect(container.querySelector(sel), `thiếu \`${sel}\` ở Cấp 0`).not.toBeNull()
    }
    expect(container.querySelector(".op-panel--cap1")).toBeNull()
  })

  it("★ Cấp 1: mặc đủ cả 8 khối + accent đồng (mockup Cấp 1 đổi brand → copper)", async () => {
    isCap1ActiveFlag = true
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument())

    for (const sel of KHOI_MOCKUP) {
      expect(container.querySelector(sel), `thiếu \`${sel}\` ở Cấp 1`).not.toBeNull()
    }
    expect(container.querySelector(".op-panel--cap1")).not.toBeNull()
  })

  /**
   * ★★ ĐẢO CHIỀU (08/2026). Bản trước khẳng định NGƯỢC LẠI — "Cấp 2 KHÔNG mặc
   * áo" — vì hồi đó chưa có mockup Cấp 2, nên khoác áo Cấp 0/1 lên một panel có
   * thêm khối SL/TP sẽ ra nửa mới nửa cũ.
   *
   * Nay `iqx-cap2-datlenh.html` đã vẽ đúng khối SL/TP trong bảng màu tối, và
   * `cap0.css` ánh xạ token Arco về bảng màu vỏ cấp, nên lý do đó hết hiệu lực.
   * User báo đúng cái giá của luật cũ: từ Cấp 2 trở lên panel rơi hẳn về giao
   * diện Arco mặc định, không giống demo.
   *
   * Test này giờ canh chiều MỚI. Khôi phục `!isCap2Active` là nó đỏ.
   */
  it("★ Cấp 2 (isCap1Active vẫn true): MẶC áo mockup + giữ accent đồng của Cấp 1", async () => {
    isCap1ActiveFlag = true
    isCap2ActiveFlag = true
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument())

    for (const sel of KHOI_MOCKUP) {
      expect(container.querySelector(sel), `thiếu \`${sel}\` ở Cấp 2`).not.toBeNull()
    }
    expect(container.querySelector(".op-panel--cap1")).not.toBeNull()

    // The order-book reader was retired from the shared panel. Cấp 2 retains
    // its SL/TP form and mockup skin without reintroducing `.op-book`.
    expect(container.querySelector(".op-book")).toBeNull()
  })

  it("★ Cấp 0 và Cấp 1: KHÔNG có sổ lệnh (nên cũng không có thẻ `.op-book`)", async () => {
    isCap0ActiveFlag = true
    const cap0 = renderPanel()
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())
    expect(cap0.container.querySelector(".op-book")).toBeNull()
    cap0.unmount()

    isCap0ActiveFlag = false
    isCap1ActiveFlag = true
    const cap1 = renderPanel()
    await waitFor(() => expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument())
    expect(cap1.container.querySelector(".op-book")).toBeNull()
  })

  it("NGOÀI mọi cấp (/bieu-do, /co-phieu): không một class mockup hay sổ lệnh được gắn", async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelector(".arco-tabs")).not.toBeNull())

    for (const sel of KHOI_MOCKUP) {
      expect(container.querySelector(sel), `\`${sel}\` rò ra ngoài Cấp 0/1`).toBeNull()
    }
    expect(container.querySelector(".op-book")).toBeNull()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
    // ...và panel thường vẫn nguyên vẹn: tabs Arco + nút % số dư.
    expect(container.querySelector(".arco-tabs")).not.toBeNull()
    expect(screen.getByText("10%")).toBeInTheDocument()
  })
})

/**
 * ★ Cổng Premium: `GatedOrderEntry` render tabs + ticker + số dư TRƯỚC mọi
 * nhánh `return` của cổng, để user không Premium trên /bieu-do vẫn thấy giá và
 * số dư. Việc mặc áo mới KHÔNG được kéo cụm đó xuống dưới cổng.
 */
describe("Cổng Premium — ticker + số dư vẫn nằm TRÊN cổng sau khi restyle", () => {
  it("★ Cấp 1 không Premium: vẫn thấy ticker + số dư (và cả hai đã mặc áo mockup)", async () => {
    isPremiumFlag = false
    isCap1ActiveFlag = true
    const { container } = renderPanel()
    await waitFor(() =>
      expect(screen.getByText(/yêu cầu gói Premium/)).toBeInTheDocument(),
    )

    expect(container.querySelector(".op-ticker")).not.toBeNull()
    expect(container.querySelector(".op-balance")).not.toBeNull()
    expect(container.querySelector(".op-tabs")).not.toBeNull()
    expect(screen.getByText("Trần")).toBeInTheDocument()
    expect(screen.getByText("Số dư")).toBeInTheDocument()
    // Form thật vẫn bị chặn — restyle không được mở cổng.
    expect(container.querySelector(".op-btn")).toBeNull()
  })

  it("NGOÀI cấp, không Premium: ticker + số dư vẫn hiện, y như trước", async () => {
    isPremiumFlag = false
    const { container } = renderPanel()
    await waitFor(() =>
      expect(screen.getByText(/yêu cầu gói Premium/)).toBeInTheDocument(),
    )

    expect(screen.getByText("Trần")).toBeInTheDocument()
    expect(screen.getByText("Số dư")).toBeInTheDocument()
    expect(container.querySelector(".op-panel")).toBeNull()
  })
})

/**
 * Tours nhắm vào 5 `data-tour-id` này. Restyle hay đổi cây DOM là lúc dễ đánh
 * rơi chúng nhất — mất một cái thì bước tour tương ứng không có target và
 * overlay đứng im.
 */
describe("data-tour-id — restyle không được làm rơi target nào của tour", () => {
  const TOUR_IDS = [
    "cap0-tour-buysell-balance",
    "cap0-tour-stock-header",
    "cap0-tour-price-bands",
    "cap0-tour-volume-fee",
    "cap0-tour-plan-submit",
  ]

  it("★ giữ đủ 5 target trong panel Cấp 0", async () => {
    isCap0ActiveFlag = true
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())

    for (const id of TOUR_IDS) {
      expect(
        container.querySelector(`[data-tour-id="${id}"]`),
        `mất target tour \`${id}\``,
      ).not.toBeNull()
    }
  })
})
