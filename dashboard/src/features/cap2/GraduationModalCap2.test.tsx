import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap2Progress } from "./types"

const { useCap2ProgressMock, graduateMutate, messageInfo } = vi.hoisted(() => ({
  useCap2ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  messageInfo: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useGraduateCap2: () => ({ mutate: graduateMutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModalCap2, isGraduationReadyCap2 } from "./GraduationModalCap2"

function makeProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    chuoi_current: 20,
    chuoi_record: 20,
    ...overrides,
  })
}

describe("isGraduationReadyCap2", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap2(null)).toBe(false)
    expect(isGraduationReadyCap2(undefined)).toBe(false)
  })

  it("is false when fewer than 5/5 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap2(readyProgress({ task_5_done_at: null }))).toBe(false)
  })

  it("is true once 5/5 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap2(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(
      isGraduationReadyCap2(readyProgress({ graduated_at: "2026-07-21T00:00:00Z" })),
    ).toBe(false)
  })
})

describe("GraduationModalCap2", () => {
  beforeEach(() => {
    useCap2ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    messageInfo.mockReset()
  })

  it("does not render when 5/5 isn't met", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap2 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + 3 khối VERBATIM (spec §13) + 120px glowing badge once ready", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)

    // Header
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 2 · KỶ LUẬT")).toBeInTheDocument()
    expect(screen.getByText("5/5 nhiệm vụ · Cửa sổ 20 lệnh với ≤2 vi phạm")).toBeInTheDocument()

    // Khối 1 — Ghi nhận
    expect(
      screen.getByText(/Bạn đã đi qua 20 lệnh Thực chiến với ≤2 vi phạm kỷ luật/),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Kế hoạch của bạn KHÔNG chỉ là kế hoạch — nó là hành động."),
    ).toBeInTheDocument()

    // Khối 2 — Định vị
    expect(screen.getByText(/Nhưng có kỷ luật vẫn chưa đủ/)).toBeInTheDocument()
    expect(
      screen.getByText("kết quả tốt không đồng nghĩa quyết định tốt."),
    ).toBeInTheDocument()

    // Khối 3 — Chuyển cấp (viền xanh brand #4f8ff7)
    expect(screen.getByText("Từ giờ: Cấp 3 «Bản lĩnh».")).toBeInTheDocument()
    expect(screen.getByText("khối lượng mua hợp lý")).toBeInTheDocument()

    // Button
    expect(screen.getByText("Vào Cấp 3 «Bản lĩnh» →")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  it('clicking "Vào Cấp 3" calls useGraduateCap2().mutate and toasts "Cấp 3 sắp ra mắt" (Cấp 3 not built yet)', () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByText("Vào Cấp 3 «Bản lĩnh» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("Cấp 3"))
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap2ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    render(<GraduationModalCap2 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})
