/**
 * The monthly hall of fame (Thần Tài predictions): fetched when the floor starts, every 5 minutes, and
 * again whenever the panel opens. The answer goes to `world.leaderboard`, which the statues and the
 * panel both read. The server caches a month for about a minute, so a refresh is cheap.
 */
import { world } from "../bridge.ts"
import { floorApi } from "./api.ts"
import type { ThanTaiLeaderboard } from "./types.ts"

export const LEADERBOARD_REFRESH_MS = 5 * 60 * 1000

/** Bumped when the floor stops: an answer that arrives after that is dropped instead of filling the next visit. */
let epoch = 0

/** Fetches this month's board and publishes it. Rejects with the request's error (the statues keep the old board). */
export async function refreshLeaderboard(): Promise<ThanTaiLeaderboard> {
  const started = epoch
  const board = await floorApi.thanTai.leaderboard()
  if (started === epoch) world.leaderboard.set(board)
  return board
}

/** Loads the board now and every 5 minutes until the returned function is called. Failures are silent here. */
export function startLeaderboard(): () => void {
  const load = (): void => {
    refreshLeaderboard().catch(() => undefined)
  }
  load()
  const timer = setInterval(load, LEADERBOARD_REFRESH_MS)
  return () => {
    clearInterval(timer)
    epoch += 1
  }
}
