/** Two animation frames, then an idle slot (max ~350 ms), then `run`. Falls back to a timeout. */
export function afterFramesSettle(run: () => void): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    run()
    return
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
        }
      ).requestIdleCallback
      if (typeof ric === "function") ric(run, { timeout: 350 })
      else window.setTimeout(run, 60)
    })
  })
}
