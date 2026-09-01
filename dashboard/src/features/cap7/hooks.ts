import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cap7Api } from "./api"
import { cap7Keys } from "./keys"

export function useCap7Progress(enabled = true) {
  return useQuery({ queryKey: cap7Keys.progress(), queryFn: cap7Api.getProgress, enabled, staleTime: 0 })
}

export function useCap7Portfolio(enabled = true) {
  return useQuery({ queryKey: cap7Keys.portfolio(), queryFn: cap7Api.getPortfolio, enabled, staleTime: 0 })
}

function useInvalidateCap7() {
  const queryClient = useQueryClient()
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: cap7Keys.progress() }),
    queryClient.invalidateQueries({ queryKey: cap7Keys.portfolio() }),
  ])
}

export function useEnterCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation({ mutationFn: cap7Api.enter, onSuccess: invalidate })
}

export function useGraduateCap7() {
  const invalidate = useInvalidateCap7()
  return useMutation({
    mutationFn: cap7Api.graduate,
    // A live gate can turn false between display and POST. Refetch after either
    // outcome, including 409, so the one-task modal cannot remain stale.
    onSettled: () => invalidate(),
  })
}
