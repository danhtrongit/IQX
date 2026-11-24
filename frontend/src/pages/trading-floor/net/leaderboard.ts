/**
 * The monthly hall of fame (Thần Tài predictions): fetched when the floor starts, every 5 minutes, and
 * again whenever the panel opens. The answer goes to `world.leaderboard`, which the statues and the
 * panel both read. The server caches a month for about a minute, so a refresh is cheap.
 */
import { world } from "../bridge.ts"
import { floorApi } from "./api.ts"
import type { ThanTaiLeaderboard } from "./types.ts"

export const LEADERBOARD_REFRESH_MS = 5 * 60 * 1000
const IDLE_MODERATE_MS = 15 * 60 * 1000
const IDLE_LONG_MS = 30 * 60 * 1000
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const

/** Bumped when the floor stops: an answer that arrives after that is dropped instead of filling the next visit. */
let epoch = 0

function isTabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true
}

/** Fetches this month's board and publishes it. Rejects with the request's error (the statues keep the old board). */
export async function refreshLeaderboard(): Promise<ThanTaiLeaderboard> {
  const started = epoch
  const board = await floorApi.thanTai.leaderboard()
  if (started === epoch) world.leaderboard.set(board)
  return board
}

/**
 * Loads the board now and periodically until the returned function is called.
 * Pauses while `document.hidden`, refreshes immediately upon returning visible,
 * and backs off when the tab has been idle for a long period.
 */
export function startLeaderboard(): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let pausedWhileHidden = false
  let lastActivityMs = Date.now()

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const nextDelayMs = (): number => {
    const idleMs = Math.max(0, Date.now() - lastActivityMs)
    if (idleMs >= IDLE_LONG_MS) return LEADERBOARD_REFRESH_MS * 3
    if (idleMs >= IDLE_MODERATE_MS) return LEADERBOARD_REFRESH_MS * 2
    return LEADERBOARD_REFRESH_MS
  }

  const load = (): void => {
    refreshLeaderboard().catch(() => undefined)
  }

  const scheduleNext = (): void => {
    if (stopped) return
    if (isTabHidden()) {
      pausedWhileHidden = true
      clearTimer()
      return
    }
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      if (stopped) return
      if (isTabHidden()) {
        pausedWhileHidden = true
        return
      }
      load()
      scheduleNext()
    }, nextDelayMs())
  }

  const onActivity = (): void => {
    lastActivityMs = Date.now()
  }

  const onVisibilityChange = (): void => {
    if (stopped) return
    if (isTabHidden()) {
      pausedWhileHidden = true
      clearTimer()
    } else {
      lastActivityMs = Date.now()
      if (pausedWhileHidden) {
        pausedWhileHidden = false
        load()
        scheduleNext()
      }
    }
  }

  if (typeof window !== "undefined") {
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true })
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  if (isTabHidden()) {
    pausedWhileHidden = true
  } else {
    load()
    scheduleNext()
  }

  return () => {
    stopped = true
    clearTimer()
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
    if (typeof window !== "undefined") {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity)
      }
    }
    epoch += 1
  }
}
