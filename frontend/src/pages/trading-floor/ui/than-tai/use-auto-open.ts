/** Opens the Thần Tài sheet by itself on the first visit of the Vietnam day, if praying is still possible. */
import { useEffect, useRef } from "react"

import { openPanel, ui } from "../../bridge.ts"
import { floorApi } from "../../net/api.ts"
import { serverOffset, shouldAutoOpenThanTai, vnDate } from "../../than-tai.ts"
import { useStore } from "../../use-store.ts"

/** localStorage key: `YYYY-MM-DD` (Vietnam) of the last automatic opening. */
export const AUTO_OPEN_KEY = "iqx.floor.thantai.auto"

/** Same-tab fallback when localStorage is unavailable (private mode). */
let memoryDay: string | null = null

function readLastDay(): string | null {
  try {
    const stored = window.localStorage.getItem(AUTO_OPEN_KEY)
    if (stored) return stored
  } catch {
    // Storage blocked: the in-memory day below still covers this tab.
  }
  return memoryDay
}

function writeLastDay(day: string): void {
  memoryDay = day
  try {
    window.localStorage.setItem(AUTO_OPEN_KEY, day)
  } catch {
    // Private mode: nothing more to do.
  }
}

/** Test hook: forget the in-memory day. */
export function resetAutoOpenMemory(): void {
  memoryDay = null
}

/**
 * Once the floor is ready and the visitor is in (profile set, not queued, no sheet open), asks the
 * server for today's ritual and opens the altar if it can still be prayed. A failed fetch does
 * nothing and does not mark the day. After the first decision, or once the visitor opens any sheet
 * themselves, it never opens again from this mount.
 */
export function useThanTaiAutoOpen(): void {
  const ready = useStore(ui.ready)
  const profile = useStore(ui.profile)
  const queue = useStore(ui.queue)
  const panel = useStore(ui.panel)
  const settled = useRef(false)
  const inGame = ready && profile !== null && queue === null
  const idle = panel === null

  useEffect(() => {
    if (!inGame) return
    if (!idle) {
      // The visitor already went somewhere: do not interrupt them later.
      settled.current = true
      return
    }
    if (settled.current) return
    let live = true
    floorApi.thanTai.today().then(
      (today) => {
        if (!live) return
        settled.current = true
        const receivedAt = Date.now()
        const now = receivedAt + serverOffset(today.serverTime, receivedAt)
        if (!shouldAutoOpenThanTai(today, now, readLastDay())) return
        if (ui.panel.get() !== null) return
        writeLastDay(vnDate(now))
        openPanel("thantai")
      },
      () => {
        // Offline or signed-out API: stay quiet and try again on the next visit.
      }
    )
    return () => {
      live = false
    }
  }, [inGame, idle])
}
