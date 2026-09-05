import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { expectRendersNothing } from "@/__tests__/textGuards"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { completeTaskMutate, kehoachMock } = vi.hoisted(() => ({
  completeTaskMutate: vi.fn(),
  // `GET /cap0/kehoach?order_id=` — feeds the §5 `Lý do mua` and
  // `Thời gian giữ` rows. Defaults to "no row yet" so the many pre-existing
  // tests below exercise the honest-unknown rendering without opting in.
  kehoachMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
}))
// `DebriefModal` needs `useCompleteTask` + `useCap0Kehoach` — mock
// `./hooks` directly (same pattern as `Cap0TradingPage.test.tsx`) so no
// QueryClient/http-client setup is needed for this file.
// ★ The hook's own `enabled` guard is NOT exercised here (it is mocked away);
// `hooks.test.tsx` renders the REAL hook against a mocked ky client for that.
vi.mock("./hooks", () => ({
  useCompleteTask: () => ({ mutate: completeTaskMutate }),
  useCap0Kehoach: (...a: unknown[]) => kehoachMock(...a),
}))

import { cap0Visibility } from "./cap0Visibility"
import { DebriefModal, type DebriefData } from "./DebriefModal"

function makeProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task4_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

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

  it("reveals Ô Giá + dropdown loại lệnh once task ① is done", () => {
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
    buyOrderId: "buy-order-1",
  }

  beforeEach(() => {
    completeTaskMutate.mockReset()
    kehoachMock.mockReset()
    kehoachMock.mockReturnValue({ data: null })
  })

  it("renders nothing when data is null", () => {
    render(<DebriefModal data={null} onClose={vi.fn()} />)
    // ★★ KHÔNG dùng `expect(container).toBeEmptyDOMElement()`: component này chỉ
    // gồm một Arco `Modal` → portal ở `document.body`, nên `container` rỗng BẤT
    // KỂ nó trả `null` hay trả một modal đầy chữ (đã chứng minh bằng đột biến).
    expectRendersNothing()
  })

  it("renders header, Kế hoạch/Thực tế table, coach block, and the close button", async () => {
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText(/MUA 100 VNM → BÁN/)).toBeInTheDocument()

    // Kế hoạch / Thực tế table — short row labels, matching Cấp 1's Kết sổ
    // and both mockups (`iqx-cap0-ketso.html` / `iqx-cap1-ketso.html`).
    expect(screen.getByText("Đối chiếu")).toBeInTheDocument()
    expect(screen.getByText("Giá vào")).toBeInTheDocument()
    expect(screen.getByText("Giá ra · thuế")).toBeInTheDocument()
    expect(screen.queryByText("Giá ra · thuế bán 0,1%")).not.toBeInTheDocument()
    expect(screen.getByText("Lý do mua")).toBeInTheDocument()
    expect(screen.getByText("Thời gian giữ")).toBeInTheDocument()

    // ★ Khối coach "NHÌN LẠI" đã bỏ theo yêu cầu điều chỉnh.
    expect(screen.queryByText("NHÌN LẠI")).not.toBeInTheDocument()

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

    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 4, gate: "debrief" })
    expect(completeTaskMutate).not.toHaveBeenCalledWith({ taskNo: 6, gate: "debrief" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("uses the typographic minus «−» (U+2212) for a NEGATIVE VND subline, same glyph as the P&L %", () => {
    const lossData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
      buyOrderId: "buy-order-2",
    }
    render(<DebriefModal data={lossData} onClose={vi.fn()} />)
    // (58,900 − 62,000) × 100 = −310,000đ — must use "−" (U+2212), never a
    // plain ASCII hyphen ("-", U+002D), which `toLocaleString` would emit.
    expect(screen.getByText("−310,000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    expect(screen.queryByText(/-310,000/)).not.toBeInTheDocument()
  })

  it("a Kết sổ rebuilt from order history renders identically — there is no plan data to be missing any more", () => {
    const retroData: DebriefData = {
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 62000,
      exitPrice: 58900,
      buyOrderId: "buy-order-2",
    }
    render(<DebriefModal data={retroData} onClose={vi.fn()} />)
    expect(screen.getByText("KẾT SỔ LỆNH · #2 · SÂN TẬP")).toBeInTheDocument()
    // The old "không ghi nhận" honesty fallback existed only because sl/tp
    // could be unknown; with no sl/tp at all there is nothing to disclaim.
    expect(screen.queryByText("không ghi nhận")).not.toBeInTheDocument()
  })

  // ── §5 bảng đối chiếu: Lý do mua + Thời gian giữ (từ `cap0_order_kehoach`) ──
  // These two rows are the only thing in the Kết sổ that is NOT derivable from
  // the sell fill itself.
  //
  // ★★ Keyed on the BUY ORDER, never on the symbol. The symbol-keyed read this
  // replaced returned the user's most recent VNM buy, which after a re-entry is
  // a DIFFERENT, still-open order — so `Lý do mua`/`Thời gian giữ` described one
  // round trip while `Giá vào`/`Giá ra` beside them described another.
  it("★ reads the chip + hold time keyed on the BUY ORDER of the round trip on screen", () => {
    kehoachMock.mockReturnValue({
      data: { ly_do_label: "Công ty tôi biết", so_phien_giu: 4, gia_vao: 61800 },
    })
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(kehoachMock).toHaveBeenCalledWith("buy-order-1")
    expect(kehoachMock).not.toHaveBeenCalledWith("VNM")
    expect(screen.getByText("Công ty tôi biết")).toBeInTheDocument()
    expect(screen.getByText("4 phiên")).toBeInTheDocument()
    // Mockup: `Lý do mua` spans Kế hoạch + Thực tế rather than showing "—"
    // under Thực tế (there is no "thực tế" version of a reason).
    expect(screen.getByText("Công ty tôi biết").getAttribute("colspan")).toBe("2")
  })

  it('appends "· Giữ {n} phiên" to the sub-line when the position was actually held', () => {
    kehoachMock.mockReturnValue({
      data: { ly_do_label: "Giá đang tăng", so_phien_giu: 4, gia_vao: 61800 },
    })
    render(<DebriefModal data={winData} onClose={vi.fn()} />)
    expect(screen.getByText(/MUA 100 VNM → BÁN · Giữ 4 phiên/)).toBeInTheDocument()
  })

  // ★ Cấp 0 is Sân tập / T+0, so `so_phien_giu` is 0 for the COMMON case (buy
  // and sell in the same session). Task 1 deliberately did not floor it to 1 —
  // that would be a fabricated number — so the FE must not print the nonsense
  // "Giữ 0 phiên"/"0 phiên" either. It says what actually happened instead.
  it("★ never prints «Giữ 0 phiên» for a same-session round trip — it says «Trong cùng phiên»", () => {
    kehoachMock.mockReturnValue({
      data: { ly_do_label: "Thử cho biết", so_phien_giu: 0, gia_vao: 61800 },
    })
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(screen.queryByText(/Giữ 0 phiên/)).not.toBeInTheDocument()
    expect(screen.queryByText("0 phiên")).not.toBeInTheDocument()
    expect(screen.getByText(/MUA 100 VNM → BÁN · Trong cùng phiên/)).toBeInTheDocument()
    // The `Thời gian giữ` row says the same thing, not a number.
    expect(screen.getByText("Trong cùng phiên")).toBeInTheDocument()
  })

  // ★ The read returns `null` when nothing was recorded (buy made before this
  // shipped, or the non-fatal POST failed). Show "—", never a made-up chip or
  // a hold time of 0/1 phiên.
  it("★ shows «—» for both rows when there is no kehoach row — and no sub-line suffix", () => {
    kehoachMock.mockReturnValue({ data: null })
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(screen.getByText(/MUA 100 VNM → BÁN$/)).toBeInTheDocument()
    expect(screen.queryByText(/Giữ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/phiên/)).not.toBeInTheDocument()
    expect(screen.queryByText("Trong cùng phiên")).not.toBeInTheDocument()
    // Lý do mua + Giá ra (Kế hoạch) + Thời gian giữ (Kế hoạch) + Thời gian giữ
    // (Thực tế) — every unknown reads as the table's own em-dash.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3)
  })

  // ★ The backend now answers `so_phien_giu: null` when the round trip has no
  // matching sell — a length it does not know, rather than one counted to
  // today. The chip is still real and must still show; only the hold time is "—".
  it("★ shows the chip but «—» for a hold time the server reports as unknown", () => {
    kehoachMock.mockReturnValue({
      data: { ly_do_label: "Thấy trên mạng", so_phien_giu: null, gia_vao: 61800 },
    })
    render(<DebriefModal data={winData} onClose={vi.fn()} />)

    expect(screen.getByText("Thấy trên mạng")).toBeInTheDocument()
    expect(screen.getByText(/MUA 100 VNM → BÁN$/)).toBeInTheDocument()
    expect(screen.queryByText(/phiên/)).not.toBeInTheDocument()
    expect(screen.queryByText("Trong cùng phiên")).not.toBeInTheDocument()
  })

  // NOTE (was: "does not query for a kehoach row while the modal is closed").
  // `useCap0Kehoach` is mocked away in this file, so its real
  // `enabled: isAuthenticated && !!orderId` guard cannot be exercised here —
  // the old name promised a guarantee this file structurally cannot make, and
  // the assertion would have passed unchanged had the hook fetched
  // unconditionally. The real guard is pinned in `hooks.test.tsx`
  // ("useCap0Kehoach — the enabled guard"); what is checked HERE is only the
  // modal's own half of the contract: a closed modal passes no order key down.
  it("passes a null order key to the kehoach hook while the modal is closed", () => {
    render(<DebriefModal data={null} onClose={vi.fn()} />)
    expect(kehoachMock).toHaveBeenCalledWith(null)
  })

  it("still completes nhiệm vụ ④ when a retroactive Kết sổ is closed", () => {
    const onClose = vi.fn()
    render(
      <DebriefModal
        data={{
          n: 2,
          symbol: "VNM",
          quantity: 100,
          entryPrice: 62000,
          exitPrice: 58900,
          buyOrderId: "buy-order-2",
        }}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(completeTaskMutate).toHaveBeenCalledWith({ taskNo: 4, gate: "debrief" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
