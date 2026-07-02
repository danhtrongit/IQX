// MidDayArticle.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { MidDayArticle } from "./MidDayArticle"
const data = {
  report_type: "midday", headline: "VN-Index giảm 0,4% phiên sáng — thanh khoản thấp",
  tagline: { text: "THẬN TRỌNG", color: "neutral" },
  paragraphs: { session_structure: { status: "published", content: "<p>a</p>" },
                money_flow: { status: "published", content: "<p>b</p>" },
                market_health: { status: "pending", pending_message: "Cập nhật 16:30", pending_until: "" } },
  unexplained: { title: "Điểm cần xác nhận trong phiên chiều", content: "c" },
  scenarios: [], watchlist: [],
} as any
describe("MidDayArticle", () => {
  it("shows the PHIÊN SÁNG badge, 2 paragraphs and the pending placeholder", () => {
    render(<MidDayArticle data={data} />)
    expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument()
    expect(screen.getByText(/Cập nhật 16:30/)).toBeInTheDocument()
    expect(screen.getByText(/Điểm cần xác nhận trong phiên chiều/)).toBeInTheDocument()
  })
})
