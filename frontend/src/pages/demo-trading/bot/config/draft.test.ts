import { describe, expect, it } from "vitest"

import { buildRegistry } from "../test-support"
import {
  buildIndicatorConfig,
  createDraft,
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

const registry = buildRegistry()
const get = (id: string) => registry.find((entry) => entry.id === id)!
const rsi = get("rsi")

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

  it("requires fast < slow for MACD and MA Cross even though the API does not publish the constraint", () => {
    for (const id of ["macd", "ma_cross"]) {
      const indicator = get(id)
      const draft = createDraft(templateConfig(indicator))
      expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
      draft.buy.params.fast = draft.buy.params.slow
      const errors = draftErrors(indicator, draft)
      expect(errors.buy.form).toBe("Chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.")
      expect(errors.sell.form).toBeNull()
    }
  })

  it("uses the published cross-field constraint when the API sends one", () => {
    const indicator = { ...get("ma"), validation: { cross_fields: [{ left: "period", op: "<" as const, right: "period" }] } }
    expect(draftErrors(indicator, createDraft(templateConfig(indicator))).buy.form).not.toBeNull()
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
