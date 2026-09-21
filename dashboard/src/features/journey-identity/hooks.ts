import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { isDoc5LopComplete, LOP_KEYS } from "@/features/cap4/doc5Lop"
import type { Lop5Partial } from "@/features/cap4/types"
import { identityApi } from "./api"
import type { UIEvent } from "./types"
import type { IdentityState } from "./types"

export function useIdentity() {
  const { user } = useAuth()
  return useQuery({ queryKey: ["journey-identity", user?.id], queryFn: identityApi.get,
    enabled: !!user, staleTime: 10_000, refetchInterval: 30_000,
    refetchIntervalInBackground: false })
}

export function useIdentityEvent() {
  const { user } = useAuth()
  const client = useQueryClient()
  return useCallback(async (event: UIEvent) => {
    // Server owns the day, including retries that cross local midnight.
    const write: UIEvent = "local_date" in event
      ? Object.fromEntries(Object.entries(event).filter(([key]) => key !== "local_date")) as UIEvent
      : event
    const current = client.getQueryData<IdentityState>(["journey-identity", user?.id])
    const result = await identityApi.event(write, current?.mascot_rules_version ?? 1)
    client.setQueryData(["journey-identity", user?.id], result)
    return result
  }, [client, user?.id])
}

/** AI answers are never downloaded before the first complete submission commits. */
export function useLearningReading(symbol: string, answers: Lop5Partial) {
  const { user } = useAuth()
  const dataset = useQuery({ queryKey: ["journey-reading", user?.id, symbol],
    queryFn: () => identityApi.dataset(symbol), enabled: !!user,
    staleTime: Infinity, gcTime: 0, retry: 1,
    refetchOnWindowFocus: false, refetchOnReconnect: false })
  const complete = isDoc5LopComplete(answers)
  const reveal = useQuery({ queryKey: ["journey-reveal", user?.id, dataset.data?.id],
    queryFn: async () => {
      const receipt = await identityApi.submit(dataset.data!.id, { ...answers })
      return identityApi.reveal(receipt.id)
    }, enabled: complete && !!dataset.data, staleTime: Infinity, gcTime: 0, retry: 1,
    refetchOnWindowFocus: false, refetchOnReconnect: false })
  // Preserve the learning form's existing degraded-data behavior; missing data
  // never becomes neutral evidence in the server's mascot classification.
  const settledFailure = dataset.isError || (complete && reveal.isError)
  const aiAnswers = complete && reveal.data
    ? Object.fromEntries(LOP_KEYS.map(key => [key, reveal.data.ai_answers[key]])) as Lop5Partial
    : null
  return { dataset, reveal, aiAnswers, settledFailure }
}
