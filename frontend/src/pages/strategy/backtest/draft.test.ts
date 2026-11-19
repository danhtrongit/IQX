/**
 * §7.2.11 "giống tự thiết lập": every seeded Chiến lược IQX (the backend seed the migration inserts) filled
 * by "Dùng" gives exactly the config a user gets by removing every card (✕) and adding each indicator
 * with "+ Mua" / "+ Bán", typing its rows in the Chỉnh form. Same config → same run and snapshot.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { buildIndicatorConfig, createDraft } from "@/pages/demo-trading/bot/config/draft"
import type { IndicatorConfig, Side } from "@/pages/demo-trading/bot/config/types"

import { buildRegistry } from "../../demo-trading/bot/test-support"
import type { IqxStrategyDefinition } from "../shared/iqx"
import {
  applyIqxStrategy,
  changedIndicators,
  defaultIndicators,
  maxHoldingError,
  removeSide,
  sameConfig,
  strategyDefinitionOf,
  strategyErrors,
  strategySummary,
  withIndicators,
  type Indicators,
} from "./draft"
import { isSideUsed } from "./sides"

type SeedStrategy = { slug: string; content: { name: string; definition: IqxStrategyDefinition } }
const seed = JSON.parse(readFileSync(resolve(process.cwd(), "../backend/src/modules/iqx-templates/iqx-templates.seed.json"), "utf8")) as {
  strategy: SeedStrategy[]
}
const registry = buildRegistry()
const SIDES: readonly Side[] = ["buy", "sell"]
const used = (indicators: Indicators, id: string, side: Side) =>
  isSideUsed(withIndicators({ schema_version: "", revision: 0, rule_version: "", indicators }, indicators), id, side)

/** A saved config with cards the strategy will replace: RSI on both sides (custom), MA buy on. */
function savedBase(): Indicators {
  const base = defaultIndicators(registry)
  const rsi = structuredClone(base.rsi!)
  rsi.master_enabled = true
  rsi.buy = { ...rsi.buy, enabled: true }
  rsi.sell = { ...rsi.sell, enabled: true }
  const ma = structuredClone(base.ma!)
  ma.master_enabled = true
  ma.buy = { ...ma.buy, enabled: true }
  return { ...base, rsi, ma }
}

/** By hand: ✕ on every card, then "+ Mua" / "+ Bán" of each indicator of the strategy and typing its rows. */
function byHand(base: Indicators, definition: IqxStrategyDefinition): Indicators {
  let current = structuredClone(base)
  for (const id of Object.keys(current))
    for (const side of SIDES) if (used(current, id, side)) current = { ...current, [id]: removeSide(current[id]!, side) }
  for (const [id, wanted] of Object.entries(definition.indicators)) {
    const indicator = registry.find((entry) => entry.id === id)!
    for (const side of SIDES) {
      if (!(wanted.master_enabled && wanted[side].enabled)) continue
      const saved: IndicatorConfig = current[id]!
      const typed = createDraft(wanted)[side]
      const draft = { ...createDraft(saved), [side]: { ...typed, enabled: true } }
      current = { ...current, [id]: buildIndicatorConfig(indicator, saved, draft, true) }
    }
  }
  return current
}

describe("Chiến lược IQX filled by Dùng = configured by hand (§7.2.11)", () => {
  it.each(seed.strategy.map((item) => [item.slug, item] as const))("%s", (_slug, item) => {
    const definition = item.content.definition
    for (const base of [savedBase(), defaultIndicators(registry)]) {
      const filled = applyIqxStrategy(base, definition)
      const manual = byHand(base, definition)
      expect(sameConfig(filled, manual)).toBe(true)
      // Cards: exactly the strategy's sides, nothing left from the saved config.
      for (const id of Object.keys(filled))
        for (const side of SIDES) {
          const wanted = definition.indicators[id]
          expect(used(filled, id, side), `${id}.${side}`).toBe(!!wanted && wanted.master_enabled && wanted[side].enabled)
        }
    }
  })

  it("a filled draft passes the publish checks and builds back the stored definition", () => {
    for (const item of seed.strategy) {
      const filled = applyIqxStrategy(defaultIndicators(registry), item.content.definition)
      expect(strategyErrors(filled, String(item.content.definition.max_holding))).toEqual([])
      const rebuilt = strategyDefinitionOf(filled, item.content.definition.max_holding)
      expect(Object.keys(rebuilt.indicators).sort()).toEqual(Object.keys(item.content.definition.indicators).sort())
      for (const [id, config] of Object.entries(item.content.definition.indicators))
        for (const side of SIDES) if (config[side].enabled) expect(rebuilt.indicators[id]![side]).toEqual(config[side])
    }
  })
})

describe("draft helpers", () => {
  it("sends only the indicators that differ from the saved config", () => {
    const base = savedBase()
    const filled = applyIqxStrategy(base, seed.strategy[0]!.content.definition)
    const changed = changedIndicators(base, filled)
    expect(Object.keys(changed).sort()).toEqual(["ma", "ma_cross", "rsi"])
    expect(changedIndicators(base, base)).toEqual({})
  })

  it("blocks a strategy without a switched-on Bán row and a Giữ tối đa outside 3–250", () => {
    const filled = applyIqxStrategy(defaultIndicators(registry), seed.strategy[0]!.content.definition)
    const noSell = { ...filled, ma_cross: removeSide(filled.ma_cross!, "sell") }
    expect(strategyErrors(noSell, "60")).toEqual(["Chưa bật chỉ báo Bán nào."])
    expect(strategyErrors(filled, "2")).toEqual(["Giữ tối đa phải từ 3 đến 250 phiên, số nguyên."])
    expect(maxHoldingError("250")).toBeNull()
    expect(maxHoldingError("10.5")).not.toBeNull()
    expect(strategyErrors(defaultIndicators(registry), "30")).toEqual(["Chưa bật chỉ báo Mua nào.", "Chưa bật chỉ báo Bán nào."])
  })

  it("summarises a card like §3.2", () => {
    const phadinh = seed.strategy.find((item) => item.slug === "phadinh")!
    expect(strategySummary(phadinh.content.definition, registry)).toEqual({
      buy: "Mua: Donchian Channel + Khối lượng",
      sell: "Bán: Donchian Channel · giữ tối đa 30 phiên",
    })
  })
})
