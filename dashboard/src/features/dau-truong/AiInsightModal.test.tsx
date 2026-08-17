import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

/**
 * ★ Modal «AI Phân tích» của thanh công cụ trong shell cấp: nhập mã → đọc kết
 * quả NGAY TRONG trang. Không có `useNavigate` ở đâu trong cây này cả — bài
 * cuối cùng canh đúng điều đó ở mức module, để một lần "tiện tay" thêm lại
 * `navigate` là đỏ.
 */

vi.mock("@/features/stock/ai-insight", () => ({
  AiInsightBriefing: ({ symbol }: { symbol: string }) => (
    <div data-testid="ai-briefing">{`briefing:${symbol}`}</div>
  ),
}))

import { AiInsightSymbolModal, isAnalyzableSymbol } from "./AiInsightModal"
import { readFileSync } from "node:fs"

describe("AiInsightSymbolModal", () => {
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
})
