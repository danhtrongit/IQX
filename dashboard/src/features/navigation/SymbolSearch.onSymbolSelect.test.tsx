import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★★ BUG FOUNDER BÁO: "Search Mã khác thì màn hình đặt lệnh về như cũ. VD:
 * Search mã ACB."
 *
 * `SymbolSearch` sống trong `Header`, và `Header` có mặt trên CẢ 9 trang cấp
 * (`Cap0TradingPage`…`Cap8TradingPage`). `go()` gọi `navigate('/co-phieu/:sym')`
 * VÔ ĐIỀU KIỆN — nên gõ một mã vào ô tìm kiếm của terminal là rời hẳn
 * `/dau-truong`: mất hành trình, mất form kế hoạch đang gõ dở, và panel đặt
 * lệnh dựng lại từ đầu ("về như cũ").
 *
 * Cùng khuôn với `CenterPanel.symbolChange` và `WatchlistPanel.onRowSelect`:
 * host truyền prop → đổi mã TẠI CHỖ. KHÔNG prop (tức /bieu-do, /co-phieu) →
 * giữ nguyên `navigate` như cũ. Hai chiều đều được canh ở dưới.
 */

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))

vi.mock("@/features/market-data", () => ({
  useSymbolSearch: () => ({ results: [], isFetching: false }),
}))
vi.mock("./StockLogo", () => ({ StockLogo: () => null }))
vi.mock("./icons", () => ({ IconTrendingUp: () => null }))

/**
 * Arco `Select` thay bằng stub phơi thẳng `onSearch`/`onChange`/`onKeyDown` —
 * ba cửa duy nhất dẫn vào `go()`. Test đi đúng đường người dùng đi (chọn một
 * dòng gợi ý, hoặc gõ tự do rồi Enter) mà không phải lái portal của Arco.
 */
vi.mock("@arco-design/web-react", () => {
  const Select = (props: {
    onChange?: (v: string) => void
    onSearch?: (v: string) => void
    onKeyDown?: (e: { key: string; preventDefault: () => void }) => void
  }) => (
    <div>
      <button type="button" onClick={() => props.onChange?.("ACB")}>
        pick-option
      </button>
      <button type="button" onClick={() => props.onSearch?.("acb")}>
        type-acb
      </button>
      <button
        type="button"
        onClick={() => props.onKeyDown?.({ key: "Enter", preventDefault: () => {} })}
      >
        press-enter
      </button>
    </div>
  )
  Select.Option = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    Select,
    Spin: () => null,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  }
})
vi.mock("@arco-design/web-react/icon", () => ({ IconSearch: () => null }))

import { SymbolSearch } from "./SymbolSearch"

describe("SymbolSearch — onSymbolSelect", () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it("★★ TRONG trang cấp (có onSymbolSelect): chọn ACB → đổi mã tại chỗ, KHÔNG navigate", () => {
    const onSymbolSelect = vi.fn()
    render(<SymbolSearch onSymbolSelect={onSymbolSelect} />)

    fireEvent.click(screen.getByText("pick-option"))

    expect(onSymbolSelect).toHaveBeenCalledWith("ACB")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ TRONG trang cấp: gõ tự do 'acb' rồi Enter → đổi mã tại chỗ (viết hoa), KHÔNG navigate", () => {
    const onSymbolSelect = vi.fn()
    render(<SymbolSearch onSymbolSelect={onSymbolSelect} />)

    fireEvent.click(screen.getByText("type-acb"))
    fireEvent.click(screen.getByText("press-enter"))

    expect(onSymbolSelect).toHaveBeenCalledWith("ACB")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ NGOÀI trang cấp (không prop): /bieu-do & /co-phieu giữ nguyên navigate", () => {
    render(<SymbolSearch />)

    fireEvent.click(screen.getByText("pick-option"))

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/ACB")
  })

  it("NGOÀI trang cấp: gõ tự do + Enter vẫn navigate như cũ", () => {
    render(<SymbolSearch />)

    fireEvent.click(screen.getByText("type-acb"))
    fireEvent.click(screen.getByText("press-enter"))

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/ACB")
  })

  it("chuỗi rỗng không gọi gì cả (cả hai chiều)", () => {
    const onSymbolSelect = vi.fn()
    render(<SymbolSearch onSymbolSelect={onSymbolSelect} />)

    // `press-enter` khi chưa gõ gì: `query` rỗng → `go()` không chạy.
    fireEvent.click(screen.getByText("press-enter"))

    expect(onSymbolSelect).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
