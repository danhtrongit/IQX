import { render, screen, fireEvent, within } from "@testing-library/react"
import React, { useEffect, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Spies referenced from inside `vi.mock` factories MUST go through
// `vi.hoisted` (see the same pattern in `Cap0TradingPage.test.tsx`).
const { useCap0ProgressMock, usePremiumStatusMock } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Premium-honest mode fix — `JourneyPanel`'s level-card `ModeBadge` now
  // needs `usePremiumStatus()` too (threaded into `tradingModeFor`). Default
  // to a free user so the many pre-existing "SÂN TẬP" tests below keep
  // passing without opting in; the premium-graduate case is exercised
  // explicitly.
  usePremiumStatusMock: vi.fn(() => ({ isPremium: false, isLoading: false })),
}))

vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))

// The other 4 sidebar-right panels are the EXISTING, untouched features —
// stub them so `RightSidebar`'s tests below only exercise panel *routing*
// (does "journey" resolve to JourneyPanel without breaking the other 4?),
// not their real implementations.
vi.mock("@/features/news", () => ({
  NewsFeedPanel: () => <div data-testid="news-panel" />,
}))
vi.mock("@/features/trading", () => ({
  TradingPanel: () => <div data-testid="trading-panel" />,
}))
vi.mock("@/features/watchlist", () => ({
  WatchlistPanel: () => <div data-testid="watchlist-panel" />,
}))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="premium-gate">{children}</div>
  ),
  usePremiumStatus: (...a: unknown[]) => usePremiumStatusMock(...a),
}))
vi.mock("@/features/patterns", () => ({
  AIPatternPanel: () => <div data-testid="patterns-panel" />,
}))

import { JourneyPanel } from "./JourneyPanel"
import { JourneyBar } from "./JourneyBar"
import { RightSidebar } from "@/features/dashboard/components/RightSidebar"
import { RightToolbar } from "@/features/dashboard/components/RightToolbar"
import { Cap0Provider, useCap0Events } from "./Cap0Context"

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

/** Renders the current `activePanel` so tests can assert `setActivePanel` calls. */
function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

/** Registers a spy as the Cap0 event bus's `onLaunchTour` handler — mirrors
 *  how `Cap0TradingPage` registers the real tour-launch dispatch, so tests
 *  can assert `JourneyPanel`'s "Làm ngay →" calls `onLaunchTour(no)` for
 *  Chặng 2 tasks instead of `setActivePanel("trading")`. */
function LaunchTourSpy({ onLaunch }: { onLaunch: (taskNo: number) => void }) {
  const { registerHandlers } = useCap0Events()
  useEffect(() => {
    registerHandlers({ onLaunchTour: onLaunch })
  }, [registerHandlers, onLaunch])
  return null
}

describe("JourneyPanel", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
  })

  it("renders the level card — CẤP 0 / NHẬP MÔN / italic lesson / mode badge", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0")).toBeInTheDocument()
    expect(screen.getByText("NHẬP MÔN")).toBeInTheDocument()
    expect(
      screen.getByText('"Hiểu sân chơi, và đi trọn vòng đời một lệnh."'),
    ).toBeInTheDocument()
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  it('keeps "SÂN TẬP · T+0" once graduated_at is set for a FREE (non-premium) user — premium-honest mode fix', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
    expect(screen.queryByText("THỰC CHIẾN")).not.toBeInTheDocument()
  })

  it('shows "THỰC CHIẾN" instead once graduated_at is set AND the user is premium (spec §9 mode switch)', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    usePremiumStatusMock.mockReturnValue({ isPremium: true, isLoading: false })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.queryByText("SÂN TẬP · T+0")).not.toBeInTheDocument()
  })

  // Mockup `iqx-cap0-hanhtrinh.html` `.ck-head`: title left, counter right —
  // two elements, not one "… · x/5" string (spec §7 gives the wording, the
  // mockup gives the layout).
  it('shows the checklist header as title + counter — "TRƯỚC KHI LÊN CẤP 1" and "0/5"', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const header = container.querySelector(".cap0-journey-checklist-header")
    expect(header).not.toBeNull()
    const head = within(header as HTMLElement)

    const title = head.getByText("TRƯỚC KHI LÊN CẤP 1")
    expect(title.className).toContain("cap0-journey-checklist-title")
    const count = head.getByText("0/5")
    expect(count.className).toContain("cap0-journey-checklist-count")
    expect(title).not.toBe(count)

    expect(screen.queryByText("TRƯỚC KHI LÊN CẤP 1 · 0/5")).not.toBeInTheDocument()
  })

  // Mockup `.ck-head .c { color: var(--lvl) }` — Cấp 0's `--lvl` is its own grey
  // `#8a90a5` (`LEVELS[0].color`), Cấp 1's is copper. The counter is the ONE
  // level-coloured thing in a `.ck-head` whose title is deliberately `--t3` grey,
  // and the rule lives in shared CSS, so both levels assert it.
  it("colours the counter with the Cấp 0 level colour", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    const { container } = render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const count = container.querySelector(".cap0-journey-checklist-count") as HTMLElement
    expect(count).not.toBeNull()
    expect(count).toHaveTextContent("1/5")
    expect(count).toHaveStyle({ color: "#8a90a5" })
  })

  // Mockup `.lvcard .info`: the mode pill sits INSIDE the info column under the
  // level name, not as a third flex child next to the badge.
  it("puts the mode pill inside the level-card info column, under the name", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const body = container.querySelector(".cap0-level-card-body")
    expect(body).not.toBeNull()
    expect(within(body as HTMLElement).getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  // Mockup `.task .st`: ✅ done · 🎯 đang làm · 🔒 chưa mở.
  it("uses the mockup's emoji status glyphs — ✅ / 🎯 / 🔒", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(within(screen.getByTestId("cap0-task-1")).getByText("✅")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap0-task-2")).getByText("🎯")).toBeInTheDocument()
    // The old numeric circle is gone — the ordinal now lives in the task name.
    expect(within(screen.getByTestId("cap0-task-1")).queryByText("✓")).not.toBeInTheDocument()
    expect(within(screen.getByTestId("cap0-task-2")).getByText("②")).toBeInTheDocument()
  })

  it("shows 🔒 on a task that is not open yet", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(within(screen.getByTestId("cap0-task-5")).getByText("🔒")).toBeInTheDocument()
  })

  // ★ Mô tả nhiệm vụ giờ CHỈ sống trong ô tập trung (mockup vẽ `.ds` trên mọi
  // dòng; bản dẫn-từng-nhiệm-vụ-một dọn chúng lên khối chi phối). Dòng đã xong
  // trong checklist thu gọn chỉ còn tên — và vẫn không có nút.
  it("moves the task description to the ô tập trung — a done row keeps just its name, no button", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const task1 = screen.getByTestId("cap0-task-1")
    expect(within(task1).getByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).toBeInTheDocument()
    expect(within(task1).queryByText(/Mua công ty bạn biết/)).not.toBeInTheDocument()
    expect(within(task1).queryByText("Làm ngay →")).not.toBeInTheDocument()
    // Mô tả của nhiệm vụ ĐANG LÀM (②) thì có, và nằm trong ô tập trung.
    expect(
      within(screen.getByTestId("cap0-focus")).getByText(/Tour ngắn ~2-3 phút, 8 điểm/),
    ).toBeInTheDocument()
  })

  it("renders all 5 task names verbatim (spec v3.0 §7)", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    // Trong checklist đầy đủ (đã hạ cấp) — nhiệm vụ đang làm còn xuất hiện lần
    // nữa ở ô tập trung, nên phải khoanh vùng thay vì `screen.getByText`.
    const rest = within(container.querySelector(".cap0-journey-rest") as HTMLElement)
    expect(rest.getByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).toBeInTheDocument()
    expect(rest.getByText("Tour bảng điện — 8 điểm")).toBeInTheDocument()
    expect(rest.getByText("Tour bản tin thị trường")).toBeInTheDocument()
    expect(rest.getByText('Tour "6 người chơi" trên mã của bạn')).toBeInTheDocument()
    expect(rest.getByText("Bán một lệnh — kết sổ đầu tiên")).toBeInTheDocument()
    // ★ v3.0 deleted the old ⑤ outright — it must not appear anywhere.
    expect(screen.queryByText("Lệnh thứ hai — tự đặt ngưỡng cắt lỗ")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap0-task-6")).not.toBeInTheDocument()
    expect(screen.queryByText(/cắt lỗ/i)).not.toBeInTheDocument()
  })

  it("① is the one task on offer at 0/5 (ô tập trung); ②③④ are locked with no «Làm ngay» button", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const focus = within(screen.getByTestId("cap0-focus"))
    expect(focus.getByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).toBeInTheDocument()
    expect(focus.getByText("Làm ngay →")).toBeInTheDocument()
    for (const no of [2, 3, 4]) {
      const item = screen.getByTestId(`cap0-task-${no}`)
      expect(item.className).toContain("cap0-checklist-item--locked")
      expect(within(item).queryByText("Làm ngay →")).not.toBeInTheDocument()
    }
    // ⑤ isn't reachable yet either (① not done) — only ① has a button.
    expect(screen.getAllByText("Làm ngay →")).toHaveLength(1)
  })

  // ★ Luật MỞ KHOÁ không đổi một chữ: xong ① là ②③④ (3 tour độc lập) VÀ ⑤ cùng
  // mở. Việc dẫn từng nhiệm vụ một chỉ đổi cách vẽ — mọi nhiệm vụ vừa mở vẫn
  // phải bấm được ngay bây giờ, dù chỉ ② đang nằm trên ô tập trung.
  it("once ① is done: header 1/5, ① done (✓, no button), ②③④ become available (independent, T2), ⑤ becomes available too", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 1")).toBeInTheDocument()
    expect(screen.getByText("1/5")).toBeInTheDocument()

    const task1 = screen.getByTestId("cap0-task-1")
    expect(task1.className).toContain("cap0-checklist-item--done")
    expect(within(task1).getByText("✅")).toBeInTheDocument()
    expect(within(task1).queryByText("Làm ngay →")).not.toBeInTheDocument()

    // ② được ô tập trung dẫn — nút của nó nằm trên đó.
    expect(screen.getByTestId("cap0-task-2").className).toContain(
      "cap0-checklist-item--current",
    )
    expect(
      within(screen.getByTestId("cap0-focus")).getByText("Tour bảng điện — 8 điểm"),
    ).toBeInTheDocument()

    // ③④ (2 tour Chặng 2 còn lại) và ⑤ đều mở, không khoá, và bấm được ngay.
    for (const no of [3, 4, 5]) {
      const item = screen.getByTestId(`cap0-task-${no}`)
      expect(item.className).not.toContain("cap0-checklist-item--locked")
      expect(within(item).getByText("Làm ngay →")).toBeInTheDocument()
    }
  })

  it("② is done (✓, no button) once task_2_done_at is set, independent of ③④'s own state", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "2026-07-21T01:00:00Z",
        task_2_done_at: "2026-07-21T02:00:00Z",
      }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const task2 = screen.getByTestId("cap0-task-2")
    expect(task2.className).toContain("cap0-checklist-item--done")
    expect(within(task2).getByText("✅")).toBeInTheDocument()
    expect(within(task2).queryByText("Làm ngay →")).not.toBeInTheDocument()

    // ③④ stay open (not blocked by ② being done, not yet done themselves) —
    // ③ lên ô tập trung, ④ giữ lối tắt trong checklist.
    for (const no of [3, 4]) {
      expect(screen.getByTestId(`cap0-task-${no}`).className).not.toContain(
        "cap0-checklist-item--locked",
      )
    }
    expect(within(screen.getByTestId("cap0-task-3")).getByText("🎯")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap0-task-4")).getByText("Làm ngay →")).toBeInTheDocument()
  })

  it('clicking «Làm ngay →» on task ③ calls onLaunchTour(3) instead of switching to the trading panel', () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    const onLaunch = vi.fn()
    render(
      <SidebarProvider>
        <Cap0Provider>
          <JourneyPanel />
          <LaunchTourSpy onLaunch={onLaunch} />
        </Cap0Provider>
        <PanelSpy />
      </SidebarProvider>,
    )
    const task3 = screen.getByTestId("cap0-task-3")
    fireEvent.click(within(task3).getByText("Làm ngay →"))
    expect(onLaunch).toHaveBeenCalledWith(3)
    expect(screen.getByTestId("panel-spy")).not.toHaveTextContent("trading")
  })

  it('clicking «Làm ngay →» switches the sidebar to the trading panel', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("shows the graduation goal box copy — «Xong cả 5», not 6", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    expect(screen.getByText(/Xong cả 5/)).toBeInTheDocument()
    expect(screen.queryByText(/Xong cả 6/)).not.toBeInTheDocument()
    expect(screen.getByText(/tốt nghiệp/)).toBeInTheDocument()
    expect(screen.getByText(/Thực chiến/)).toBeInTheDocument()
  })

  // ★ Chặng 3 now holds exactly ⑤. The progress ring (spec §12 / decision 4)
  // must be over /5 too — at 1 task done it is 20%, not 16.7%.
  it("★ the journey badge's progress ring is over 5, not 6", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    const { container } = render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    // `badge()`'s ring is a dash-offset of `circumference * (1 - ring)`.
    // r = size*0.34*1.5 = 64*0.34*1.5 = 32.64 → circumference 205.0796...
    const ringCircle = container.querySelectorAll("circle")[1]
    const circumference = 2 * Math.PI * (64 * 0.34 * 1.5)
    expect(Number(ringCircle.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference * (1 - 1 / 5),
      1,
    )
  })

  it("★ ⑤ is done once task_5_done_at is set — it is driven by the sell + Kết sổ, nothing else", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_5_done_at: "t" }),
    })
    render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
    const task5 = screen.getByTestId("cap0-task-5")
    expect(task5.className).toContain("cap0-checklist-item--done")
    expect(within(task5).getByText("Bán một lệnh — kết sổ đầu tiên")).toBeInTheDocument()
    expect(screen.getByText("2/5")).toBeInTheDocument()
  })
})

// ── ★ Hành trình dẫn TỪNG NHIỆM VỤ MỘT ───────────────────────────────────────
// Người mới không đọc nổi một checklist 5 dòng cùng lúc: ô "nhiệm vụ đang làm"
// nổi hẳn lên (mô tả + Làm ngay →), checklist đầy đủ vẫn ở dưới nhưng THU GỌN
// (chỉ tên) để họ vẫn thấy mình đang ở đâu trong cung đường.
describe("JourneyPanel — dẫn từng nhiệm vụ một", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
  })

  function renderAt(progress: Partial<Cap0Progress>) {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress(progress) })
    return render(
      <SidebarProvider>
        <JourneyPanel />
      </SidebarProvider>,
    )
  }

  it("ô tập trung mang ĐÚNG nhiệm vụ đang active (① ở 0/5) — mô tả + «Làm ngay →», và không nhiệm vụ nào khác", () => {
    renderAt({})
    const focus = within(screen.getByTestId("cap0-focus"))
    expect(focus.getByText("①")).toBeInTheDocument()
    expect(focus.getByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).toBeInTheDocument()
    expect(focus.getByText(/Mua công ty bạn biết/)).toBeInTheDocument()
    expect(focus.getByText("Làm ngay →")).toBeInTheDocument()
    // Đúng MỘT nhiệm vụ trong ô — không phải cả checklist thu nhỏ.
    expect(focus.queryByText("Tour bảng điện — 8 điểm")).not.toBeInTheDocument()
    expect(focus.queryByText("Bán một lệnh — kết sổ đầu tiên")).not.toBeInTheDocument()
  })

  it("ô tập trung theo NGAY nhiệm vụ active kế tiếp khi ① xong (② «Tour bảng điện»)", () => {
    renderAt({ task_1_done_at: "t" })
    const focus = within(screen.getByTestId("cap0-focus"))
    expect(focus.getByText("②")).toBeInTheDocument()
    expect(focus.getByText("Tour bảng điện — 8 điểm")).toBeInTheDocument()
    expect(focus.getByText(/Tour ngắn ~2-3 phút, 8 điểm/)).toBeInTheDocument()
    // ① đã xong → không bao giờ được tập trung nữa.
    expect(focus.queryByText("Lệnh đầu tiên + Nắm giữ + Theo dõi")).not.toBeInTheDocument()
  })

  it("ô tập trung KHÔNG BAO GIỜ mang nhiệm vụ đã xong hay chưa mở — nó là nhiệm vụ active đầu tiên", () => {
    renderAt({ task_1_done_at: "t", task_2_done_at: "t" })
    const focus = within(screen.getByTestId("cap0-focus"))
    expect(focus.getByText("③")).toBeInTheDocument()
    expect(focus.getByText("Tour bản tin thị trường")).toBeInTheDocument()
    expect(focus.queryByText("Tour bảng điện — 8 điểm")).not.toBeInTheDocument()
  })

  it("ô tập trung nêu CHẶNG của nhiệm vụ đang làm", () => {
    renderAt({ task_1_done_at: "t" })
    expect(
      within(screen.getByTestId("cap0-focus")).getByText(
        "CHẶNG 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX",
      ),
    ).toBeInTheDocument()
  })

  it("checklist bên dưới vẫn còn ĐỦ 5 nhiệm vụ + 3 nhãn chặng, nhưng THU GỌN (không mô tả)", () => {
    const { container } = renderAt({ task_1_done_at: "t" })
    const rest = container.querySelector(".cap0-journey-rest") as HTMLElement
    expect(rest).not.toBeNull()
    for (const no of [1, 2, 3, 4, 5]) {
      expect(within(rest).getByTestId(`cap0-task-${no}`)).toBeInTheDocument()
    }
    expect(within(rest).getByText("CHẶNG 1 — VÀO SÂN")).toBeInTheDocument()
    expect(within(rest).getByText("CHẶNG 3 — KHÉP VÒNG")).toBeInTheDocument()
    // Mô tả chỉ sống trong ô tập trung — checklist thu gọn chỉ còn tên.
    expect(rest.querySelector(".cap0-checklist-desc")).toBeNull()
    expect(within(rest).queryByText(/Mua công ty bạn biết/)).not.toBeInTheDocument()
  })

  it("dòng của nhiệm vụ đang tập trung được đánh dấu --current 🎯; các nhiệm vụ mở khác là 🔲", () => {
    renderAt({ task_1_done_at: "t" })
    const task2 = screen.getByTestId("cap0-task-2")
    expect(task2.className).toContain("cap0-checklist-item--current")
    expect(within(task2).getByText("🎯")).toBeInTheDocument()

    for (const no of [3, 4, 5]) {
      const row = screen.getByTestId(`cap0-task-${no}`)
      expect(row.className).not.toContain("cap0-checklist-item--current")
      expect(within(row).getByText("🔲")).toBeInTheDocument()
    }
    // Đúng MỘT 🎯 trong cả checklist.
    expect(screen.getAllByText("🎯")).toHaveLength(1)
  })

  it("nhiệm vụ đã xong hiện ✅ trong checklist và không nằm trong ô tập trung", () => {
    renderAt({ task_1_done_at: "t" })
    const task1 = screen.getByTestId("cap0-task-1")
    expect(task1.className).toContain("cap0-checklist-item--done")
    expect(within(task1).getByText("✅")).toBeInTheDocument()
    expect(within(task1).queryByText("Làm ngay →")).not.toBeInTheDocument()
  })

  it("nhiệm vụ CHƯA MỞ không bấm được ở bất cứ đâu — ở 0/5 chỉ có đúng 1 «Làm ngay →», nằm trong ô tập trung", () => {
    renderAt({})
    const links = screen.getAllByText("Làm ngay →")
    expect(links).toHaveLength(1)
    expect(screen.getByTestId("cap0-focus")).toContainElement(links[0])
    for (const no of [2, 3, 4, 5]) {
      const row = screen.getByTestId(`cap0-task-${no}`)
      expect(row.className).toContain("cap0-checklist-item--locked")
      expect(within(row).queryByText("Làm ngay →")).not.toBeInTheDocument()
      expect(within(row).getByText("🔒")).toBeInTheDocument()
    }
  })

  // ★ Chống hồi quy quan trọng nhất: ②③④ là 3 tour ĐỘC LẬP và ⑤ mở cùng lúc với
  // chúng. "Một nhiệm vụ một lúc" là cách DẪN, không được KHOÁ thứ user đang có
  // quyền làm ngay bây giờ.
  it("★ nhiệm vụ đang mở nhưng không được tập trung VẪN còn lối tắt «Làm ngay →» trong checklist", () => {
    renderAt({ task_1_done_at: "t" })
    for (const no of [3, 4, 5]) {
      expect(
        within(screen.getByTestId(`cap0-task-${no}`)).getByText("Làm ngay →"),
      ).toBeInTheDocument()
    }
    // ...trừ chính dòng đang được tập trung (ô trên đã có nút to rồi).
    expect(within(screen.getByTestId("cap0-task-2")).queryByText("Làm ngay →")).not.toBeInTheDocument()
    // 1 nút trong ô tập trung + 3 lối tắt.
    expect(screen.getAllByText("Làm ngay →")).toHaveLength(4)
  })

  it("bấm «Làm ngay →» trong ô tập trung của ② chạy tour 2 (không chuyển sang tab Đặt lệnh)", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    const onLaunch = vi.fn()
    render(
      <SidebarProvider>
        <Cap0Provider>
          <JourneyPanel />
          <LaunchTourSpy onLaunch={onLaunch} />
        </Cap0Provider>
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap0-focus")).getByText("Làm ngay →"))
    expect(onLaunch).toHaveBeenCalledWith(2)
    expect(screen.getByTestId("panel-spy")).not.toHaveTextContent("trading")
  })

  it("bấm lối tắt của ④ trong checklist thu gọn vẫn chạy đúng tour 4", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    const onLaunch = vi.fn()
    render(
      <SidebarProvider>
        <Cap0Provider>
          <JourneyPanel />
          <LaunchTourSpy onLaunch={onLaunch} />
        </Cap0Provider>
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap0-task-4")).getByText("Làm ngay →"))
    expect(onLaunch).toHaveBeenCalledWith(4)
  })

  it("bấm «Làm ngay →» của ① (ô tập trung) chuyển sidebar sang tab Đặt lệnh", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyPanel />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap0-focus")).getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("★ xong cả 5 → ô tập trung là trạng thái SẴN SÀNG TỐT NGHIỆP, không phải ô rỗng", () => {
    renderAt({
      task_1_done_at: "t",
      task_2_done_at: "t",
      task_3_done_at: "t",
      task_4_done_at: "t",
      task_5_done_at: "t",
    })
    const focusEl = screen.getByTestId("cap0-focus")
    expect(focusEl.className).toContain("cap0-focus--ready")
    const focus = within(focusEl)
    expect(focus.getByText(/Sẵn sàng tốt nghiệp Cấp 0/)).toBeInTheDocument()
    // Không còn nhiệm vụ nào để dẫn → không nút, không mô tả nhiệm vụ.
    expect(screen.queryByText("Làm ngay →")).not.toBeInTheDocument()
    expect(focus.queryByText("Bán một lệnh — kết sổ đầu tiên")).not.toBeInTheDocument()
    // Checklist vẫn đủ 5 dòng, tất cả ✅.
    expect(screen.getByText("5/5")).toBeInTheDocument()
    for (const no of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`cap0-task-${no}`).className).toContain(
        "cap0-checklist-item--done",
      )
    }
  })
})

describe("JourneyBar", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
  })

  it("shows «CẤP 0 · 0/5» + the 0/5 copy on fresh progress", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 0/5")).toBeInTheDocument()
    expect(screen.getByText("Lệnh đầu tiên của bạn")).toBeInTheDocument()
  })

  it("shows the 1/5 copy once ① is done", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 1/5")).toBeInTheDocument()
    expect(
      screen.getByText("✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"),
    ).toBeInTheDocument()
  })

  it("shows the 5/5 graduation copy when all 5 tasks are done", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
      }),
    })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 5/5")).toBeInTheDocument()
    expect(screen.getByText("🎓 Hoàn thành Cấp 0!")).toBeInTheDocument()
  })

  // ★ Mid-run the bar names the next REACHABLE task — the very one the tab
  // Hành trình is focusing. Never the deleted "Lệnh thứ hai — tự đặt ngưỡng
  // cắt lỗ" (v3.0 xoá hẳn nhiệm vụ đó).
  it("★ names the task the Hành trình tab is focusing (④ at 3/5), not a hard-coded one", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(screen.getByText("CẤP 0 · 3/5")).toBeInTheDocument()
    expect(screen.getByText('Tour "6 người chơi" trên mã của bạn')).toBeInTheDocument()
    expect(screen.queryByText(/cắt lỗ/i)).not.toBeInTheDocument()
  })

  // ★ Thanh bar và ô tập trung phải nói CÙNG một nhiệm vụ: bar rao "Tiếp: X"
  // trong khi panel dẫn Y là đúng cái mâu thuẫn bản này đi sửa.
  it("★ the bar and the panel's ô tập trung name the same task", () => {
    useCap0ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    const { container } = render(
      <SidebarProvider>
        <JourneyBar />
        <JourneyPanel />
      </SidebarProvider>,
    )
    const focusName = (
      screen.getByTestId("cap0-focus").querySelector(".cap0-focus-name") as HTMLElement
    ).textContent as string
    expect(focusName).toContain("Tour bản tin thị trường")
    const bar = container.querySelector(".cap0-jbar-task") as HTMLElement
    expect(bar.textContent).toContain("Tour bản tin thị trường")
  })

  it('clicking the bar calls setActivePanel("journey")', () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(
      <SidebarProvider defaultPanel="trading">
        <JourneyBar />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    fireEvent.click(screen.getByTitle("Bấm để mở Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })

  it("renders 5 progress dots", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = render(
      <SidebarProvider>
        <JourneyBar />
      </SidebarProvider>,
    )
    expect(container.querySelectorAll(".cap0-jd")).toHaveLength(5)
  })
})

describe("RightSidebar — journey panel wired in without breaking the existing 4 panels", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
  })

  it('resolves "journey" to JourneyPanel (and not any other panel)', () => {
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 1")).toBeInTheDocument()
    expect(screen.queryByTestId("news-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("trading-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("watchlist-panel")).not.toBeInTheDocument()
    expect(screen.queryByTestId("patterns-panel")).not.toBeInTheDocument()
  })

  it('the mobile header label shows "Hành trình" for the journey panel (panelNames complete)', () => {
    render(
      <SidebarProvider defaultPanel="journey">
        <RightSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText("Hành trình")).toBeInTheDocument()
  })

  it.each([
    ["news", "Tin tức", "news-panel"],
    ["trading", "Đặt lệnh", "trading-panel"],
    ["watchlist", "Danh mục", "watchlist-panel"],
    ["patterns", "AI Mẫu nến", "patterns-panel"],
  ] as const)(
    'the existing "%s" panel still resolves after adding journey (label %s)',
    (panel, label, testId) => {
      render(
        <SidebarProvider defaultPanel={panel}>
          <RightSidebar />
        </SidebarProvider>,
      )
      expect(screen.getByTestId(testId)).toBeInTheDocument()
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    },
  )
})

describe("RightToolbar — journey prepended", () => {
  it('shows "Hành trình" and clicking it activates the journey panel', () => {
    render(
      <SidebarProvider defaultPanel="trading">
        <RightToolbar />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    fireEvent.click(screen.getByText("Hành trình"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})
