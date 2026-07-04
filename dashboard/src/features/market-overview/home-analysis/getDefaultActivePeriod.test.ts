import { describe, expect, it } from "vitest"
import { getDefaultActivePeriod } from "./getDefaultActivePeriod"

// helper: Thứ Hai 2026-07-06 + giờ/phút tuỳ ý
const at = (h: number, m: number, day = 6) => new Date(2026, 6, day, h, m) // 2026-07-06 là Thứ Hai

describe("getDefaultActivePeriod", () => {
  it("08:30 T2 → premarket", () => expect(getDefaultActivePeriod(at(8, 30))).toBe("premarket"))
  it("00:00 T2 → premarket", () => expect(getDefaultActivePeriod(at(0, 0))).toBe("premarket"))
  it("09:14 T2 → premarket (biên trên)", () => expect(getDefaultActivePeriod(at(9, 14))).toBe("premarket"))
  it("09:15 T2 → midday (biên dưới)", () => expect(getDefaultActivePeriod(at(9, 15))).toBe("midday"))
  it("14:00 T2 → midday", () => expect(getDefaultActivePeriod(at(14, 0))).toBe("midday"))
  it("15:29 T2 → midday (biên trên)", () => expect(getDefaultActivePeriod(at(15, 29))).toBe("midday"))
  it("15:30 T2 → eod (biên dưới)", () => expect(getDefaultActivePeriod(at(15, 30))).toBe("eod"))
  it("20:00 T2 → eod", () => expect(getDefaultActivePeriod(at(20, 0))).toBe("eod"))
  it("10:00 T7 → eod (cuối tuần)", () => expect(getDefaultActivePeriod(new Date(2026, 6, 4, 10, 0))).toBe("eod")) // 2026-07-04 là T7
  it("10:00 CN → eod", () => expect(getDefaultActivePeriod(new Date(2026, 6, 5, 10, 0))).toBe("eod"))
  it("isTradingDay=false override → eod kể cả T2 sáng", () =>
    expect(getDefaultActivePeriod(at(8, 30), { isTradingDay: false })).toBe("eod"))
})

// override ngược: lịch giao dịch nói T7 là ngày GD (hiếm) → vẫn tính theo giờ
it("isTradingDay=true override trên T7 → premarket theo giờ, không phải eod", () => {
  expect(getDefaultActivePeriod(new Date(2026, 6, 4, 8, 30), { isTradingDay: true })).toBe("premarket")
})
