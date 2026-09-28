import { ApiError } from "@/lib/api"

import type { AIInsightResponse, LayerCard, NarrativeFragment } from "../types"

type Raw = Record<string, unknown>

const LAYERS = ["L1", "L2", "L3", "L4", "L5"] as const

function invalid(path: string): never {
  throw new ApiError(`Dữ liệu phân tích AI không hợp lệ (${path}).`, 502, {
    code: "INVALID_INSIGHT_RESPONSE",
  })
}

function record(value: unknown, path: string): Raw {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path)
  return value as Raw
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path)
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path)
  return value
}

function newsItems(value: unknown, path: string, material: boolean): Raw[] {
  if (value == null) return []
  if (!Array.isArray(value)) invalid(path)
  return value.map((entry, index) => {
    const item = record(entry, `${path}[${index}]`)
    string(item.title, `${path}[${index}].title`)
    string(item.tag, `${path}[${index}].tag`)
    if (material && item.subtitle != null) string(item.subtitle, `${path}[${index}].subtitle`)
    return item
  })
}

/** Decode text at the wire boundary without coercing objects into visible prose. */
export function normalizeFragments(value: unknown, path = "fragments"): NarrativeFragment[] {
  if (value == null) return []
  const source = Array.isArray(value) ? value : [value]
  return source.map((entry, index): NarrativeFragment => {
    if (typeof entry === "string") return { type: "text", content: entry }
    const fragment = record(entry, `${path}[${index}]`)
    const content = string(fragment.content, `${path}[${index}].content`)
    switch (fragment.type) {
      case "text":
      case "number":
      case "highlight":
        return { type: fragment.type, content }
      case "emphasis":
        if (
          fragment.variant !== "bull" && fragment.variant !== "bear" &&
          fragment.variant !== "warn" && fragment.variant !== "info"
        ) invalid(`${path}[${index}].variant`)
        return { type: "emphasis", content, variant: fragment.variant }
      default:
        return invalid(`${path}[${index}].type`)
    }
  })
}

export function normalizeLayerFields(value: unknown, path: string): LayerCard["fields"] {
  if (value == null) return []
  if (!Array.isArray(value)) invalid(path)
  return value.map((item, index) => {
    const field = record(item, `${path}[${index}]`)
    return {
      label: string(field.label, `${path}[${index}].label`),
      value: normalizeFragments(field.value, `${path}[${index}].value`),
    }
  })
}

/** Used by the trading panel, which reads only a subset of the complete card. */
export function normalizeInsightLayerSubset(value: unknown): Partial<Record<(typeof LAYERS)[number], LayerCard>> {
  const source = record(value, "layers")
  const layers: Partial<Record<(typeof LAYERS)[number], LayerCard>> = {}
  for (const key of LAYERS) {
    if (source[key] == null) continue
    const layer = record(source[key], `layers.${key}`)
    if (layer.statusLevel != null &&
      (typeof layer.statusLevel !== "number" || ![1, 2, 3, 4, 5].includes(layer.statusLevel))) {
      invalid(`layers.${key}.statusLevel`)
    }
    const diff = layer.diff == null ? {} : record(layer.diff, `layers.${key}.diff`)
    layers[key] = {
      ...layer,
      layerNum: key,
      fields: normalizeLayerFields(layer.fields, `layers.${key}.fields`),
      diff: {
        ...diff,
        text: normalizeFragments(diff.text, `layers.${key}.diff.text`),
      },
    } as LayerCard
  }
  return layers
}

/** Validate the canonical response while accepting legacy string narrative slots. */
export function normalizeAIInsightResponse(payload: unknown): AIInsightResponse {
  const outer = record(payload, "response")
  const raw = record("data" in outer ? outer.data : outer, "data")
  const briefing = record(raw.briefing, "briefing")
  const observations = record(briefing.observations, "briefing.observations")
  const briefingDiff = record(briefing.diff, "briefing.diff")
  const header = record(raw.header, "header")
  const rawInput = raw.rawInput == null ? {} : record(raw.rawInput, "rawInput")
  const layers = normalizeInsightLayerSubset(raw.layers)
  for (const key of LAYERS) {
    const layer = layers[key]
    if (!layer) invalid(`layers.${key}`)
    string(layer.layerName, `layers.${key}.layerName`)
    string(layer.statusLabel, `layers.${key}.statusLabel`)
    if (![1, 2, 3, 4, 5].includes(layer.statusLevel)) invalid(`layers.${key}.statusLevel`)
  }
  if (
    briefing.statusVariant !== "bull" && briefing.statusVariant !== "warn" &&
    briefing.statusVariant !== "bear" && briefing.statusVariant !== "neutral"
  ) invalid("briefing.statusVariant")
  for (const key of ["trend", "status", "timeframe", "recommendation"] as const) {
    string(briefing[key], `briefing.${key}`)
  }
  boolean(briefingDiff.hasChange, "briefing.diff.hasChange")
  boolean(briefingDiff.isFirstAnalysis, "briefing.diff.isFirstAnalysis")
  for (const key of LAYERS) {
    const source = record(record(raw.layers, "layers")[key], `layers.${key}`)
    const diff = record(source.diff, `layers.${key}.diff`)
    boolean(diff.hasChange, `layers.${key}.diff.hasChange`)
  }
  if (briefing.watchLevels != null && !Array.isArray(briefing.watchLevels)) invalid("briefing.watchLevels")
  const watchLevels = (briefing.watchLevels ?? []).map((entry: unknown, index: number) => {
    const level = record(entry, `briefing.watchLevels[${index}]`)
    return {
      tag: string(level.tag, `briefing.watchLevels[${index}].tag`),
      description: string(level.description, `briefing.watchLevels[${index}].description`),
    }
  })
  const l5News = record(raw.layers, "layers").L5
  const news = record(l5News, "layers.L5").news
  if (news != null) {
    const source = record(news, "layers.L5.news")
    layers.L5 = {
      ...layers.L5!,
      news: {
        material: newsItems(source.material, "layers.L5.news.material", true) as NonNullable<LayerCard["news"]>["material"],
        filler: newsItems(source.filler, "layers.L5.news.filler", false) as NonNullable<LayerCard["news"]>["filler"],
      },
    }
  }
  return {
    ...raw,
    symbol: string(raw.symbol, "symbol"),
    updatedAt: string(raw.updatedAt, "updatedAt"),
    header: header as AIInsightResponse["header"],
    rawInput: rawInput as AIInsightResponse["rawInput"],
    briefing: {
      ...briefing,
      watchLevels,
      narrative: normalizeFragments(briefing.narrative, "briefing.narrative"),
      diff: {
        ...briefingDiff,
        text: normalizeFragments(briefingDiff.text, "briefing.diff.text"),
      },
      observations: {
        ...observations,
        liquidity: normalizeFragments(observations.liquidity, "briefing.observations.liquidity"),
        moneyFlow: normalizeFragments(observations.moneyFlow, "briefing.observations.moneyFlow"),
        insider: normalizeFragments(observations.insider, "briefing.observations.insider"),
        news: normalizeFragments(observations.news, "briefing.observations.news"),
        supportResistance: normalizeFragments(observations.supportResistance, "briefing.observations.supportResistance"),
      },
    } as AIInsightResponse["briefing"],
    layers: layers as AIInsightResponse["layers"],
  }
}
