import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"

import { trackJourneyEvent } from "./journey-events"
import { useTour } from "./use-tour"
import type { TourConfig } from "./types"

/** The three product tours the workspace can deep-link into. */
export type ProductTourKey = "phantich" | "bantin" | "bctc"

interface Options {
  onBeforeNext?: (index: number) => void | Promise<void>
  onStepView?: (index: number) => void
  /** Called only after the authenticated server write succeeds. */
  onFinished?: (skipped: boolean) => void
}

interface PendingCompletion {
  skipped: boolean
}

class TourAuthenticationError extends Error {}

/** True once `[data-tour-id="targetId"]` exists; false after `timeoutMs`. */
export async function waitForTourTarget(targetId: string, timeoutMs: number): Promise<boolean> {
  const selector = `[data-tour-id="${targetId}"]`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (document.querySelector(selector)) return true
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  return document.querySelector(selector) !== null
}

/**
 * Product-tour state plus its durable completion write.
 *
 * The overlay closes immediately, while a failed write stays retryable without
 * replaying the tour. Progress is only ever granted by the server — anonymous
 * visitors can watch a tour but the completion is rejected and surfaced.
 */
export function useProductTour(config: TourConfig, key: ProductTourKey, options: Options = {}) {
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
      await api(`/cap0/tours/${key}/complete`, {
        method: "POST",
        body: JSON.stringify({ skipped }),
      })
    },
    retry: (failureCount, error) => !(error instanceof TourAuthenticationError) && failureCount < 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["journey"] })
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
