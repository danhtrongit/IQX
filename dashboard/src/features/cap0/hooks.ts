import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cap0Api } from "./api"
import { cap0Keys } from "./keys"
import type { Cap0Gate, Cap0Progress, PlacementResult } from "./types"

/**
 * Current user's Cấp 0 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (the journey bar / checklist reflect live progress).
 * `data` is `null` when the user hasn't entered Cấp 0 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE `Cap0TradingPage` (e.g.
 * `TradingPanel`/`RightSidebar`/`RightToolbar`, shared with /bieu-do &
 * /co-phieu) pass their own `isCap0Active` so this query — and the hide-by-
 * level decision it feeds (spec §8) — never fires outside Cấp 0.
 */
export function useCap0Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap0Progress | null>({
    queryKey: cap0Keys.progress(),
    queryFn: cap0Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 0 query (progress) — used by every mutation. */
function useInvalidateCap0() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap0Keys.all })
}

/** POST /cap0/enter — enter Cấp 0 + seed the practice account. */
export function useEnterCap0() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.enter,
    onSuccess: invalidate,
  })
}

/** POST /cap0/placement — records the "have you traded before?" answer. */
export function usePlacement() {
  const invalidate = useInvalidateCap0()
  return useMutation<PlacementResult, unknown, boolean>({
    mutationFn: (hasTradedBefore) => cap0Api.placement(hasTradedBefore),
    onSuccess: invalidate,
  })
}

/**
 * PATCH /cap0/task — mark a task done (with an optional behaviour gate).
 *
 * Centralizes spec §7's "auto-chuyển tab Hành trình khi hoàn thành nhiệm vụ"
 * (moment thưởng, KHÔNG confetti) here in the hook's `onSuccess` — rather
 * than in each of the (currently 3, likely more later) call sites
 * (`Gbar`/nhiệm vụ ①, the Chặng 2 tours/nhiệm vụ ②③④,
 * `DebriefModal`/nhiệm vụ ⑤) — so every current AND future caller gets the
 * auto-tab for free without having to remember to wire it. `useSidebar()`
 * outside a `SidebarProvider` returns the app's no-op default context, so
 * this is safe to call from anywhere `useCompleteTask` is used.
 *
 * A config-level `onSuccess` on `useMutation` fires even after the calling
 * component has unmounted (TanStack Query keeps the mutation observer alive
 * until the promise settles). `Cap0TradingPage` restores the sidebar's
 * pre-Cấp-0 panel on unmount (see its own comment) — but if a task PATCH is
 * still in flight at that moment (e.g. user closes the Kết sổ for nhiệm vụ ⑤, then
 * immediately clicks the ticker to navigate to `/co-phieu/:symbol`), this
 * `onSuccess` resolves AFTER that restore and would otherwise clobber the
 * panel back to "journey", leaking the Cấp 0 sidebar into the shared
 * `/bieu-do` & `/co-phieu` terminals. Guard with the same route check
 * `Cap0TradingPage` is only ever mounted under: only auto-tab when the user
 * is still actually on `/dau-truong`.
 */
export function useCompleteTask() {
  const invalidate = useInvalidateCap0()
  const { setActivePanel } = useSidebar()
  return useMutation<Cap0Progress, unknown, { taskNo: number; gate?: Cap0Gate }>({
    mutationFn: ({ taskNo, gate }) => cap0Api.completeTask(taskNo, gate),
    onSuccess: () => {
      invalidate()
      if (window.location.pathname === "/dau-truong") {
        setActivePanel("journey")
      }
    },
  })
}

/** POST /cap0/graduate — graduate to Cấp 1 (switches mode to Thực chiến). */
export function useGraduate() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.graduate,
    onSuccess: invalidate,
  })
}
