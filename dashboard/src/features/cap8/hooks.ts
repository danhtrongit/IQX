import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap8Api } from "./api"
import { cap8Keys } from "./keys"
import type { Cap8ExitContext, Cap8Progress } from "./types"

export function useCap8Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap8Progress | null>({
    queryKey: cap8Keys.progress(),
    queryFn: cap8Api.getProgress,
    enabled: enabled && isAuthenticated,
  })
}

export function useEnterCap8() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cap8Api.enter,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cap8Keys.progress() }),
      ])
    },
  })

}

export function useGraduateCap8() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cap8Api.graduate,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cap8Keys.progress() }),
      ])
    },
  })
}

export function useCap8ExitContext(symbol: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap8ExitContext>({
    queryKey: cap8Keys.exitContext(symbol ?? ""),
    queryFn: () => cap8Api.getExitContext(symbol!),
    enabled: enabled && isAuthenticated && Boolean(symbol),
  })
}

/** The Level 7 balance snapshot projected for the selected sale quantity. */
export function useCap8ExitImpact(
  symbol: string | null, quantity: number | undefined, enabled = true,
) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap8ExitContext>({
    queryKey: cap8Keys.exitImpact(symbol ?? "", quantity ?? 0),
    queryFn: () => cap8Api.getExitContext(symbol!, quantity),
    enabled: enabled && isAuthenticated && Boolean(symbol) && Boolean(quantity && quantity > 0),
  })
}

export function useSetCap8DynamicStop(symbol: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dynamicStopVnd: number) => cap8Api.setDynamicStop(symbol, dynamicStopVnd),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cap8Keys.exitContext(symbol) }),
        queryClient.invalidateQueries({ queryKey: cap8Keys.progress() }),
      ])
    },
  })
}
