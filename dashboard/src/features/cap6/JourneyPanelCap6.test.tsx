import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { visibleText } from "@/__tests__/textGuards"
import type { Cap6Progress } from "./types"

/**
 * Tab "Hành trình" Cấp 6 «Bậc thầy» (mockup `iqx-cap6-hanhtrinh.html`).
 *
 * Cổng duy nhất do server công bố là ba lần xử lý mâu thuẫn nhất quán. Số lần có
 * phủ quyết vẫn là phân tích mô tả, không phải mục tiêu hay điều kiện hoàn thành.
 */
const { useCap6ProgressMock, setActivePanelMock, capFlags } = vi.hoisted(() => ({
  useCap6ProgressMock: vi.fn(),
  setActivePanelMock: vi.fn(),
  // ★★ MẶC ĐỊNH = TRẦN THẬT (`CAP_MAX_ENABLED` đang là 5 ⇒ Cấp 7 CHƯA mở).
  capFlags: { max: 5 },
}))

vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
}))
vi.mock("@/shared/contexts/sidebar-context", () => ({
  useSidebar: () => ({ activePanel: "journey", setActivePanel: setActivePanelMock }),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return capFlags.max
  },
}))

import { JourneyPanelCap6, taskStateCap6 } from "./JourneyPanelCap6"
import { Cap6Provider } from "./Cap6Context"

function makeProgress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "cap6-progress",
    user_id: "user-1",
    entered_at: "2026-08-20T00:00:00Z",
    so_lan_xu_ly_nhat_quan: 1,
    so_lan_xu_ly_veto_nhat_quan: 0,
    muc_tieu_nhat_quan: 3,
    tong_lai_lenh_cap6_pct: 9.3,
    da_xem_tour_mauthuan: true,
    dat_nhiem_vu: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <Cap6Provider>
      <JourneyPanelCap6 />
    </Cap6Provider>,
  )
}

beforeEach(() => {
  useCap6ProgressMock.mockReset()
  useCap6ProgressMock.mockReturnValue({ data: makeProgress() })
  setActivePanelMock.mockClear()
  capFlags.max = 5
})

describe("JourneyPanelCap6 — thẻ cấp + nhiệm vụ duy nhất (mockup)", () => {
  it("tên cấp là BẬC THẦY, KHÔNG còn ĐỐI CHIẾU", () => {
    renderPanel()
    const text = visibleText()
    expect(text).toContain("BẬC THẦY")
    expect(text).not.toContain("ĐỐI CHIẾU")
  })

  it("checklist header 0/1 và đúng MỘT nhiệm vụ", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-journey-header")).toHaveTextContent(
      "TRƯỚC KHI LÊN CẤP 7 · 0/1",
    )
    expect(screen.getByTestId("cap6-task-1")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-task-2")).toBeNull()
    expect(screen.queryByTestId("cap6-task-3")).toBeNull()
  })

  it("tên nhiệm vụ và bộ đếm bám mục tiêu 3 lần của server", () => {
    renderPanel()
    const task = screen.getByTestId("cap6-task-1")
    expect(task).toHaveTextContent("Xử lý mâu thuẫn nhất quán 3 lần")
    expect(screen.getByTestId("cap6-journey-prog-nhatquan")).toHaveTextContent(
      "1/3 lần xử lý nhất quán",
    )
    expect(screen.queryByTestId("cap6-journey-prog-veto")).toBeNull()
  })

  it("mô tả nhiệm vụ đúng chữ mockup", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-task-1")).toHaveTextContent(
      'Đọc "nghiêm trọng" thì mua nhỏ hoặc không mua',
    )
  })

  it("§C12c — giải thích tiến độ do server chốt và KHÔNG đo lãi", () => {
    renderPanel()
    const why = screen.getByTestId("cap6-journey-why")
    expect(why).toHaveTextContent("do hệ thống chốt từ chính các lệnh của bạn")
    expect(why).toHaveTextContent("KHÔNG đo lãi")
    expect(why.textContent).not.toContain("phủ quyết")
  })

  it("★ KHÔNG khoe lãi ở tab Hành trình (spec §11: chỉ ở Kết sổ/Phân tích)", () => {
    renderPanel()
    // Neo dương tính: panel THẬT SỰ đã render.
    expect(screen.getByTestId("cap6-task-1")).toBeInTheDocument()
    expect(visibleText()).not.toContain("9.3")
    expect(visibleText()).not.toContain("9,3")
  })

  it("★ BỎ HẲN hai widget của bản «Đối chiếu» cũ (mockup không vẽ)", () => {
    renderPanel()
    expect(screen.getByTestId("cap6-task-1")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-journey-doichieu")).toBeNull()
    expect(screen.queryByTestId("cap6-thachthuc")).toBeNull()
  })

  it("chip bài học chỉ kèm bộ đếm hoàn thành", () => {
    renderPanel()
    const chip = screen.getByTestId("cap6-journey-tag")
    expect(chip).toHaveTextContent("1 lần nhất quán")
    expect(chip.textContent).not.toContain("phủ quyết")
  })

  it("chưa có hồ sơ → chip không có số bịa", () => {
    useCap6ProgressMock.mockReturnValue({ data: null })
    renderPanel()
    const chip = screen.getByTestId("cap6-journey-tag")
    expect(chip).toHaveTextContent("Đọc mâu thuẫn đúng, hành động tương xứng")
    expect(chip.textContent).not.toContain("lần nhất quán")
  })
})

describe("taskStateCap6", () => {
  it("chưa đủ → active", () => {
    expect(taskStateCap6(1, makeProgress())).toBe("active")
  })

  it("3 lần nhất quán, không có phủ quyết → done", () => {
    expect(
      taskStateCap6(1, makeProgress({ so_lan_xu_ly_nhat_quan: 3, so_lan_xu_ly_veto_nhat_quan: 0 })),
    ).toBe("done")
  })

  it("2 lần nhất quán, dù có phủ quyết → active", () => {
    expect(
      taskStateCap6(1, makeProgress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 })),
    ).toBe("active")
  })

  it("xong → header 1/1 và không còn nút «Làm ngay»", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ so_lan_xu_ly_nhat_quan: 3, so_lan_xu_ly_veto_nhat_quan: 0 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap6-journey-header")).toHaveTextContent(
      "TRƯỚC KHI LÊN CẤP 7 · 1/1",
    )
    expect(screen.queryByRole("button", { name: /Làm ngay/ })).toBeNull()
  })
})

describe("JourneyPanelCap6 — ô mục tiêu ở HAI PHÍA của trần cấp", () => {
  it("trần < 7: nói THẲNG Cấp 7 chưa ra mắt, KHÔNG hứa mở Cấp 7", () => {
    capFlags.max = 5
    renderPanel()
    const goal = screen.getByTestId("cap6-journey-goal")
    expect(goal).toHaveTextContent("Cấp 7 chưa ra mắt")
    expect(goal).toHaveTextContent("chặng cuối của chương trình hiện tại")
    expect(goal.textContent).not.toContain("mở Cấp 7")
  })

  it("trần ≥ 7: hứa mở Cấp 7", () => {
    capFlags.max = 7
    renderPanel()
    const goal = screen.getByTestId("cap6-journey-goal")
    expect(goal).toHaveTextContent("mở Cấp 7")
    expect(goal.textContent).not.toContain("chưa ra mắt")
  })

  it("★ trần đọc trong HÀM: đổi trần giữa hai lần render là đổi câu chữ", () => {
    capFlags.max = 5
    const { unmount } = renderPanel()
    expect(screen.getByTestId("cap6-journey-goal")).toHaveTextContent("chưa ra mắt")
    unmount()
    capFlags.max = 7
    renderPanel()
    expect(screen.getByTestId("cap6-journey-goal")).toHaveTextContent("mở Cấp 7")
  })

  /**
   * ★★★ KHÔNG HỨA SAI THỨ CẤP SAU THẬT SỰ DẠY.
   *
   * Mockup `iqx-cap6-hanhtrinh.html` viết ô mục tiêu là "mở **Cấp 7** (quản trị
   * cả danh mục nhiều mã)". Nhưng spec §3 cố tình KHÔNG tiết lộ chủ đề Cấp 7
   * ("Chủ đề sẽ hé lộ khi bạn tới gần"), và Cấp 7 trong repo hôm nay là «Đọc sổ
   * lệnh» — không phải quản trị danh mục nhiều mã. Nên câu trong ngoặc của mockup
   * KHÔNG được dùng: nó là một lời hứa sai.
   */
  it("★ KHÔNG nói chủ đề Cấp 7 (mockup đoán sai chủ đề)", () => {
    capFlags.max = 7
    renderPanel()
    const goal = screen.getByTestId("cap6-journey-goal")
    expect(goal).toHaveTextContent("mở Cấp 7")
    for (const tu of ["quản trị cả danh mục", "nhiều mã", "sổ lệnh", "đọc lực"]) {
      expect(goal.textContent).not.toContain(tu)
    }
  })
})

describe("JourneyPanelCap6 — điều hướng ở TRONG shell cấp", () => {
  it("«Làm ngay» đổi panel sang trading, không rời trang", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: /Làm ngay/ }))
    expect(setActivePanelMock).toHaveBeenCalledWith("trading")
  })

  it("«Xem Phân tích danh mục» đổi panel sang cap6-analysis", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: /Xem Phân tích danh mục/ }))
    expect(setActivePanelMock).toHaveBeenCalledWith("cap6-analysis")
  })

  it("hook progress chỉ query khi đang ở trong Cấp 6", () => {
    renderPanel()
    expect(useCap6ProgressMock).toHaveBeenCalledWith(true)
  })
})
