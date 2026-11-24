import { describe, expect, it, vi } from "vitest"

import {
  runBuildChunked,
  runBuildSync,
  yieldToMain,
  type BuildSteps,
} from "./chunked-build.ts"

function* steps(log: string[], n: number): BuildSteps {
  for (let i = 0; i < n; i += 1) {
    log.push(`step-${i}`)
    yield (i + 1) / n
  }
  log.push("done")
}

describe("chunked scene build", () => {
  it("runBuildSync drains every step in order", () => {
    const log: string[] = []
    runBuildSync(steps(log, 3))
    expect(log).toEqual(["step-0", "step-1", "step-2", "done"])
  })

  it("runBuildChunked yields to the browser between slices and reports monotonic progress ending at 1", async () => {
    const log: string[] = []
    const yieldFn = vi.fn(() => Promise.resolve())
    const progress: number[] = []
    const finished = await runBuildChunked(steps(log, 4), {
      budgetMs: 1,
      yieldFn,
      onProgress: (f) => progress.push(f),
    })
    expect(finished).toBe(true)
    expect(log.at(-1)).toBe("done")
    expect(progress.at(-1)).toBe(1)
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]!)
    }
  })

  it("slices by time budget and stops when cancelled", async () => {
    let now = 0
    const spy = vi.spyOn(performance, "now").mockImplementation(() => now)
    try {
      const log: string[] = []
      function* slow(): BuildSteps {
        for (let i = 0; i < 6; i += 1) {
          now += 6 // each step costs 6 ms
          log.push(`s${i}`)
          yield i / 6
        }
      }
      let cancel = false
      const yieldFn = vi.fn(() => {
        if (log.length >= 4) cancel = true
        return Promise.resolve()
      })
      const progress: number[] = []
      const finished = await runBuildChunked(slow(), {
        budgetMs: 10,
        yieldFn,
        isCancelled: () => cancel,
        onProgress: (f) => progress.push(f),
      })
      expect(finished).toBe(false)
      // 10 ms budget with 6 ms steps -> a yield after every second step.
      expect(yieldFn).toHaveBeenCalledTimes(2)
      expect(log).toEqual(["s0", "s1", "s2", "s3"])
      expect(progress).toEqual([1 / 6, 3 / 6])
    } finally {
      spy.mockRestore()
    }
  })

  it("yieldToMain resolves without scheduler.yield (MessageChannel / setTimeout fallback)", async () => {
    await expect(yieldToMain()).resolves.toBeUndefined()
  })
})
