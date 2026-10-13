import { api } from "@/lib/api"

import type { InvestmentView } from "./types"

type Envelope = { data: InvestmentView }

export async function fetchInvestmentView(symbol: string, signal?: AbortSignal): Promise<InvestmentView> {
  const res = await api<Envelope>(`/ai/investment-view/${encodeURIComponent(symbol)}`, { signal })
  return res.data
}

export async function fetchInvestmentViewStatus(
  symbol: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<InvestmentView> {
  const res = await api<Envelope>(
    `/ai/investment-view/${encodeURIComponent(symbol)}/status?jobId=${encodeURIComponent(jobId)}`,
    { signal },
  )
  return res.data
}
