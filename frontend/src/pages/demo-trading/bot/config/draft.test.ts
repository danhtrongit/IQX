import { describe, expect, it } from "vitest"

import { buildRegistry } from "../test-support"
import {
  buildIndicatorConfig,
  createDraft,
  crossFieldsOf,
  draftErrors,
  hasDraftErrors,
  isDraftDirty,
  paramError,
  rebaseDraft,
  resetDraftSide,
  sideField,
  sideFields,
  templateConfig,
} from "./draft"
import { masterToggleIntent } from "./master"
import type { TechnicalIndicator } from "./types"

const registry = buildRegistry()
const get = (id: string) => registry.find((entry) => entry.id === id)!
const rsi = get("rsi")
/** A registry response from before `validation` was published. */
const withoutValidation = (indicator: TechnicalIndicator): TechnicalIndicator => ({ ...indicator, validation: undefined })

describe("registry field domains", () => {
  it("merges the side override into the field (RSI level is 10-49 to buy and 51-90 to sell)", () => {
    expect(sideField(rsi, "buy", "level")).toMatchObject({ min: 10, max: 49, label: "Ngưỡng quá bán" })
    expect(sideField(rsi, "sell", "level")).toMatchObject({ min: 51, max: 90, label: "Ngưỡng quá mua" })
    expect(sideFields(rsi, "buy").map((field) => field.key)).toEqual(["period", "level"])
  })

  it("validates range, integer-ness and step from the registry", () => {
    const level = sideField(rsi, "buy", "level")!
    expect(paramError(level, "30")).toBeNull()
    expect(paramError(level, "50")).toMatch(/từ 10 đến 49/)
    expect(paramError(level, "9")).toMatch(/từ 10 đến 49/)
    expect(paramError(level, "30.5")).toMatch(/số nguyên/)
    expect(paramError(level, "")).toMatch(/bắt buộc/)
    const k = sideField(get("bollinger"), "buy", "k")!
    expect(paramError(k, "2")).toBeNull()
    expect(paramError(k, "2.1")).toBeNull()
    expect(paramError(k, "2.15")).toMatch(/bước 0,1/)
  })

  it("enforces the registry's published cross_fields (fast < slow) and names the left field", () => {
    for (const id of ["macd", "ma_cross"]) {
      const indicator = get(id)
      expect(indicator.validation?.cross_fields).toEqual([{ left: "fast", op: "<", right: "slow" }])
      const draft = createDraft(templateConfig(indicator))
      expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
      draft.buy.params.fast = draft.buy.params.slow
      const errors = draftErrors(indicator, draft)
      expect(Object.keys(errors.buy.fields)).toEqual(["fast"])
      expect(errors.buy.fields.fast).toMatch(/phải nhỏ hơn chu kỳ/)
      expect(errors.sell.fields).toEqual({})
    }
    const macd = get("macd")
    const draft = createDraft(templateConfig(macd))
    draft.sell.params.fast = draft.sell.params.slow
    expect(draftErrors(macd, draft).sell.fields.fast).toBe("Chu kỳ EMA nhanh phải nhỏ hơn chu kỳ EMA chậm.")
  })

  it("follows the published constraint, including a `>` operator and any pair of fields", () => {
    const base = get("macd")
    const indicator = { ...base, validation: { cross_fields: [{ left: "slow", op: ">" as const, right: "signal" }] } }
    const draft = createDraft(templateConfig(indicator))
    expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
    // fast >= slow is fine now: the published rule is slow > signal.
    draft.buy.params.fast = "40"
    draft.buy.params.slow = "20"
    expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
    draft.buy.params.slow = "9"
    draft.buy.params.signal = "9"
    expect(draftErrors(indicator, draft).buy.fields.slow).toBe("Chu kỳ EMA chậm phải lớn hơn chu kỳ đường tín hiệu.")
  })

  it("an empty published list means no cross-field rule, not the built-in fallback", () => {
    const indicator = { ...get("macd"), validation: { cross_fields: [] } }
    const draft = createDraft(templateConfig(indicator))
    draft.buy.params.fast = draft.buy.params.slow
    expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
    expect(crossFieldsOf(indicator)).toEqual([])
  })

  it("falls back to fast < slow for MACD and MA Cross only when the registry does not publish validation", () => {
    for (const id of ["macd", "ma_cross"]) {
      const indicator = withoutValidation(get(id))
      expect(crossFieldsOf(indicator)).toEqual([{ left: "fast", op: "<", right: "slow" }])
      const draft = createDraft(templateConfig(indicator))
      draft.buy.params.fast = draft.buy.params.slow
      expect(draftErrors(indicator, draft).buy.fields.fast).toMatch(/phải nhỏ hơn/)
    }
    expect(crossFieldsOf(withoutValidation(get("rsi")))).toEqual([])
  })

  it("does not judge a cross-field rule while one of its fields has an error of its own", () => {
    const indicator = get("macd")
    const draft = createDraft(templateConfig(indicator))
    draft.buy.params.slow = ""
    expect(Object.keys(draftErrors(indicator, draft).buy.fields)).toEqual(["slow"])
  })
})

describe("Đặt lại", () => {
  it("restores only the open side's params and operators to the registry defaults and keeps ON/OFF and the other side", () => {
    const saved = templateConfig(rsi)
    saved.buy.enabled = true
    saved.buy.params = { period: 21, level: 25 }
    saved.buy.rules = saved.buy.rules.map((rule) => ({ ...rule, op: "<" }) as typeof rule)
    saved.sell.params = { period: 9, level: 80 }
    const draft = createDraft(saved)
    draft.sell.enabled = true

    const reset = resetDraftSide(draft, rsi, "buy")
    expect(reset.buy.params).toEqual({ period: "14", level: "30" })
    expect(reset.buy.ops).toEqual({ r1: "<", r2: ">" })
    expect(reset.buy.enabled).toBe(true)
    expect(reset.sell).toEqual(draft.sell)
  })
})

describe("building the PATCH record", () => {
  const withSides = (buy: boolean, sell: boolean, master: boolean) => {
    const config = templateConfig(rsi)
    config.master_enabled = master
    config.buy.enabled = buy
    config.sell.enabled = sell
    return config
  }

  it("saves master OFF when both sides end up OFF, whatever the master was", () => {
    const saved = withSides(true, false, true)
    const draft = createDraft(saved)
    draft.buy.enabled = false
    expect(buildIndicatorConfig(saved, draft, false).master_enabled).toBe(false)
    expect(buildIndicatorConfig(saved, draft, true).master_enabled).toBe(false)
  })

  it("never turns the master on from editing alone, only when opened from the master switch with a side ON", () => {
    const saved = withSides(false, false, false)
    const draft = createDraft(saved)
    draft.buy.enabled = true
    expect(buildIndicatorConfig(saved, draft, false).master_enabled).toBe(false)
    expect(buildIndicatorConfig(saved, draft, true).master_enabled).toBe(true)
  })

  it("keeps a master that is ON and sends each side's own params and operators", () => {
    const saved = withSides(true, true, true)
    const draft = createDraft(saved)
    draft.buy.params.period = "10"
    draft.sell.ops.r2 = ">"
    const built = buildIndicatorConfig(saved, draft, false)
    expect(built.master_enabled).toBe(true)
    expect(built.buy.params).toEqual({ period: 10, level: 30 })
    expect(built.sell.params).toEqual({ period: 14, level: 70 })
    expect(built.sell.rules.find((rule) => rule.id === "r2")?.op).toBe(">")
    expect(built.buy.rules.find((rule) => rule.id === "r2")?.op).toBe(">")
  })

  it("ignores an operator that is not in the rule's allowed set", () => {
    const saved = templateConfig(get("bollinger"))
    const draft = createDraft(saved)
    draft.buy.ops.r1 = "∈"
    expect(buildIndicatorConfig(saved, draft, false).buy.rules[0]?.op).toBe("<")
  })
})

describe("dirty and rebase", () => {
  it("is dirty only when something differs from the saved config", () => {
    const saved = templateConfig(rsi)
    const draft = createDraft(saved)
    expect(isDraftDirty(createDraft(saved), draft)).toBe(false)
    draft.buy.params.level = "31"
    expect(isDraftDirty(createDraft(saved), draft)).toBe(true)
  })

  it("after a conflict keeps what the user changed and takes everything else from the newer config", () => {
    const base = templateConfig(rsi)
    const newer = templateConfig(rsi)
    newer.sell.params = { period: 14, level: 85 }
    newer.buy.params = { period: 14, level: 40 }
    const draft = createDraft(base)
    draft.buy.params.level = "35"

    const rebased = rebaseDraft(draft, base, newer)
    expect(rebased.buy.params.level).toBe("35")
    expect(rebased.sell.params.level).toBe("85")
    expect(rebased.buy.params.period).toBe("14")
  })
})

describe("master switch rules", () => {
  const config = (master: boolean, buy: boolean, sell: boolean) => {
    const value = templateConfig(rsi)
    return { ...value, master_enabled: master, buy: { ...value.buy, enabled: buy }, sell: { ...value.sell, enabled: sell } }
  }

  it("OFF keeps the children", () => {
    const intent = masterToggleIntent(config(true, true, false))
    expect(intent).toEqual({ kind: "save", config: config(false, true, false) })
  })

  it("ON with a side already ON keeps it and does not enable the other side", () => {
    const intent = masterToggleIntent(config(false, false, true))
    expect(intent).toEqual({ kind: "save", config: config(true, false, true) })
  })

  it("ON with both sides OFF opens the configuration instead of activating", () => {
    expect(masterToggleIntent(config(false, false, false))).toEqual({ kind: "configure" })
  })
})
