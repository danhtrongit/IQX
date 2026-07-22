import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { completeTaskMutate } = vi.hoisted(() => ({
  completeTaskMutate: vi.fn(),
}))
// `DebriefModal` only needs `useCompleteTask` — mock `./hooks` directly (same
// pattern as `Cap0TradingPage.test.tsx`) so no QueryClient/http-client setup
// is needed for this file.
vi.mock("./hooks", () => ({
  useCompleteTask: () => ({ mutate: completeTaskMutate }),
}))

import { coachTemplate } from "./coachTemplate"
import { cap0Visibility } from "./cap0Visibility"
import { DebriefModal, type DebriefData } from "./DebriefModal"

function makeProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 250_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task_6_done_at: null,
    task1_star_clicked: false,
    task5_sl_typed: false,
    task6_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

// ── coachTemplate (spec §5 — 4 verbatim templates) ─────────────────────────────
describe("coachTemplate", () => {
  it("A — lãi, không chạm SL, không chạm TP (bán tay khi đang lãi)", () => {
    const text = coachTemplate({ pnlPositive: true, hitSL: false, hitTP: false }, 2)
    expect(text).toContain("Lệnh 2 khép trọn vòng đời")
    expect(text).toContain("bạn đã đi đủ quy trình mà phần lớn người mua cổ phiếu bỏ qua")
    expect(text).toContain("thuế bán 0,1%")
  })

  it("B — lãi, chạm TP", () => {
    const text = coachTemplate({ pnlPositive: true, hitSL: false, hitTP: true })
    expect(text).toContain("Kế hoạch chốt lời chạm đúng mục tiêu")
    expect(text).toContain("ghi lại như một mẫu chuẩn để nhớ")
  })

  it("C — lỗ, chạm SL", () => {
    const text = coachTemplate({ pnlPositive: false, hitSL: true, hitTP: false })
    expect(text).toContain("Cắt lỗ đúng kế hoạch")
    expect(text).toContain("đây không phải thất bại, đây là kỷ luật")
  })

  it("D — lỗ, không chạm SL (bán tay khi đang lỗ)", () => {
    const text = coachTemplate({ pnlPositive: false, hitSL: false, hitTP: false })
    expect(text).toContain("Bán khi chưa chạm cắt lỗ")
    expect(text).toContain("Cấp 2 «Kỷ luật»")
  })

  it("B takes priority over A when both pnlPositive and hitTP are true, regardless of hitSL", () => {
    const text = coachTemplate({ pnlPositive: true, hitSL: true, hitTP: true })
    expect(text).toContain("Kế hoạch chốt lời chạm đúng mục tiêu")
  })
})

// ── cap0Visibility (spec §8 hide-by-level) ─────────────────────────────────────
describe("cap0Visibility", () => {
  it("hides everything on fresh Cấp 0 progress (no tasks done yet)", () => {
    const vis = cap0Visibility(makeProgress())
    expect(vis).toEqual({
      orderBook: false,
      priceField: false,
      orderTypeDropdown: false,
      newsTab: false,
      aiPatternsTab: false,
    })
  })

  it("reveals Ô Giá + dropdown loại lệnh once task ① is done (nhiệm vụ ⑤ mở)", () => {
    const vis = cap0Visibility(makeProgress({ task_1_done_at: "2026-07-21T00:00:00Z" }))
    expect(vis.priceField).toBe(true)
    expect(vis.orderTypeDropdown).toBe(true)
    // Order book / news / patterns stay hidden — different unlock conditions.
    expect(vis.orderBook).toBe(false)
    expect(vis.newsTab).toBe(false)
    expect(vis.aiPatternsTab).toBe(false)
  })

  it("reveals sổ lệnh bid/ask once task ② is done", () => {
    const vis = cap0Visibility(makeProgress({ task_2_done_at: "2026-07-21T00:00:00Z" }))
    expect(vis.orderBook).toBe(true)
  })

  it("reveals Tin tức + AI Mẫu nến once graduated (lên Cấp 1)", () => {
    const vis = cap0Visibility(makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }))
    expect(vis.newsTab).toBe(true)
    expect(vis.aiPatternsTab).toBe(true)
  })

  it("treats null/undefined progress as fully hidden (fail-closed)", () => {
    expect(cap0Visibility(null)).toEqual({
      orderBook: false,
      priceField: false,
      orderTypeDropdown: false,
      newsTab: false,
      aiPatternsTab: false,
    })
    expect(cap0Visibility(undefined)).toEqual({
      orderBook: false,
      priceField: false,
      orderTypeDropdown: false,
      newsTab: false,
      aiPatternsTab: false,
    })
  })
})

// ── DebriefModal (spec §5 Kết sổ) ───────────────────────────────────────────────
describe("DebriefModal", () => {
  const winData: DebriefData = {
    n: 1,
    symbol: "VNM",
    quantity: 100,
    entryPrice: 61800,
    exitPrice: 63000,
    sl: 58710,
    tp: 68000,
  }

  beforeEach(() => {
    completeTaskMutate.mockReset()
  })

  it("renders nothing when data is null", () => {
    const { container } = render(<DebriefModal data={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders header, Kế hoạch/Thực tế table, coach block, and the close button", async () => {
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText(/MUA 100 VNM → BÁN/)).toBeInTheDocument()

    // Kế hoạch / Thực tế table
    expect(screen.getByText("Giá vào")).toBeInTheDocument()
    expect(screen.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(screen.getByText("Chốt lời")).toBeInTheDocument()
    expect(screen.getByText("Giá ra · thuế bán 0,1%")).toBeInTheDocument()
    // Neither SL nor TP was hit (exit 63.000 is between both) — bán tay khi lãi.
    expect(screen.getByText("không chạm")).toBeInTheDocument()
    expect(screen.getByText("chưa tới — bán tay")).toBeInTheDocument()

    // Coach block (template A — lãi, no SL/TP hit)
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText(/Lệnh 1 khép trọn vòng đời/)).toBeInTheDocument()

    // Count-up P&L eventually settles on the final +1.9% (63000 vs 61800).
    await waitFor(
      () => expect(screen.getByText("+1.9%")).toBeInTheDocument(),
      { timeout: 2000 },
    )

    expect(screen.getByText("Đóng kết sổ ✓")).toBeInTheDocument()
  })

  it('clicking "Đóng kết sổ ✓" calls completeTask(6, "debrief") and onClose', () => {
    const onClose = vi.fn()
    render(<DebriefModal data={winData} onClose={onClose} />)

    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 6, gate: "debrief" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("selects coach template C (lỗ, chạm SL) when the exit price hits the stop-loss", () => {
    const lossData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
      sl: 58900,
      tp: 68000,
    }
    render(<DebriefModal data={lossData} onClose={vi.fn()} />)
    expect(screen.getByText(/Cắt lỗ đúng kế hoạch/)).toBeInTheDocument()
    expect(screen.getByText("chạm")).toBeInTheDocument()
  })

  it("uses the typographic minus «−» (U+2212) for a NEGATIVE VND subline, same glyph as the P&L %", () => {
    const lossData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
      sl: 58900,
      tp: 68000,
    }
    render(<DebriefModal data={lossData} onClose={vi.fn()} />)
    // (58,900 − 62,000) × 100 = −310,000 ₫ — must use "−" (U+2212), never a
    // plain ASCII hyphen ("-", U+002D), which `toLocaleString` would emit.
    expect(screen.getByText("−310,000 ₫ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.queryByText(/-310,000/)).not.toBeInTheDocument()
  })

  it("falls back to '—' for SL/TP cells when no Kế hoạch data was captured", () => {
    const noplanData: DebriefData = {
      n: 3,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 62000,
    }
    render(<DebriefModal data={noplanData} onClose={vi.fn()} />)
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2)
  })
})
