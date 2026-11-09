import { createContext, useContext } from "react"

/** What the Candle Dojo tool shows: the home, or one focused task (intro, lesson, drill, belt exam). */
export type DojoScreen =
  | { kind: "home" }
  | { kind: "intro" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "drill"; lessonId: string }
  | { kind: "exam"; dojo: number }

export const DOJO_HOME: DojoScreen = { kind: "home" }

export type CandleDojoContextValue = {
  screen: DojoScreen
  open: (screen: DojoScreen) => void
  /** Preview (chế độ xem trước): a client-only flag that opens every row and never writes anything. */
  preview: boolean
  setPreview: (preview: boolean) => void
}

export const CandleDojoContext = createContext<CandleDojoContextValue | null>(null)

export function useCandleDojo(): CandleDojoContextValue {
  const value = useContext(CandleDojoContext)
  if (!value) throw new Error("useCandleDojo must be used within CandleDojoProvider")
  return value
}
