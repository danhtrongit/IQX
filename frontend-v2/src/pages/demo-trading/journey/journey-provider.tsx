import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import type { JourneyProgress } from "../types"
import { JourneyContext, LEVELS, unwrapJourneyData, type JourneySnapshot, type Placement } from "./journey-state"

/** Backend keeps historical Cấp 7/8 rows, but the active v2 learning-plan
 * contract currently ends at Cấp 6. Never turn a historical level into a
 * PATCH/POST against a non-existent task or plan route. */
export const MAX_ACTIVE_JOURNEY_LEVEL = 6

export function JourneyProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["journey", "state", user?.id],
    enabled: !!user,
    queryFn: async ({ signal }): Promise<JourneySnapshot> => {
      const [initialProgress, placement] = await Promise.all([
        api<unknown>("/cap0/progress", { signal }).then(unwrapJourneyData<JourneyProgress | null>),
        api<unknown>("/cap0/placement", { signal }).then(unwrapJourneyData<Placement | null>),
      ])
      let progress = initialProgress
      let level = 0
      if (!progress && placement?.placed_level === 0) progress = unwrapJourneyData<JourneyProgress>(await api<unknown>("/cap0/enter", { method: "POST", signal }))
      while (level < MAX_ACTIVE_JOURNEY_LEVEL && (progress?.graduated_at || (placement?.placed_level ?? 0) > level)) {
        level += 1
        progress = unwrapJourneyData<JourneyProgress | null>(await api<unknown>(`/cap${level}/progress`, { signal }))
        if (!progress && level >= (placement?.placed_level ?? 0)) {
          progress = unwrapJourneyData<JourneyProgress>(await api<unknown>(`/cap${level}/enter`, { method: "POST", signal }))
        }
      }
      return { level, progress, placement }
    },
  })
  const state = query.data ?? { level: 0, progress: null, placement: null }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["journey"] }),
      queryClient.invalidateQueries({ queryKey: ["identity"] }),
    ])
  }
  async function choosePlacement(answer: "never" | "unsure" | "regular") {
    await api("/cap0/placement", { method: "POST", body: JSON.stringify({ answer }) })
    await refresh()
    await queryClient.invalidateQueries({ queryKey: ["trading"] })
  }
  async function completeTask(task: number, gate?: "star" | "debrief") {
    if (state.level < 0 || state.level > MAX_ACTIVE_JOURNEY_LEVEL) return
    await api(`/cap${state.level}/task`, { method: "PATCH", body: JSON.stringify({ task_no: task, ...(gate ? { gate } : {}) }) })
    await refresh()
  }
  async function graduate() {
    if (state.level < 0 || state.level > MAX_ACTIVE_JOURNEY_LEVEL) return
    await api(`/cap${state.level}/graduate`, { method: "POST" })
    await refresh()
    await queryClient.invalidateQueries({ queryKey: ["trading"] })
  }

  return <JourneyContext.Provider value={{ ...state, levelName: LEVELS[state.level].name, mode: state.level === 0 ? "san_tap" : "thuc_chien", isLoading: authLoading || (!!user && query.isLoading), error: query.error, needsPlacement: !!user && query.isSuccess && !state.progress && !state.placement, refresh, choosePlacement, completeTask, graduate }}>{children}</JourneyContext.Provider>
}
