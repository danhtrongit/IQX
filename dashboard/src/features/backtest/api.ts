import { api } from "@/shared/http/client"
import type {
  CatalogResponse,
  RunRequest,
  RunResult,
  SavedStrategy,
  StrategyConfig,
} from "./types"

/** Backtester endpoints (Premium-gated). Responses are plain JSON (not enveloped). */
export const backtestApi = {
  getCatalog: (): Promise<CatalogResponse> =>
    api.get("backtest/catalog").json<CatalogResponse>(),

  run: (req: RunRequest): Promise<RunResult> =>
    api.post("backtest/run", { json: req, timeout: 60_000 }).json<RunResult>(),

  listStrategies: (): Promise<SavedStrategy[]> =>
    api.get("backtest/strategies").json<SavedStrategy[]>(),

  createStrategy: (body: {
    name: string
    symbol?: string | null
    config: StrategyConfig
  }): Promise<SavedStrategy> => api.post("backtest/strategies", { json: body }).json<SavedStrategy>(),

  updateStrategy: (
    id: string,
    body: { name?: string; symbol?: string | null; config?: StrategyConfig },
  ): Promise<SavedStrategy> =>
    api.put(`backtest/strategies/${id}`, { json: body }).json<SavedStrategy>(),

  deleteStrategy: (id: string): Promise<void> => {
    return api.delete(`backtest/strategies/${id}`).then(() => undefined)
  },
}
