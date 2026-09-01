import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const ROOT = `${process.cwd()}/src/features`

/**
 * Levels 0–6 own their terminal chrome directly. Levels 7–8 deliberately
 * inherit it through their lower-level shells and are covered by composition
 * tests instead of brittle source-text assertions.
 */
const DIRECT_CAP_PAGES = [0, 1, 2, 3, 4, 5, 6].map((cap) => ({
  cap,
  path: `${ROOT}/cap${cap}/Cap${cap}TradingPage.tsx`,
}))

function read(path: string): string {
  return readFileSync(path, "utf8")
}

describe.each(DIRECT_CAP_PAGES)("Cấp $cap — terminal trực tiếp không ném user ra ngoài", ({ path }) => {
  it("does not navigate to a stock route", () => {
    expect(read(path)).not.toMatch(/navigate\(\s*[`'"]\/co-phieu/)
  })

  it("keeps symbol changes inside its shell", () => {
    expect(read(path)).toMatch(/<Header\s+onSymbolSelect=\{setSymbol\}/)
    expect(read(path)).toMatch(/<MarketBar\s+onSymbolClick=\{setSymbol\}/)
  })

  it("owns an in-shell AI insight modal", () => {
    expect(read(path)).toMatch(/<AiInsightSymbolModal\b/)
  })
})
