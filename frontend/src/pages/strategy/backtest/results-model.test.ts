import { describe, expect, it } from "vitest"

import { exitReasonText, thinPoints, warningText } from "./results-model"

describe("results model", () => {
  it("exit reasons, with (cùng đến hạn) when both were true", () => {
    expect(exitReasonText({ exit_reason: "indicator", exit_reasons: ["indicator"] })).toBe("Điều kiện Bán")
    expect(exitReasonText({ exit_reason: "max_holding", exit_reasons: ["max_holding"] })).toBe("Hết thời gian giữ")
    expect(exitReasonText({ exit_reason: "indicator", exit_reasons: ["indicator", "max_holding"] })).toBe("Điều kiện Bán (cùng đến hạn)")
  })

  it("thinning keeps the first and the last point", () => {
    const points = Array.from({ length: 1500 }, (_unused, index) => index)
    const thin = thinPoints(points, 600)
    expect(thin.length).toBeLessThanOrEqual(601)
    expect(thin[0]).toBe(0)
    expect(thin.at(-1)).toBe(1499)
    expect(thinPoints([1, 2, 3])).toEqual([1, 2, 3])
  })

  it("warnings: the server message wins, known codes have their sentence", () => {
    expect(warningText({ code: "X", message: "Câu của máy chủ." })).toBe("Câu của máy chủ.")
    expect(warningText({ code: "SYMBOLS_EXCLUDED", message: "", symbols: ["XYZ", "ABC"] })).toBe("Bỏ 2 mã ngoài VN100: XYZ, ABC")
  })
})
