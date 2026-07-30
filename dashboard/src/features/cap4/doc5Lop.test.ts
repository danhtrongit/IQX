import { describe, expect, it } from "vitest"
import {
  LOP_DEFS,
  LOP_KEYS,
  NHAN_DINH_LABEL,
  NHAN_DINH_OPTIONS,
  countCungGocNhin,
  countDongThuan,
  countKhacAi,
  deriveAiRating,
  deriveLyDoForCap1,
  isDoc5LopComplete,
  nhanDinhFromVerdict,
} from "./doc5Lop"
import type { Lop5Map, Lop5Partial } from "./types"

describe("LOP_DEFS / LOP_KEYS (spec §5.1)", () => {
  it("declares exactly the 5 lớp, in the spec's order, matching the BE's LOP_KEYS", () => {
    expect(LOP_KEYS).toEqual(["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"])
    expect(LOP_DEFS.map((d) => d.lop)).toEqual(LOP_KEYS)
  })

  it("maps each lớp to its real data source (L1/L3/L4/L5 + BCTC for Định giá)", () => {
    const byLop = Object.fromEntries(LOP_DEFS.map((d) => [d.lop, d]))
    expect(byLop.ky_thuat.layer).toBe("L1")
    expect(byLop.dong_tien.layer).toBe("L3")
    expect(byLop.noi_bo.layer).toBe("L4")
    expect(byLop.tin_tuc.layer).toBe("L5")
    // Định giá is NOT an AI Insight layer — it comes from BCTC.
    expect(byLop.dinh_gia.layer).toBeNull()
    expect(byLop.dinh_gia.source).toMatch(/BCTC/)
  })

  it("labels + icons each lớp for the panel rows", () => {
    const byLop = Object.fromEntries(LOP_DEFS.map((d) => [d.lop, d]))
    expect(byLop.ky_thuat.label).toBe("Kỹ thuật")
    expect(byLop.dong_tien.label).toBe("Dòng tiền")
    expect(byLop.noi_bo.label).toBe("Nội bộ")
    expect(byLop.tin_tuc.label).toBe("Tin tức")
    expect(byLop.dinh_gia.label).toBe("Định giá")
    expect(LOP_DEFS.every((d) => d.icon.length > 0)).toBe(true)
  })

  it("offers exactly the 3 self-rating mức (Ủng hộ / Trung tính / Ngược chiều)", () => {
    expect(NHAN_DINH_OPTIONS.map((o) => o.value)).toEqual(["ok", "neu", "bad"])
    expect(NHAN_DINH_OPTIONS.map((o) => o.label)).toEqual([
      "Ủng hộ",
      "Trung tính",
      "Ngược chiều",
    ])
    expect(NHAN_DINH_LABEL.ok).toBe("Ủng hộ")
  })
})

describe("nhanDinhFromVerdict — thang 5 bậc thật → 3 mức (spec §5.3)", () => {
  it("Rất mạnh/Mạnh (ung_ho_manh, ung_ho) → Ủng hộ", () => {
    expect(nhanDinhFromVerdict("ung_ho_manh")).toBe("ok")
    expect(nhanDinhFromVerdict("ung_ho")).toBe("ok")
  })
  it("Trung bình/Trung tính → Trung tính", () => {
    expect(nhanDinhFromVerdict("trung_tinh")).toBe("neu")
  })
  it("Yếu/Cảnh báo (can_chu_y) + Rất yếu (nguoc_chieu) → Ngược chiều", () => {
    expect(nhanDinhFromVerdict("can_chu_y")).toBe("bad")
    expect(nhanDinhFromVerdict("nguoc_chieu")).toBe("bad")
  })
})

describe("deriveAiRating — from a real statusLevel (spec §5.3)", () => {
  it("statusLevel 5/4 → 'ok'", () => {
    expect(deriveAiRating({ kind: "statusLevel", statusLevel: 5 })).toBe("ok")
    expect(deriveAiRating({ kind: "statusLevel", statusLevel: 4 })).toBe("ok")
  })
  it("statusLevel 3 → 'neu'", () => {
    expect(deriveAiRating({ kind: "statusLevel", statusLevel: 3 })).toBe("neu")
  })
  it("statusLevel 2/1 → 'bad'", () => {
    expect(deriveAiRating({ kind: "statusLevel", statusLevel: 2 })).toBe("bad")
    expect(deriveAiRating({ kind: "statusLevel", statusLevel: 1 })).toBe("bad")
  })
})

describe("deriveAiRating — from Định giá (BCTC vùng giá trị)", () => {
  const range = { median: 100, rangeLow: 80, rangeHigh: 120 }
  it("price below the whole vùng giá trị → 'ok'", () => {
    expect(deriveAiRating({ kind: "valuation", currentPrice: 70, ...range })).toBe("ok")
  })
  it("price in the lower half of the vùng → 'ok'", () => {
    expect(deriveAiRating({ kind: "valuation", currentPrice: 90, ...range })).toBe("ok")
  })
  it("price around the trung vị → 'neu'", () => {
    expect(deriveAiRating({ kind: "valuation", currentPrice: 100, ...range })).toBe("neu")
  })
  it("price in the upper half → 'bad' (cần chú ý collapses to Ngược chiều)", () => {
    expect(deriveAiRating({ kind: "valuation", currentPrice: 115, ...range })).toBe("bad")
  })
  it("price above the vùng (vượt đỉnh) → 'bad'", () => {
    expect(deriveAiRating({ kind: "valuation", currentPrice: 130, ...range })).toBe("bad")
  })
})

const FULL: Lop5Map = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "bad",
  dinh_gia: "ok",
}

describe("isDoc5LopComplete — cổng cứng (spec §5.2)", () => {
  it("is true only when all 5 lớp are rated", () => {
    expect(isDoc5LopComplete(FULL)).toBe(true)
  })
  it("is false for a partial map", () => {
    expect(isDoc5LopComplete({ ky_thuat: "ok", dong_tien: "neu" })).toBe(false)
  })
  it("is false for an empty/null map", () => {
    expect(isDoc5LopComplete({})).toBe(false)
    expect(isDoc5LopComplete(null)).toBe(false)
    expect(isDoc5LopComplete(undefined)).toBe(false)
  })
  it("is false when one lớp carries an unknown value", () => {
    const bad = { ...FULL, noi_bo: "wat" } as unknown as Lop5Partial
    expect(isDoc5LopComplete(bad)).toBe(false)
  })
})

describe("countDongThuan — số lớp đánh giá Ủng hộ", () => {
  it("counts 'ok' entries", () => {
    expect(countDongThuan(FULL)).toBe(3)
  })
  it("works on a partial map and on null", () => {
    expect(countDongThuan({ ky_thuat: "ok", noi_bo: "bad" })).toBe(1)
    expect(countDongThuan(null)).toBe(0)
  })
})

describe("countKhacAi / countCungGocNhin — trung tính, KHÔNG đúng/sai", () => {
  const ai: Lop5Map = {
    ky_thuat: "ok",
    dong_tien: "neu",
    noi_bo: "neu",
    tin_tuc: "bad",
    dinh_gia: "bad",
  }
  it("counts the lớp where the user read differently from AI", () => {
    // dong_tien (ok vs neu) + dinh_gia (ok vs bad) differ → 2
    expect(countKhacAi(FULL, ai)).toBe(2)
  })
  it("counts the lớp where user and AI share a góc nhìn", () => {
    expect(countCungGocNhin(FULL, ai)).toBe(3)
  })
  it("is 0 when AI has not been revealed yet (no ai map)", () => {
    expect(countKhacAi(FULL, null)).toBe(0)
    expect(countCungGocNhin(FULL, null)).toBe(0)
  })
  it("only compares lớp present in BOTH maps (never invents a verdict)", () => {
    expect(countKhacAi({ ky_thuat: "ok" }, ai)).toBe(0)
    expect(countCungGocNhin({ ky_thuat: "ok" }, ai)).toBe(1)
  })
})

describe("deriveLyDoForCap1 — Cấp 1's NOT NULL lyDo workaround", () => {
  it("picks the 'ok' lớp with the strongest AI support", () => {
    const doc: Lop5Map = {
      ky_thuat: "ok",
      dong_tien: "ok",
      noi_bo: "neu",
      tin_tuc: "bad",
      dinh_gia: "ok",
    }
    const ai: Lop5Map = {
      ky_thuat: "bad",
      dong_tien: "neu",
      noi_bo: "ok",
      tin_tuc: "ok",
      dinh_gia: "ok",
    }
    // Among the user's 'ok' lớp (ky_thuat/dong_tien/dinh_gia), AI supports
    // dinh_gia the strongest.
    expect(deriveLyDoForCap1(doc, ai)).toBe("dinh_gia")
  })

  it("falls back to the FIRST 'ok' lớp (canonical order) when AI is not revealed", () => {
    expect(deriveLyDoForCap1({ noi_bo: "ok", dong_tien: "ok" }, null)).toBe("dong_tien")
  })

  it("breaks AI-support ties by the canonical lớp order", () => {
    const doc: Lop5Partial = { dong_tien: "ok", tin_tuc: "ok" }
    const ai: Lop5Partial = { dong_tien: "ok", tin_tuc: "ok" }
    expect(deriveLyDoForCap1(doc, ai)).toBe("dong_tien")
  })

  it("falls back to the first RATED lớp when the user rated no lớp 'ok'", () => {
    expect(deriveLyDoForCap1({ noi_bo: "bad", tin_tuc: "neu" }, null)).toBe("noi_bo")
  })

  it("falls back to a stable default when nothing is rated at all", () => {
    expect(deriveLyDoForCap1({}, null)).toBe("ky_thuat")
    expect(deriveLyDoForCap1(null, null)).toBe("ky_thuat")
  })
})
