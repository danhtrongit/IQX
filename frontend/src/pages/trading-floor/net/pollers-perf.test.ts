import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetBridge, ui } from "../bridge.ts"
import { floorApi } from "./api.ts"
import { refreshInbox, startChat } from "./chat.ts"
import { LEADERBOARD_REFRESH_MS, startLeaderboard } from "./leaderboard.ts"
import { market, startMarket } from "./market.ts"
import {
  IDLE_BACKOFF_THRESHOLDS,
  POLL_MS,
  idleBackoffMultiplier,
  nextPollDelay,
} from "./market/polling.ts"
import type { ThanTaiLeaderboard } from "./types.ts"

vi.mock("./api.ts", () => ({
  floorApi: {
    thanTai: { leaderboard: vi.fn() },
    inbox: vi.fn(),
  },
}))

const mockLeaderboard = vi.mocked(floorApi.thanTai.leaderboard)
const mockInbox = vi.mocked(floorApi.inbox)

function setDocHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  })
}

const sampleBoard: ThanTaiLeaderboard = {
  month: "2026-11",
  scoredDays: 5,
  rows: [],
  me: null,
  asOf: 1,
}

describe("Trading Floor pollers visibility pause & idle backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDocHidden(false)
    mockLeaderboard.mockReset()
    mockInbox.mockReset()
  })

  afterEach(() => {
    setDocHidden(false)
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetBridge()
  })

  it("applies idle backoff multiplier in market polling without exceeding closed interval", () => {
    expect(idleBackoffMultiplier(0)).toBe(1)
    expect(idleBackoffMultiplier(IDLE_BACKOFF_THRESHOLDS.moderateMs - 1)).toBe(1)
    expect(idleBackoffMultiplier(IDLE_BACKOFF_THRESHOLDS.moderateMs)).toBe(2)
    expect(idleBackoffMultiplier(IDLE_BACKOFF_THRESHOLDS.longMs)).toBe(4)

    // Tuesday 10:00 ICT (open session): base 20s -> 40s at 5m idle -> 80s at 15m idle
    const openMs = Date.parse("2026-11-24T03:00:00Z")
    expect(
      nextPollDelay({ now: openMs, failures: 0, idleMs: 0, random: () => 0.5 })
    ).toBe(POLL_MS.open)
    expect(
      nextPollDelay({
        now: openMs,
        failures: 0,
        idleMs: IDLE_BACKOFF_THRESHOLDS.moderateMs,
        random: () => 0.5,
      })
    ).toBe(POLL_MS.open * 2)
    expect(
      nextPollDelay({
        now: openMs,
        failures: 0,
        idleMs: IDLE_BACKOFF_THRESHOLDS.longMs,
        random: () => 0.5,
      })
    ).toBe(POLL_MS.open * 4)
  })

  it("pauses market polling while document.hidden and immediately refreshes on visible", async () => {
    const indicesSpy = vi
      .spyOn(market, "indices")
      .mockResolvedValue({ indices: [], asOf: null })
    const groupSpy = vi
      .spyOn(market, "groupSymbols")
      .mockResolvedValue(["FPT"])
    const quotesSpy = vi.spyOn(market, "quotes").mockResolvedValue([])

    const stop = startMarket()
    await vi.advanceTimersByTimeAsync(10)
    expect(indicesSpy).toHaveBeenCalledTimes(1)
    expect(groupSpy).toHaveBeenCalledTimes(1)
    expect(quotesSpy).toHaveBeenCalledTimes(1)

    // Hide tab -> no polls run even after 15 minutes
    setDocHidden(true)
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(indicesSpy).toHaveBeenCalledTimes(1)
    expect(quotesSpy).toHaveBeenCalledTimes(1)

    // Tab becomes visible -> immediate refresh fires
    setDocHidden(false)
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(10)
    expect(indicesSpy).toHaveBeenCalledTimes(2)
    expect(quotesSpy).toHaveBeenCalledTimes(2)

    stop()
  })

  it("pauses leaderboard polling while document.hidden, refreshes on visible, and backs off when idle", async () => {
    mockLeaderboard.mockResolvedValue(sampleBoard)
    const stop = startLeaderboard()
    expect(mockLeaderboard).toHaveBeenCalledTimes(1)

    // Hide tab -> timer cleared, zero fetches across 20 minutes
    setDocHidden(true)
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS * 4)
    expect(mockLeaderboard).toHaveBeenCalledTimes(1)

    // Show tab -> immediate refresh
    setDocHidden(false)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(mockLeaderboard).toHaveBeenCalledTimes(2)

    // Advance 15 min without user activity -> next poll backs off to 2x (10 min)
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS) // t=5m -> fetch #3
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS) // t=10m -> fetch #4
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS) // t=15m -> fetch #5, now idle>=15m so next is +10m
    expect(mockLeaderboard).toHaveBeenCalledTimes(5)

    // After 5m more (t=20m): still waiting due to 2x idle backoff
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS)
    expect(mockLeaderboard).toHaveBeenCalledTimes(5)

    // After another 5m (t=25m): backoff timer fires
    await vi.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS)
    expect(mockLeaderboard).toHaveBeenCalledTimes(6)

    stop()
  })

  it("defers chat inbox refresh while document.hidden and flushes immediately when visible", async () => {
    ui.profile.set({ name: "An", avatar: "male01", color: "default" })
    mockInbox.mockResolvedValue({
      asUser: [],
      asSaco: [],
      saco: null,
      matchedConvId: null,
    })

    setDocHidden(true)
    const stop = startChat()
    refreshInbox(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(mockInbox).not.toHaveBeenCalled()

    setDocHidden(false)
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(10)
    expect(mockInbox).toHaveBeenCalledTimes(1)

    stop()
  })
})
