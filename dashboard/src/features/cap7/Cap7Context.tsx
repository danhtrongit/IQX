import { createContext, useContext, type ReactNode } from "react"

export interface Cap7EventBus {
  isCap7Active: boolean
}

const Cap7EventsContext = createContext<Cap7EventBus | null>(null)
const NOOP_BUS: Cap7EventBus = { isCap7Active: false }

/** Provider gate for Level 7 allocation controls; no trading event channel remains. */
export function Cap7Provider({ children }: { children: ReactNode }) {
  return <Cap7EventsContext.Provider value={{ isCap7Active: true }}>{children}</Cap7EventsContext.Provider>
}

export function useCap7Events(): Cap7EventBus {
  return useContext(Cap7EventsContext) ?? NOOP_BUS
}
