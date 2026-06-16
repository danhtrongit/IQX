import { api } from "@/shared/http/client"

/** Serialized TradingView LineToolsAndGroupsState (opaque to us). */
export type DrawingState = Record<string, unknown>

interface ChartDrawingResponse {
  symbol: string
  state: DrawingState | null
  updated_at: string | null
}

/** Per-user chart-drawing storage (backend). All endpoints require auth. */
export const chartDrawingsApi = {
  get: (symbol: string) =>
    api.get(`chart-drawings/${encodeURIComponent(symbol)}`).json<ChartDrawingResponse>(),
  put: (symbol: string, state: DrawingState) =>
    api
      .put(`chart-drawings/${encodeURIComponent(symbol)}`, { json: { state } })
      .json<ChartDrawingResponse>(),
  remove: (symbol: string) => api.delete(`chart-drawings/${encodeURIComponent(symbol)}`),
}
