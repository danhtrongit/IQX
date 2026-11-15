/** Small hooks of the Thần Tài screens: motion preference, the server clock and the serif font. */
import { useEffect, useState, useSyncExternalStore } from "react"

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function readReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia(REDUCED_QUERY).matches
  )
}

/** The OS asks for less motion: no shake, no flip, no coin rain. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false)
}

/** Server time (browser clock + `offset`), refreshed every `everyMs`. */
export function useServerNow(offset: number, everyMs = 1000): number {
  const [clientNow, setClientNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return clientNow + offset
}

const FONT_ID = "tt-noto-serif"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,500;0,700;0,800;1,500&display=swap"

/** Noto Serif for quẻ names, verses and the hoành phi; loaded once, only when the altar opens. */
export function useSerifFont(): void {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return
    const link = document.createElement("link")
    link.id = FONT_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

/** Resolves after `ms` (0 resolves on the next task). */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
