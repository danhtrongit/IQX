import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

const { useDiemKyLuat } = vi.hoisted(() => ({ useDiemKyLuat: vi.fn() }))
vi.mock("./hooks", () => ({ useDiemKyLuat }))

import { DiemKyLuatCard } from "./DiemKyLuat"
import type { DiemKyLuat } from "./types"

function diem(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-03-02",
    co_giao_dich: true,
    co_tinh_huong: true,
    diem: 90,
    xep_loai: "xanh",
    giai_thich: "Bạn giữ đúng cam kết cắt lỗ và không nhồi lệnh khi lỗ.",
    thanh_phan: {
      ke_hoach: 40,
      ke_hoach_toi_da: 40,
      cat_lo_dung: 30,
      cat_lo_dung_toi_da: 40,
      khong_nhoi: 30,
      khong_nhoi_toi_da: 30,
      chot_loi_dung: 15,
      chot_loi_dung_toi_da: 30,
    },
    ...overrides,
  }
}

describe("DiemKyLuatCard", () => {
  it("shows the score with the xanh band for ≥85", () => {
    useDiemKyLuat.mockReturnValue({ data: diem({ diem: 90, xep_loai: "xanh" }), isLoading: false })
    render(<DiemKyLuatCard />)
    expect(screen.getByTestId("cap2-diem-value")).toHaveTextContent("90")
    expect(screen.getByTestId("cap2-diem-card").className).toContain("cap2-diem--xanh")
  })

  it("uses the vàng band for 70-84", () => {
    useDiemKyLuat.mockReturnValue({ data: diem({ diem: 78, xep_loai: "vang" }), isLoading: false })
    render(<DiemKyLuatCard />)
    expect(screen.getByTestId("cap2-diem-card").className).toContain("cap2-diem--vang")
  })

  it("uses the đỏ band for <70", () => {
    useDiemKyLuat.mockReturnValue({ data: diem({ diem: 60, xep_loai: "do" }), isLoading: false })
    render(<DiemKyLuatCard />)
    expect(screen.getByTestId("cap2-diem-card").className).toContain("cap2-diem--do")
  })

  // §C12c — the number is NEVER allowed to stand alone.
  it("always renders the 1-câu giải thích AND the breakdown showing where the score came from", () => {
    useDiemKyLuat.mockReturnValue({ data: diem(), isLoading: false })
    render(<DiemKyLuatCard />)
    expect(
      screen.getByText("Bạn giữ đúng cam kết cắt lỗ và không nhồi lệnh khi lỗ."),
    ).toBeInTheDocument()
    const breakdown = screen.getByTestId("cap2-diem-breakdown")
    expect(breakdown).toHaveTextContent("Có kế hoạch đủ")
    expect(breakdown).toHaveTextContent("40/40")
    expect(breakdown).toHaveTextContent("Cắt lỗ đúng")
    expect(breakdown).toHaveTextContent("30/40")
    expect(breakdown).toHaveTextContent("Không nhồi lệnh")
    expect(breakdown).toHaveTextContent("30/30")
    expect(breakdown).toHaveTextContent("Chốt lời đúng")
    expect(breakdown).toHaveTextContent("15/30")
  })

  it("degrades gracefully when there is no điểm yet (no bare number, no crash)", () => {
    useDiemKyLuat.mockReturnValue({
      data: diem({
        co_giao_dich: false,
        co_tinh_huong: false,
        diem: null,
        xep_loai: null,
        thanh_phan: null,
        giai_thich: "Chưa có lệnh nào hôm nay để tính điểm kỷ luật.",
      }),
      isLoading: false,
    })
    render(<DiemKyLuatCard />)
    expect(screen.getByText("Chưa có lệnh nào hôm nay để tính điểm kỷ luật.")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-diem-value")).not.toBeInTheDocument()
  })

  it("renders a placeholder while loading", () => {
    useDiemKyLuat.mockReturnValue({ data: undefined, isLoading: true })
    render(<DiemKyLuatCard />)
    expect(screen.getByTestId("cap2-diem-loading")).toBeInTheDocument()
  })
})
