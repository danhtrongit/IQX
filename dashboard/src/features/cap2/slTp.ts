import type { NarrativeFragment } from "@/features/stock/types"

/**
 * Pure cắt lỗ/chốt lời computation (spec §5.2/§5.3) — kept side-effect-free
 * and independently unit-tested so `SlTpBlock.tsx` stays a thin data-fetch +
 * render shell around it.
 */

/** Minimal OHLCV bar shape — matches `InsightRawInput.trend.ohlcv`'s items
 * (`backend/app/services/ai/analysis_service.py#_build_raw_input`: `date`,
 * `open`, `high`, `low`, `close`, `volume`, already in full VND — same scale
 * as `computed.latestClose`). */
export interface OhlcvBar {
  date?: unknown
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

export interface SlTpResult {
  catLo: number
  chotLoi: number
  /** % away from giá vào — negative for cắt lỗ, positive for chốt lời. */
  catLoPct: number
  chotLoiPct: number
}

/** Kế hoạch preset rounding to the nearest VND tick (mirrors
 * `TradingPanel.tsx`'s own private `roundToStep` — duplicated here rather
 * than imported since that one isn't exported and `cap2` must stay
 * independent of `trading`). */
export function roundToStep(n: number, step = 100): number {
  return Math.round(n / step) * step
}

function pctAway(value: number, giaVao: number): number {
  if (!giaVao) return 0
  return ((value - giaVao) / giaVao) * 100
}

/**
 * Pull the first numeric value out of a `NarrativeFragment[]` — AI Insight's
 * Hỗ trợ/Kháng cự fields are free narrative text (e.g. a `[num]61.000[/num]`
 * tag rendered as `{type:"number", content:"61.000"}`, per
 * `backend/app/services/ai/insight_fragments.py`). Prefers a `type:"number"`
 * fragment; falls back to the first numeric token in the joined text.
 * Returns `null` when nothing numeric is found (graceful degrade — spec:
 * don't crash, don't block, just disable that card).
 */
export function extractNumberFromFragments(
  fragments: NarrativeFragment[] | null | undefined,
): number | null {
  if (!fragments || fragments.length === 0) return null
  const numberFragment = fragments.find((f) => f.type === "number")
  const candidates = numberFragment ? [numberFragment.content] : fragments.map((f) => f.content)
  for (const text of candidates) {
    const match = text.match(/\d[\d.,]*/)
    if (!match) continue
    const digitsOnly = match[0].replace(/[.,]/g, "")
    const n = Number(digitsOnly)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** Minimal shape of an AI Insight L1 layer's `fields` — matches `LayerCard`. */
export interface LayerField {
  label: string
  value: NarrativeFragment[]
}

/** spec §5.2 — pull hỗ trợ/kháng cự numeric marks out of L1's fields (labels
 * "Hỗ trợ"/"Kháng cự", set by the backend's `_layer_fields_l1`). */
export function extractHoTroKhangCu(fields: LayerField[] | null | undefined): {
  hoTro: number | null
  khangCu: number | null
} {
  const list = fields ?? []
  const hoTroField = list.find((f) => f.label === "Hỗ trợ")
  const khangCuField = list.find((f) => f.label === "Kháng cự")
  return {
    hoTro: extractNumberFromFragments(hoTroField?.value),
    khangCu: extractNumberFromFragments(khangCuField?.value),
  }
}

/**
 * Cách 1 (spec §5.2): Cắt lỗ = ngay dưới hỗ trợ 1%, Chốt lời = ngay dưới
 * kháng cự 1% — rounded to the nearest 100 VND tick. `null` when hỗ
 * trợ/kháng cự aren't available (degrade: disable the card).
 */
export function computeHoTroKhangCuSlTp(
  hoTro: number | null,
  khangCu: number | null,
  giaVao: number,
): SlTpResult | null {
  if (hoTro == null || khangCu == null || !giaVao) return null
  const catLo = roundToStep(hoTro * 0.99)
  const chotLoi = roundToStep(khangCu * 0.99)
  return { catLo, chotLoi, catLoPct: pctAway(catLo, giaVao), chotLoiPct: pctAway(chotLoi, giaVao) }
}

/**
 * "Biên độ dao động" (spec §5.3 — NEVER call it "ATR" in user-facing copy,
 * per `IQX-NguyenTac-Chung.md` §E's bảng thay từ, which supersedes the older
 * Cấp2 spec draft's "(ATR)" first-mention allowance): average True Range
 * over the last `period` bars (default 14). Requires `period + 1` bars (each
 * TR needs a previous close). Returns `null` when there isn't enough OHLCV
 * history (degrade: disable the card).
 */
export function computeBienDoDaoDong(
  ohlcv: OhlcvBar[] | null | undefined,
  period = 14,
): number | null {
  if (!ohlcv || ohlcv.length < period + 1) return null
  const bars = ohlcv.slice(-(period + 1))
  const trueRanges: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]
    const prevClose = bars[i - 1].close
    if (cur.high == null || cur.low == null || prevClose == null) return null
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    )
    trueRanges.push(tr)
  }
  if (trueRanges.length === 0) return null
  const atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
  return atr > 0 ? atr : null
}

/**
 * Cách 2 (spec §5.3): Cắt lỗ = giá vào − (biên độ × 2), Chốt lời = giá vào +
 * (biên độ × 4). `null` when biên độ dao động isn't available.
 */
export function computeBienDoSlTp(bienDo: number | null, giaVao: number): SlTpResult | null {
  if (bienDo == null || !giaVao) return null
  const catLo = Math.round(giaVao - bienDo * 2)
  const chotLoi = Math.round(giaVao + bienDo * 4)
  return { catLo, chotLoi, catLoPct: pctAway(catLo, giaVao), chotLoiPct: pctAway(chotLoi, giaVao) }
}
