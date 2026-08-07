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
import { countTasksDone, type Cap0Progress } from "./types"

// ── LEVELS (spec §12) ─────────────────────────────────────────────────────────
describe("LEVELS", () => {
  it("has the 6 nền-tảng levels + Cấp 6 + Cấp 7 + Cấp 8; level 0 is «Nhập môn» grey with fill 0", () => {
    // 0-5 = spec §12's own table (mạch nền tảng); index 6 was APPENDED when
    // Cấp 6 «Đối chiếu» shipped (đỏ son #d64550, fill=6), index 7 when Cấp 7
    // «Đọc sổ lệnh» shipped (hồng magenta #c65cae, fill=7), index 8 when Cấp 8
    // «Quản trị rủi ro danh mục» shipped (xanh lá #3f9b5a, fill=8 — the LAST
    // level of the current program).
    expect(LEVELS).toHaveLength(9)
    expect(LEVELS[0].name).toBe("Nhập môn")
    expect(LEVELS[0].color).toBe("#8a90a5")
    expect(LEVELS[0].fill).toBe(0)
    expect(LEVELS[5].name).toBe("Lão luyện")
    expect(LEVELS[6]).toEqual({ n: 6, name: "Đối chiếu", color: "#d64550", fill: 6 })
    expect(LEVELS[7]).toEqual({ n: 7, name: "Đọc sổ lệnh", color: "#c65cae", fill: 7 })
    expect(LEVELS[8]).toEqual({
      n: 8,
      name: "Quản trị rủi ro danh mục",
      color: "#3f9b5a",
      fill: 8,
    })
  })

  // ★ The full 0-8 rail is the payoff of `GraduationModalCap8`'s CTA — every one
  // of the nine badges must render with ITS OWN colour and number. A single
  // `undefined` in the opacity table turns one rail cell invisible, and the
  // moment the whole program builds to is a hole in a row of badges.
  it("★ renders all NINE rail states, each with its own colour + number, no NaN", () => {
    // Expected hexes written out LITERALLY, not read back off `LEVELS`: a test
    // that feeds `LEVELS[i].color` into `badge()` and then looks for that same
    // string in the output can never notice a wrong colour in `LEVELS`.
    const EXPECTED = [
      "#8a90a5",
      "#c97b4a",
      "#7dd3c0",
      "#4f8ff7",
      "#a78bfa",
      "#e0b64d",
      "#d64550",
      "#c65cae",
      "#3f9b5a",
    ]
    expect(LEVELS.map((l) => l.color)).toEqual(EXPECTED)
    expect(LEVELS.map((l) => l.fill)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    LEVELS.forEach((level, i) => {
      const svg = badge({ n: level.n, color: level.color, fill: level.fill, size: 34 })
      expect(svg, `Cấp ${level.n}`).not.toContain("NaN")
      expect(svg, `Cấp ${level.n}`).toContain(EXPECTED[i])
      expect(svg, `Cấp ${level.n}`).toContain(`>${level.n}<`)
    })
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

  // ★ Regression (Cấp 8): SAME bug, one index further. `coreOpacity` stopping at
  // 7 made `fill=8` render `stop-opacity="NaN"` — and Cấp 8's badge is the one
  // the graduation screen shows at 120px as the finale of the whole program.
  it("★ renders a fill=8 badge without NaN opacities (Cấp 8 xanh lá)", () => {
    const svg = badge({ n: 8, color: "#3f9b5a", fill: 8, size: 120, glow: true })
    expect(svg).not.toContain("NaN")
    expect(svg).not.toContain("stop-opacity=\"undefined\"")
    expect(svg).toContain("#3f9b5a")
    // Core is fully opaque from fill=6 up; the outer stop is half of that.
    expect(svg).toContain('stop-opacity="1"')
    expect(svg).toContain('stop-opacity="0.5"')
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
  task1_star_clicked: false,
  task5_debrief_done: false,
  graduated_at: null,
  time_to_graduate_hours: null,
}

// ── countTasksDone (spec v3.0 §4 — 5 nhiệm vụ, không phải 6) ──────────────────
describe("countTasksDone", () => {
  it("counts over exactly FIVE task columns (v3.0 cut nhiệm vụ ⑤ «lệnh thứ hai + cắt lỗ»)", () => {
    const all: Cap0Progress = {
      ...fakeProgress,
      task_1_done_at: "t",
      task_2_done_at: "t",
      task_3_done_at: "t",
      task_4_done_at: "t",
      task_5_done_at: "t",
    }
    expect(countTasksDone(all)).toBe(5)
  })

  it("counts partial progress and treats null/undefined as 0", () => {
    expect(countTasksDone({ ...fakeProgress, task_1_done_at: "t" })).toBe(1)
    expect(countTasksDone(null)).toBe(0)
    expect(countTasksDone(undefined)).toBe(0)
  })

  // ★ The trap the plan names explicitly: a stray `task_6_done_at` left over
  // from the v2.2 wire shape must NEVER be counted — the migration copies col 6
  // into col 5, so counting both would read 6/5 for a mid-flight user.
  it("★ ignores a leftover task_6_done_at from the old 6-task wire shape", () => {
    const stale = { ...fakeProgress, task_1_done_at: "t", task_6_done_at: "t" } as Cap0Progress
    expect(countTasksDone(stale)).toBe(1)
  })
})

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
