import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import type { IdentityState, UIEvent } from "./types"

export function useIdentity() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["identity", user?.id],
    enabled: !!user,
    queryFn: ({ signal }) => api<IdentityState>("/bot/mascot", { signal }),
  })
}


export function useIdentityEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (event: UIEvent & { mascot_rules_version: number }) => api<IdentityState>("/bot/mascot/ui-events", { method: "POST", body: JSON.stringify(event) }),
    onSuccess: state => { queryClient.setQueryData(["identity", user?.id], state) },
  })
}
