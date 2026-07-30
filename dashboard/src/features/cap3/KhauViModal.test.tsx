import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap3Progress } from "./types"

const { useCap3ProgressMock, setKhauViMutate } = vi.hoisted(() => ({
  useCap3ProgressMock: vi.fn(),
  setKhauViMutate: vi.fn((_khauVi?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
}))

vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
}))

import { Cap3Provider, useCap3Events } from "./Cap3Context"
import { KhauViModal } from "./KhauViModal"

function makeProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-07-29T00:00:00Z",
    khau_vi_da_dat: false,
    khau_vi: null,
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  useCap3ProgressMock.mockReset()
  setKhauViMutate.mockReset()
  setKhauViMutate.mockImplementation((_khauVi?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  })
})

describe("KhauViModal — visibility", () => {
  it("does not render when there is no Cấp 3 progress yet", () => {
    useCap3ProgressMock.mockReturnValue({ data: null })
    render(<KhauViModal />)
    expect(screen.queryByText("Thận trọng")).not.toBeInTheDocument()
  })

  it("auto-shows when khau_vi_da_dat is false (mandatory first pick) and has NO close/cancel affordance", () => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ khau_vi_da_dat: false }) })
    render(<KhauViModal />)
    expect(screen.getByText("Thận trọng")).toBeInTheDocument()
    expect(screen.getByText("Cân bằng")).toBeInTheDocument()
    expect(screen.getByText("Tấn công")).toBeInTheDocument()
    // Arco's Modal `closable={false}` renders no close icon.
    expect(document.querySelector(".arco-modal-close-icon")).toBeNull()
  })

  it("does NOT auto-show once khau_vi_da_dat is true (and forceOpen is not passed)", () => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ khau_vi_da_dat: true, khau_vi: "can_bang" }) })
    render(<KhauViModal />)
    expect(screen.queryByText("Thận trọng")).not.toBeInTheDocument()
  })

  it("forceOpen shows it even when khau_vi_da_dat is already true (đổi sau — không khoá vĩnh viễn), WITH a close affordance", () => {
    const onClose = vi.fn()
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ khau_vi_da_dat: true, khau_vi: "can_bang" }),
    })
    render(<KhauViModal forceOpen onClose={onClose} />)
    expect(screen.getByText("Thận trọng")).toBeInTheDocument()
    expect(document.querySelector(".arco-modal-close-icon")).not.toBeNull()
  })
})

describe("KhauViModal — 3 mức + hệ quả (spec §5.1/§C12c: cho thấy con số đến từ đâu)", () => {
  beforeEach(() => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ khau_vi_da_dat: false, von_ban_dau: 100_000_000 }),
    })
  })

  it("shows the 3 mức with their % trần", () => {
    render(<KhauViModal />)
    expect(within(screen.getByTestId("khau-vi-pick-than_trong")).getByText(/trần 10%/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-can_bang")).getByText(/trần 20%/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-tan_cong")).getByText(/trần 30%/)).toBeInTheDocument()
  })

  it("shows số mã nắm được for each mức, computed from vốn 100tr (10 / 5 / 3)", () => {
    render(<KhauViModal />)
    expect(within(screen.getByTestId("khau-vi-pick-than_trong")).getByText(/10 mã/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-can_bang")).getByText(/5 mã/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-tan_cong")).getByText(/3 mã/)).toBeInTheDocument()
  })

  it("shows thiệt hại tối đa nếu 1 mã giảm sàn, computed from vốn 100tr (700,000 / 1,400,000 / 2,100,000)", () => {
    render(<KhauViModal />)
    expect(within(screen.getByTestId("khau-vi-pick-than_trong")).getByText(/700,000/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-can_bang")).getByText(/1,400,000/)).toBeInTheDocument()
    expect(within(screen.getByTestId("khau-vi-pick-tan_cong")).getByText(/2,100,000/)).toBeInTheDocument()
  })

  it("marks Cân bằng as the suggested default", () => {
    render(<KhauViModal />)
    expect(screen.getByText(/mặc định/i)).toBeInTheDocument()
  })
})

describe("KhauViModal — posting the choice", () => {
  beforeEach(() => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ khau_vi_da_dat: false }) })
  })

  it("clicking a mức calls useSetKhauVi().mutate with that khẩu vị", () => {
    render(<KhauViModal />)
    const card = screen.getByTestId("khau-vi-pick-than_trong")
    fireEvent.click(within(card).getByRole("button"))
    expect(setKhauViMutate).toHaveBeenCalledWith("than_trong", expect.objectContaining({
      onSuccess: expect.any(Function),
    }))
  })

  it("on success, notifies the Cấp 3 bus's onKhauViPicked and calls onClose", () => {
    const onKhauViPicked = vi.fn()
    const onClose = vi.fn()

    function Harness() {
      const bus = useCap3Events()
      React.useEffect(() => {
        bus.registerHandlers({ onKhauViPicked })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <KhauViModal onClose={onClose} />
    }

    render(
      <Cap3Provider>
        <Harness />
      </Cap3Provider>,
    )
    fireEvent.click(within(screen.getByTestId("khau-vi-pick-tan_cong")).getByRole("button"))
    expect(onKhauViPicked).toHaveBeenCalledWith("tan_cong")
    expect(onClose).toHaveBeenCalled()
  })

  it("highlights the currently-chosen mức when changing later (forceOpen)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({ khau_vi_da_dat: true, khau_vi: "tan_cong" }),
    })
    render(<KhauViModal forceOpen />)
    expect(screen.getByTestId("khau-vi-pick-tan_cong")).toHaveAttribute("data-selected", "true")
    expect(screen.getByTestId("khau-vi-pick-than_trong")).toHaveAttribute("data-selected", "false")
  })
})
