import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

const { useCap2Progress } = vi.hoisted(() => ({ useCap2Progress: vi.fn() }))
vi.mock("./hooks", () => ({ useCap2Progress }))

import { ChuoiWidget } from "./ChuoiWidget"
import type { Cap2ChuoiLegacy, Cap2Progress } from "./types"

// ★ `Cap2ChuoiLegacy` — ba trường `chuoi_*` KHÔNG còn trên wire (xem
// `types.ts`); widget này là di sản không được mount ở đâu, nên fixture phải
// nói rõ nó đang bơm một hình dạng LEGACY chứ không phải `Cap2Progress` thật.
function progress(
  overrides: Partial<Cap2Progress & Cap2ChuoiLegacy> = {},
): Cap2Progress & Cap2ChuoiLegacy {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    task_1_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    chuoi_current: 3,
    chuoi_record: 7,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("ChuoiWidget", () => {
  it("shows the current chuỗi and the personal record", () => {
    useCap2Progress.mockReturnValue({ data: progress() })
    render(<ChuoiWidget />)
    expect(screen.getByText(/Chuỗi lệnh kỷ luật/)).toBeInTheDocument()
    expect(screen.getByTestId("cap2-chuoi-current")).toHaveTextContent("3")
    expect(screen.getByText(/Kỷ lục của bạn: 7/)).toBeInTheDocument()
  })

  it("renders 0 (not a crash) before the user has entered Cấp 2", () => {
    useCap2Progress.mockReturnValue({ data: null })
    render(<ChuoiWidget />)
    expect(screen.getByTestId("cap2-chuoi-current")).toHaveTextContent("0")
  })

  it("nhắc when the user trades under 1 lệnh/tuần (spec §6)", () => {
    useCap2Progress.mockReturnValue({ data: progress() })
    render(<ChuoiWidget ordersLastWeek={0} />)
    expect(screen.getByTestId("cap2-chuoi-lowactivity")).toBeInTheDocument()
  })

  it("does NOT nhắc when the user is trading regularly", () => {
    useCap2Progress.mockReturnValue({ data: progress() })
    render(<ChuoiWidget ordersLastWeek={3} />)
    expect(screen.queryByTestId("cap2-chuoi-lowactivity")).not.toBeInTheDocument()
  })

  it("shows a reset hint (chuỗi về 0) right after a vi phạm", () => {
    useCap2Progress.mockReturnValue({
      data: progress({ chuoi_current: 0, last_chuoi_reset_at: "2026-03-02T08:00:00Z" }),
    })
    render(<ChuoiWidget />)
    expect(screen.getByTestId("cap2-chuoi-current")).toHaveTextContent("0")
    expect(screen.getByTestId("cap2-chuoi-reset")).toBeInTheDocument()
  })
})
