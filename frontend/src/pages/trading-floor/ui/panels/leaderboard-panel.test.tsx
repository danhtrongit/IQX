import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LeaderRow, ThanTaiLeaderboard } from "../../net/types.ts"

const leaderboard = vi.hoisted(() => vi.fn())
const openAuth = vi.hoisted(() => vi.fn())

vi.mock("../../net/api.ts", () => ({
  floorApi: { thanTai: { leaderboard } },
}))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ openAuth }) }))

const { LeaderboardPanel } = await import("./LeaderboardPanel.tsx")
const bridge = await import("../../bridge.ts")

const row = (rank: number, over: Partial<LeaderRow> = {}): LeaderRow => ({
  rank,
  name: `Người ${rank}`,
  avatar: "male01",
  color: "default",
  correct: 10 - rank,
  total: 12,
  ...over,
})

const board = (over: Partial<ThanTaiLeaderboard> = {}): ThanTaiLeaderboard => ({
  month: "2026-11",
  scoredDays: 9,
  rows: [row(1), row(2), row(3)],
  me: null,
  asOf: 1,
  ...over,
})

beforeEach(() => {
  bridge.resetBridge()
  leaderboard.mockReset()
  openAuth.mockReset()
})

describe("LeaderboardPanel", () => {
  it("shows the month, the explanation and the ranked rows with accuracy", async () => {
    leaderboard.mockResolvedValue(board())
    render(<LeaderboardPanel />)
    expect(await screen.findByText("Tháng 11/2026")).toBeTruthy()
    expect(
      screen.getByText(/Xếp theo số lần dự đoán VNINDEX đúng/)
    ).toBeTruthy()
    expect(screen.getByText("Người 1")).toBeTruthy()
    expect(screen.getByText("9/12")).toBeTruthy()
    expect(screen.getByText("75%")).toBeTruthy()
    expect(screen.queryByText("Đăng nhập để được xếp hạng")).toBeNull()
  })

  it("pins the caller's own row when it is outside the top rows", async () => {
    leaderboard.mockResolvedValue(
      board({ me: row(37, { name: "Tôi", correct: 1, total: 4 }) })
    )
    render(<LeaderboardPanel />)
    expect(await screen.findByText("Tôi")).toBeTruthy()
    expect(screen.getByText("37")).toBeTruthy()
    expect(screen.getByText("25%")).toBeTruthy()
    expect(screen.getByText("Bạn")).toBeTruthy()
  })

  it("marks the caller inside the top rows without repeating the row", async () => {
    leaderboard.mockResolvedValue(board({ me: row(2) }))
    render(<LeaderboardPanel />)
    expect(await screen.findByText("Bạn")).toBeTruthy()
    expect(screen.getAllByText("Người 2")).toHaveLength(1)
  })

  it("asks a guest to sign in", async () => {
    const user = userEvent.setup()
    bridge.ui.guest.set(true)
    leaderboard.mockResolvedValue(board())
    render(<LeaderboardPanel />)
    await user.click(await screen.findByRole("button", { name: "Đăng nhập" }))
    expect(screen.getByText("Đăng nhập để được xếp hạng")).toBeTruthy()
    expect(openAuth).toHaveBeenCalledWith("login")
  })

  it("says so when no day has been scored", async () => {
    leaderboard.mockResolvedValue(board({ rows: [], scoredDays: 0 }))
    render(<LeaderboardPanel />)
    expect(
      await screen.findByText("Chưa có phiên nào được chấm trong tháng này.")
    ).toBeTruthy()
  })

  it("shows an error with a retry that loads the board", async () => {
    const user = userEvent.setup()
    leaderboard.mockRejectedValueOnce(new Error("offline"))
    leaderboard.mockResolvedValueOnce(board())
    render(<LeaderboardPanel />)
    await user.click(await screen.findByRole("button", { name: "Thử lại" }))
    expect(await screen.findByText("Người 1")).toBeTruthy()
    expect(leaderboard).toHaveBeenCalledTimes(2)
  })

  it("keeps the old board when a refresh fails", async () => {
    bridge.world.leaderboard.set(board())
    leaderboard.mockRejectedValue(new Error("offline"))
    render(<LeaderboardPanel />)
    await waitFor(() => expect(leaderboard).toHaveBeenCalled())
    expect(screen.getByText("Người 1")).toBeTruthy()
    expect(screen.queryByText("Thử lại")).toBeNull()
  })
})
