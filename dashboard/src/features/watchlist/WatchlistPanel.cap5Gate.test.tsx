import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

/**
 * ★★ CHIỀU CÒN LẠI CỦA LUẬT SỐ 4 ★★
 *
 * Cấp 5 nâng "Theo dõi" thành **Watchlist** có điểm đồng thuận 5 lớp + trạng thái
 * "★ Đáng chú ý" (spec §6). Bản nâng đó sống trong MỘT panel riêng
 * (`features/cap5/Cap5WatchlistPanel.tsx`, panel `"cap5-watchlist"`).
 *
 * File này canh chiều ngược: panel "Danh mục" DÙNG CHUNG (`WatchlistPanel`) —
 * cái mà `/bieu-do`, `/co-phieu` và cả chín shell cấp đều render, và nhiệm vụ ③
 * của Cấp 0 («Xem tab Theo dõi») treo trên đúng nó — phải KHÔNG mang một chữ nào
 * của Cấp 5. Nếu ai đó "tiện tay" nhồi điểm đồng thuận vào đây, bài này đỏ.
 *
 * Chiều thuận (panel `"cap5-watchlist"` chỉ render khi `isCap5Active`) nằm ở
 * `features/dashboard/components/RightSidebar.cap5SanMa.test.tsx`.
 *
 * Khung mock sao lại từ `WatchlistPanel.rowSelect.test.tsx`.
 */

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))

vi.mock("@/features/market-data", () => ({
  usePrices: () => ({ priceMap: {} }),
  prevSessionChangePct: () => 0,
}))

vi.mock("./hooks", () => ({
  useWatchlist: () => ({ data: [{ symbol: "VNM" }, { symbol: "HPG" }], isLoading: false }),
  useAddToWatchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveFromWatchlist: () => ({ mutateAsync: vi.fn() }),
  useSparkline: () => ({ data: [] }),
  useSymbolInfo: () => ({ data: null }),
}))

vi.mock("./api", () => ({ watchlistApi: { validateStock: vi.fn() } }))

vi.mock("@/features/trading", () => ({
  usePortfolio: () => ({
    data: { positions: [], balance: 1, totalAssets: 1, pnl: 0, pnlPercent: 0 },
    isLoading: false,
  }),
  useOrders: () => ({ data: [], isLoading: false }),
}))

vi.mock("@/features/portfolio-manager", () => ({
  PortfolioAnalysisButton: () => <button type="button">Phân tích</button>,
}))

vi.mock("@/features/navigation/StockLogo", () => ({
  StockLogo: () => <span data-testid="logo" />,
}))

vi.mock("@/features/cap0/hooks", () => ({ useCap0Progress: () => ({ data: null }) }))

import { WatchlistPanel } from "./WatchlistPanel"
import { Cap0Provider } from "@/features/cap0/Cap0Context"

/** Từ vựng RIÊNG của Watchlist Cấp 5 — không được rò vào panel dùng chung. */
const TU_VUNG_CAP5 = [
  "Đáng chú ý",
  "Đang quan sát",
  "Chưa chấm 5 lớp",
  "Chưa kết luận",
  "Săn từ",
  "+ Săn thêm",
  "lớp đang ủng hộ",
  "Quyết định mua vẫn là của bạn",
  "Xem 5 lớp",
]

describe("WatchlistPanel dùng chung — KHÔNG mang bản nâng Cấp 5 (luật số 4)", () => {
  it("★ ngoài shell cấp: không một chữ nào của Watchlist Cấp 5", () => {
    const { container } = render(<WatchlistPanel />)
    for (const tu of TU_VUNG_CAP5) {
      expect(container.textContent).not.toContain(tu)
    }
  })

  it("★ TRONG một session cấp (bus Cấp 0 đang sống) vẫn không có chữ nào của Cấp 5", () => {
    const { container } = render(
      <Cap0Provider>
        <WatchlistPanel onRowSelect={vi.fn()} />
      </Cap0Provider>,
    )
    for (const tu of TU_VUNG_CAP5) {
      expect(container.textContent).not.toContain(tu)
    }
  })

  it("★ giữ NGUYÊN 3 tab cũ — nhiệm vụ ③ Cấp 0 («Xem tab Theo dõi») còn nguyên chỗ bám", () => {
    render(
      <Cap0Provider>
        <WatchlistPanel onRowSelect={vi.fn()} />
      </Cap0Provider>,
    )
    expect(screen.getByText("Theo dõi")).toBeInTheDocument()
    expect(screen.getByText("Nắm giữ")).toBeInTheDocument()
  })

  it("★ KHÔNG hiện điểm đồng thuận «x/5» cho mã nào", () => {
    const { container } = render(<WatchlistPanel />)
    expect(container.textContent).not.toMatch(/[0-5—]\/5/)
  })
})
