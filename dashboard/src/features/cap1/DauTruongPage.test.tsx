import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap1Progress } from "./types"

const {
  useAuthMock,
  useCap0ProgressMock,
  useCap1ProgressMock,
  enterCap1Mutate,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useCap0ProgressMock: vi.fn(),
  useCap1ProgressMock: vi.fn(),
  enterCap1Mutate: vi.fn(),
}))

vi.mock("@/features/auth", () => ({ useAuth: () => useAuthMock() }))

vi.mock("@/features/cap0", () => ({
  Cap0TradingPage: () => <div data-testid="cap0-page" />,
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useEnterCap1: () => ({ mutate: enterCap1Mutate, isPending: false }),
}))

vi.mock("./Cap1TradingPage", () => ({
  Cap1TradingPage: () => <div data-testid="cap1-page" />,
}))

import { DauTruongPage } from "./DauTruongPage"

function fakeCap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task_6_done_at: null,
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lan_xem_danh_muc: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("DauTruongPage — progression routing (Task FE3)", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    useCap0ProgressMock.mockReset()
    useCap1ProgressMock.mockReset()
    enterCap1Mutate.mockReset()
  })

  it("shows a spinner while auth is still loading", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap0TradingPage when not authenticated (guest — zero behaviour change)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap0-page")).toBeInTheDocument()
  })

  it("shows a spinner while Cấp 0 progress is still loading (authenticated)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap0TradingPage when Cấp 0 is not graduated yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: { graduated_at: null }, isFetched: true })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap0-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
    expect(enterCap1Mutate).not.toHaveBeenCalled()
  })

  it("shows a spinner once Cấp 0 is graduated but Cấp 1 progress hasn't resolved yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap1TradingPage + calls POST /cap1/enter once when Cấp 0 is graduated and Cấp 1 hasn't been entered yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(enterCap1Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap1TradingPage WITHOUT re-entering when Cấp 1 progress already exists (not graduated)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(enterCap1Mutate).not.toHaveBeenCalled()
  })

  it("still renders Cap1TradingPage when Cấp 1 is ALREADY graduated (Cấp 2 not built yet)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(enterCap1Mutate).not.toHaveBeenCalled()
  })
})
