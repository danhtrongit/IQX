/** Keeps the world data (ritual stats, leaderboard) fresh for both the game and the panels. */
import { toast, ui, world } from "../bridge.ts"
import { floorApi } from "./api.ts"
import { presence } from "./presence.ts"
import type { RitualToday } from "./types.ts"

const RITUAL_EVERY_MS = 60_000

export async function refreshRitual(): Promise<RitualToday | null> {
  try {
    const today = await floorApi.today()
    world.ritual.set(today.stats)
    return today
  } catch {
    return null
  }
}

export async function refreshLeaders(): Promise<void> {
  try {
    world.leaders.set((await floorApi.leaderboard()).rows)
  } catch {
    // Keep the last board.
  }
}

/** Loads the ritual and leaderboard data and keeps them current. Returns the stop function. */
export function startData(): () => void {
  void refreshRitual()
  void refreshLeaders()
  const timer = setInterval(() => void refreshRitual(), RITUAL_EVERY_MS)
  const offRitual = presence.on("ritual", (r) => {
    void refreshRitual()
    if (r.name !== ui.profile.get()?.name) {
      toast(
        `🙏 ${r.name} vừa khấn Thần Tài · quẻ ${r.que} · đoán VNINDEX ${r.direction === "up" ? "tăng" : "giảm"}`,
        "gold"
      )
    }
  })
  const offBoard = presence.on("leaderboard", () => void refreshLeaders())
  return () => {
    clearInterval(timer)
    offRitual()
    offBoard()
  }
}
