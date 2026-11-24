/**
 * Time-sliced scene construction helpers.
 *
 * Heavy builders (office architecture, floor furniture, team desk pods) are written as generators that
 * `yield` between independent pieces of work, optionally yielding a progress fraction in [0, 1]. The same
 * generator can be drained synchronously (`runBuildSync`, used for live rebuilds and tests) or in
 * ~10 ms slices that hand the main thread back to the browser between slices (`runBuildChunked`, used
 * while the loading screen is up), so the loading screen keeps animating and input stays responsive.
 */

/** A builder step sequence: each `yield` is a safe pause point; a numeric value reports progress 0..1. */
export type BuildSteps = Generator<number | void, void, void>

export interface ChunkedBuildOptions {
  /** Work budget per slice before yielding to the browser (default 10 ms). */
  budgetMs?: number
  /** Latest progress fraction (0..1) reported by the builder, called at most once per slice. */
  onProgress?: (fraction: number) => void
  /** Checked after every yield; returning true stops the run early (the generator is left suspended). */
  isCancelled?: () => boolean
  /** Override for tests; defaults to `yieldToMain`. */
  yieldFn?: () => Promise<void>
}

type SchedulerLike = { yield?: () => Promise<void> }

/** Yields the main thread: `scheduler.yield()` when available, else a MessageChannel task, else `setTimeout(0)`. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler
  if (scheduler && typeof scheduler.yield === "function") {
    return scheduler.yield.call(scheduler)
  }
  if (typeof MessageChannel !== "undefined") {
    return new Promise<void>((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/** Runs every remaining step synchronously. */
export function runBuildSync(steps: BuildSteps): void {
  for (;;) {
    if (steps.next().done) return
  }
}

/**
 * Runs the steps in time slices of `budgetMs`, yielding to the browser between slices.
 * Resolves `true` when the builder finished, `false` when `isCancelled()` stopped it first.
 */
export async function runBuildChunked(
  steps: BuildSteps,
  opts: ChunkedBuildOptions = {}
): Promise<boolean> {
  const budgetMs = Math.max(1, opts.budgetMs ?? 10)
  const yieldFn = opts.yieldFn ?? yieldToMain
  let progress = 0
  let reported = -1
  let sliceStart = performance.now()
  for (;;) {
    const res = steps.next()
    if (res.done) {
      opts.onProgress?.(1)
      return true
    }
    if (typeof res.value === "number" && Number.isFinite(res.value)) {
      progress = Math.max(progress, Math.min(1, Math.max(0, res.value)))
    }
    if (performance.now() - sliceStart >= budgetMs) {
      if (progress !== reported) {
        reported = progress
        opts.onProgress?.(progress)
      }
      await yieldFn()
      if (opts.isCancelled?.()) return false
      sliceStart = performance.now()
    }
  }
}
