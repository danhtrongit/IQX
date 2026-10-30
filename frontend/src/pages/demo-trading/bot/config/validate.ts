/**
 * Save-time validation of the condition rows (SPEC V3 §4): a port of the server's
 * `quant/v2/conditions/validate.ts`, driven by the same registry metadata and producing the
 * same messages (`Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.`). Both tabs are
 * checked, disabled rows and a disabled tab included. Nothing the user typed is repaired.
 */
import type { RowDefinition, RowField, RowNumberField, Side } from "./types"

export const SIDE_LABEL: Readonly<Record<Side, string>> = { buy: "Mua", sell: "Bán" }

/** Step tolerance of the server (`|(v-min)/step - round| ≤ 1e-6`). */
const STEP_TOLERANCE = 1e-6

/** One refused value: the row (1-based) and field it belongs to, with the server-style path. */
export type RowError = {
  /** `indicators.rsi.buy.rules.1.period` (0-based row index, as the API reports it). */
  path: string
  side: Side
  /** 1-based row number, as in the message. */
  row: number
  /** The field the message is about (the left field of a `fast < slow` pair). */
  field: string
  message: string
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** `Mua · dòng 2` */
export const rowPrefix = (side: Side, row: number): string => `${SIDE_LABEL[side]} · dòng ${row}`

/** `Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.` */
export const rangeMessage = (side: Side, row: number, field: RowNumberField): string =>
  `${rowPrefix(side, row)}: ${field.label} phải từ ${field.min} đến ${field.max}${field.type === "integer" ? ", số nguyên" : ""}.`

/** `Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.` */
export const optionsMessage = (side: Side, row: number, label: string, options: readonly number[]): string =>
  `${rowPrefix(side, row)}: ${label} chỉ chọn ${options.join(", ")}.`

/** `Mua · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.` */
export const fastSlowMessage = (side: Side, row: number): string => `${rowPrefix(side, row)}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.`

/**
 * The number a typed text stands for, or NaN for an empty or non-numeric text. Only the plain
 * decimal notation the inputs show is read (`-0.05`, `5`, `2.5`); nothing is rounded.
 */
export function parseNumber(text: string | undefined): number {
  if (text === undefined) return Number.NaN
  const trimmed = text.trim()
  return trimmed === "" ? Number.NaN : Number(trimmed)
}

/** The value a field stores for its draft text: a number for number fields, the code for enums. */
export function fieldValue(field: RowField, text: string | undefined): number | string {
  return field.type === "enum" ? (text ?? "") : parseNumber(text)
}

function fieldMessage(field: RowField, value: unknown, side: Side, row: number): string | null {
  if (field.type === "enum") {
    return typeof value === "string" && field.options.some((option) => option.value === value)
      ? null
      : `${rowPrefix(side, row)}: ${field.label} không hợp lệ.`
  }
  if (field.options) {
    return isFiniteNumber(value) && field.options.includes(value) ? null : optionsMessage(side, row, field.label, field.options)
  }
  if (!isFiniteNumber(value) || value < field.min || value > field.max || (field.type === "integer" && !Number.isInteger(value))) {
    return rangeMessage(side, row, field)
  }
  const steps = (value - field.min) / field.step
  if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) return `${rowPrefix(side, row)}: ${field.label} phải theo bước ${field.step}.`
  return null
}

/**
 * Errors of one row (fields in sentence order, then the `fast < slow` constraints, the latter
 * judged on two valid numbers only and reported on the left field, as the server does).
 * `values` are the stored values: numbers for number fields, codes for enums.
 */
export function validateRowValues(
  definition: RowDefinition,
  values: Readonly<Record<string, unknown>>,
  side: Side,
  row: number,
  path: string,
): RowError[] {
  const errors: RowError[] = []
  for (const field of definition.fields) {
    const message = fieldMessage(field, values[field.key], side, row)
    if (message) errors.push({ path: `${path}.${field.key}`, side, row, field: field.key, message })
  }
  for (const constraint of definition.constraints) {
    const left = values[constraint.left]
    const right = values[constraint.right]
    if (!isFiniteNumber(left) || !isFiniteNumber(right) || left < right) continue
    // One message per bad value: a field already out of range is not also compared.
    if (errors.some((e) => e.field === constraint.left || e.field === constraint.right)) continue
    errors.push({ path: `${path}.${constraint.left}`, side, row, field: constraint.left, message: fastSlowMessage(side, row) })
  }
  return errors
}

/** One draft row: its values as typed (number fields) or chosen (enum codes). */
export type RowTexts = { values: Readonly<Record<string, string>> }

/**
 * Errors of one tab of a row-based indicator, every row included (on or off). Paths are
 * `indicators.<id>.<side>.rules.<index>.<field>`; an empty list means the tab can be saved.
 */
export function validateSideRows(
  indicatorId: string,
  definitions: readonly RowDefinition[],
  side: Side,
  rows: readonly RowTexts[],
): RowError[] {
  return definitions.flatMap((definition, index) => {
    const texts = rows[index]?.values ?? {}
    const values = Object.fromEntries(definition.fields.map((field) => [field.key, fieldValue(field, texts[field.key])]))
    return validateRowValues(definition, values, side, index + 1, `indicators.${indicatorId}.${side}.rules.${index}`)
  })
}

/** `{ side, index (0-based), field }` of a server path `…<side>.rules.<index>[.<field>]`, if it is one. */
export function rowPathOf(path: string): { side: Side; index: number; field: string | null } | null {
  const match = /(?:^|\.)(buy|sell)\.rules\.(\d+)(?:\.([a-z_]+))?$/.exec(path)
  if (!match) return null
  return { side: match[1] as Side, index: Number(match[2]), field: match[3] ?? null }
}
