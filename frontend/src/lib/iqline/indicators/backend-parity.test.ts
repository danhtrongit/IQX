/**
 * Đối chiếu 23 chỉ báo với công thức backend (docs/iqline-design.md §9, "Đối chiếu số liệu").
 *
 * `__fixtures__/backend-golden.json` do `backend/scripts/iqline-indicator-fixtures.ts` sinh bằng cách chạy `calcLegacy`
 * của backend trên 240 nến cố định (không gọi mạng). Mỗi chỉ báo chạy với bộ tham số mặc định và một bộ khác.
 *
 * Bot chạy theo công thức backend nên một chỗ lệch KHÔNG được tự sửa cho khớp và KHÔNG được che. Mỗi chỗ lệch đã biết
 * nằm trong `KNOWN_DIVERGENCES` kèm nguyên nhân, và có hai test:
 *
 * - `it.fails` "khớp backend": đang đỏ có chủ đích. Khi ai đó sửa một bên cho khớp thì test này tự xanh và vitest báo
 *   lỗi, buộc người sửa gỡ mục ngoại lệ.
 * - "lệch đúng như đã ghi": mọi phần tử lệch phải được `explain` giải thích, và chuỗi không được ghi thì phải khớp hoàn
 *   toàn. Nhờ vậy ngoại lệ không che thêm lỗi lạ.
 *
 * Chỗ lệch đã biết (nguyên nhân chi tiết ở từng mục bên dưới): MACD (đường tín hiệu, histogram), Stochastic (%K, %D)
 * và CMF. 20 trong 23 chỉ báo khớp backend trong sai số 1e-6.
 */
import { describe, expect, it } from "vitest"
import type { IndicatorParams } from "../types"
import { computeIndicator, getIndicator, listIndicators, validateIndicatorParams } from "./index"
import { GOLDEN, goldenBars, inputOf, mismatches, type GoldenCase } from "./test-support"

const TOLERANCE = 1e-6
const BARS = goldenBars()

/** Chuỗi của frontend (khoá) so với chuỗi của backend (giá trị). `#histogram` là cột histogram của MACD. */
const SERIES_MAP: Record<string, Record<string, string>> = {
  volume: { threshold: "threshold" },
  ma: { ma: "value" },
  bollinger: { upper: "upper", lower: "lower", middle: "middle" },
  ema: { ema: "value" },
  ma_cross: { fast: "fast", slow: "slow" },
  donchian: { upper: "upper", lower: "lower" },
  rsi: { rsi: "value" },
  macd: { macd: "value", signal: "signal", "#histogram": "histogram" },
  dmi: { plus: "plus", minus: "minus" },
  stochastic: { k: "value", d: "signal" },
  cci: { cci: "value" },
  roc: { roc: "value" },
  williams_r: { williams_r: "value" },
  obv: { obv: "value", signal: "baseline" },
  mfi: { mfi: "value" },
  cmf: { cmf: "value" },
  atr: { atr: "atr" },
  atr_percent: { atr_percent: "value" },
  adx: { adx: "value" },
  keltner: { upper: "upper", lower: "lower", middle: "middle" },
  bb_width: { bb_width: "value" },
  psar: { psar: "value" },
  relative_volume: { rvol: "value" },
}

type Series = readonly (number | null)[]
type Pair = { frontend: Series; backend: Series }

const frontendParams = (testCase: GoldenCase): IndicatorParams => inputOf(testCase).params

function pairs(testCase: GoldenCase): Record<string, Pair> {
  const plot = computeIndicator({ id: testCase.id, params: frontendParams(testCase) }, BARS)
  if (!plot) throw new Error(`Không tính được ${testCase.name}`)
  const backend = testCase.series as unknown as Record<string, Series>
  const out: Record<string, Pair> = {}
  for (const [key, backendKey] of Object.entries(SERIES_MAP[testCase.id])) {
    const frontend = key === "#histogram" ? plot.histogram?.values : plot.series.find((series) => series.key === key)?.values
    if (!frontend) throw new Error(`${testCase.name}: thiếu chuỗi ${key}`)
    out[key] = { frontend, backend: backend[backendKey] }
  }
  return out
}

type Explain = (index: number, frontend: number | null, backend: number | null, params: IndicatorParams) => boolean
type Divergence = {
  /** Vì sao hai bên lệch và bên nào đúng ý nghĩa hơn. */
  reason: string
  /** Chuỗi bị lệch và điều kiện giải thích từng phần tử lệch. */
  series: Record<string, Explain>
}

const num = (params: IndicatorParams, key: string): number => Number(params[key])
const hasFlatBar = (from: number, to: number): boolean => BARS.slice(Math.max(0, from), to + 1).some((bar) => bar.high === bar.low)

/**
 * 1. MACD, đường tín hiệu và histogram.
 *    Frontend (bản Flashback) đổi các `null` đầu chuỗi MACD thành 0 rồi mới lấy EMA, nên EMA khởi tạo từ các số 0 và
 *    đường tín hiệu bị kéo thấp về 0 ở đoạn đầu; nó còn hiện ngay từ nến MACD đầu tiên. Backend khởi tạo EMA bằng trung
 *    bình N giá trị MACD thật đầu tiên. Lệch hết sau khoảng 7 chu kỳ tín hiệu. Frontend sai rõ ràng.
 *
 * 2. Stochastic, %K và %D.
 *    Frontend đổi %K thô thiếu thành 0 rồi mới làm mượt, nên các giá trị đầu chuỗi lẫn số 0 và hiện sớm hơn backend
 *    (backend chỉ cho giá trị khi cả cửa sổ làm mượt đều có số). Bộ `smooth = 1` không lệch ở %K nhưng %D vẫn lệch.
 *    Frontend sai rõ ràng ở đoạn đầu. (Quanh phiên high = low cũng có cùng cơ chế nhưng cần cả cửa sổ %K phẳng nên
 *    bộ mẫu không chạm tới.)
 *
 * 3. CMF.
 *    Frontend cho `null` cả cửa sổ nếu có một phiên high = low (kịch trần, kịch sàn). Backend coi phiên đó có dòng tiền
 *    bằng 0 nhưng vẫn cộng khối lượng vào mẫu số, nên vẫn có giá trị. Cổ phiếu Việt Nam hay kịch trần nên đây là chỗ
 *    lệch đáng kể: bộ mẫu có 10 phiên phẳng và CMF 20 bị trống gần nửa chuỗi.
 *
 * Lệch lý thuyết, bộ mẫu không chạm tới: ngưỡng Volume khi trung bình `lookback` phiên trước bằng 0 (toàn khối lượng 0).
 * Frontend cho 0, backend cho `null` (`x > 0 ? x * mult : null`). Có test riêng ở `indicators.test.ts`.
 */
const KNOWN_DIVERGENCES: Record<string, Divergence> = {
  "macd:default": macdDivergence(),
  "macd:alt": macdDivergence(),
  "stochastic:default": stochasticDivergence(["k", "d"]),
  "stochastic:alt": stochasticDivergence(["d"]),
  "cmf:default": cmfDivergence(),
  "cmf:alt": cmfDivergence(),
}

function macdDivergence(): Divergence {
  // Vùng lệch: từ nến MACD đầu tiên tới 8 chu kỳ tín hiệu sau nến có đường tín hiệu của backend.
  const explain: Explain = (index, _frontend, _backend, params) => index < num(params, "slow") - 1 + 8 * num(params, "signal")
  return {
    reason: "đường tín hiệu EMA khởi tạo từ các số 0 thay cho null; backend khởi tạo từ N giá trị MACD thật",
    series: { signal: explain, "#histogram": explain },
  }
}

function stochasticDivergence(keys: readonly ("k" | "d")[]): Divergence {
  const explain =
    (key: "k" | "d"): Explain =>
    (index, frontend, backend, params) => {
      // Chỉ lệch ở đoạn đầu: frontend đã có số khi backend còn chờ đủ cửa sổ làm mượt.
      const warmup = num(params, "k") - 1 + (num(params, "smooth") - 1) + (key === "d" ? num(params, "d") - 1 : 0)
      return index < warmup && backend === null && frontend !== null
    }
  return {
    reason: "%K thô thiếu bị đổi thành 0 trước khi làm mượt nên frontend có giá trị sớm hơn và bị kéo thấp ở đoạn đầu",
    series: Object.fromEntries(keys.map((key) => [key, explain(key)])),
  }
}

function cmfDivergence(): Divergence {
  return {
    reason: "frontend cho null cả cửa sổ có phiên high = low; backend coi phiên đó có dòng tiền 0 và vẫn có giá trị",
    series: { cmf: (index, frontend, backend, params) => frontend === null && backend !== null && hasFlatBar(index - num(params, "period") + 1, index) },
  }
}

describe("đối chiếu công thức với backend (calcLegacy)", () => {
  it("bộ mẫu có đủ 23 chỉ báo, mỗi chỉ báo hai bộ tham số", () => {
    const ids = new Set(GOLDEN.cases.map((testCase) => testCase.id))
    expect(ids.size).toBe(23)
    expect(GOLDEN.cases).toHaveLength(46)
    expect([...ids].sort()).toEqual(Object.keys(SERIES_MAP).sort())
    expect(GOLDEN.bars.some((bar) => bar.high === bar.low)).toBe(true)
  })

  for (const testCase of GOLDEN.cases) {
    const known = KNOWN_DIVERGENCES[testCase.name]
    const run = () => {
      for (const [key, pair] of Object.entries(pairs(testCase))) {
        expect(mismatches(pair.frontend, pair.backend, TOLERANCE), `${testCase.name} ${key}`).toEqual([])
      }
    }
    if (!known) {
      it(`${testCase.name} khớp backend trong sai số ${TOLERANCE}`, run)
      continue
    }
    it.fails(`${testCase.name} khớp backend (đang lệch có chủ đích: ${known.reason})`, run)
    it(`${testCase.name} lệch đúng như đã ghi, không lệch thêm`, () => {
      const params = { ...Object.fromEntries((getIndicator(testCase.id)?.params ?? []).map((spec) => [spec.key, spec.default])), ...frontendParams(testCase) }
      for (const [key, pair] of Object.entries(pairs(testCase))) {
        const bad = mismatches(pair.frontend, pair.backend, TOLERANCE)
        const explain = known.series[key]
        if (!explain) {
          expect(bad, `${testCase.name} ${key} không có trong danh sách lệch nên phải khớp`).toEqual([])
          continue
        }
        expect(bad.length, `${testCase.name} ${key} đã ghi là lệch`).toBeGreaterThan(0)
        const unexplained = bad.filter((index) => !explain(index, pair.frontend[index] ?? null, pair.backend[index] ?? null, params))
        expect(unexplained, `${testCase.name} ${key} lệch ngoài vùng đã ghi`).toEqual([])
      }
    })
  }

  it("chỗ lệch không làm hỏng phần còn lại của chuỗi: MACD khớp sau vùng khởi tạo", () => {
    const testCase = GOLDEN.cases.find((item) => item.name === "macd:default")!
    const { signal } = pairs(testCase)
    const from = 25 + 8 * 9
    expect(mismatches(signal.frontend.slice(from), signal.backend.slice(from), TOLERANCE)).toEqual([])
  })
})

/** Một bản ghi danh mục của backend (16 chỉ báo Flashback). */
type CatalogParam = { key: string; min: number; max: number; step: number; default: number; lower: { min: number; max: number; default: number } | null; upper: { min: number; max: number; default: number } | null }

describe("tham số khớp danh mục và registry của backend", () => {
  const catalogIds = GOLDEN.catalog.map((entry) => entry.id)

  it("16 chỉ báo trong danh mục là đúng 16 chỉ báo có flashback: true", () => {
    const flagged = listIndicators({ flashback: true }).map((definition) => definition.id)
    expect([...flagged].sort()).toEqual([...catalogIds].sort())
    expect(flagged).toHaveLength(16)
  })

  for (const entry of GOLDEN.catalog) {
    it(`${entry.id}: miền giá trị, bước nhảy và mặc định bằng danh mục`, () => {
      const definition = getIndicator(entry.id)!
      const expected = new Map<string, { min: number; max: number; step: number; default: number }>()
      for (const param of entry.params as CatalogParam[]) {
        if (param.lower && param.upper) {
          expected.set("lower", { min: param.lower.min, max: param.lower.max, step: param.step, default: param.lower.default })
          expected.set("upper", { min: param.upper.min, max: param.upper.max, step: param.step, default: param.upper.default })
        } else {
          expected.set(param.key, { min: param.min, max: param.max, step: param.step, default: param.default })
        }
      }
      expect(definition.params.map((spec) => spec.key).sort()).toEqual([...expected.keys()].sort())
      for (const spec of definition.params) {
        expect({ min: spec.min, max: spec.max, step: spec.step, default: spec.default }, `${entry.id}.${spec.key}`).toEqual(expected.get(spec.key))
      }
    })

    for (const rule of entry.crossFields) {
      it(`${entry.id}: ${rule.left} ${rule.op} ${rule.right} được kiểm tra`, () => {
        const definition = getIndicator(entry.id)!
        const defaults = Object.fromEntries(definition.params.map((spec) => [spec.key, spec.default]))
        expect(validateIndicatorParams(entry.id, defaults)).toBeNull()
        const equal = { ...defaults, [rule.left]: defaults[rule.right] }
        expect(validateIndicatorParams(entry.id, equal)).not.toBeNull()
      })
    }
  }

  for (const entry of GOLDEN.legacy) {
    it(`${entry.id} (bổ sung): mặc định bằng registry cũ của Bot, miền không hẹp hơn`, () => {
      const definition = getIndicator(entry.id)!
      expect(definition.flashback).toBe(false)
      for (const spec of definition.params) {
        const legacyDefault = (entry.defaults as unknown as Record<string, number>)[spec.key]
        expect(spec.default, `${entry.id}.${spec.key}`).toBe(legacyDefault)
        const field = entry.fields.find((item) => item.key === spec.key)
        if (!field) continue
        expect(spec.min, `${entry.id}.${spec.key} min`).toBeLessThanOrEqual(field.min)
        expect(spec.max, `${entry.id}.${spec.key} max`).toBeGreaterThanOrEqual(field.max)
      }
    })
  }
})
