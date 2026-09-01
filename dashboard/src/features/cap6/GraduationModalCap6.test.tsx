import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap6Progress } from "./types"

/**
 * Màn tốt nghiệp Cấp 6 «Bậc thầy» (spec §3).
 *
 * Cổng duy nhất là ba lần xử lý nhất quán. Lãi/lỗ, tour, và số sự kiện có phủ
 * quyết đều không thay đổi khả năng mở màn.
 */
const { useCap6ProgressMock, graduateMutate, enterCap7Mutate, capFlags, pending } = vi.hoisted(
  () => ({
    useCap6ProgressMock: vi.fn(),
    graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    }),
    enterCap7Mutate: vi.fn(),
    // ★★ MẶC ĐỊNH = TRẦN THẬT (`CAP_MAX_ENABLED` đang là 5, tức Cấp 7 CHƯA mở).
    // Đặt mặc định TRÊN trần thật sẽ khiến mọi bài chỉ chạy nhánh "đã mở" và câu
    // chữ user THẬT SỰ đọc hôm nay không bao giờ bị canh — đúng lỗi đã sửa ở Cấp 5.
    capFlags: { max: 5 },
    pending: { current: false },
  }),
)

vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useGraduateCap6: () => ({ mutate: graduateMutate, isPending: pending.current }),
}))
vi.mock("@/features/cap7/hooks", () => ({
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return capFlags.max
  },
}))

import { GraduationModalCap6, isGraduationReadyCap6 } from "./GraduationModalCap6"

function makeProgress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "cap6-progress",
    user_id: "user-1",
    entered_at: "2026-08-20T00:00:00Z",
    so_lan_xu_ly_nhat_quan: 3,
    so_lan_xu_ly_veto_nhat_quan: 0,
    muc_tieu_nhat_quan: 3,
    tong_lai_lenh_cap6_pct: 12.4,
    da_xem_tour_mauthuan: true,
    dat_nhiem_vu: true,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  useCap6ProgressMock.mockReset()
  useCap6ProgressMock.mockReturnValue({ data: makeProgress() })
  graduateMutate.mockClear()
  enterCap7Mutate.mockClear()
  capFlags.max = 5
  pending.current = false
})

describe("isGraduationReadyCap6 — thuần hành vi, KHÔNG đo lãi (spec §2/§3)", () => {
  it("3 lần nhất quán, không có phủ quyết → mở", () => {
    expect(isGraduationReadyCap6(makeProgress())).toBe(true)
  })

  it("2 lần nhất quán, dù có phủ quyết → không mở", () => {
    expect(
      isGraduationReadyCap6(
        makeProgress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 }),
      ),
    ).toBe(false)
  })

  it("★ lỗ nặng vẫn mở — lãi KHÔNG phải cổng", () => {
    expect(isGraduationReadyCap6(makeProgress({ tong_lai_lenh_cap6_pct: -38 }))).toBe(true)
  })

  it("chưa từng có lệnh đã đóng (lãi null) vẫn mở", () => {
    expect(isGraduationReadyCap6(makeProgress({ tong_lai_lenh_cap6_pct: null }))).toBe(true)
  })

  it("đã tốt nghiệp → không mở lại (một chiều)", () => {
    expect(isGraduationReadyCap6(makeProgress({ graduated_at: "2026-08-30T00:00:00Z" }))).toBe(
      false,
    )
  })

  it("chưa có hồ sơ → không mở", () => {
    expect(isGraduationReadyCap6(null)).toBe(false)
    expect(isGraduationReadyCap6(undefined)).toBe(false)
  })
})

describe("GraduationModalCap6 — dòng phụ dùng SỐ HÀNH VI, không khoe lãi", () => {
  it("in một bộ đếm 3/3 lần xử lý nhất quán", () => {
    render(<GraduationModalCap6 />)
    const sub = screen.getByTestId("cap6-grad-sub")
    expect(sub).toHaveTextContent("3/3 lần xử lý nhất quán")
    expect(sub.textContent).not.toContain("phủ quyết")
  })

  it("★ KHÔNG một chữ nào về lãi/lợi nhuận/% lãi trên toàn màn (spec §2/§11)", () => {
    render(<GraduationModalCap6 />)
    // Neo dương tính: modal THẬT SỰ đã render vào portal.
    expect(screen.getByTestId("cap6-grad-khoi1")).toBeInTheDocument()
    const body = document.body.textContent ?? ""
    expect(body.length).toBeGreaterThan(100)
    for (const tu of [
      "lãi từ lệnh mâu thuẫn",
      "lãi",
      "lợi nhuận",
      "tỷ lệ thắng",
      "12.4",
      "12,4",
    ]) {
      expect(body).not.toContain(tu)
    }
  })

  it("lãi lỗ nặng cũng không lọt vào màn", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ tong_lai_lenh_cap6_pct: -38.2 }),
    })
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-sub")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("38")
  })
})

describe("GraduationModalCap6 — 3 khối theo spec §3", () => {
  it("Khối 1 ghi nhận đúng thứ Cấp 6 dạy", () => {
    render(<GraduationModalCap6 />)
    const k1 = screen.getByTestId("cap6-grad-khoi1")
    expect(k1).toHaveTextContent("phân biệt lớp phủ quyết với lớp điểm trừ")
    expect(k1).toHaveTextContent("để hành động khớp với nhận định của mình")
  })

  it("Khối 2 điểm lại đúng chặng Cấp 0 → Cấp 6", () => {
    render(<GraduationModalCap6 />)
    const k2 = screen.getByTestId("cap6-grad-khoi2")
    expect(k2).toHaveTextContent("hiểu sân chơi (Cấp 0)")
    expect(k2).toHaveTextContent("săn mã (Cấp 5)")
    expect(k2).toHaveTextContent("xử lý mâu thuẫn (Cấp 6)")
  })

  it("★ KHÔNG ghi công việc user không làm: không nhắc «không mua» như thành tích", () => {
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-khoi1")).toBeInTheDocument()
    // Cấp 6 KHÔNG đo số lần đứng ngoài làm cổng — nó chỉ hiện ở Phân tích ⑮.
    expect(screen.getByTestId("cap6-grad-sub").textContent).not.toContain("không mua")
    expect(screen.getByTestId("cap6-grad-khoi1").textContent).not.toContain("không mua")
  })
})

describe("GraduationModalCap6 — HAI PHÍA của trần cấp (capFlags §LUẬT TỔNG QUÁT)", () => {
  it("trần < 7: Khối 3 nói THẲNG Cấp 7 chưa ra mắt, không nói «đang chờ»", () => {
    capFlags.max = 5
    render(<GraduationModalCap6 />)
    const k3 = screen.getByTestId("cap6-grad-khoi3")
    expect(k3).toHaveTextContent("Cấp 7 chưa ra mắt")
    expect(k3.textContent).not.toContain("Cấp 7 đang chờ")
  })

  it("trần ≥ 7: Khối 3 quay về câu NGUYÊN VĂN spec §3", () => {
    capFlags.max = 7
    render(<GraduationModalCap6 />)
    const k3 = screen.getByTestId("cap6-grad-khoi3")
    expect(k3).toHaveTextContent("Cấp 7 đang chờ")
    expect(k3).toHaveTextContent("Chủ đề sẽ hé lộ khi bạn tới gần")
    expect(k3.textContent).not.toContain("chưa ra mắt")
  })

  it("trần < 7: dòng «sắp ra mắt» dưới CTA", () => {
    capFlags.max = 5
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-cta")).toHaveTextContent("Cấp 7 sắp ra mắt")
  })

  it("trần ≥ 7: dòng «sắp ra mắt» biến mất", () => {
    capFlags.max = 7
    render(<GraduationModalCap6 />)
    const cta = screen.getByTestId("cap6-grad-cta")
    expect(cta).toHaveTextContent("Vào Cấp 7")
    expect(cta.textContent).not.toContain("sắp ra mắt")
  })

  it("trần < 7: bấm CTA VẪN ghi tốt nghiệp nhưng KHÔNG gọi POST /cap7/enter", () => {
    capFlags.max = 5
    render(<GraduationModalCap6 />)
    fireEvent.click(screen.getByTestId("cap6-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  it("trần ≥ 7: bấm CTA ghi tốt nghiệp RỒI vào Cấp 7", () => {
    capFlags.max = 7
    render(<GraduationModalCap6 />)
    fireEvent.click(screen.getByTestId("cap6-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    expect(enterCap7Mutate).toHaveBeenCalledTimes(1)
  })

  it("★ trần đọc trong HÀM: đổi trần giữa hai lần render là đổi câu chữ", () => {
    capFlags.max = 5
    const { unmount } = render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-khoi3")).toHaveTextContent("chưa ra mắt")
    unmount()
    capFlags.max = 7
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-khoi3")).toHaveTextContent("đang chờ")
  })
})

describe("GraduationModalCap6 — CTA không bao giờ nhốt user", () => {
  it("★ trần < 7 mà CTA vẫn bấm được (không disabled kiểu «sắp ra mắt»)", () => {
    capFlags.max = 5
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-cta")).not.toBeDisabled()
  })

  it("chỉ `isPending` được phép tắt nút (chặn double-submit)", () => {
    pending.current = true
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-cta")).toBeDisabled()
  })
})

describe("GraduationModalCap6 — chưa đủ điều kiện thì KHÔNG vẽ gì", () => {
  it("hồ sơ chưa đạt → không có modal, không có chữ nào của màn tốt nghiệp", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 }),
    })
    render(<GraduationModalCap6 />)
    // ★ Neo dương tính đảo chiều: chứng minh chuỗi này CÓ xuất hiện khi đạt.
    expect(screen.queryByTestId("cap6-grad-khoi1")).toBeNull()
    expect(document.body.textContent).not.toContain("CẤP 6 · BẬC THẦY")
  })

  it("(đối chứng) hồ sơ đạt thì chuỗi trên CÓ mặt — bài trên không xanh giả", () => {
    render(<GraduationModalCap6 />)
    expect(document.body.textContent).toContain("CẤP 6 · BẬC THẦY")
  })
})
