import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"
import { normalizeAIInsightResponse, normalizeFragments, normalizeInsightLayerSubset } from "./normalize-insight"

const layer = (key: string) => ({
  layerNum: key,
  layerName: key,
  statusLabel: "Quan sát",
  statusLevel: 3,
  fields: [{ label: "Xu hướng", value: "Giữ nguyên nội dung" }],
  diff: { text: { type: "number", content: "61.000" }, hasChange: true },
})

const response = () => ({
  symbol: "FPT",
  updatedAt: "2026-09-24T10:00:00Z",
  header: { symbol: "FPT" },
  rawInput: {},
  briefing: {
    statusVariant: "neutral",
    trend: "Đi ngang",
    status: "Quan sát",
    timeframe: "Ngắn hạn",
    recommendation: "Quan sát thêm",
    watchLevels: [{ tag: "Hỗ trợ", description: "61.000" }],
    narrative: "Giữ nguyên [bull]văn bản[/bull] từ máy chủ",
    diff: { text: "Không đổi", hasChange: false, isFirstAnalysis: false },
    observations: {
      liquidity: "Thanh khoản",
      moneyFlow: { type: "text", content: "Dòng tiền" },
      insider: [],
      news: null,
      supportResistance: ["Hỗ trợ ", { type: "number", content: "61.000" }],
    },
  },
  layers: Object.fromEntries(["L1", "L2", "L3", "L4", "L5"].map((key) => [key, layer(key)])),
})

describe("insight fragment boundary", () => {
  it("preserves plain strings, single fragments, and ordered mixed arrays", () => {
    expect(normalizeFragments(["A", { type: "emphasis", variant: "bull", content: "B" }, "C"]))
      .toEqual([
        { type: "text", content: "A" },
        { type: "emphasis", variant: "bull", content: "B" },
        { type: "text", content: "C" },
      ])
    expect(normalizeFragments({ type: "highlight", content: "Mốc" }))
      .toEqual([{ type: "highlight", content: "Mốc" }])
  })

  it.each([{}, ["ok", {}], [{ type: "text", content: 42 }], [{ type: "emphasis", variant: "invalid", content: "x" }]])(
    "rejects unsafe fragment data: %j", (value) => {
      expect(() => normalizeFragments(value)).toThrow(ApiError)
    },
  )

  it("normalizes every briefing and layer fragment location", () => {
    const result = normalizeAIInsightResponse({ data: response() })
    expect(result.briefing.narrative).toEqual([{ type: "text", content: "Giữ nguyên [bull]văn bản[/bull] từ máy chủ" }])
    expect(result.briefing.diff.text).toEqual([{ type: "text", content: "Không đổi" }])
    expect(result.briefing.observations.news).toEqual([])
    expect(result.briefing.observations.supportResistance).toEqual([
      { type: "text", content: "Hỗ trợ " }, { type: "number", content: "61.000" },
    ])
    expect(result.layers.L1.fields[0].value).toEqual([{ type: "text", content: "Giữ nguyên nội dung" }])
    expect(result.layers.L1.diff.text).toEqual([{ type: "number", content: "61.000" }])
  })

  it("does not invent missing narratives or layer statuses", () => {
    const data = response()
    delete (data.briefing as { narrative?: unknown }).narrative
    expect(normalizeAIInsightResponse(data).briefing.narrative).toEqual([])
    const partial = normalizeInsightLayerSubset({ L1: { fields: [{ label: "X", value: "Y" }] } })
    expect(partial.L1?.statusLevel).toBeUndefined()
    expect(partial.L1?.fields[0].value).toEqual([{ type: "text", content: "Y" }])
  })

  it("reports malformed important response structures", () => {
    const data = response()
    ;(data.layers.L1.fields[0] as { value: unknown }).value = { unsafe: true }
    expect(() => normalizeAIInsightResponse(data)).toThrow(ApiError)
    expect(() => normalizeAIInsightResponse({ ...response(), layers: {} })).toThrow(ApiError)
    expect(() => normalizeAIInsightResponse({ ...response(), briefing: null })).toThrow(ApiError)
    expect(() => normalizeAIInsightResponse({ ...response(), briefing: { ...response().briefing, watchLevels: {} } }))
      .toThrow(ApiError)
    expect(() => normalizeAIInsightResponse({ ...response(), briefing: { ...response().briefing, diff: { text: "x" } } }))
      .toThrow(ApiError)
    const badNews = response()
    badNews.layers.L5 = { ...layer("L5"), news: { material: { title: "unsafe" } } } as unknown as typeof badNews.layers.L5
    expect(() => normalizeAIInsightResponse(badNews)).toThrow(ApiError)
  })
})
