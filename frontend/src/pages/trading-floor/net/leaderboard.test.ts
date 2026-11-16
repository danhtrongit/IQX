import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetBridge, world } from "../bridge.ts"
import { floorApi } from "./api.ts"
import {
  LEADERBOARD_REFRESH_MS,
  refreshLeaderboard,
  startLeaderboard,
} from "./leaderboard.ts"
import type { ThanTaiLeaderboard } from "./types.ts"

vi.mock("./api.ts", () => ({
  floorApi: { thanTai: { leaderboard: vi.fn() } },
}))

const board = (month: string): ThanTaiLeaderboard => ({
  month,
  scoredDays: 3,
  rows: [
    {
      rank: 1,
      name: "An",
      avatar: "male01",
      color: "default",
      correct: 3,
      total: 3,
    },
  ],
  me: null,
  asOf: 1,
})

const leaderboard = vi.mocked(floorApi.thanTai.leaderboard)

describe("leaderboard polling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    leaderboard.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetBridge()
  })

  it("publishes the board when it is fetched", async () => {
    leaderboard.mockResolvedValue(board("2026-11"))
    await refreshLeaderboard()
    expect(world.leaderboard.get()?.month).toBe("2026-11")
  })

  it("keeps the old board when a refresh fails", async () => {
    leaderboard.mockResolvedValueOnce(board("2026-11"))
    await refreshLeaderboard()
    leaderboard.mockRejectedValueOnce(new Error("offline"))
    await expect(refreshLeaderboard()).rejects.toThrow("offline")
    expect(world.leaderboard.get()?.month).toBe("2026-11")
  })

  it("loads at once, then every 5 minutes, and stops when torn down", async () => {
    leaderboard.mockResolvedValue(board("2026-11"))
    const stop = startLeaderboard()
    expect(leaderboard).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS)
    expect(leaderboard).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS)
    expect(leaderboard).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS * 3)
    expect(leaderboard).toHaveBeenCalledTimes(3)
  })

  it("drops an answer that arrives after the floor stopped", async () => {
    let answer: (value: ThanTaiLeaderboard) => void = () => undefined
    leaderboard.mockReturnValue(
      new Promise<ThanTaiLeaderboard>((resolve) => {
        answer = resolve
      })
    )
    const stop = startLeaderboard()
    stop()
    answer(board("2026-11"))
    await vi.advanceTimersByTimeAsync(0)
    expect(world.leaderboard.get()).toBeNull()
  })

  it("survives a double start and stop (StrictMode) without leaking a timer", async () => {
    leaderboard.mockResolvedValue(board("2026-11"))
    startLeaderboard()()
    const stop = startLeaderboard()
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS)
    // Two starts load once each, then one live timer.
    expect(leaderboard).toHaveBeenCalledTimes(3)
    expect(world.leaderboard.get()?.month).toBe("2026-11")
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
