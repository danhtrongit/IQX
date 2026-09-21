import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap6Progress } from "./types"

/**
 * Màn tốt nghiệp Cấp 6 «Bậc thầy» (spec §3).
 *
 * Cổng duy nhất là ba lần xử lý nhất quán. Lãi/lỗ, tour, và số sự kiện có phủ
 * quyết đều không thay đổi khả năng mở màn.
 */
const { useCap6ProgressMock, graduateMutate, enterCap7Mutate, pending, trackJourneyEventMock } = vi.hoisted(
  () => {
    const state = { current: false, error: false }
    return {
      useCap6ProgressMock: vi.fn(),
      graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: (data: { id: string }) => void }) => {
        if (!state.current && !state.error) opts?.onSuccess?.({ id: "cap6-progress" })
      }),
      enterCap7Mutate: vi.fn(),
      pending: state,
      trackJourneyEventMock: vi.fn(),
    }
  },
)

vi.mock("@/shared/analytics/journey", () => ({
  trackJourneyEvent: trackJourneyEventMock,
}))

vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useGraduateCap6: () => ({ mutate: graduateMutate, isPending: pending.current, isError: pending.error }),
}))
vi.mock("@/features/cap7/hooks", () => ({
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
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
  pending.current = false
  pending.error = false
  trackJourneyEventMock.mockClear()
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

describe("GraduationModalCap6 — giữ nguyên dòng phụ P&L của spec §3", () => {
  it("hiện lãi từ lệnh mâu thuẫn theo định dạng số Việt Nam", () => {
    render(<GraduationModalCap6 />)
    const sub = screen.getByTestId("cap6-grad-sub")
    expect(sub).toHaveTextContent("lãi từ lệnh mâu thuẫn +12,4%")
  })

  it("lỗ dùng dấu âm và dấu phẩy thập phân", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ tong_lai_lenh_cap6_pct: -38.2 }),
    })
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-sub")).toHaveTextContent(
      "lãi từ lệnh mâu thuẫn -38,2%",
    )
  })

  it("null nói chưa có lệnh đóng, không bịa 0,0%", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ tong_lai_lenh_cap6_pct: null }),
    })
    render(<GraduationModalCap6 />)
    const sub = screen.getByTestId("cap6-grad-sub")
    expect(sub).toHaveTextContent("chưa có lệnh đã đóng")
    expect(sub).not.toHaveTextContent("0,0%")
  })
})

describe("GraduationModalCap6 — kết thúc tại Cấp 6", () => {
  it("Khối 3 đúng nguyên văn bổ sung, không hứa cấp sau", () => {
    render(<GraduationModalCap6 />)
    expect(document.querySelectorAll(".cap0-grad-block")).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/Cấp [78]|sắp ra mắt|đang chờ/)
    expect(screen.getByRole("button", { name: "Hoàn tất" })).toBeEnabled()
    expect(trackJourneyEventMock).toHaveBeenCalledWith("cap6_graduation_view", {
      consistent_count: 3,
    })
  })

  it("ghi tốt nghiệp khi đủ điều kiện, Hoàn tất chỉ đóng màn và không mở cấp mới", async () => {
    const { rerender } = render(<GraduationModalCap6 />)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-09-13T01:00:00Z" }),
    })
    rerender(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-cta")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất" }))
    await waitFor(() => expect(screen.queryByTestId("cap6-grad-cta")).not.toBeVisible())
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  it("không gửi lặp trong StrictMode hoặc khi tiến trình tải lại", () => {
    const { rerender } = render(<React.StrictMode><GraduationModalCap6 /></React.StrictMode>)
    rerender(<React.StrictMode><GraduationModalCap6 /></React.StrictMode>)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("không cho đóng màn trước khi kết quả tốt nghiệp được lưu", () => {
    pending.current = true
    render(<GraduationModalCap6 />)
    const cta = screen.getByRole("button", { name: "Đang ghi nhận…" })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(screen.getByTestId("cap6-grad-cta")).toBeVisible()
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("lỗi lưu có lời báo và nút thử lại, không tạo điều kiện tốt nghiệp mới", () => {
    pending.error = true
    render(<GraduationModalCap6 />)
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa lưu được kết quả tốt nghiệp")
    expect(screen.getByRole("button", { name: "Đang ghi nhận…" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(graduateMutate).toHaveBeenCalledTimes(2)
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  it("giới hạn chiều cao modal để CTA vẫn tới được trên màn hình thấp", () => {
    render(<GraduationModalCap6 />)
    const modal = screen.getByTestId("cap6-grad-cta").closest(".arco-modal")
    expect(modal).toHaveStyle({
      maxHeight: "calc(100dvh - 32px)",
      overflowY: "auto",
    })
  })

  it("người đã tốt nghiệp quay lại không mở màn hoặc ghi lại", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ graduated_at: "2026-09-13T01:00:00Z" }),
    })
    render(<GraduationModalCap6 />)
    expect(screen.queryByTestId("cap6-grad-cta")).toBeNull()
    expect(graduateMutate).not.toHaveBeenCalled()
  })
})

describe("GraduationModalCap6 — chưa đủ điều kiện thì KHÔNG vẽ gì", () => {
  it("hồ sơ chưa đạt → không có modal, không có chữ nào của màn tốt nghiệp", () => {
    useCap6ProgressMock.mockReturnValue({
      data: makeProgress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 }),
    })
    render(<GraduationModalCap6 />)
    // ★ Neo dương tính đảo chiều: chứng minh chuỗi này CÓ xuất hiện khi đạt.
    expect(graduateMutate).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cap6-grad-khoi1")).toBeNull()
    expect(document.body.textContent).not.toContain("CẤP 6 · BẬC THẦY")
  })

  it("(đối chứng) hồ sơ đạt thì chuỗi trên CÓ mặt — bài trên không xanh giả", () => {
    render(<GraduationModalCap6 />)
    expect(document.body.textContent).toContain("CẤP 6 · BẬC THẦY")
  })
})
