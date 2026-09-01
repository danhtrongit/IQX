import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap3Progress } from "./types"

const { useCap3ProgressMock, graduateMutate, enterCap4Mutate, flags } = vi.hoisted(() => ({
  flags: { CAP_MAX_ENABLED: 3 },
  useCap3ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_value?: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.()),
  enterCap4Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap3Progress: (...args: unknown[]) => useCap3ProgressMock(...args),
  useGraduateCap3: () => ({ mutate: graduateMutate, isPending: false }),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))
vi.mock("@/features/cap4/hooks", () => ({
  useEnterCap4: () => ({ mutate: enterCap4Mutate, isPending: false }),
}))

import { GraduationModalCap3, isGraduationReadyCap3 } from "./GraduationModalCap3"

function makeProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-08-01T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_quan_ly_von: 0,
    muc_tu_tin_da_dung: [],
    so_muc_tu_tin_da_dung: 0,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("isGraduationReadyCap3", () => {
  it("requires exactly both completed Level 3 tasks and no prior graduation", () => {
    expect(isGraduationReadyCap3(makeProgress({ task_1_done_at: "done" }))).toBe(false)
    expect(isGraduationReadyCap3(makeProgress({ task_1_done_at: "done", task_2_done_at: "done" }))).toBe(true)
    expect(isGraduationReadyCap3(makeProgress({ task_1_done_at: "done", task_2_done_at: "done", graduated_at: "done" }))).toBe(false)
  })
})

describe("GraduationModalCap3", () => {
  beforeEach(() => {
    flags.CAP_MAX_ENABLED = 3
    graduateMutate.mockClear()
    enterCap4Mutate.mockClear()
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "done", task_2_done_at: "done" }),
    })
  })

  it("renders the two-task source subtitle and all three updated graduation blocks", () => {
    render(<GraduationModalCap3 />)

    expect(screen.getByText("10 lệnh có chấm tự tin · đủ 3 mức tự tin")).toBeInTheDocument()
    expect(screen.getByText(/Quan trọng hơn con số lãi/)).toBeInTheDocument()
    expect(screen.getByText(/Cấp 4 dạy điều khó nhất/)).toBeInTheDocument()
    expect(screen.getByTestId("cap3-grad-khoi3")).toHaveTextContent("Từ giờ: Cấp 4 «Thuần thục».")
  })

  it("retains the release-gated Level 4 transition", () => {
    flags.CAP_MAX_ENABLED = 4
    render(<GraduationModalCap3 />)

    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    expect(enterCap4Mutate).toHaveBeenCalledTimes(1)
  })
})
