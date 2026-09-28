/**
 * Per-user chart drawing persistence.
 *
 * Drawings live on the backend (`/chart-drawings/{symbol}`, per signed-in user)
 * and — in parallel — in a localStorage bucket keyed by JWT subject, so a guest
 * or an offline session still gets the same-device experience. The localStorage
 * copy is a cache, never the authority: the API decides what a user may read.
 */
import { api, getAccessToken } from "@/lib/api"

export type DrawingState = Record<string, unknown>

type ChartDrawingResponse = {
  symbol: string
  state: DrawingState | null
  updated_at: string | null
}

const chartDrawingsApi = {
  get: (symbol: string) =>
    api<ChartDrawingResponse>(`/chart-drawings/${encodeURIComponent(symbol)}`),
  put: (symbol: string, state: DrawingState) =>
    api<ChartDrawingResponse>(`/chart-drawings/${encodeURIComponent(symbol)}`, {
      method: "PUT",
      body: JSON.stringify({ state }),
    }),
}

export type DrawingPersistence = {
  load(symbol: string): Promise<DrawingState | null>
  save(symbol: string, state: DrawingState): void
}

const LS_PREFIX = "iqx.tv_drawings_v2_"
const SAVE_DEBOUNCE_MS = 1500

/** JWT subject is only a cache namespace; API authorization stays server-side. */
function currentOwner(): string | null {
  const token = getAccessToken()
  if (!token) return "guest"
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const { sub } = JSON.parse(atob(payload)) as { sub?: unknown }
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

/** Shared singleton so every chart mount shares one debounce-timer map. */
let shared: DrawingPersistence | null = null
export function getDrawingPersistence(): DrawingPersistence {
  if (!shared) shared = createDrawingPersistence()
  return shared
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
          const response = await chartDrawingsApi.get(sym)
          if (currentOwner() !== owner) return null
          return response.state ?? lsLoad(owner, sym)
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
      clearTimeout(timers.get(key))
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
