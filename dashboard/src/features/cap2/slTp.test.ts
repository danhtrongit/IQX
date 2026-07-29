import { describe, expect, it } from "vitest"
import {
  computeBienDoDaoDong,
  computeBienDoSlTp,
  computeHoTroKhangCuSlTp,
  extractHoTroKhangCu,
  extractNumberFromFragments,
  roundToStep,
  type OhlcvBar,
} from "./slTp"

describe("extractNumberFromFragments", () => {
  it("prefers a type:number fragment's content", () => {
    expect(
      extractNumberFromFragments([
        { type: "text", content: "Mốc " },
        { type: "number", content: "61.000" },
        { type: "text", content: " đồng" },
      ]),
    ).toBe(61_000)
  })

  it("falls back to a numeric token in plain text when there's no number fragment", () => {
    expect(extractNumberFromFragments([{ type: "text", content: "quanh 66,500 đồng" }])).toBe(
      66_500,
    )
  })

  it("returns null for empty/missing fragments", () => {
    expect(extractNumberFromFragments([])).toBeNull()
    expect(extractNumberFromFragments(undefined)).toBeNull()
    expect(extractNumberFromFragments(null)).toBeNull()
  })

  it("returns null when nothing numeric is present (degrade, don't crash)", () => {
    expect(extractNumberFromFragments([{ type: "text", content: "chưa xác định" }])).toBeNull()
  })
})

describe("extractHoTroKhangCu", () => {
  it("reads the 'Hỗ trợ'/'Kháng cự' labeled L1 fields", () => {
    const fields = [
      { label: "Xu hướng", value: [{ type: "text" as const, content: "Tăng" }] },
      { label: "Hỗ trợ", value: [{ type: "number" as const, content: "61.000" }] },
      { label: "Kháng cự", value: [{ type: "number" as const, content: "66.500" }] },
    ]
    expect(extractHoTroKhangCu(fields)).toEqual({ hoTro: 61_000, khangCu: 66_500 })
  })

  it("degrades to nulls when the fields are missing", () => {
    expect(extractHoTroKhangCu([])).toEqual({ hoTro: null, khangCu: null })
    expect(extractHoTroKhangCu(null)).toEqual({ hoTro: null, khangCu: null })
  })
})

describe("computeHoTroKhangCuSlTp (spec §5.2 — Ví dụ VNM)", () => {
  it("giá vào 62.400, hỗ trợ 61.000, kháng cự 66.500 → cắt lỗ 60.400 (−3,2%), chốt lời 65.800 (+5,4%)", () => {
    const result = computeHoTroKhangCuSlTp(61_000, 66_500, 62_400)
    expect(result).not.toBeNull()
    expect(result!.catLo).toBe(60_400)
    expect(result!.chotLoi).toBe(65_800)
    expect(result!.catLoPct).toBeCloseTo(-3.2, 1)
    expect(result!.chotLoiPct).toBeCloseTo(5.4, 1)
  })

  it("returns null when hỗ trợ or kháng cự is missing (degrade gracefully)", () => {
    expect(computeHoTroKhangCuSlTp(null, 66_500, 62_400)).toBeNull()
    expect(computeHoTroKhangCuSlTp(61_000, null, 62_400)).toBeNull()
    expect(computeHoTroKhangCuSlTp(61_000, 66_500, 0)).toBeNull()
  })
})

/** 15 flat bars (close=61.500, high=61.925, low=61.075 — TR=850 every bar,
 * matching spec §5.3's "Ví dụ VNM ... biên độ 850đ"). */
function flatBars(n: number): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    open: 61_500,
    high: 61_925,
    low: 61_075,
    close: 61_500,
    volume: 1_000_000,
  }))
}

describe("computeBienDoDaoDong (biên độ dao động — average True Range)", () => {
  it("computes ATR(14)=850 from 15 flat bars (high-low=850 every bar)", () => {
    expect(computeBienDoDaoDong(flatBars(15))).toBe(850)
  })

  it("returns null when there aren't enough bars (period+1)", () => {
    expect(computeBienDoDaoDong(flatBars(10))).toBeNull()
    expect(computeBienDoDaoDong([])).toBeNull()
    expect(computeBienDoDaoDong(undefined)).toBeNull()
  })

  it("returns null when a bar is missing high/low/close (degrade gracefully)", () => {
    const bars = flatBars(15)
    bars[5].high = null
    expect(computeBienDoDaoDong(bars)).toBeNull()
  })
})

describe("computeBienDoSlTp (spec §5.3 — Ví dụ VNM)", () => {
  it("giá vào 62.400, biên độ 850 → cắt lỗ 60.700 (−2,7%), chốt lời 65.800 (+5,4%)", () => {
    const result = computeBienDoSlTp(850, 62_400)
    expect(result).not.toBeNull()
    expect(result!.catLo).toBe(60_700)
    expect(result!.chotLoi).toBe(65_800)
    expect(result!.catLoPct).toBeCloseTo(-2.7, 1)
    expect(result!.chotLoiPct).toBeCloseTo(5.4, 1)
  })

  it("returns null when biên độ dao động isn't available", () => {
    expect(computeBienDoSlTp(null, 62_400)).toBeNull()
    expect(computeBienDoSlTp(850, 0)).toBeNull()
  })
})

describe("roundToStep", () => {
  it("rounds to the nearest 100 VND tick by default", () => {
    expect(roundToStep(60_390)).toBe(60_400)
    expect(roundToStep(65_835)).toBe(65_800)
  })
})
