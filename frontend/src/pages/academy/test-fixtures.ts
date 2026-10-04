/** Test fixtures for Học viện (shapes of CONTRACTS.md §3/§4; not product data). */
import type { IndicatorConfig, SharedConfigState, TechnicalIndicator, TechnicalRegistry } from "@/lib/shared-config"

import type { Attempt, AttemptResult, Curriculum, CurriculumChapter, LessonDetail } from "./api"

export const RSI: TechnicalIndicator = {
  id: "rsi",
  name: "RSI",
  chapter: 1,
  lesson_id: "ch01-l01",
  family: "state",
  formula: "RSI = 100 − 100 / (1 + G/D)",
  availability: "ohlcv",
  fields: [
    { key: "period", label: "Chu kỳ RSI", type: "integer", min: 5, max: 50, step: 1, unit: "phiên", api_scale: 1, wire_unit: "phiên" },
    { key: "level", label: "Ngưỡng RSI", type: "number", min: 10, max: 90, step: 1, unit: "", api_scale: 1, wire_unit: "indicator_points" },
  ],
  buy: {
    enabled: true,
    params: { period: 14, level: 30 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: -1 }, op: "<", rhs: { kind: "param", key: "level" }, allowed_ops: [">", "<"] },
      { id: "r2", kind: "compare", lhs: { kind: "series", key: "value", offset: 0 }, op: ">", rhs: { kind: "series", key: "value", offset: -1 }, allowed_ops: [">", "<"] },
    ],
    field_overrides: { level: { min: 10, max: 49, label: "Ngưỡng quá bán" } },
  },
  sell: {
    enabled: true,
    params: { period: 14, level: 70 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: -1 }, op: ">", rhs: { kind: "param", key: "level" }, allowed_ops: [">", "<"] },
    ],
    field_overrides: { level: { min: 51, max: 90, label: "Ngưỡng quá mua" } },
  },
  learned: false,
}

export const MACD: TechnicalIndicator = {
  ...RSI,
  id: "macd",
  name: "MACD",
  lesson_id: "ch01-l02",
  fields: [
    { key: "fast", label: "EMA nhanh", type: "integer", min: 2, max: 50, step: 1, unit: "phiên", api_scale: 1, wire_unit: "phiên" },
  ],
  buy: {
    enabled: true,
    params: { fast: 12 },
    rules: [{ id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: 0 }, op: ">", rhs: { kind: "series", key: "signal", offset: 0 }, allowed_ops: [">", "<"] }],
  },
  sell: {
    enabled: true,
    params: { fast: 12 },
    rules: [{ id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: 0 }, op: "<", rhs: { kind: "series", key: "signal", offset: 0 }, allowed_ops: [">", "<"] }],
  },
  learned: true,
}

export function registryFixture(): TechnicalRegistry {
  return { calculation_version: "iqx-ta-2.0", rule_version: "iqx-rules-2.0", indicators: [RSI, MACD] }
}

function stripOverrides(indicator: TechnicalIndicator, master: boolean): IndicatorConfig {
  const side = (s: "buy" | "sell") => ({ enabled: indicator[s].enabled, params: { ...indicator[s].params }, rules: indicator[s].rules })
  return { master_enabled: master, buy: side("buy"), sell: side("sell") }
}

export function sharedConfigFixture(savedRevision = 3, macd?: Partial<IndicatorConfig>): SharedConfigState {
  return {
    saved_revision: savedRevision,
    effective_revision: savedRevision,
    effective_session: "2026-03-02",
    status: "pending",
    config: {
      schema_version: "2.0",
      revision: savedRevision,
      rule_version: "iqx-rules-2.0",
      indicators: { rsi: stripOverrides(RSI, false), macd: { ...stripOverrides(MACD, false), ...macd } },
    },
    config_hash: "hash",
    registry_version: "iqx-ta-2.0",
    granted_indicators: ["macd"],
  }
}

export function curriculumFixture(): Curriculum {
  const chapters: CurriculumChapter[] = Array.from({ length: 18 }, (_, index) => ({
    no: index + 1,
    title: `Chương thử ${index + 1}`,
    type: "tool",
    bot: "Bot V2",
    lessons: [{
      id: `ch${String(index + 1).padStart(2, "0")}-l01`,
      order: 1,
      name: `Bài ${index + 1}.1`,
      kind: "tool",
      config_id: null,
      passed: false,
      best_score: null,
      attempts: 0,
      capabilities: [],
    }],
  }))
  chapters[0] = {
    no: 1,
    title: "Chỉ báo kỹ thuật nền tảng",
    type: "technical",
    bot: "Bot V2",
    lessons: [
      { id: "ch01-l01", order: 1, name: "RSI", kind: "technical", config_id: "rsi", passed: false, best_score: 6, attempts: 1, capabilities: ["indicator:rsi", "lesson:ch01-l01"] },
      { id: "ch01-l02", order: 2, name: "MACD", kind: "technical", config_id: "macd", passed: true, best_score: 8, attempts: 2, capabilities: ["indicator:macd", "lesson:ch01-l02"] },
    ],
  }
  return { content_version: "2.0.0", chapters, granted_capabilities: ["indicator:macd", "lesson:ch01-l02"] }
}

export function lessonFixture(id = "ch01-l01"): LessonDetail {
  return {
    id,
    chapter: 1,
    order: id === "ch01-l02" ? 2 : 1,
    name: id === "ch01-l02" ? "MACD" : "RSI",
    kind: "technical",
    content_version: "2.0.0",
    config_id: id === "ch01-l02" ? "macd" : "rsi",
    sections: [{ title: "1. Khái niệm và cách đọc", html: "<p><strong>RSI</strong> đo đà giá.</p><script>window.__pwned = true</script>" }],
    fixture: { type: "scalar", label: "RSI", prompt: "G = 1,2; D = 0,4. RSI bằng bao nhiêu?", expected: 75, unit: "", tolerance: 0.015, synthetic: true },
    prerequisites: [],
    sources: ["source:technical-registry-v1"],
    review_status: "editorial-v2",
    passed: id === "ch01-l02",
  }
}

export function attemptFixture(lessonId = "ch01-l01"): Attempt {
  return {
    attempt_id: "attempt-1",
    lesson_id: lessonId,
    content_version: "2.0.0",
    questions_version: "q-1",
    questions: Array.from({ length: 8 }, (_, index) => ({
      id: `q${index + 1}`,
      question: `Câu hỏi số ${index + 1}?`,
      options: [
        { id: `q${index + 1}-a`, text: `Phương án A${index + 1}` },
        { id: `q${index + 1}-b`, text: `Phương án B${index + 1}` },
      ],
    })),
  }
}

export function passedResultFixture(): AttemptResult {
  return {
    attempt_id: "attempt-1",
    score: 8,
    total: 8,
    passed: true,
    results: Array.from({ length: 8 }, (_, index) => ({
      question_id: `q${index + 1}`,
      option_id: `q${index + 1}-a`,
      correct: true,
      correct_option_id: `q${index + 1}-a`,
      explanation: `Giải thích ${index + 1}`,
    })),
    granted_capabilities: ["indicator:rsi", "lesson:ch01-l01"],
    newly_granted: ["indicator:rsi", "lesson:ch01-l01"],
  }
}
