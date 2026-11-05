/**
 * Sổ đăng ký chỉ báo (docs/iqline-design.md §9, "Mở rộng bằng code").
 *
 * `registerIndicator` nhận một `IndicatorDefinition` của hợp đồng chung và không cho trùng id. Phần ngoài hợp đồng
 * (kiểm tra chéo giữa các tham số, số nến phía trước mà một giá trị còn phụ thuộc) đi qua tham số `options` để không
 * phải sửa `types.ts`.
 */
import type { IndicatorDefinition, IndicatorKind, IndicatorParamSpec, IndicatorParams, IndicatorParamValue, IndicatorPlot } from "../types"

export type IndicatorOptions = {
  /** Kiểm tra thêm giữa các tham số đã điền đủ mặc định (ví dụ nhanh < chậm). Trả về thông báo lỗi hoặc `null`. */
  validate?: (params: IndicatorParams) => string | null
  /**
   * Giá trị tại nến `i` chỉ phụ thuộc các nến `i - m .. i`; hàm trả về `m` theo tham số. `null` (hoặc không khai báo)
   * nghĩa là phụ thuộc cả chuỗi (EMA, Wilder...), khi nến cuối đổi thì tính lại cả chuỗi.
   */
  tailMemory?: (params: IndicatorParams) => number | null
}

type Entry = { definition: IndicatorDefinition; options: IndicatorOptions }

const entries = new Map<string, Entry>()
const KINDS: ReadonlySet<string> = new Set(["over", "vol", "pane"])
const ID_PATTERN = /^[a-z][a-z0-9_]*$/
/** Sai số cho phép khi kiểm tra giá trị nằm đúng bước nhảy, tính theo số bước. */
const STEP_TOLERANCE = 1e-6

const labelOf = (spec: IndicatorParamSpec): string => spec.label ?? spec.key

/** Lỗi trong chính định nghĩa (không phải trong tham số người dùng): ném ra ngay lúc đăng ký. */
function assertDefinition(definition: IndicatorDefinition): void {
  const { id } = definition
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new Error(`Chỉ báo có id không hợp lệ: "${String(id)}"`)
  if (!definition.name) throw new Error(`Chỉ báo "${id}" thiếu tên`)
  if (!KINDS.has(definition.kind)) throw new Error(`Chỉ báo "${id}" có kind không hợp lệ: "${String(definition.kind)}"`)
  if (typeof definition.compute !== "function") throw new Error(`Chỉ báo "${id}" thiếu hàm compute`)
  const seen = new Set<string>()
  for (const spec of definition.params) {
    if (!spec.key || seen.has(spec.key)) throw new Error(`Chỉ báo "${id}" có tham số trùng hoặc thiếu key: "${spec.key}"`)
    seen.add(spec.key)
    if (typeof spec.default === "number") {
      if (!Number.isFinite(spec.default)) throw new Error(`Chỉ báo "${id}": mặc định của "${spec.key}" không phải số hữu hạn`)
      if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) throw new Error(`Chỉ báo "${id}": "${spec.key}" có min lớn hơn max`)
      if ((spec.min !== undefined && spec.default < spec.min) || (spec.max !== undefined && spec.default > spec.max)) {
        throw new Error(`Chỉ báo "${id}": mặc định của "${spec.key}" nằm ngoài miền cho phép`)
      }
      if (spec.step !== undefined && !(spec.step > 0)) throw new Error(`Chỉ báo "${id}": bước nhảy của "${spec.key}" phải dương`)
    } else if (typeof spec.default === "string" && spec.options && !spec.options.includes(spec.default)) {
      throw new Error(`Chỉ báo "${id}": mặc định của "${spec.key}" không nằm trong options`)
    }
  }
}

/** Đăng ký một chỉ báo. Ném lỗi nếu id đã có hoặc định nghĩa không hợp lệ. */
export function registerIndicator(definition: IndicatorDefinition, options: IndicatorOptions = {}): void {
  assertDefinition(definition)
  if (entries.has(definition.id)) throw new Error(`Chỉ báo đã được đăng ký: "${definition.id}"`)
  entries.set(definition.id, { definition, options })
}

/** Gỡ một chỉ báo; trả về `true` nếu có gỡ. Dành cho test và HMR, biểu đồ không gọi. */
export function unregisterIndicator(id: string): boolean {
  return entries.delete(id)
}

export function getIndicator(id: string): IndicatorDefinition | undefined {
  return entries.get(id)?.definition
}

/** Danh sách theo thứ tự đăng ký. `flashback: true` chỉ lấy các chỉ báo dùng được ở chế độ `flashback`; bỏ trống là lấy hết. */
export function listIndicators(filter: { flashback?: boolean; kind?: IndicatorKind } = {}): IndicatorDefinition[] {
  const out: IndicatorDefinition[] = []
  for (const { definition } of entries.values()) {
    if (filter.flashback && !definition.flashback) continue
    if (filter.kind !== undefined && definition.kind !== filter.kind) continue
    out.push(definition)
  }
  return out
}

/** Điền giá trị mặc định cho các tham số còn thiếu. Không bỏ tham số lạ: để `validateParamSpecs` báo. */
export function resolveParamSpecs(specs: readonly IndicatorParamSpec[], params: IndicatorParams): IndicatorParams {
  const out: Record<string, IndicatorParamValue> = { ...params }
  for (const spec of specs) {
    if (out[spec.key] === undefined) out[spec.key] = spec.default
  }
  return out
}

function checkNumber(spec: IndicatorParamSpec, value: number): string | null {
  const label = labelOf(spec)
  if (!Number.isFinite(value)) return `${label} phải là một số hữu hạn.`
  const min = spec.min ?? Number.NEGATIVE_INFINITY
  const max = spec.max ?? Number.POSITIVE_INFINITY
  if (value < min || value > max) {
    if (spec.min !== undefined && spec.max !== undefined) return `${label} phải nằm trong khoảng ${spec.min} đến ${spec.max} (đang là ${value}).`
    return spec.min !== undefined ? `${label} phải từ ${spec.min} trở lên (đang là ${value}).` : `${label} phải từ ${spec.max} trở xuống (đang là ${value}).`
  }
  const step = spec.step
  if (step !== undefined) {
    if (step >= 1 && !Number.isInteger(value)) return `${label} phải là số nguyên.`
    const origin = spec.min ?? 0
    const steps = (value - origin) / step
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) return `${label} phải là bội của ${step} (đang là ${value}).`
  }
  return null
}

function checkValue(spec: IndicatorParamSpec, value: IndicatorParamValue): string | null {
  const label = labelOf(spec)
  if (typeof spec.default === "number") return typeof value === "number" ? checkNumber(spec, value) : `${label} phải là một số.`
  if (typeof spec.default === "boolean") return typeof value === "boolean" ? null : `${label} phải là đúng hoặc sai.`
  if (typeof value !== "string") return `${label} phải là chuỗi.`
  if (spec.options && !spec.options.includes(value)) return `${label} phải là một trong: ${spec.options.join(", ")}.`
  return null
}

/**
 * Kiểm tra một bộ tham số theo danh sách spec: không có khoá lạ, đúng kiểu, nằm trong miền, đúng bước nhảy. Tham số
 * thiếu được hiểu là mặc định. Trả về thông báo tiếng Việt hoặc `null` khi hợp lệ.
 */
export function validateParamSpecs(name: string, specs: readonly IndicatorParamSpec[], params: IndicatorParams, extra?: (resolved: IndicatorParams) => string | null): string | null {
  for (const key of Object.keys(params)) {
    if (!specs.some((spec) => spec.key === key)) return `${name}: không có tham số "${key}".`
  }
  const resolved = resolveParamSpecs(specs, params)
  for (const spec of specs) {
    const problem = checkValue(spec, resolved[spec.key])
    if (problem) return `${name}: ${problem}`
  }
  const cross = extra?.(resolved)
  return cross ? `${name}: ${cross}` : null
}

/** Kiểm tra tham số của một chỉ báo đã đăng ký, gồm cả luật chéo. Id lạ trả về thông báo lỗi. */
export function validateIndicatorParams(id: string, params: IndicatorParams): string | null {
  const entry = entries.get(id)
  if (!entry) return `Không có chỉ báo "${id}".`
  return validateParamSpecs(entry.definition.name, entry.definition.params, params, entry.options.validate)
}

/** Tham số đã điền đủ mặc định; id lạ trả về `null`. */
export function resolveIndicatorParams(id: string, params: IndicatorParams): IndicatorParams | null {
  const entry = entries.get(id)
  return entry ? resolveParamSpecs(entry.definition.params, params) : null
}

/** Số nến phía trước còn ảnh hưởng một giá trị (xem `IndicatorOptions.tailMemory`); `null` nếu cả chuỗi. */
export function indicatorTailMemory(id: string, resolved: IndicatorParams): number | null {
  const memory = entries.get(id)?.options.tailMemory
  if (!memory) return null
  const value = memory(resolved)
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null
}

/** Khoá ổn định của một bộ tham số đã điền đủ mặc định, theo thứ tự spec; dùng làm khoá ghi nhớ. */
export function paramsKey(id: string, params: IndicatorParams): string {
  const entry = entries.get(id)
  const resolved = entry ? resolveParamSpecs(entry.definition.params, params) : params
  const keys = entry ? entry.definition.params.map((spec) => spec.key) : Object.keys(resolved).sort()
  return `${id}(${keys.map((key) => `${key}=${String(resolved[key])}`).join(",")})`
}

export const emptyPlot = (kind: IndicatorKind): IndicatorPlot => ({ kind, series: [] })
