/**
 * State of the Candle Dojo tool shared by its main area and the workspace frame: the screen on show and the
 * preview flag. It lives only while the tool is open; leaving the tool starts again from the home with
 * the preview off, so the unlocked view never outlasts the visit.
 */
import { useMemo, useState, type ReactNode } from "react"

import { CandleDojoContext, DOJO_HOME, type DojoScreen } from "./candle-dojo-context"

export function CandleDojoProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<DojoScreen>(DOJO_HOME)
  const [preview, setPreview] = useState(false)
  const value = useMemo(() => ({ screen, open: setScreen, preview, setPreview }), [screen, preview])
  return <CandleDojoContext.Provider value={value}>{children}</CandleDojoContext.Provider>
}
