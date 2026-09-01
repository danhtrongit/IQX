import { api, unwrap } from "@/shared/http/client"
import type { Cap8Exit, Cap8ExitContext, Cap8Progress } from "./types"

export const cap8Api = {
  getProgress: async (): Promise<Cap8Progress | null> => {
    const response = await api.get("cap8/progress").json<unknown>()
    return (unwrap(response as never) ?? null) as Cap8Progress | null
  },
  enter: async (): Promise<Cap8Progress> =>
    unwrap((await api.post("cap8/enter").json<unknown>()) as never) as Cap8Progress,
  graduate: async (): Promise<Cap8Progress> =>
    unwrap((await api.post("cap8/graduate").json<unknown>()) as never) as Cap8Progress,
  getExitContext: async (symbol: string): Promise<Cap8ExitContext> =>
    unwrap((await api.get(`cap8/positions/${symbol}/exit-context`).json<unknown>()) as never) as Cap8ExitContext,
  syncPlan: async (symbol: string, buyOrderId: string): Promise<void> => {
    await api.post(`cap8/positions/${symbol}/sync-plan`, { json: { buy_order_id: buyOrderId } })
  },
  setDynamicStop: async (symbol: string, dynamicStopVnd: number): Promise<void> => {
    await api.patch(`cap8/positions/${symbol}/dynamic-stop`, { json: { dynamic_stop_vnd: dynamicStopVnd } })
  },
  recordExit: async (sellOrderId: string): Promise<Cap8Exit> =>
    unwrap((await api.post("cap8/exits", { json: { sell_order_id: sellOrderId } }).json<unknown>()) as never) as Cap8Exit,
}
