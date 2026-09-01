import { api, unwrap } from "@/shared/http/client"
import type { Cap7Progress, PortfolioBalanceCap7 } from "./types"

export const cap7Api = {
  getProgress: async (): Promise<Cap7Progress | null> =>
    unwrap((await api.get("cap7/progress").json<unknown>()) as never) as Cap7Progress | null,
  enter: async (): Promise<Cap7Progress> =>
    unwrap((await api.post("cap7/enter").json<unknown>()) as never) as Cap7Progress,
  getPortfolio: async (): Promise<PortfolioBalanceCap7> =>
    unwrap((await api.get("cap7/portfolio").json<unknown>()) as never) as PortfolioBalanceCap7,
  graduate: async (): Promise<Cap7Progress> =>
    unwrap((await api.post("cap7/graduate").json<unknown>()) as never) as Cap7Progress,
}
