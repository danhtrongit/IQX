import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap7Progress } from "./types"

const { useCap7ProgressMock, useCap8ProgressMock, graduateMutate, enterCap8Mutate, capFlags } = vi.hoisted(() => ({
  useCap7ProgressMock: vi.fn(),
  useCap8ProgressMock: vi.fn(),
  graduateMutate: vi.fn(),
  enterCap8Mutate: vi.fn(),
  capFlags: { max: 7 },
}))

vi.mock("@arco-design/web-react", () => ({
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <div role="dialog">{children}</div> : null,
}))
vi.mock("./hooks", () => ({
  useCap7Progress: () => useCap7ProgressMock(),
  useGraduateCap7: () => ({ mutate: graduateMutate, isPending: false }),
}))
vi.mock("@/features/cap8/hooks", () => ({
  useEnterCap8: () => ({ mutate: enterCap8Mutate, isSuccess: false }),
  useCap8Progress: () => useCap8ProgressMock(),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return capFlags.max
  },
}))
vi.mock("@/features/cap6/Cap6TradingPage", () => ({
  Cap6TradingPage: () => <div data-testid="cap6-page" />,
}))

import { Cap7TradingPage } from "./Cap7TradingPage"
import { GraduationModalCap7 } from "./GraduationModalCap7"
import { isGraduationReadyCap7 } from "./graduationState"

function progress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return {
    id: "p7", user_id: "u7", entered_at: "2026-09-01T00:00:00Z", can_doi_ok: true,
    so_ma_dang_giu: 4, so_nganh_dang_giu: 3, ma_ty_trong_cao_nhat: "AAA",
    ty_trong_ma_cao_nhat_pct: 30, nganh_ty_trong_cao_nhat: "Ngân hàng",
    ty_trong_nganh_cao_nhat_pct: 40, ma_chua_co_gia: [], ma_chua_ro_nganh: [],
    du_lieu_day_du: true, nguong_ty_trong_ma_pct: 30, nguong_ty_trong_nganh_pct: 40,
    toi_thieu_ma: 4, toi_thieu_nganh: 3, graduated_at: null, time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  useCap7ProgressMock.mockReturnValue({ data: progress() })
  useCap8ProgressMock.mockReturnValue({ data: null })
  graduateMutate.mockReset()
  enterCap8Mutate.mockReset()
  capFlags.max = 7
})

describe("GraduationModalCap7", () => {
  it("mounts the graduation modal inside the Level 7 provider/page", () => {
    render(<Cap7TradingPage />)
    expect(screen.getByTestId("cap6-page")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("mounts the live one-task graduation copy and confirms graduation", () => {
    render(<GraduationModalCap7 />)
    expect(screen.getByRole("dialog")).toHaveTextContent("1/1 nhiệm vụ")
    expect(screen.getByRole("dialog")).toHaveTextContent("30%")
    expect(screen.getByRole("dialog")).toHaveTextContent("40%")
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận tốt nghiệp" }))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("closes after terminal graduation when Level 8 remains release-gated", () => {
    useCap7ProgressMock.mockReturnValue({ data: progress({ graduated_at: "2026-09-01T01:00:00Z" }) })
    render(<GraduationModalCap7 />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("offers the permitted Level 8 transition after graduation", () => {
    capFlags.max = 8
    useCap7ProgressMock.mockReturnValue({ data: progress({ graduated_at: "2026-09-01T01:00:00Z" }) })
    render(<GraduationModalCap7 />)
    fireEvent.click(screen.getByRole("button", { name: "Vào Cấp 8" }))
    expect(enterCap8Mutate).toHaveBeenCalledTimes(1)
  })

  it("suppresses the non-closable Level 7 modal after Level 8 progress exists", () => {
    capFlags.max = 8
    useCap7ProgressMock.mockReturnValue({ data: progress({ graduated_at: "2026-09-01T01:00:00Z" }) })
    useCap8ProgressMock.mockReturnValue({ data: { id: "p8" } })
    render(<GraduationModalCap7 />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("requires live balance and no prior graduation", () => {
    expect(isGraduationReadyCap7(progress())).toBe(true)
    expect(isGraduationReadyCap7(progress({ can_doi_ok: false }))).toBe(false)
    expect(isGraduationReadyCap7(progress({ graduated_at: "2026-09-01T01:00:00Z" }))).toBe(false)
  })
})
