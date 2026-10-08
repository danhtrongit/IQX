import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ensureWorkspaceOnce, fetchWorkspaceState, resolveActiveMascotId } from "./workspace-api"

/**
 * Runs `POST /workspace/ensure` once when the workspace mounts for a signed-in
 * user (never again on re-renders or remounts in the same page session) and
 * reports when the read of `/workspace/state` may start.
 */
export function useWorkspaceBootstrap(): boolean {
  const { user } = useAuth()
  const userId = user?.id
  const [settledFor, setSettledFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    ensureWorkspaceOnce(userId)
      .catch(() => undefined)
      .finally(() => {
        if (active) setSettledFor(userId)
      })
    return () => {
      active = false
    }
  }, [userId])

  return !!userId && settledFor === userId
}

/** The signed-in account's workspace: the active mascot (default when unknown). */
export function useWorkspace() {
  const { user } = useAuth()
  const ready = useWorkspaceBootstrap()
  const query = useQuery({
    queryKey: ["workspace", "state", user?.id],
    enabled: !!user && ready,
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) => fetchWorkspaceState(signal),
  })
  return {
    state: query.data ?? null,
    mascotId: resolveActiveMascotId(query.data),
  }
}
