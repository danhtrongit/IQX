import { render } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * ★ Bug punch-list 2026-08-12: trên /dau-truong, đổi mã (click ở Nắm giữ →
 * setSymbol → widget đổi → TVChart bắn onSymbolChanged) bị `CenterPanel`
 * navigate('/co-phieu/…') vô điều kiện → user bị ném khỏi Cấp 0/1 về màn
 * hình đặt lệnh mặc định. Các trang cấp truyền `symbolChange="select"`:
 * đổi mã TẠI CHỖ, không điều hướng. /bieu-do & /co-phieu giữ "navigate".
 */

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))

const setSymbolMock = vi.fn()
let userId: string | null = "user-a"
const chartMounted = vi.fn()
const chartUnmounted = vi.fn()
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: userId ? { id: userId } : null }),
}))
vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: setSymbolMock }),
}))
vi.mock("@/shared/theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "dark" }) }))
vi.mock("../chart/drawing-persistence", () => ({ getDrawingPersistence: () => undefined }))

// TVChart thật khởi tạo widget TradingView — thay bằng stub giữ lại callback
// để test tự bắn sự kiện đổi mã như widget làm.
let firedSymbolChanged: ((s: string) => void) | undefined
vi.mock("../chart/TVChart", () => ({
  TVChart: ({ onSymbolChanged }: { onSymbolChanged?: (s: string) => void }) => {
    React.useEffect(() => {
      chartMounted()
      return () => chartUnmounted()
    }, [])
    firedSymbolChanged = onSymbolChanged
    return <div data-testid="tvchart-stub" />
  },
}))

import { CenterPanel } from "./CenterPanel"

describe("CenterPanel — symbolChange", () => {
  beforeEach(() => {
    navigateMock.mockReset()
    setSymbolMock.mockReset()
    firedSymbolChanged = undefined
    userId = "user-a"
    chartMounted.mockClear()
    chartUnmounted.mockClear()
  })

  it('★ "select" (trang cấp): chart đổi mã → setSymbol tại chỗ, KHÔNG navigate', () => {
    render(<CenterPanel symbolChange="select" />)
    firedSymbolChanged?.("HOSE:FPT")
    expect(setSymbolMock).toHaveBeenCalledWith("FPT")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('★ echo cùng mã (từ chính setSymbol của ta) là no-op — không setSymbol lại, không navigate', () => {
    render(<CenterPanel symbolChange="select" />)
    firedSymbolChanged?.("HOSE:VNM")
    expect(setSymbolMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('mặc định "navigate" (/bieu-do, /co-phieu): giữ nguyên hành vi cũ', () => {
    render(<CenterPanel />)
    firedSymbolChanged?.("HOSE:FPT")
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/FPT")
    expect(setSymbolMock).not.toHaveBeenCalled()
  })

  it("recreates the chart when the account changes, clearing the old drawings", () => {
    const view = render(<CenterPanel />)
    userId = "user-b"
    view.rerender(<CenterPanel />)
    expect(chartMounted).toHaveBeenCalledTimes(2)
    expect(chartUnmounted).toHaveBeenCalledTimes(1)
    userId = null
    view.rerender(<CenterPanel />)
    expect(chartMounted).toHaveBeenCalledTimes(3)
  })
})
