import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap8Progress } from "./types"

type ModalProps = { children?: ReactNode; visible: boolean }

const mocks = vi.hoisted(() => ({
  graduateMutate: vi.fn(),
  useCap8Progress: vi.fn(),
}))

vi.mock("@arco-design/web-react", () => ({
  Modal: ({ children, visible }: ModalProps) => visible ? <div role="dialog">{children}</div> : null,
}))
vi.mock("@/features/cap0/Badge", () => ({
  Badge: () => <div data-testid="level-badge" />,
  LEVELS: { 8: { color: "purple", n: 8 } },
}))
vi.mock("./hooks", () => ({
  useCap8Progress: mocks.useCap8Progress,
  useGraduateCap8: () => ({ isPending: false, mutate: mocks.graduateMutate }),
}))

import { GraduationModalCap8 } from "./GraduationModalCap8"

function progress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "p8",
    user_id: "u8",
    entered_at: "2026-09-01T00:00:00Z",
    so_lenh_thoat_dung_ke_hoach: 5,
    muc_tieu_thoat_dung_ke_hoach: 5,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.graduateMutate.mockReset()
  mocks.useCap8Progress.mockReset()
  mocks.useCap8Progress.mockReturnValue({ data: progress() })
})

describe("GraduationModalCap8", () => {
  it("renders terminal program graduation and offers no next-level entry", () => {
    render(<GraduationModalCap8 />)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("Hoàn thành chương trình Học tập")
    expect(dialog).toHaveTextContent("5/5 lần thoát lệnh theo kế hoạch")
    expect(screen.getByRole("button", { name: "Xác nhận hoàn thành" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Vào Cấp|Cấp 9/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hoàn thành" }))
    expect(mocks.graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("stays closed before the fifth compliant exit", () => {
    mocks.useCap8Progress.mockReturnValue({ data: progress({ so_lenh_thoat_dung_ke_hoach: 4 }) })
    render(<GraduationModalCap8 />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
