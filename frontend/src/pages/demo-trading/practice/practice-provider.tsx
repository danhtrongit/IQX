import type { ReactNode } from "react"

import { PracticeContext } from "./practice-context"
import { usePracticeController } from "./use-practice-controller"

/**
 * Shares one practice session between the main area and the right panel, which the workspace frame
 * renders in different places. `indicatorId = null` keeps every query disabled, so the provider can
 * stay mounted around the frame whether or not a practice is open.
 */
export function PracticeProvider({ indicatorId, children }: { indicatorId: string | null; children: ReactNode }) {
  const value = usePracticeController(indicatorId)
  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>
}
