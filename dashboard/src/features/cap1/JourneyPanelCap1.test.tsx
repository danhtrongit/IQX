import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap1ProgressMock, useCap1EventsMock, useCap1TradeLogMock, flags } = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap1EventsMock: vi.fn(() => ({ isCap1Active: true })),
  useCap1TradeLogMock: vi.fn(() => ({ trades: [], record: vi.fn() })),
  // Mutable so the goal box can be asserted in BOTH states of the công tắc.
  flags: { CAP_2_PLUS_ENABLED: false },
}))

// Getter (not a plain value): the panel must read the flag at RENDER time, so
// flipping `flags` between tests actually flips the copy.
vi.mock("./capFlags", () => ({
  get CAP_2_PLUS_ENABLED() {
    return flags.CAP_2_PLUS_ENABLED
  },
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
}))
vi.mock("./Cap1Context", () => ({
  useCap1Events: () => useCap1EventsMock(),
}))
vi.mock("./tradeLog", () => ({
  useCap1TradeLog: () => useCap1TradeLogMock(),
}))

import { JourneyPanelCap1 } from "./JourneyPanelCap1"

function makeProgress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function trade(overrides: Partial<Cap1TradeRecord> = {}): Cap1TradeRecord {
  return {
    orderId: "o1",
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 5,
    pnlVnd: 100_000,
    closedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap1 />
    </SidebarProvider>,
  )
}

/** `renderPanel` + đặt sẵn progress — dùng khi test chỉ quan tâm tiến độ. */
function renderPanel2(progress: Partial<Cap1Progress> = {}) {
  useCap1ProgressMock.mockReturnValue({ data: makeProgress(progress) })
  return renderPanel()
}

describe("JourneyPanelCap1", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1EventsMock.mockReset()
    useCap1EventsMock.mockReturnValue({ isCap1Active: true })
    useCap1TradeLogMock.mockReset()
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    flags.CAP_2_PLUS_ENABLED = false
  })

  it("renders the level card — CẤP 1 / HỌC VIỆC / italic bài học / badge THỰC CHIẾN", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.getByText("CẤP 1")).toBeInTheDocument()
    expect(screen.getByText("HỌC VIỆC")).toBeInTheDocument()
    expect(
      screen.getByText('"Vào lệnh phải biết VÌ SAO mua và mua vùng nào."'),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  // Mockup `iqx-cap1-hanhtrinh.html` `.ck-head` (lines 25-27): `.t` tiêu đề bên
  // trái + `.c` bộ đếm bên phải — HAI phần tử, không phải một chuỗi "… · x/5".
  // Cùng một `.ck-head` mà Cấp 0 đã dựng; CSS là của chung nên Cấp 1 phải khớp
  // y hệt, nếu không nó ăn màu xám phẳng của `.t` cho cả bộ đếm.
  it("shows the checklist header as title + counter (mockup .ck-head), not one joined string", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = renderPanel()

    const header = container.querySelector(".cap0-journey-checklist-header")
    expect(header).not.toBeNull()
    const head = within(header as HTMLElement)

    const title = head.getByText("TRƯỚC KHI LÊN CẤP 2")
    expect(title.className).toContain("cap0-journey-checklist-title")
    const count = head.getByText("0/5")
    expect(count.className).toContain("cap0-journey-checklist-count")
    expect(title).not.toBe(count)

    // Chuỗi gộp cũ phải biến mất — nếu còn, `.c` không bao giờ được tô riêng.
    expect(screen.queryByText("TRƯỚC KHI LÊN CẤP 2 · 0/5")).not.toBeInTheDocument()
  })

  // Mockup `.ck-head .c { color: var(--lvl) }` — bộ đếm mang MÀU CỦA CẤP
  // (Cấp 1 = đồng `#c97b4a`), không phải màu xám `--t3` của tiêu đề. Đây chính
  // là "brand emphasis" mà Cấp 1 đánh mất khi `.cap0-journey-checklist-header`
  // đổi sang `var(--t3)`.
  it("colours the counter with the Cấp 1 level colour, not the header's grey", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t" }),
    })
    const { container } = renderPanel()
    const count = container.querySelector(".cap0-journey-checklist-count") as HTMLElement
    expect(count).not.toBeNull()
    expect(count).toHaveTextContent("2/5")
    // LEVELS[1].color
    expect(count).toHaveStyle({ color: "#c97b4a" })
  })

  // Mockup `.lvcard .info .mode` (line 24): viên pill chế độ nằm TRONG cột info,
  // dưới tên cấp — không phải phần tử flex thứ ba cạnh huy hiệu.
  it("puts the mode pill inside the level-card info column, under the name", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = renderPanel()
    const body = container.querySelector(".cap0-level-card-body")
    expect(body).not.toBeNull()
    expect(within(body as HTMLElement).getByText("THỰC CHIẾN")).toBeInTheDocument()
    // ...và KHÔNG còn là con trực tiếp của `.cap0-level-card`.
    const card = container.querySelector(".cap0-level-card") as HTMLElement
    expect(card.querySelector(":scope > .cap0-mode")).toBeNull()
  })

  // ★ Nhãn NGUYÊN VĂN mockup mới (`iqx-cap1-hanhtrinh.html`, "Hành trình cấp
  // 1: Chỉnh lại"): NGẮN, và hành trình chỉ còn 5 nhiệm vụ — «Xem lại danh mục»
  // bị bỏ, «10 lệnh Thực chiến» dời từ ⑥ về ⑤.
  it("renders exactly the mockup's 5 (short) task names", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = renderPanel()
    // Trong checklist đầy đủ (đã hạ cấp) — nhiệm vụ đang làm còn xuất hiện lần
    // nữa trên ô tập trung, nên phải khoanh vùng thay vì `screen.getByText`.
    const rest = within(container.querySelector(".cap0-journey-rest") as HTMLElement)
    expect(rest.getByText("Lệnh đầu có kế hoạch")).toBeInTheDocument()
    expect(rest.getByText("Kết sổ đầu tiên")).toBeInTheDocument()
    expect(rest.getByText("Làm quen 5 lý do mua")).toBeInTheDocument()
    expect(rest.getByText("3 lệnh có lý do ✅ Ủng hộ")).toBeInTheDocument()
    expect(rest.getByText("10 lệnh Thực chiến")).toBeInTheDocument()
    // ...và ĐÚNG 5 dòng, không còn dòng thứ 6.
    expect(container.querySelectorAll("[data-testid^='cap1-task-']")).toHaveLength(5)
    expect(screen.queryByTestId("cap1-task-6")).not.toBeInTheDocument()
  })

  // ★ Nhiệm vụ bị bỏ không được sống sót ở BẤT CỨ đâu trên tab Hành trình —
  // kể cả ô tập trung hay ô mục tiêu.
  it("★ never mentions the removed «Xem lại danh mục» task anywhere", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", task_3_done_at: "t" }),
    })
    const { container } = renderPanel()
    expect(container.textContent).not.toMatch(/[Xx]em lại danh mục/)
    expect(container.textContent).not.toMatch(/3 lần khác ngày/)
  })

  // Mockup: tên nhiệm vụ Cấp 1 KHÔNG còn số khoanh tròn dẫn trước (khác Cấp 0,
  // vốn vẫn giữ ①..④ trong mockup của chính nó).
  it("★ task rows carry NO circled numeral before the name", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    const { container } = renderPanel()
    const rest = container.querySelector(".cap0-journey-rest") as HTMLElement
    expect(rest.textContent).not.toMatch(/[①②③④⑤⑥]/)
    expect(rest.querySelector(".cap1-checklist-no")).toBeNull()
  })

  // ★ Móc CSS để dòng ĐÃ XONG của Cấp 1 chỉ mờ chứ không GẠCH NGANG (mockup bỏ
  // `.task.done .nm`). Luật gạch ngang sống ở `.cap0-checklist-item--done
  // .cap0-checklist-name` trong `cap0.css` dùng chung, nên Cấp 1 phải có class
  // riêng để `cap1.css` gỡ được — mất class này là gạch ngang lặng lẽ quay lại.
  it("★ keeps the cap1-only class hook that removes the done-row line-through", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    const row = screen.getByTestId("cap1-task-1")
    expect(row.className).toContain("cap1-checklist-item")
    expect(row.className).toContain("cap0-checklist-item--done")
  })

  it("at 0/5: ① is the 🎯 task being led, ⑤ is 🔲 open, ②③④ are 🔒 locked", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const task1 = screen.getByTestId("cap1-task-1")
    // Dòng của nhiệm vụ đang được ô tập trung dẫn — vạch nhấn, không tô nền.
    expect(task1.className).toContain("cap0-checklist-item--current")
    expect(within(task1).getByText("🎯")).toBeInTheDocument()

    const task5 = screen.getByTestId("cap1-task-5")
    expect(task5.className).toContain("cap1-checklist-item--open")
    expect(task5.className).not.toContain("cap0-checklist-item--current")
    expect(within(task5).getByText("🔲")).toBeInTheDocument()

    for (const no of [2, 3, 4]) {
      const task = screen.getByTestId(`cap1-task-${no}`)
      expect(task.className).toContain("cap0-checklist-item--locked")
      expect(within(task).getByText("🔒")).toBeInTheDocument()
    }
  })

  it("once ① is done it shows ✅, ② becomes the single 🎯 task being led and ③④⑤ are 🔲 open", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    renderPanel()
    const task1 = screen.getByTestId("cap1-task-1")
    expect(task1.className).toContain("cap0-checklist-item--done")
    expect(within(task1).getByText("✅")).toBeInTheDocument()

    expect(screen.getByTestId("cap1-task-2").className).toContain("cap0-checklist-item--current")
    for (const no of [3, 4, 5]) {
      const task = screen.getByTestId(`cap1-task-${no}`)
      expect(task.className).toContain("cap1-checklist-item--open")
      expect(task.className).not.toContain("cap0-checklist-item--current")
    }
    // Exactly ONE 🎯 in the whole checklist.
    expect(screen.getAllByText("🎯").filter((el) => el.className.includes("checklist"))).toHaveLength(
      1,
    )
  })

  it('unlocked-but-not-focused tasks keep their "Làm ngay →" shortcut', () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-07-21T01:00:00Z" }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap1-task-5")).getByText("Làm ngay →")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap1-task-3")).getByText("Làm ngay →")).toBeInTheDocument()
  })

  // Dải 5 lý do đã dọn lên ô tập trung (nó chỉ có nghĩa khi ③ tới lượt) — luật
  // của dải nằm ở test "③ đưa dải 5 lý do…" dưới. Dòng ③ trong checklist thu
  // gọn thì vẫn phải giữ CON SỐ, vì Cấp 1 là cấp đếm.
  it("③'s row keeps its «Đã dùng n/5 lý do» counter while another task is being led", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_ly_do_da_dung: 2 }),
    })
    useCap1TradeLogMock.mockReturnValue({
      trades: [trade({ lyDo: "dong_tien" }), trade({ lyDo: "ky_thuat" })],
      record: vi.fn(),
    })
    renderPanel()
    const task3 = within(screen.getByTestId("cap1-task-3"))
    expect(task3.getByText("Đã dùng 2/5 lý do")).toBeInTheDocument()
    // ...nhưng dải emoji thì không nhân đôi xuống đây.
    expect(task3.queryByTestId("cap1-coverage-dong_tien")).not.toBeInTheDocument()
  })

  it("③'s «Đã dùng» never under-reports the server count when the local trade log is empty", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_ly_do_da_dung: 4 }),
    })
    useCap1TradeLogMock.mockReturnValue({ trades: [], record: vi.fn() })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-3")).getByText("Đã dùng 4/5 lý do"),
    ).toBeInTheDocument()
  })

  it("④ shows «Lý do có cơ sở (✅): X/3»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_ly_do_ung_ho: 2 }),
    })
    renderPanel()
    expect(
      within(screen.getByTestId("cap1-task-4")).getByText("Lý do có cơ sở (✅): 2/3"),
    ).toBeInTheDocument()
  })

  // Mockup dòng 84: «7/10 lệnh».
  it("⑤ shows «X/10 lệnh»", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_thuc_chien: 7 }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap1-task-5")).getByText("7/10 lệnh")).toBeInTheDocument()
  })

  it("⑤'s counter never overshoots 10/10", () => {
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_thuc_chien: 14 }),
    })
    renderPanel()
    expect(within(screen.getByTestId("cap1-task-5")).getByText("10/10 lệnh")).toBeInTheDocument()
  })

  it("renders the two-tool row 📓 Kết sổ + 📊 Phân tích danh mục", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const tools = within(screen.getByTestId("cap1-tools"))
    expect(tools.getByText("📓 Kết sổ")).toBeInTheDocument()
    expect(tools.getByRole("button", { name: "📊 Phân tích danh mục" })).toBeInTheDocument()
    // Kết sổ tự mở khi bán lệnh (spec §6) — không có màn để mở tay, nên ô này
    // KHÔNG phải nút bấm chết.
    expect(tools.getAllByRole("button")).toHaveLength(1)
  })

  it('clicking "📊 Phân tích danh mục" switches the sidebar to the cap1-analysis panel', () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap1 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "📊 Phân tích danh mục" }))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap1-analysis")
  })

  // ── ★★ Ô mục tiêu: TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 1 ★★ ────
  // Modal tốt nghiệp unmount xong là về đúng màn này, checklist 5/5, và ô mục
  // tiêu là câu cuối cùng họ đọc. Khi `CAP_2_PLUS_ENABLED = false` nó KHÔNG được
  // hứa một cấp chưa tồn tại.
  it("★ goal box never promises Cấp 2 while CAP_2_PLUS_ENABLED is false", () => {
    flags.CAP_2_PLUS_ENABLED = false
    useCap1ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
      }),
    })
    renderPanel()
    const goal = screen.getByTestId("cap1-journey-goal")
    expect(goal).toHaveTextContent(/tốt nghiệp/)
    // Không hứa "lên Cấp 2", không liệt kê tính năng Cấp 2 như thể sắp có.
    expect(goal).not.toHaveTextContent(/lên\s+Cấp 2/)
    expect(goal).not.toHaveTextContent(/Cấp 2 thêm cắt lỗ/)
    expect(goal).not.toHaveTextContent(/viên lục giác ngọc lam/)
    // ...mà nói thẳng Cấp 2 chưa mở.
    expect(goal).toHaveTextContent(/chưa (ra mắt|mở)/)
  })

  it("★ goal box restores the Cấp 2 wording the moment CAP_2_PLUS_ENABLED flips back on", () => {
    flags.CAP_2_PLUS_ENABLED = true
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    const goal = screen.getByTestId("cap1-journey-goal")
    expect(goal).toHaveTextContent("Xong 5/5 → tốt nghiệp Cấp 1 «Học việc», lên Cấp 2 «Kỷ luật»")
    expect(goal).toHaveTextContent("Cấp 2 thêm cắt lỗ/chốt lời + sổ lệnh")
    expect(goal).not.toHaveTextContent(/chưa ra mắt/)
  })

  // ── ★ Hành trình dẫn TỪNG NHIỆM VỤ MỘT ────────────────────────────────────
  // Cùng một cách dẫn với Cấp 0 (`cap0/JourneyFocus.tsx` dùng chung): ô "NHIỆM
  // VỤ ĐANG LÀM" nổi hẳn lên, checklist 5 dòng vẫn ở dưới nhưng thu gọn.
  describe("dẫn từng nhiệm vụ một", () => {
    it("ô tập trung mang ĐÚNG nhiệm vụ active (① ở 0/5) — mô tả nguyên văn spec §2 + «Làm ngay →»", () => {
      useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
      renderPanel()
      const focus = within(screen.getByTestId("cap1-focus"))
      expect(focus.getByText("①")).toBeInTheDocument()
      expect(focus.getByText("Lệnh đầu có kế hoạch")).toBeInTheDocument()
      expect(
        focus.getByText(
          "Cấp 1 khác Cấp 0 — mọi lệnh phải có kế hoạch: chọn lý do mua (1 trong 5 lý do) + vùng mua. Thiếu 1 trong 2 không đặt được lệnh.",
        ),
      ).toBeInTheDocument()
      expect(focus.getByText("Làm ngay →")).toBeInTheDocument()
      // Đúng MỘT nhiệm vụ trong ô.
      expect(focus.queryByText("Kết sổ đầu tiên")).not.toBeInTheDocument()
    })

    it("ô tập trung chuyển sang ② ngay khi ① xong — ① không còn được tập trung", () => {
      useCap1ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
      renderPanel()
      const focus = within(screen.getByTestId("cap1-focus"))
      expect(focus.getByText("②")).toBeInTheDocument()
      expect(focus.getByText("Kết sổ đầu tiên")).toBeInTheDocument()
      expect(focus.queryByText("Lệnh đầu có kế hoạch")).not.toBeInTheDocument()
    })

    it("checklist bên dưới vẫn đủ 5 nhiệm vụ nhưng THU GỌN (mô tả chỉ sống trên ô tập trung)", () => {
      const { container } = renderPanel2({ task_1_done_at: "t" })
      const rest = container.querySelector(".cap0-journey-rest") as HTMLElement
      expect(rest).not.toBeNull()
      for (const no of [1, 2, 3, 4, 5]) {
        expect(within(rest).getByTestId(`cap1-task-${no}`)).toBeInTheDocument()
      }
      expect(within(rest).queryByText(/Bán một lệnh đang mở/)).not.toBeInTheDocument()
    })

    // ★ Dòng 🎯 trong checklist và ô tập trung phải là CÙNG một nhiệm vụ —
    // hai chỗ suy ra từ cùng `taskStates`, và test này giữ chúng dính nhau.
    it("dòng --current 🎯 là ĐÚNG nhiệm vụ mà ô tập trung đang dẫn — đúng MỘT dòng", () => {
      useCap1ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
      const { container } = renderPanel()
      const current = container.querySelector(".cap0-checklist-item--current") as HTMLElement
      expect(current).not.toBeNull()
      expect(current.dataset.testid).toBe("cap1-task-2")
      expect(container.querySelectorAll(".cap0-checklist-item--current")).toHaveLength(1)
      expect(screen.getAllByText("🎯")).toHaveLength(1)

      // So tên với tên: `.cap0-checklist-name` là ô CHỈ chứa nhãn nhiệm vụ, nên
      // không phải bóc glyph trạng thái ra khỏi `textContent` nữa — vốn là cách
      // so sai kể từ khi ④ có dấu ✅ NGAY TRONG TÊN của nó.
      const rowName = (current.querySelector(".cap0-checklist-name") as HTMLElement).textContent
      const focusName = (
        screen.getByTestId("cap1-focus").querySelector(".cap0-focus-name") as HTMLElement
      ).textContent as string
      expect(rowName).toBe("Kết sổ đầu tiên")
      expect(focusName).toContain(rowName as string)
    })

    it("③ đưa dải 5 lý do + «Đã dùng n/5 lý do» lên ô tập trung khi tới lượt nó", () => {
      useCap1ProgressMock.mockReturnValue({
        data: makeProgress({ task_1_done_at: "t", task_2_done_at: "t", so_ly_do_da_dung: 2 }),
      })
      useCap1TradeLogMock.mockReturnValue({
        trades: [trade({ lyDo: "dong_tien" }), trade({ lyDo: "ky_thuat" })],
        record: vi.fn(),
      })
      renderPanel()
      const focus = within(screen.getByTestId("cap1-focus"))
      expect(focus.getByText("Làm quen 5 lý do mua")).toBeInTheDocument()
      // Đã dùng → sáng; chưa dùng → mờ (class `.off` như mockup).
      for (const value of ["dong_tien", "ky_thuat"]) {
        expect(focus.getByTestId(`cap1-coverage-${value}`).className).not.toContain(
          "cap1-coverage-off",
        )
      }
      for (const value of ["noi_bo", "tin_tuc", "dinh_gia"]) {
        expect(focus.getByTestId(`cap1-coverage-${value}`).className).toContain("cap1-coverage-off")
      }
      // Emoji only — the old "✓/✗" pairs are gone.
      expect(focus.getByTestId("cap1-coverage-noi_bo")).toHaveTextContent("👤")
      expect(focus.queryByText(/✗/)).not.toBeInTheDocument()
      expect(focus.getByText("Đã dùng 2/5 lý do")).toBeInTheDocument()
    })

    it("nhiệm vụ CHƯA MỞ không bấm được ở đâu cả — ở 0/5 chỉ ① (ô tập trung) và ⑤ (lối tắt) có nút", () => {
      useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
      renderPanel()
      for (const no of [2, 3, 4]) {
        const row = screen.getByTestId(`cap1-task-${no}`)
        expect(row.className).toContain("cap0-checklist-item--locked")
        expect(within(row).queryByText("Làm ngay →")).not.toBeInTheDocument()
      }
      // ⑤ mở ngay từ đầu (spec §2 "Điều kiện mở: vào Cấp 1") → vẫn phải bấm được.
      expect(within(screen.getByTestId("cap1-task-5")).getByText("Làm ngay →")).toBeInTheDocument()
      expect(screen.getAllByText("Làm ngay →")).toHaveLength(2)
    })

    // ★ Nhiệm vụ duy nhất từng dẫn sang trang Phân tích danh mục đã bị bỏ, nên
    // KHÔNG nhiệm vụ nào còn đẩy user ra khỏi tab Đặt lệnh — trang đó chỉ mở
    // bằng ô công cụ 📊.
    it("★ «Làm ngay →» của MỌI nhiệm vụ dẫn về tab Đặt lệnh, không sang cap1-analysis", () => {
      function PanelSpy() {
        const { activePanel } = useSidebar()
        return <div data-testid="panel-spy">{activePanel}</div>
      }
      const upTo = (n: number) =>
        Object.fromEntries(
          Array.from({ length: n }, (_, i) => [`task_${i + 1}_done_at`, "t"]),
        ) as Partial<Cap1Progress>
      // 0 → 4 nhiệm vụ đã xong: ô tập trung lần lượt dẫn ①②③④⑤ — kể cả ⑤, vốn
      // là nhiệm vụ DUY NHẤT từng nhảy sang cap1-analysis.
      for (const n of [0, 1, 2, 3, 4]) {
        useCap1ProgressMock.mockReturnValue({ data: makeProgress(upTo(n)) })
        const { unmount } = render(
          <SidebarProvider>
            <JourneyPanelCap1 />
            <PanelSpy />
          </SidebarProvider>,
        )
        fireEvent.click(within(screen.getByTestId("cap1-focus")).getByText("Làm ngay →"))
        expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
        unmount()
      }

      // ...và cả lối tắt «Làm ngay →» của dòng ⑤ lúc nó mới chỉ MỞ (0/5).
      useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
      render(
        <SidebarProvider>
          <JourneyPanelCap1 />
          <PanelSpy />
        </SidebarProvider>,
      )
      fireEvent.click(within(screen.getByTestId("cap1-task-5")).getByText("Làm ngay →"))
      expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    })

    it("★ xong cả 5 → ô tập trung là trạng thái SẴN SÀNG TỐT NGHIỆP, không phải ô rỗng", () => {
      useCap1ProgressMock.mockReturnValue({
        data: makeProgress({
          task_1_done_at: "t",
          task_2_done_at: "t",
          task_3_done_at: "t",
          task_4_done_at: "t",
          task_5_done_at: "t",
        }),
      })
      renderPanel()
      const focusEl = screen.getByTestId("cap1-focus")
      expect(focusEl.className).toContain("cap0-focus--ready")
      expect(within(focusEl).getByText(/Sẵn sàng tốt nghiệp Cấp 1/)).toBeInTheDocument()
      // ...và KHÔNG ghi công nhiệm vụ đã bị bỏ.
      expect(focusEl.textContent).not.toMatch(/nhìn lại danh mục/)
      expect(screen.queryByText("Làm ngay →")).not.toBeInTheDocument()
      expect(screen.getByText("5/5")).toBeInTheDocument()
      expect(within(focusEl).getByText(/ĐÃ XONG CẢ 5 NHIỆM VỤ/)).toBeInTheDocument()
      for (const no of [1, 2, 3, 4, 5]) {
        expect(screen.getByTestId(`cap1-task-${no}`).className).toContain(
          "cap0-checklist-item--done",
        )
      }
    })
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §8 — Cấp 1 has none)", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })
})
