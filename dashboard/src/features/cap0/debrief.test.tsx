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
    task1_star_clicked: false,
    task5_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

// ── coachTemplate (spec v3.0 §5 — EXACTLY 2 verbatim templates) ──────────────
// v3.0 removed cắt lỗ/chốt lời from Cấp 0 entirely, so the situation the coach
// reads reduces to one bit: lãi or không-lãi. Templates C/D/E (all of which
// asserted something about a ngưỡng cắt lỗ) are gone with the data that fed
// them — under v3.0 there is never a recorded SL, so their premise is void.
describe("coachTemplate", () => {
  it("A — lệnh lãi: verbatim spec §5 template A", () => {
    const text = coachTemplate({ pnlPositive: true }, 2)
    expect(text).toContain("Lệnh 2 khép trọn vòng đời: mua — nắm giữ — theo dõi — bán")
    expect(text).toContain("bạn đã đi đủ một vòng giao dịch hoàn chỉnh")
    expect(text).toContain("nhiều người mua cổ phiếu còn không biết mình đang nắm gì")
    expect(text).toContain("thuế bán 0,1%")
  })

  it("B — lệnh lỗ: verbatim spec §5 template B", () => {
    const text = coachTemplate({ pnlPositive: false }, 3)
    expect(text).toContain("Lệnh 3 lỗ nhẹ")
    expect(text).toContain("đây là Sân tập, tiền không thật")
    expect(text).toContain("Cái bạn thu được là kinh nghiệm, không phải con số")
    expect(text).toContain("thuế bán 0,1%")
  })

  // ★ The v3.0 constraint, stated in four places in the spec: Cấp 0 has NO
  // cắt lỗ/chốt lời ANYWHERE — including coach copy. The old templates C/D/E
  // told a Cấp 0 user they had "chạm cắt lỗ", "bán trước kế hoạch", or should
  // "gõ ngưỡng cắt lỗ" into a field that no longer exists.
  it("★ neither template ever tells a Cấp 0 user to set or check their own cắt lỗ", () => {
    for (const pnlPositive of [true, false]) {
      const text = coachTemplate({ pnlPositive }, 1)
      expect(text).not.toContain("Bán khi chưa chạm cắt lỗ")
      expect(text).not.toContain("Cắt lỗ đúng kế hoạch")
      expect(text).not.toContain("gõ ngưỡng cắt lỗ")
      expect(text).not.toContain("Không có dữ liệu ngưỡng cắt lỗ")
      expect(text).not.toContain("chốt lời chạm đúng mục tiêu")
    }
  })

  it("orderNo defaults to 1 and appears in BOTH templates", () => {
    expect(coachTemplate({ pnlPositive: true })).toContain("Lệnh 1 khép trọn vòng đời")
    expect(coachTemplate({ pnlPositive: false })).toContain("Lệnh 1 lỗ nhẹ")
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

  // ★ v3.0 §8: "Sổ lệnh bid/ask → ẨN | Lên Cấp 2 (không hiện ở Cấp 0 và Cấp
  // 1)". Cấp 0 has NO unlock for it at all — the old `task_2_done_at` unlock
  // (tour bảng điện) opened it a whole level early. `cap0Visibility` is a pure
  // function of `Cap0Progress` and so cannot know about Cấp 2; the Cấp 2
  // short-circuit lives in `TradingPanel`'s `!isCap2Active`.
  it("★ never reveals sổ lệnh bid/ask inside Cấp 0 — not on task ②, not even once graduated", () => {
    expect(cap0Visibility(makeProgress({ task_2_done_at: "2026-07-21T00:00:00Z" })).orderBook).toBe(
      false,
    )
    expect(
      cap0Visibility(
        makeProgress({
          task_1_done_at: "t",
          task_2_done_at: "t",
          task_3_done_at: "t",
          task_4_done_at: "t",
          task_5_done_at: "t",
          graduated_at: "2026-07-21T00:00:00Z",
        }),
      ).orderBook,
    ).toBe(false)
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

// ── DebriefModal (spec v3.0 §5 Kết sổ) ─────────────────────────────────────────
describe("DebriefModal", () => {
  const winData: DebriefData = {
    n: 1,
    symbol: "VNM",
    quantity: 100,
    entryPrice: 61800,
    exitPrice: 63000,
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
    expect(screen.getByText("Giá ra · thuế bán 0,1%")).toBeInTheDocument()

    // Coach block (template A — lệnh lãi)
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText(/Lệnh 1 khép trọn vòng đời/)).toBeInTheDocument()

    // Count-up P&L eventually settles on the final +1.9% (63000 vs 61800).
    await waitFor(
      () => expect(screen.getByText("+1.9%")).toBeInTheDocument(),
      { timeout: 2000 },
    )

    expect(screen.getByText("Đóng kết sổ ✓")).toBeInTheDocument()
  })

  // ★ v3.0 removed cắt lỗ/chốt lời from Cấp 0 entirely (preamble, §0, §8, §13)
  // — the Kết sổ table's two threshold rows go with them. Nothing in this modal
  // may name, show, or pass judgement on a stop/target any more.
  it("★ has NO Cắt lỗ / Chốt lời rows at all", () => {
    render(<DebriefModal data={winData} onClose={vi.fn()} />)
    expect(screen.queryByText("Cắt lỗ")).not.toBeInTheDocument()
    expect(screen.queryByText("Chốt lời")).not.toBeInTheDocument()
    // ...nor any of the verdicts those rows used to render.
    expect(screen.queryByText("không chạm")).not.toBeInTheDocument()
    expect(screen.queryByText("chạm")).not.toBeInTheDocument()
    expect(screen.queryByText("chạm mục tiêu ✓")).not.toBeInTheDocument()
    expect(screen.queryByText("chưa tới — bán tay")).not.toBeInTheDocument()
    expect(screen.queryByText("không ghi nhận")).not.toBeInTheDocument()
  })

  it('★ clicking "Đóng kết sổ ✓" calls completeTask(5, "debrief") — the ONLY behaviour gate of Cấp 0', () => {
    const onClose = vi.fn()
    render(<DebriefModal data={winData} onClose={onClose} />)

    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 5, gate: "debrief" })
    expect(completeTaskMutate).not.toHaveBeenCalledWith({ taskNo: 6, gate: "debrief" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("a losing round trip gets coach template B, and never a cắt-lỗ accusation", () => {
    const lossData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
    }
    render(<DebriefModal data={lossData} onClose={vi.fn()} />)
    expect(screen.getByText(/Lệnh 2 lỗ nhẹ/)).toBeInTheDocument()
    expect(screen.queryByText(/Bán khi chưa chạm cắt lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cắt lỗ đúng kế hoạch/)).not.toBeInTheDocument()
  })

  it("uses the typographic minus «−» (U+2212) for a NEGATIVE VND subline, same glyph as the P&L %", () => {
    const lossData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
    }
    render(<DebriefModal data={lossData} onClose={vi.fn()} />)
    // (58,900 − 62,000) × 100 = −310,000 ₫ — must use "−" (U+2212), never a
    // plain ASCII hyphen ("-", U+002D), which `toLocaleString` would emit.
    expect(screen.getByText("−310,000 ₫ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.queryByText(/-310,000/)).not.toBeInTheDocument()
  })

  it("a Kết sổ rebuilt from order history renders identically — there is no plan data to be missing any more", () => {
    const retroData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
    }
    render(<DebriefModal data={retroData} onClose={vi.fn()} />)
    expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText(/Lệnh 2 lỗ nhẹ/)).toBeInTheDocument()
    // The old "không ghi nhận" honesty fallback existed only because sl/tp
    // could be unknown; with no sl/tp at all there is nothing to disclaim.
    expect(screen.queryByText("không ghi nhận")).not.toBeInTheDocument()
  })

  it("still completes nhiệm vụ ⑤ when a retroactive Kết sổ is closed", () => {
    const onClose = vi.fn()
    render(
      <DebriefModal
        data={{ n: 2, symbol: "VNM", quantity: 100, entryPrice: 62000, exitPrice: 58900 }}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 5, gate: "debrief" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
