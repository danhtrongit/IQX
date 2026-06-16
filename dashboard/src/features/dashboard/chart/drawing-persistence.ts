import { getAccessToken } from "@/shared/http/client"
import { chartDrawingsApi, type DrawingState } from "./drawings-api"

/**
 * Loads/saves a symbol's TradingView drawings. Backend (per-user) when the user
 * is signed in — so drawings sync across devices — with a localStorage fallback
 * for anonymous users so a refresh still restores what they drew.
 */
export interface DrawingPersistence {
  load(symbol: string): Promise<DrawingState | null>
  save(symbol: string, state: DrawingState): void
}

const LS_PREFIX = "tv_drawings_"
const SAVE_DEBOUNCE_MS = 1500

function lsKey(symbol: string): string {
  return LS_PREFIX + symbol.toUpperCase()
}

function lsLoad(symbol: string): DrawingState | null {
  try {
    const raw = localStorage.getItem(lsKey(symbol))
    return raw ? (JSON.parse(raw) as DrawingState) : null
  } catch {
    return null
  }
}

function lsSave(symbol: string, state: DrawingState): void {
  try {
    localStorage.setItem(lsKey(symbol), JSON.stringify(state))
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
      if (getAccessToken()) {
        try {
          const res = await chartDrawingsApi.get(sym)
          // Backend is authoritative for signed-in users; fall back to a local
          // copy only if the backend has nothing yet (e.g. drawn while anon).
          return res.state ?? lsLoad(sym)
        } catch {
          return lsLoad(sym)
        }
      }
      return lsLoad(sym)
    },

    save(symbol, state) {
      const sym = symbol.toUpperCase()
      // Always keep a same-device copy (instant restore, offline-safe).
      lsSave(sym, state)
      if (!getAccessToken()) return
      const existing = timers.get(sym)
      if (existing) clearTimeout(existing)
      timers.set(
        sym,
        setTimeout(() => {
          timers.delete(sym)
          chartDrawingsApi.put(sym, state).catch(() => {
            /* network/auth error — local copy already saved */
          })
        }, SAVE_DEBOUNCE_MS),
      )
    },
  }
}
