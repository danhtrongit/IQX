import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap5Progress } from "./types"

/**
 * Tab Hành trình Cấp 5 «Lão luyện — Săn mã» (mockup `iqx-cap5-hanhtrinh.html`).
 *
 * ★★ Hình dạng LIVE: **2 nhiệm vụ SONG SONG** — «Săn 10 mã vào Watchlist»
 * (`n/10 mã`) và «Mua 5 mã từ Watchlist» (`n/5 mã`), jbar `CẤP 5 · n/2` kèm dòng
 * "Hai nhiệm vụ làm song song". Bài canh quan trọng nhất: nhiệm vụ ② KHÔNG bị
 * gác sau ① — cả hai đều bấm được ngay khi vào cấp.
 *
 * ★ Cấp 5 CŨ (3 nhiệm vụ + «Tỷ lệ quyết định đúng» + «Thách thức Lão luyện» 3
 * điều kiện) đã NGHỈ HƯU — có bài canh riêng để những khối đó không mọc lại.
 */
const { useCap5ProgressMock, useCap5EventsMock, capFlags } = vi.hoisted(() => ({
  useCap5ProgressMock: vi.fn(),
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: true })),
  capFlags: { max: 5 },
}))

vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
}))
vi.mock("./Cap5Context", () => ({ useCap5Events: () => useCap5EventsMock() }))
// Trần cấp phải đọc được LÚC RENDER (cùng lý do `JourneyPanelCap4` ghi) — mock
// bằng getter để đổi được giữa hai bài.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return capFlags.max
  },
}))

import { JourneyPanelCap5 } from "./JourneyPanelCap5"

function makeProgress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-08-20T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_ma_da_san: 6,
    so_ma_mua_tu_watchlist: 3,
    so_ma_cho_du_lop: null,
    muc_tieu_so_ma_san: 10,
    muc_tieu_so_ma_mua: 5,
    da_xem_tour_sanma: false,
    best_filter: null,
    best_filter_ten: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/** Bọc panel trong `SidebarProvider` + phơi `activePanel` để canh lối đi. */
function PanelHarness() {
  const { activePanel } = useSidebar()
  return (
    <>
      <span data-testid="active-panel">{activePanel}</span>
      <JourneyPanelCap5 />
    </>
  )
}

function renderPanel() {
  return render(
    <SidebarProvider defaultPanel="journey">
      <PanelHarness />
    </SidebarProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  capFlags.max = 5
  useCap5EventsMock.mockReturnValue({ isCap5Active: true })
  useCap5ProgressMock.mockReturnValue({ data: makeProgress() })
})

describe("JourneyPanelCap5 — 2 nhiệm vụ song song (mockup)", () => {
  it("jbar: «CẤP 5 · 0/2» + «Hai nhiệm vụ làm song song»", () => {
    renderPanel()
    const jbar = screen.getByTestId("cap5-jbar")
    expect(jbar).toHaveTextContent("CẤP 5 · 0/2")
    expect(jbar).toHaveTextContent("Hai nhiệm vụ làm song song")
  })

  it("jbar đếm theo số nhiệm vụ ĐÃ xong", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ task_2_done_at: "2026-08-21T00:00:00Z" }),
    })
    renderPanel()
    expect(screen.getByTestId("cap5-jbar")).toHaveTextContent("CẤP 5 · 1/2")
  })

  it("thẻ cấp: CẤP 5 · LÃO LUYỆN + bài học + badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 5")).toBeInTheDocument()
    expect(screen.getByText("LÃO LUYỆN")).toBeInTheDocument()
    expect(screen.getByText(/chủ động đi săn/i)).toBeInTheDocument()
  })

  it("hai nhiệm vụ, đúng tên và tiến độ mockup", () => {
    renderPanel()
    const t1 = screen.getByTestId("cap5-task-1")
    const t2 = screen.getByTestId("cap5-task-2")
    expect(t1).toHaveTextContent("Săn 10 mã vào Watchlist")
    expect(t1).toHaveTextContent("6/10 mã")
    expect(t2).toHaveTextContent("Mua 5 mã từ Watchlist")
    expect(t2).toHaveTextContent("3/5 mã")
  })

  it("«TRƯỚC KHI LÊN CẤP 6» + bộ đếm n/2", () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 6")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-checklist-count")).toHaveTextContent("0/2")
  })

  it("★ mục tiêu đọc từ SERVER, không hard-code", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ muc_tieu_so_ma_san: 12, muc_tieu_so_ma_mua: 7 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap5-task-1")).toHaveTextContent("6/12 mã")
    expect(screen.getByTestId("cap5-task-2")).toHaveTextContent("3/7 mã")
  })

  it("tiến độ không vượt mẫu số (săn 14 mã vẫn hiện 10/10)", () => {
    useCap5ProgressMock.mockReturnValue({ data: makeProgress({ so_ma_da_san: 14 }) })
    renderPanel()
    expect(screen.getByTestId("cap5-task-1")).toHaveTextContent("10/10 mã")
  })

  it("★ chưa tải được progress → KHÔNG in «0/10» như thể đã đếm", () => {
    useCap5ProgressMock.mockReturnValue({ data: undefined })
    renderPanel()
    const t1 = screen.getByTestId("cap5-task-1")
    expect(t1).not.toHaveTextContent("0/10")
    expect(t1).toHaveTextContent("chưa lấy được số liệu")
  })
})

describe("JourneyPanelCap5 — SONG SONG: ② không bị gác sau ①", () => {
  it("★ cả hai nhiệm vụ đều ở trạng thái đang làm khi mới vào cấp", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-task-1").className).toContain("cap0-checklist-item--active")
    expect(screen.getByTestId("cap5-task-2").className).toContain("cap0-checklist-item--active")
  })

  it("★ cả hai nhiệm vụ đều BẤM ĐƯỢC (không nhiệm vụ nào bị khoá)", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-task-1-go")).toBeEnabled()
    expect(screen.getByTestId("cap5-task-2-go")).toBeEnabled()
  })

  it("★ ② xong TRƯỚC ① vẫn được đánh dấu xong", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ task_2_done_at: "2026-08-21T00:00:00Z", so_ma_mua_tu_watchlist: 5 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap5-task-2").className).toContain("cap0-checklist-item--done")
    expect(screen.getByTestId("cap5-task-1").className).toContain("cap0-checklist-item--active")
  })

  it("ô tập trung nhắm nhiệm vụ CHƯA xong đầu tiên", () => {
    renderPanel()
    expect(screen.getByTestId("cap5-focus")).toHaveTextContent("Săn 10 mã vào Watchlist")
  })

  it("★ ① xong → ô tập trung chuyển sang ②, KHÔNG kẹt ở ①", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "2026-08-21T00:00:00Z", so_ma_da_san: 10 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap5-focus")).toHaveTextContent("Mua 5 mã từ Watchlist")
  })

  it("xong 2/2 → ô tập trung nói sẵn sàng tốt nghiệp", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "2026-08-21T00:00:00Z",
        task_2_done_at: "2026-08-21T00:00:00Z",
      }),
    })
    renderPanel()
    expect(screen.getByTestId("cap5-focus")).toHaveTextContent("Sẵn sàng tốt nghiệp Cấp 5")
    expect(screen.getByTestId("cap5-checklist-count")).toHaveTextContent("2/2")
  })
})

describe("JourneyPanelCap5 — lối đi TRONG shell cấp (luật số 5)", () => {
  it("ô tập trung ① → mở màn Săn mã", () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("cap5-focus").querySelector("button")!)
    expect(screen.getByTestId("active-panel")).toHaveTextContent("cap5-sanma")
  })

  it("nhiệm vụ ② → mở Watchlist", () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("cap5-task-2-go"))
    expect(screen.getByTestId("active-panel")).toHaveTextContent("cap5-watchlist")
  })

  it("hàng công cụ: 🔍 Săn mã · 👀 Watchlist", () => {
    renderPanel()
    const tools = screen.getByTestId("cap5-tools")
    expect(tools).toHaveTextContent("Săn mã")
    expect(tools).toHaveTextContent("Watchlist")
    fireEvent.click(screen.getByTestId("cap5-tool-sanma"))
    expect(screen.getByTestId("active-panel")).toHaveTextContent("cap5-sanma")
  })

  it("★ Phân tích danh mục (khối ⑫/⑬ spec §9) phải tới được", () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("cap5-tool-analysis"))
    expect(screen.getByTestId("active-panel")).toHaveTextContent("cap5-analysis")
  })
})

describe("JourneyPanelCap5 — ô mục tiêu gắn theo trần cấp", () => {
  it("trần ≥6 → hứa Cấp 6 «xử lý khi 5 lớp mâu thuẫn»", () => {
    capFlags.max = 6
    renderPanel()
    const goal = screen.getByTestId("cap5-journey-goal")
    expect(goal).toHaveTextContent("Xong 2/2")
    expect(goal).toHaveTextContent("Cấp 6")
    expect(goal).toHaveTextContent("mâu thuẫn")
  })

  it("★ trần còn ở 5 → KHÔNG hứa một cấp chưa mở", () => {
    capFlags.max = 5
    renderPanel()
    const goal = screen.getByTestId("cap5-journey-goal")
    expect(goal).toHaveTextContent("chưa ra mắt")
  })
})

describe("JourneyPanelCap5 — Cấp 5 CŨ không mọc lại", () => {
  it("★ không còn «Tỷ lệ quyết định đúng» / «Thách thức Lão luyện» / 4 ô / đứng ngoài", () => {
    const { container } = renderPanel()
    for (const tu of [
      "Tỷ lệ quyết định đúng",
      "Thách thức Lão luyện",
      "4 ô",
      "đứng ngoài",
      "Đứng ngoài",
      "phân loại",
    ]) {
      expect(container.textContent).not.toContain(tu)
    }
  })

  it("★ đúng HAI nhiệm vụ, không có nhiệm vụ thứ ba", () => {
    renderPanel()
    expect(screen.queryByTestId("cap5-task-3")).not.toBeInTheDocument()
  })
})

describe("JourneyPanelCap5 — gác theo cấp (luật số 4)", () => {
  it("ngoài Cấp 5 KHÔNG query progress Cấp 5", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: false })
    renderPanel()
    expect(useCap5ProgressMock).toHaveBeenCalledWith(false)
  })
})
