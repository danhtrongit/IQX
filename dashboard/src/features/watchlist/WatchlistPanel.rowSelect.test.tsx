import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React, { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★ Hai hành vi của panel "Danh mục" mà Cấp 0 phụ thuộc vào, và cả hai đều phải
 * TẮT hoàn toàn ngoài `/dau-truong` — panel này dùng chung với /bieu-do và
 * /co-phieu, và rò rỉ sang đó là lỗi lặp đi lặp lại của repo này.
 *
 *  1. **Bấm vào một mã.** Mặc định là navigate `/co-phieu/:symbol`. Đúng trên
 *     hai route dùng chung; SAI bên trong một trang cấp, nơi nó ném người dùng
 *     ra khỏi terminal giữa lúc đang làm nhiệm vụ (và ra khỏi `Cap0Provider`,
 *     nên lệnh tiếp theo của họ bắn vào bus no-op). `RightSidebar` truyền
 *     `onRowSelect` khi có shell cấp đang mount; panel phải TÔN TRỌNG nó và
 *     KHÔNG navigate.
 *  2. **Mở một tab.** Đó chính là nhiệm vụ ② «Xem tab Nắm giữ» / ③ «Xem tab
 *     Theo dõi». Panel chỉ BÁO tab đang hiện lên bus Cấp 0; mọi luật "có ghi
 *     nhiệm vụ không" nằm ở `Gbar` (xem `gbar.test.tsx`).
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
  useWatchlist: () => ({ data: [{ symbol: "VNM" }], isLoading: false }),
  useAddToWatchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveFromWatchlist: () => ({ mutateAsync: vi.fn() }),
  useSparkline: () => ({ data: [] }),
  useSymbolInfo: () => ({ data: null }),
}))

vi.mock("./api", () => ({ watchlistApi: { validateStock: vi.fn() } }))

vi.mock("@/features/trading", () => ({
  usePortfolio: () => ({
    data: {
      positions: [
        {
          symbol: "HPG",
          quantity: 100,
          avgBuyPrice: 30000,
          currentPrice: 31000,
          marketValue: 3_100_000,
          unrealizedPnl: 100_000,
        },
      ],
      balance: 1,
      totalAssets: 1,
      pnl: 0,
      pnlPercent: 0,
    },
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

// `Cap0Provider` itself calls `useCap0Progress`, which needs a real
// QueryClient this file deliberately doesn't mount — stub it. The provider's
// only other job here is the notify/register plumbing, which stays real.
vi.mock("@/features/cap0/hooks", () => ({
  useCap0Progress: () => ({ data: null }),
}))

import { WatchlistPanel } from "./WatchlistPanel"
import { Cap0Provider, useCap0Events, type Cap0PortfolioTab } from "@/features/cap0/Cap0Context"

const TAB_STORAGE_KEY = "iqx.watchlist.activeTab"

/** Registers a spy as the bus's `onPortfolioTabOpen` handler (what `Gbar` does). */
function TabSpy({ onOpen }: { onOpen: (tab: Cap0PortfolioTab) => void }) {
  const { registerHandlers } = useCap0Events()
  useEffect(() => {
    registerHandlers({ onPortfolioTabOpen: onOpen })
  }, [registerHandlers, onOpen])
  return null
}

beforeEach(() => {
  navigateMock.mockReset()
  window.localStorage.clear()
})

// ── Bấm vào một mã ──────────────────────────────────────────────────────────
describe("WatchlistPanel — bấm vào một mã", () => {
  it("★ Nắm giữ: có onRowSelect thì GỌI nó và KHÔNG navigate (trang cấp giữ người dùng ở lại terminal)", () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "holdings")
    const onRowSelect = vi.fn()
    render(<WatchlistPanel onRowSelect={onRowSelect} />)

    fireEvent.click(screen.getByText("HPG"))

    expect(onRowSelect).toHaveBeenCalledWith("HPG")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  // ★★ Mặt còn lại của cùng một luật: /bieu-do và /co-phieu KHÔNG truyền prop,
  // và ở đó điều hướng tới trang mã vẫn phải y như cũ.
  it("★★ Nắm giữ: KHÔNG có onRowSelect thì vẫn navigate /co-phieu/:symbol y như cũ", () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "holdings")
    render(<WatchlistPanel />)

    fireEvent.click(screen.getByText("HPG"))

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/HPG")
  })

  it("★ Theo dõi: cùng một luật — onRowSelect thay cho navigate", () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "watchlist")
    const onRowSelect = vi.fn()
    render(<WatchlistPanel onRowSelect={onRowSelect} />)

    fireEvent.click(screen.getByText("VNM"))

    expect(onRowSelect).toHaveBeenCalledWith("VNM")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ Theo dõi: KHÔNG có onRowSelect thì vẫn navigate /co-phieu/:symbol", () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "watchlist")
    render(<WatchlistPanel />)

    fireEvent.click(screen.getByText("VNM"))

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })
})

// ── Mở một tab = nhiệm vụ ②③ của Cấp 0 ──────────────────────────────────────
describe("WatchlistPanel — báo tab đang mở lên bus Cấp 0", () => {
  it("★ báo tab đang hiện NGAY TỪ LÚC MOUNT (tab được nhớ trong localStorage)", async () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "holdings")
    const onOpen = vi.fn()
    render(
      <Cap0Provider>
        <TabSpy onOpen={onOpen} />
        <WatchlistPanel />
      </Cap0Provider>,
    )
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("holdings"))
  })

  it("★ báo tab mới mỗi lần người dùng đổi tab", async () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "watchlist")
    const onOpen = vi.fn()
    render(
      <Cap0Provider>
        <TabSpy onOpen={onOpen} />
        <WatchlistPanel />
      </Cap0Provider>,
    )
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("watchlist"))

    fireEvent.click(screen.getByText("Nắm giữ"))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("holdings"))
  })

  // ★★ Ngoài `Cap0Provider` hàm notify là `undefined` — panel dùng chung này
  // phải chạy y hệt trên /bieu-do và /co-phieu, không crash và không phát gì.
  it("★★ ngoài Cấp 0 thì hoàn toàn im lặng — panel vẫn render bình thường", () => {
    window.localStorage.setItem(TAB_STORAGE_KEY, "holdings")
    render(<WatchlistPanel />)
    expect(screen.getByText("HPG")).toBeInTheDocument()
    expect(screen.getByText("Theo dõi")).toBeInTheDocument()
  })
})
