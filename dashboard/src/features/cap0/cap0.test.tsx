import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, renderHook, waitFor } from "@testing-library/react"
import React, { type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Mock the ky client so api.ts + hooks.ts run against fixtures (no network /
// tokens). `unwrap` is the identity here — cap0 payloads are un-enveloped.
const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }))

import { Badge, badge, LEVELS } from "./Badge"
import { ModeBadge } from "./ModeBadge"
import { useCap0Progress } from "./hooks"
import type { Cap0Progress } from "./types"

// ── LEVELS (spec §12) ─────────────────────────────────────────────────────────
describe("LEVELS", () => {
  it("has the 6 nền-tảng levels + Cấp 6 + Cấp 7; level 0 is «Nhập môn» grey with fill 0", () => {
    // 0-5 = spec §12's own table (mạch nền tảng); index 6 was APPENDED when
    // Cấp 6 «Đối chiếu» shipped (đỏ son #d64550, fill=6), index 7 when Cấp 7
    // «Đọc sổ lệnh» shipped (hồng magenta #c65cae, fill=7).
    expect(LEVELS).toHaveLength(8)
    expect(LEVELS[0].name).toBe("Nhập môn")
    expect(LEVELS[0].color).toBe("#8a90a5")
    expect(LEVELS[0].fill).toBe(0)
    expect(LEVELS[5].name).toBe("Lão luyện")
    expect(LEVELS[6]).toEqual({ n: 6, name: "Đối chiếu", color: "#d64550", fill: 6 })
    expect(LEVELS[7]).toEqual({ n: 7, name: "Đọc sổ lệnh", color: "#c65cae", fill: 7 })
  })

  it("renders a fill=6 badge without NaN opacities (spec §12's table stops at 5)", () => {
    const svg = badge({ n: 6, color: "#d64550", fill: 6, size: 64 })
    expect(svg).not.toContain("NaN")
    expect(svg).toContain("#d64550")
  })

  // ★ Regression (Cấp 7): the core-opacity table is indexed BY `fill`. When it
  // stopped at 6, `fill=7` produced `stop-opacity="NaN"` — an invisible badge.
  it("renders a fill=7 badge without NaN opacities (Cấp 7 hồng magenta)", () => {
    const svg = badge({ n: 7, color: "#c65cae", fill: 7, size: 64 })
    expect(svg).not.toContain("NaN")
    expect(svg).toContain("#c65cae")
    // fill ≥ 5 keeps the bright rays; fill ≥ 3 keeps the white numeral.
    expect(svg).toContain('opacity="0.9"')
    expect(svg).toContain('fill="#fff"')
  })
})

// ── Badge (port of spec §12 badge()) ───────────────────────────────────────────
describe("Badge", () => {
  it("renders an <svg> containing the level number", () => {
    const { container } = render(<Badge n={0} color={LEVELS[0].color} fill={0} size={66} />)
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.textContent).toContain("0")
  })

  it("renders a different number for a higher level", () => {
    const { container } = render(<Badge n={2} color={LEVELS[2].color} fill={2} size={34} />)
    expect(container.querySelector("svg")?.textContent).toContain("2")
  })

  it("hides the number when showNum is false", () => {
    const { container } = render(
      <Badge n={3} color={LEVELS[3].color} fill={3} size={34} showNum={false} />,
    )
    expect(container.querySelector("text")).toBeNull()
  })

  it("badge() string builder emits an <svg> with the number", () => {
    const svg = badge({ n: 1, color: LEVELS[1].color, fill: 1, size: 34 })
    expect(svg).toContain("<svg")
    expect(svg).toContain(">1<")
  })
})

// ── ModeBadge ──────────────────────────────────────────────────────────────────
describe("ModeBadge", () => {
  it("shows «SÂN TẬP · T+0» in practice mode", () => {
    const { getByText } = render(<ModeBadge mode="san_tap" />)
    expect(getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  it("shows «THỰC CHIẾN» in live mode", () => {
    const { getByText } = render(<ModeBadge mode="thuc_chien" />)
    expect(getByText("THỰC CHIẾN")).toBeInTheDocument()
  })
})

// ── useCap0Progress ─────────────────────────────────────────────────────────────
const fakeProgress: Cap0Progress = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  entered_at: "2026-07-21T00:00:00Z",
  virtual_balance_init: 250_000_000,
  task_1_done_at: null,
  task_2_done_at: null,
  task_3_done_at: null,
  task_4_done_at: null,
  task_5_done_at: null,
  task_6_done_at: null,
  task1_star_clicked: false,
  task5_sl_typed: false,
  task6_debrief_done: false,
  graduated_at: null,
  time_to_graduate_hours: null,
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe("useCap0Progress", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it("GETs cap0/progress and returns the progress row", async () => {
    get.mockReturnValue({ json: () => Promise.resolve(fakeProgress) })
    const { result } = renderHook(() => useCap0Progress(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data).toEqual(fakeProgress))
    expect(get).toHaveBeenCalledWith("cap0/progress")
  })
})
