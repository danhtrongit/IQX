/** Mô tả 14 công cụ và Fibonacci (chuyển từ flashback-drawings.test.ts, đổi formatNumber thành formatPrice). */
import { describe, expect, it } from "vitest"

import {
  ALL_TOOLS,
  FIB_EXTENSION_LEVELS,
  FIB_FORBIDDEN_TOKENS,
  FIB_RETRACEMENT_LEVELS,
  FLASHBACK_TOOLS,
  TOOL_SPECS,
  anchorCountOf,
  fibExtensionPrice,
  fibLabel,
  fibRetracementPrice,
  isDrawingTool,
} from "./index"

describe("14 công cụ (§10)", () => {
  it("14 công cụ gốc vẫn ở đầu danh sách; cả danh sách không trùng và khớp bảng mô tả", () => {
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(14)
    expect(new Set(ALL_TOOLS).size).toBe(ALL_TOOLS.length)
    expect([...ALL_TOOLS].sort()).toEqual(Object.keys(TOOL_SPECS).sort())
    for (const tool of ALL_TOOLS) expect(TOOL_SPECS[tool].tool).toBe(tool)
  })

  it("số điểm neo của 14 công cụ gốc (công cụ đợt 1 và đợt 2 có test riêng)", () => {
    expect(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, anchorCountOf(tool)]))).toMatchObject({
      trend: 2,
      ray: 2,
      extended: 2,
      horizontal: 1,
      "horizontal-ray": 1,
      vertical: 1,
      channel: 3,
      "fib-retracement": 2,
      "fib-extension": 3,
      rectangle: 2,
      "elliott-5": 6,
      "elliott-abc": 4,
      note: 1,
      measure: 2,
    })
  })

  it("Flashback dùng đủ 36 công cụ như market, gồm ba công cụ cũ: xu hướng, Fibonacci thoái lui, đường ngang", () => {
    expect(FLASHBACK_TOOLS).toHaveLength(36)
    expect([...FLASHBACK_TOOLS].sort()).toEqual([...ALL_TOOLS].sort())
    for (const tool of ["trend", "fib-retracement", "horizontal"] as const) expect(FLASHBACK_TOOLS).toContain(tool)
  })

  it("kiểu mặc định không dùng màu tăng giảm hay màu dành cho lớp AI", () => {
    for (const tool of ALL_TOOLS) {
      expect(FIB_FORBIDDEN_TOKENS).not.toContain(TOOL_SPECS[tool].defaultStyle.color)
      expect(TOOL_SPECS[tool].label).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it("isDrawingTool chỉ nhận tên công cụ thật", () => {
    expect(isDrawingTool("trend")).toBe(true)
    expect(isDrawingTool("fib")).toBe(false)
    expect(isDrawingTool("toString")).toBe(false)
    expect(isDrawingTool(5)).toBe(false)
  })
})

describe("Fibonacci thoái lui (v2.1 §7.3)", () => {
  it("đúng 7 mức: 0, 23,6, 38,2, 50, 61,8, 78,6 và 100%", () => {
    expect(FIB_RETRACEMENT_LEVELS.map((entry) => entry.level)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1])
  })

  it("không dùng chart-3, chart-4 (màu tăng giảm) hay chart-7 (lớp AI) ở bất kỳ mức nào", () => {
    for (const entry of [...FIB_RETRACEMENT_LEVELS, ...FIB_EXTENSION_LEVELS]) {
      expect(FIB_FORBIDDEN_TOKENS).not.toContain(entry.token)
    }
  })

  it("giá tại mức L = giá cuối - (giá cuối - giá đầu) x L: điểm đầu là 100%, điểm cuối là 0%", () => {
    expect(fibRetracementPrice(30_000, 25_000, 0)).toBe(25_000)
    expect(fibRetracementPrice(30_000, 25_000, 1)).toBe(30_000)
    expect(fibRetracementPrice(30_000, 25_000, 0.5)).toBe(27_500)
    expect(fibRetracementPrice(30_000, 25_000, 0.618)).toBeCloseTo(28_090, 6)
    expect(fibRetracementPrice(30_000, 25_000, 0.382)).toBeCloseTo(26_910, 6)
  })

  it("vẽ từ đáy lên đỉnh cũng đúng công thức", () => {
    expect(fibRetracementPrice(25_000, 30_000, 0)).toBe(30_000)
    expect(fibRetracementPrice(25_000, 30_000, 1)).toBe(25_000)
    expect(fibRetracementPrice(25_000, 30_000, 0.618)).toBeCloseTo(30_000 - 5_000 * 0.618, 6)
  })

  it("Fibonacci mở rộng đo đoạn A đến B từ điểm C", () => {
    expect(fibExtensionPrice(100, 110, 105, 0)).toBe(105)
    expect(fibExtensionPrice(100, 110, 105, 1)).toBe(115)
    expect(fibExtensionPrice(100, 110, 105, 1.618)).toBeCloseTo(121.18, 6)
    expect(fibExtensionPrice(110, 100, 105, 1)).toBe(95)
  })

  it('nhãn "61,8% · 25.630"; mức nguyên không có số lẻ', () => {
    expect(fibLabel(0.618, 25_630)).toBe("61,8% · 25.630")
    expect(fibLabel(0.236, 26_000)).toBe("23,6% · 26.000")
    expect(fibLabel(0, 25_000)).toBe("0% · 25.000")
    expect(fibLabel(0.5, 27_500)).toBe("50% · 27.500")
    expect(fibLabel(1, 30_000)).toBe("100% · 30.000")
    expect(fibLabel(1.618, 30_000)).toBe("161,8% · 30.000")
  })

  it("giá đi qua formatPrice của bên dùng", () => {
    expect(fibLabel(0.5, 25.5, (price) => price.toFixed(2))).toBe("50% · 25.50")
  })
})
