import { api } from "@/shared/http/client"
import type { AnalyzeResponse } from "./types"

export const portfolioManagerApi = {
  analyze: async (): Promise<AnalyzeResponse> => {
    return api.post("portfolio-manager/analyze", { timeout: 120_000 }).json<AnalyzeResponse>()
  },
}
