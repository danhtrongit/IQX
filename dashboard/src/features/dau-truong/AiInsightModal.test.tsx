import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★ Modal «AI Phân tích» của thanh công cụ trong shell cấp: nhập mã → đọc kết
 * quả NGAY TRONG trang. Không có `useNavigate` ở đâu trong cây này cả — bài
 * cuối cùng canh đúng điều đó ở mức module, để một lần "tiện tay" thêm lại
 * `navigate` là đỏ.
 */

const { usePremiumStatusMock } = vi.hoisted(() => ({ usePremiumStatusMock: vi.fn() }))

vi.mock("@/features/premium/hooks", () => ({
  usePremiumStatus: () => usePremiumStatusMock(),
}))

// `PremiumLockedOverlay` (bên trong `PremiumGate`) dùng `useAuth` + `useNavigate`
// — mock ở mức lá để bài này không cần cả router lẫn QueryClient.
vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    setShowAuthModal: vi.fn(),
    setAuthModalTab: vi.fn(),
  }),
}))

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))

vi.mock("@/features/stock/ai-insight", () => ({
  AiInsightBriefing: ({ symbol }: { symbol: string }) => (
    <div data-testid="ai-briefing">{`briefing:${symbol}`}</div>
  ),
}))

import { AiInsightSymbolModal, isAnalyzableSymbol } from "./AiInsightModal"
import { readFileSync } from "node:fs"

function premium(isPremium: boolean) {
  usePremiumStatusMock.mockReturnValue({ isPremium, isLoading: false })
}

describe("AiInsightSymbolModal", () => {
  beforeEach(() => {
    usePremiumStatusMock.mockReset()
    premium(true)
  })

  it("★★ nhập mã rồi Phân tích → briefing hiện TẠI CHỖ (không rời trang)", async () => {
    render(<AiInsightSymbolModal visible onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("VD: VCB"), { target: { value: "acb" } })
    fireEvent.click(screen.getByText("Phân tích"))

    await waitFor(() => expect(screen.getByTestId("ai-briefing")).toHaveTextContent("briefing:ACB"))
  })

  it("mã không hợp lệ (chỉ số toàn thị trường) bị chặn ở nút Phân tích", () => {
    render(<AiInsightSymbolModal visible onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("VD: VCB"), { target: { value: "VNINDEX" } })

    expect(screen.getByText("Phân tích").closest("button")).toBeDisabled()
  })

  it("isAnalyzableSymbol: chặn chỉ số và chuỗi rác, nhận mã thường", () => {
    expect(isAnalyzableSymbol("acb")).toBe(true)
    expect(isAnalyzableSymbol("VN30")).toBe(false)
    expect(isAnalyzableSymbol("VNINDEX")).toBe(false)
    expect(isAnalyzableSymbol("A")).toBe(false)
    expect(isAnalyzableSymbol("")).toBe(false)
  })

  it("★★ module KHÔNG chứa bất kỳ điều hướng nào", () => {
    const src = readFileSync(
      new URL("./AiInsightModal.tsx", `file://${process.cwd()}/src/features/dau-truong/`),
      "utf8",
    )
    expect(src).not.toMatch(/useNavigate|window\.location|<Link\b/)
  })

  /**
   * ★★ Kịch bản thật: user FREE ở Cấp 0 «Nhập môn» (Sân tập KHÔNG cần Premium)
   * bấm «AI Phân tích» → nhập VCB → Phân tích. Endpoint là premium-only
   * (`PremiumUser`), nên trước bản vá họ đọc một dòng đỏ "Không thể tải phân
   * tích AI — vui lòng thử lại sau", tức bị báo là lỗi tạm thời và không bao
   * giờ biết mình cần Premium.
   */
  describe("user KHÔNG Premium", () => {
    beforeEach(() => premium(false))

    it("★★ thấy tường Premium kèm lối nâng cấp, KHÔNG phải lỗi 'thử lại sau'", async () => {
      render(<AiInsightSymbolModal visible onClose={vi.fn()} />)

      fireEvent.change(screen.getByPlaceholderText("VD: VCB"), { target: { value: "VCB" } })
      fireEvent.click(screen.getByText("Phân tích"))

      await waitFor(() =>
        expect(screen.getByText("Tính năng dành cho Premium")).toBeInTheDocument(),
      )
      expect(screen.getByText("Nâng cấp ngay")).toBeInTheDocument()
      // Nội dung premium vẫn được dựng nhưng nằm SAU tường (aria-hidden + blur)
      // — đúng cách `features/stock/StockPage.tsx` bọc chính component này.
      expect(screen.getByTestId("ai-briefing").closest("[aria-hidden]")).not.toBeNull()
    })
  })
})
