import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap5WatchlistItem } from "./watchlistTypes"

/**
 * Watchlist Cấp 5 (spec §6, mockup `iqx-cap5-watchlist.html`).
 *
 * Ba trục canh:
 *   1. LUẬT SỐ 1 — "chưa chấm"/"chưa kết luận" là hai trạng thái RIÊNG, không
 *      bao giờ được in thành `0/5` hay gọi là "Đang quan sát";
 *   2. LUẬT SỐ 5 — mọi lối đi (Săn thêm / Đặt lệnh / Xem 5 lớp) chỉ đổi
 *      `activePanel`, KHÔNG `navigate` ra khỏi shell cấp;
 *   3. LUẬT SỐ 4 — panel RIÊNG của Cấp 5, gác trên `isCap5Active` (bài canh
 *      chiều còn lại nằm ở `features/watchlist/WatchlistPanel.cap5Gate.test.tsx`).
 */
const { wlQuery, setActivePanelMock, setSymbolMock, cap5Active, priceMap, wlEnabledSpy } =
  vi.hoisted(() => ({
    wlQuery: { current: {} as Record<string, unknown> },
    setActivePanelMock: vi.fn(),
    setSymbolMock: vi.fn(),
    cap5Active: { current: true },
    priceMap: { current: {} as Record<string, { closePrice: number; percentChange: number }> },
    wlEnabledSpy: vi.fn(),
  }))

vi.mock("./sanMaHooks", () => ({
  useCap5Watchlist: (enabled?: boolean) => {
    wlEnabledSpy(enabled)
    return wlQuery.current
  },
}))
vi.mock("./Cap5Context", () => ({
  useCap5Events: () => ({ isCap5Active: cap5Active.current }),
}))
vi.mock("@/shared/contexts/sidebar-context", () => ({
  useSidebar: () => ({ setActivePanel: setActivePanelMock }),
}))
vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: setSymbolMock }),
}))
vi.mock("@/features/market-data", () => ({
  usePrices: () => ({ priceMap: priceMap.current, isLoading: false }),
}))

import { Cap5WatchlistPanel } from "./Cap5WatchlistPanel"

function item(over: Partial<Cap5WatchlistItem> = {}): Cap5WatchlistItem {
  return {
    symbol: "HPG",
    added_at: "2026-08-10T02:00:00Z",
    hunt_filter: "ngoai",
    hunt_signal: "+45,2 tỷ ròng · 4/5 phiên",
    so_phien_tu_khi_san: 2,
    lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "ok" },
    consensus_today: 4,
    consensus_prev: 2,
    consensus_da_cham: 5,
    ...over,
  }
}

const NOTABLE = item()
const WATCHING = item({
  symbol: "FPT",
  hunt_filter: "dinh",
  so_phien_tu_khi_san: 4,
  consensus_today: 2,
  consensus_prev: 2,
  consensus_da_cham: 5,
  lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "neu", dinh_gia: "bad" },
})

beforeEach(() => {
  vi.clearAllMocks()
  cap5Active.current = true
  priceMap.current = {
    HPG: { closePrice: 27.85, percentChange: 1.2 },
    FPT: { closePrice: 138.5, percentChange: 0.9 },
  }
  wlQuery.current = { data: [NOTABLE, WATCHING], isLoading: false, isError: false }
})

describe("Cap5WatchlistPanel — thẻ mã (spec §6.2)", () => {
  it("hiện mã, điểm đồng thuận, dòng thay đổi và nguồn săn", () => {
    render(<Cap5WatchlistPanel />)
    const card = screen.getByTestId("cap5-wl-card-HPG")
    expect(card).toHaveTextContent("HPG")
    expect(card).toHaveTextContent("4/5")
    expect(card).toHaveTextContent("2/5 → 4/5 (cải thiện)")
    expect(card).toHaveTextContent("Săn từ Khối ngoại gom · 2 phiên trước")
  })

  it("cụm 5 icon lớp theo đúng thứ tự 🎯 💰 👤 📰 💎", () => {
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-lop-HPG")).toHaveTextContent("🎯✅ 💰✅ 👤⚪ 📰✅ 💎✅")
  })

  it("giá hiện theo en-US (luật số 7), KHÔNG copy 27.850 của mockup", () => {
    render(<Cap5WatchlistPanel />)
    const price = screen.getByTestId("cap5-wl-price-HPG")
    expect(price).toHaveTextContent("27,850")
    expect(price).not.toHaveTextContent("27.850")
    expect(price).toHaveTextContent("+1.2%")
  })

  it("★ chưa có giá realtime → «—», KHÔNG phải 0", () => {
    priceMap.current = {}
    render(<Cap5WatchlistPanel />)
    const price = screen.getByTestId("cap5-wl-price-HPG")
    expect(price).toHaveTextContent("—")
    expect(price.textContent).not.toMatch(/\b0\b/)
  })

  it("★ mã KHÔNG đến từ săn mã thì nói thẳng, không gán một bộ lọc bất kỳ", () => {
    wlQuery.current = {
      data: [item({ symbol: "SSI", hunt_filter: null, hunt_signal: null })],
      isLoading: false,
      isError: false,
    }
    render(<Cap5WatchlistPanel />)
    const card = screen.getByTestId("cap5-wl-card-SSI")
    expect(card).toHaveTextContent("Thêm tay — không qua bộ lọc săn")
    expect(card).not.toHaveTextContent("Săn từ")
  })
})

describe("Cap5WatchlistPanel — trạng thái (spec §6.1)", () => {
  it("≥4/5 lớp → «★ Đáng chú ý» + câu «Quyết định mua vẫn là của bạn»", () => {
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-status-HPG")).toHaveTextContent("★ Đáng chú ý")
    const hint = screen.getByTestId("cap5-wl-hint-HPG")
    expect(hint).toHaveTextContent("4/5 lớp đang ủng hộ")
    expect(hint).toHaveTextContent("Quyết định mua vẫn là của bạn")
  })

  it("<4 lớp (đã chấm đủ 5) → «Đang quan sát», KHÔNG có câu nhắc", () => {
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-status-FPT")).toHaveTextContent("Đang quan sát")
    expect(screen.queryByTestId("cap5-wl-hint-FPT")).not.toBeInTheDocument()
  })

  it("★ hệ chưa chấm được lớp nào → «Chưa chấm 5 lớp» + «—/5», KHÔNG «0/5»", () => {
    wlQuery.current = {
      data: [
        item({
          symbol: "DIG",
          consensus_today: null,
          consensus_prev: null,
          consensus_da_cham: null,
          lop: null,
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<Cap5WatchlistPanel />)
    const card = screen.getByTestId("cap5-wl-card-DIG")
    expect(screen.getByTestId("cap5-wl-status-DIG")).toHaveTextContent("Chưa chấm 5 lớp")
    expect(card).toHaveTextContent("—/5")
    expect(card).not.toHaveTextContent("0/5")
    expect(card).not.toHaveTextContent("Đang quan sát")
  })

  it("★ 3 lớp ủng hộ / mới chấm 4 lớp → «Chưa kết luận» + số lớp còn thiếu", () => {
    wlQuery.current = {
      data: [
        item({
          symbol: "REE",
          consensus_today: 3,
          consensus_prev: 3,
          consensus_da_cham: 4,
          lop: null,
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<Cap5WatchlistPanel />)
    const card = screen.getByTestId("cap5-wl-card-REE")
    expect(screen.getByTestId("cap5-wl-status-REE")).toHaveTextContent("Chưa kết luận")
    expect(card).not.toHaveTextContent("Đang quan sát")
    expect(screen.getByTestId("cap5-wl-warn-REE")).toHaveTextContent("1 lớp chưa có dữ liệu")
  })

  it("★ chưa có phiên trước → nói thẳng, không vẽ «0/5 →»", () => {
    wlQuery.current = {
      data: [item({ symbol: "MWG", consensus_prev: null })],
      isLoading: false,
      isError: false,
    }
    render(<Cap5WatchlistPanel />)
    const trend = screen.getByTestId("cap5-wl-trend-MWG")
    expect(trend).toHaveTextContent("chưa có phiên trước để so")
    expect(trend).not.toHaveTextContent("0/5")
  })
})

describe("Cap5WatchlistPanel — 2 tab (spec §6.3)", () => {
  it("đếm đúng «Tất cả (N)» / «Đáng chú ý (M)»", () => {
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-tab-all")).toHaveTextContent("Tất cả (2)")
    expect(screen.getByTestId("cap5-wl-tab-notable")).toHaveTextContent("Đáng chú ý (1)")
  })

  it("bấm tab «Đáng chú ý» chỉ còn mã đáng chú ý", () => {
    render(<Cap5WatchlistPanel />)
    fireEvent.click(screen.getByTestId("cap5-wl-tab-notable"))
    expect(screen.getByTestId("cap5-wl-card-HPG")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-wl-card-FPT")).not.toBeInTheDocument()
  })

  it("★ «Chưa kết luận» KHÔNG được đếm vào tab Đáng chú ý", () => {
    wlQuery.current = {
      data: [item({ symbol: "REE", consensus_today: 3, consensus_da_cham: 4, lop: null })],
      isLoading: false,
      isError: false,
    }
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-tab-notable")).toHaveTextContent("Đáng chú ý (0)")
  })

  it("tab Đáng chú ý rỗng → nói thẳng chưa mã nào chín, không hối thúc mua", () => {
    wlQuery.current = { data: [WATCHING], isLoading: false, isError: false }
    render(<Cap5WatchlistPanel />)
    fireEvent.click(screen.getByTestId("cap5-wl-tab-notable"))
    expect(screen.getByTestId("cap5-wl-empty")).toHaveTextContent("Chưa mã nào lên ≥4/5 lớp")
  })
})

describe("Cap5WatchlistPanel — ở TRONG shell cấp (luật số 5)", () => {
  it("«+ Săn thêm» chỉ đổi panel sang Săn mã", () => {
    render(<Cap5WatchlistPanel />)
    fireEvent.click(screen.getByTestId("cap5-wl-add"))
    expect(setActivePanelMock).toHaveBeenCalledWith("cap5-sanma")
  })

  it("mã Đáng chú ý có «Đặt lệnh →» → đổi mã + mở panel đặt lệnh Cấp 4", () => {
    render(<Cap5WatchlistPanel />)
    fireEvent.click(screen.getByTestId("cap5-wl-act-HPG"))
    expect(setSymbolMock).toHaveBeenCalledWith("HPG")
    expect(setActivePanelMock).toHaveBeenCalledWith("trading")
  })

  it("mã chưa chín có «Xem 5 lớp →» (KHÔNG phải «Đặt lệnh»)", () => {
    render(<Cap5WatchlistPanel />)
    const act = screen.getByTestId("cap5-wl-act-FPT")
    expect(act).toHaveTextContent("Xem 5 lớp →")
    expect(act).not.toHaveTextContent("Đặt lệnh")
  })
})

describe("Cap5WatchlistPanel — trạng thái tải (luật số 1)", () => {
  it("★ đang tải KHÔNG nói «chưa có mã nào»", () => {
    wlQuery.current = { data: undefined, isLoading: true, isError: false }
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-loading")).toHaveTextContent("Đang tải")
    expect(screen.queryByTestId("cap5-wl-empty")).not.toBeInTheDocument()
  })

  it("★ lỗi tải KHÔNG biến thành watchlist rỗng", () => {
    wlQuery.current = { data: undefined, isLoading: false, isError: true }
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-error")).toHaveTextContent("Chưa lấy được Watchlist")
    expect(screen.queryByTestId("cap5-wl-empty")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap5-wl-tab-all")).toHaveTextContent("Tất cả (—)")
  })

  it("watchlist rỗng THẬT → mời đi săn", () => {
    wlQuery.current = { data: [], isLoading: false, isError: false }
    render(<Cap5WatchlistPanel />)
    expect(screen.getByTestId("cap5-wl-empty")).toHaveTextContent("Chưa có mã nào trong Watchlist")
    expect(screen.getByTestId("cap5-wl-tab-all")).toHaveTextContent("Tất cả (0)")
  })
})

describe("Cap5WatchlistPanel — gác theo cấp (luật số 4)", () => {
  it("ngoài Cấp 5 KHÔNG query watchlist Cấp 5", () => {
    cap5Active.current = false
    render(<Cap5WatchlistPanel />)
    expect(wlEnabledSpy).toHaveBeenCalledWith(false)
  })

  it("trong Cấp 5 thì query", () => {
    render(<Cap5WatchlistPanel />)
    expect(wlEnabledSpy).toHaveBeenCalledWith(true)
  })
})
