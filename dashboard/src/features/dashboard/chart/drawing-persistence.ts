import { getAccessToken } from "@/shared/http/client"
import { chartDrawingsApi, type DrawingState } from "./drawings-api"

/**
 * Loads/saves a symbol's TradingView drawings. Backend (per-user) when the user
 * is signed in, with a separate same-device fallback for each account/guest.
 */
export interface DrawingPersistence {
  load(symbol: string): Promise<DrawingState | null>
  save(symbol: string, state: DrawingState): void
}

const LS_PREFIX = "tv_drawings_v2_"
const SAVE_DEBOUNCE_MS = 1500

/** JWT subject is only a cache namespace; API authorization stays server-side. */
function currentOwner(): string | null {
  const token = getAccessToken()
  if (!token) return "guest"
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const { sub } = JSON.parse(atob(payload))
    return typeof sub === "string" && sub ? `user:${sub}` : null
  } catch {
    return null
  }
}

function lsKey(owner: string, symbol: string): string {
  return `${LS_PREFIX}${owner}:${symbol.toUpperCase()}`
}

function lsLoad(owner: string, symbol: string): DrawingState | null {
  try {
    const raw = localStorage.getItem(lsKey(owner, symbol))
    return raw ? (JSON.parse(raw) as DrawingState) : null
  } catch {
    return null
  }
}

function lsSave(owner: string, symbol: string, state: DrawingState): void {
  try {
    localStorage.setItem(lsKey(owner, symbol), JSON.stringify(state))
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Shared singleton so all chart mounts share one debounce-timer map. */
let _shared: DrawingPersistence | null = null
export function getDrawingPersistence(): DrawingPersistence {
  if (!_shared) _shared = createDrawingPersistence()
  return _shared
}

export function createDrawingPersistence(): DrawingPersistence {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    async load(symbol) {
      const sym = symbol.toUpperCase()
      const owner = currentOwner()
      if (!owner) return null
      if (owner !== "guest") {
        try {
          const res = await chartDrawingsApi.get(sym)
          if (currentOwner() !== owner) return null
          return res.state ?? lsLoad(owner, sym)
        } catch {
          return currentOwner() === owner ? lsLoad(owner, sym) : null
        }
      }
      return lsLoad(owner, sym)
    },

    save(symbol, state) {
      const sym = symbol.toUpperCase()
      const owner = currentOwner()
      if (!owner) return
      lsSave(owner, sym, state)
      if (owner === "guest") return
      const key = lsKey(owner, sym)
      const existing = timers.get(key)
      if (existing) clearTimeout(existing)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          if (currentOwner() !== owner) return
          chartDrawingsApi.put(sym, state).catch(() => {
            /* network/auth error — local copy already saved */
          })
        }, SAVE_DEBOUNCE_MS),
      )
    },
  }
}
