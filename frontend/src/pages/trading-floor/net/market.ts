/** Market data for the HUD, the LED wall and the ritual, from the public IQX market API. */
import { API_BASE } from "@/lib/api-config"

import { world } from "../bridge.ts"
import { createMarketApi } from "./market/api.ts"
import { nextPollDelay } from "./market/polling.ts"
import type { DirectoryEntry, Quote } from "./market/types.ts"

export const market = createMarketApi({ baseUrl: API_BASE })

let stopPolling: (() => void) | null = null

/** Polls VNINDEX & co and the VN30 basket until the returned function is called. */
export function startMarket(): () => void {
  if (stopPolling) return stopPolling
  const controller = new AbortController()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let vn30Symbols: string[] | null = null

  const loop = (run: () => Promise<boolean>): void => {
    let failures = 0
    const tick = async (): Promise<void> => {
      if (controller.signal.aborted) return
      failures = (await run()) ? 0 : failures + 1
      if (controller.signal.aborted) return
      const timer = setTimeout(
        () => {
          timers.delete(timer)
          void tick()
        },
        nextPollDelay({ now: Date.now(), failures })
      )
      timers.add(timer)
    }
    void tick()
  }

  loop(async () => {
    try {
      const { indices } = await market.indices(controller.signal)
      world.indices.set(indices)
      return true
    } catch {
      return false
    }
  })
  loop(async () => {
    try {
      vn30Symbols ??= (
        await market.groupSymbols("VN30", controller.signal)
      ).sort()
      const rows = await quotes(vn30Symbols, controller.signal)
      world.vn30.set(vn30Symbols.flatMap((s) => rows[s] ?? []))
      return true
    } catch {
      return false
    }
  })

  const stop = (): void => {
    controller.abort()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    stopPolling = null
  }
  stopPolling = stop
  return stop
}

const DIRECTORY_KEY = "iqx-trading-floor:directory"
const DIRECTORY_TTL_MS = 12 * 60 * 60 * 1000
let directoryPromise: Promise<DirectoryEntry[]> | null = null

/** Listed stocks for the ticker pickers, cached in localStorage for half a day. */
export function directory(): Promise<DirectoryEntry[]> {
  if (directoryPromise) return directoryPromise
  try {
    const cached = JSON.parse(
      localStorage.getItem(DIRECTORY_KEY) ?? "null"
    ) as { at: number; entries: DirectoryEntry[] } | null
    if (
      cached &&
      Date.now() - cached.at < DIRECTORY_TTL_MS &&
      cached.entries.length
    ) {
      return (directoryPromise = Promise.resolve(cached.entries))
    }
  } catch {
    // A broken cache is ignored.
  }
  directoryPromise = market.directory().then((entries) => {
    try {
      localStorage.setItem(
        DIRECTORY_KEY,
        JSON.stringify({ at: Date.now(), entries })
      )
    } catch {
      // Storage full or blocked: keep it in memory only.
    }
    return entries
  })
  directoryPromise.catch(() => {
    directoryPromise = null
  })
  return directoryPromise
}

export async function quotes(
  symbols: string[],
  signal?: AbortSignal
): Promise<Record<string, Quote>> {
  if (!symbols.length) return {}
  const rows = await market.quotes(symbols, signal)
  return Object.fromEntries(rows.map((q) => [q.symbol, q]))
}

/** Folds Vietnamese text to ASCII for search ("Hòa Phát" gives "hoa phat"). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

export function searchDirectory(
  entries: DirectoryEntry[],
  query: string,
  limit = 8
): DirectoryEntry[] {
  const q = fold(query.trim())
  if (!q) return []
  const upper = q.toUpperCase()
  const scored: [number, DirectoryEntry][] = []
  for (const e of entries) {
    let s = -1
    if (e.symbol === upper) s = 0
    else if (e.symbol.startsWith(upper)) s = 1
    else if (fold(e.name).includes(q)) s = 2
    if (s >= 0) scored.push([s, e])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].symbol.localeCompare(b[1].symbol))
  return scored.slice(0, limit).map(([, e]) => e)
}
