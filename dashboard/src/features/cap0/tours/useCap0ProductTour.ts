import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { useTour, type TourConfig } from "@/features/tour"
import { cap0Keys } from "@/features/cap0/keys"
import { api } from "@/shared/http/client"
import { trackJourneyEvent } from "@/shared/analytics/journey"

export type Cap0ProductTourKey = "phantich" | "bantin" | "bctc"

interface Options {
  onBeforeNext?: (index: number) => void | Promise<void>
  onStepView?: (index: number) => void
  /** Called only after the authenticated server write and progress refresh succeed. */
  onFinished?: (skipped: boolean) => void
}

interface PendingCompletion {
  skipped: boolean
}

class TourAuthenticationError extends Error {}

export function waitForTourTarget(targetId: string, timeoutMs: number): Promise<boolean> {
  if (document.querySelector(`[data-tour-id="${targetId}"]`)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (document.querySelector(`[data-tour-id="${targetId}"]`)) return resolve(true)
      if (Date.now() >= deadline) return resolve(false)
      window.setTimeout(check, 50)
    }
    check()
  })
}

/**
 * Product-tour state plus its durable completion write.
 * The overlay closes immediately, while failed evidence remains retryable
 * without replaying the tour. Client storage never grants progress.
 */
export function useCap0ProductTour(config: TourConfig, key: Cap0ProductTourKey, options: Options = {}) {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const skippedRef = useRef(false)
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null)

  const completion = useMutation<void, unknown, PendingCompletion>({
    mutationKey: ["cap0", "tour-complete", user?.id ?? "anonymous", key],
    mutationFn: async ({ skipped }) => {
      if (!isAuthenticated || !user?.id) {
        throw new TourAuthenticationError("Bạn cần đăng nhập để lưu tiến trình tour.")
      }
      await api.post(`cap0/tours/${key}/complete`, { json: { skipped } }).json<unknown>()
    },
    retry: (failureCount, error) => !(error instanceof TourAuthenticationError) && failureCount < 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: cap0Keys.all })
      setPendingCompletion(null)
      if (!variables.skipped) trackJourneyEvent(`tour_${key}_complete`)
      options.onFinished?.(variables.skipped)
    },
  })

  const persistCompletion = (skipped: boolean) => {
    const variables = { skipped }
    setPendingCompletion(variables)
    completion.mutate(variables)
  }

  const controller = useTour(config, {
    onStart: () => {
      skippedRef.current = false
      trackJourneyEvent(`tour_${key}_start`)
    },
    onStepView: (index) => {
      trackJourneyEvent(`tour_${key}_step_view`, { step_id: index + 1 })
      options.onStepView?.(index)
    },
    onBeforeNext: options.onBeforeNext,
    onSkip: (index) => {
      skippedRef.current = true
      trackJourneyEvent(`tour_${key}_skip`, { step_id: index + 1 })
    },
    onComplete: () => persistCompletion(skippedRef.current),
  })

  return {
    ...controller,
    completionPending: completion.isPending,
    completionError: completion.isError ? completion.error : null,
    retryCompletion: () => {
      if (pendingCompletion && !completion.isPending) completion.mutate(pendingCompletion)
    },
  }
}
