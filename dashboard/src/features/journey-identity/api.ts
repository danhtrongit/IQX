import { api } from "@/shared/http/client"
import type { Lop5Partial } from "@/features/cap4/types"
import type { IdentityState, ReadingDataset, ReadingReveal, UIEvent } from "./types"

export const identityApi = {
  get: () => api.get("bot/mascot").json<IdentityState>(),
  event: (event: UIEvent, mascotRulesVersion = 1) => api.post("bot/mascot/ui-events", {
    json: { ...event, mascot_rules_version: mascotRulesVersion },
  }).json<IdentityState>(),
  dataset: (symbol: string) => api.post("journey/reading-datasets", {
    json: { symbol }, timeout: 120_000,
  }).json<ReadingDataset>(),
  submit: (datasetId: string, answers: Lop5Partial) => api.post("journey/assessments", {
    json: { dataset_id: datasetId, answers },
  }).json<{ id: string; dataset_id: string }>(),
  reveal: (id: string) => api.post(`journey/assessments/${id}/reveal`).json<ReadingReveal>(),
}
