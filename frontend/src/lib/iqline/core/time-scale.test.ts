import { describe, expect, it } from "vitest"

import { ICT_OFFSET, civilFromDays, dayOfWeekdayOrdinal, daysFromCivil, ictParts, intradayStarts, weekdayOrdinal } from "./calendar"
import { createMarketTimeScale, createSessionTimeScale, dayBreaks } from "./time-scale"

/** Giờ Việt Nam sang Unix giây. */
const ict = (year: number, month: number, day: number, hour = 0, minute = 0) => daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 - ICT_OFFSET
/** 00:00 UTC, giờ của nến ngày. */
const utc = (year: number, month: number, day: number) => daysFromCivil(year, month, day) * 86400

describe("calendar", () => {
  it("ngày dương lịch đổi qua lại đúng", () => {
    for (const [year, month, day] of [
      [1970, 1, 1],
      [2024, 2, 29],
      [2026, 11, 5],
      [2100, 12, 31],
    ] as const) {
      expect(civilFromDays(daysFromCivil(year, month, day))).toEqual({ year, month, day })
    }
  })

  it("thứ trong tuần theo giờ Việt Nam: 2026-11-05 là thứ năm, 07:00 UTC đã sang ngày kế", () => {
    expect(ictParts(ict(2026, 11, 5, 9)).weekday).toBe(3)
    expect(ictParts(utc(2026, 11, 5)).date).toBe(5)
    expect(ictParts(ict(2026, 11, 5, 23, 30)).date).toBe(5)
  })

  it("thứ tự ngày giao dịch bỏ cuối tuần và đổi ngược lại được", () => {
    const friday = daysFromCivil(2026, 11, 6)
    const monday = daysFromCivil(2026, 11, 9)
    expect(weekdayOrdinal(monday) - weekdayOrdinal(friday)).toBe(1)
    expect(weekdayOrdinal(friday + 1)).toBe(weekdayOrdinal(monday))
    for (const day of [friday - 4, friday, monday, monday + 3]) expect(dayOfWeekdayOrdinal(weekdayOrdinal(day))).toBe(day)
  })

  it("số ô một ngày theo khung: 1 phút 255, 5 phút 51, 60 phút 5", () => {
    expect(intradayStarts(1)).toHaveLength(255)
    expect(intradayStarts(5)).toHaveLength(51)
    expect(intradayStarts(60)).toEqual([540, 600, 660, 780, 840])
  })
})

describe("thang thời gian market: ngoại suy sau nến cuối", () => {
  const fiveMinute = [ict(2026, 11, 5, 14, 30), ict(2026, 11, 5, 14, 35), ict(2026, 11, 5, 14, 40)]
  const scale = createMarketTimeScale(fiveMinute, "5")

  it("nến thật: thời gian là chỉ số nguyên, đổi qua lại chính xác", () => {
    expect(scale.indexOfAnchor({ time: fiveMinute[1], price: 1 })).toBe(1)
    expect(scale.anchorAt(2, 50)).toEqual({ time: fiveMinute[2], price: 50 })
  })

  it("sau 14:40 (ô cuối của phiên chiều) là 09:00 ngày kế, không có ô cho 14:45 đến 09:00", () => {
    expect(scale.timeOfIndex(3)).toBe(ict(2026, 11, 6, 9, 0))
    expect(scale.timeOfIndex(4)).toBe(ict(2026, 11, 6, 9, 5))
    expect(scale.indexOfTime(ict(2026, 11, 6, 9, 0))).toBe(3)
    expect(scale.indexOfTime(ict(2026, 11, 6, 9, 5))).toBe(4)
  })

  it("bỏ cuối tuần: sau thứ sáu là thứ hai", () => {
    const friday = createMarketTimeScale([ict(2026, 11, 6, 14, 40)], "5")
    expect(friday.timeOfIndex(1)).toBe(ict(2026, 11, 9, 9, 0))
    expect(friday.indexOfTime(ict(2026, 11, 9, 9, 0))).toBe(1)
    expect(friday.indexOfTime(ict(2026, 11, 7, 12, 0))).toBe(1)
  })

  it("bỏ nghỉ trưa: sau 11:25 là 13:00", () => {
    const morning = createMarketTimeScale([ict(2026, 11, 5, 11, 20), ict(2026, 11, 5, 11, 25)], "5")
    expect(morning.timeOfIndex(2)).toBe(ict(2026, 11, 5, 13, 0))
    expect(morning.indexOfTime(ict(2026, 11, 5, 13, 5))).toBe(3)
  })

  it("ngoại suy xa vẫn chính xác (khung 1 phút, qua cả tuần)", () => {
    const minute = createMarketTimeScale([ict(2026, 11, 6, 14, 44)], "1")
    // 255 ô mỗi ngày: ô thứ 255 sau nến cuối là 14:44 thứ hai, ô thứ 256 là 09:00 thứ ba.
    expect(minute.timeOfIndex(1)).toBe(ict(2026, 11, 9, 9, 0))
    expect(minute.timeOfIndex(255)).toBe(ict(2026, 11, 9, 14, 44))
    expect(minute.timeOfIndex(256)).toBe(ict(2026, 11, 10, 9, 0))
    expect(minute.indexOfTime(ict(2026, 11, 10, 9, 0))).toBe(256)
  })

  it("trước nến đầu cũng ngoại suy: nến trước 09:00 thứ hai là 14:40 thứ sáu", () => {
    const monday = createMarketTimeScale([ict(2026, 11, 9, 9, 0), ict(2026, 11, 9, 9, 5)], "5")
    expect(monday.timeOfIndex(-1)).toBe(ict(2026, 11, 6, 14, 40))
    expect(monday.indexOfTime(ict(2026, 11, 6, 14, 40))).toBe(-1)
  })

  it("nến ngoài phiên (VNINDEX có nến 15:00) không làm hỏng ngoại suy", () => {
    const odd = createMarketTimeScale([ict(2026, 11, 5, 14, 55), ict(2026, 11, 5, 15, 0)], "5")
    expect(odd.timeOfIndex(2)).toBe(ict(2026, 11, 6, 9, 0))
    expect(odd.indexOfTime(ict(2026, 11, 6, 9, 0))).toBe(2)
  })

  it("giữa hai nến cách nhau cả ngày: không kéo dài quá một bước của khung", () => {
    const gap = createMarketTimeScale([ict(2026, 11, 5, 14, 40), ict(2026, 11, 9, 9, 0)], "5")
    expect(gap.indexOfTime(ict(2026, 11, 5, 14, 40))).toBe(0)
    expect(gap.indexOfTime(ict(2026, 11, 7, 10, 0))).toBe(1)
    expect(gap.indexOfTime(ict(2026, 11, 5, 14, 42))).toBeCloseTo(0.4, 5)
  })

  it("neo loại `session` không đổi được ở market", () => {
    expect(scale.indexOfAnchor({ session: 3, price: 1 })).toBeNull()
  })

  it("không có nến thì không đổi được", () => {
    const empty = createMarketTimeScale([], "5")
    expect(empty.indexOfAnchor({ time: 1, price: 1 })).toBeNull()
  })
})

describe("thang thời gian market: khung ngày, tuần, tháng", () => {
  it("khung ngày: nến 00:00 UTC, sau thứ sáu là thứ hai, giữ nguyên giờ trong ngày", () => {
    const daily = createMarketTimeScale([utc(2026, 11, 5), utc(2026, 11, 6)], "D")
    expect(daily.timeOfIndex(2)).toBe(utc(2026, 11, 9))
    expect(daily.timeOfIndex(3)).toBe(utc(2026, 11, 10))
    expect(daily.indexOfTime(utc(2026, 11, 10))).toBe(3)
    expect(daily.indexOfTime(utc(2026, 11, 8))).toBe(2)
  })

  it("khung tuần cách 7 ngày, khung tháng sang tháng kế", () => {
    const weekly = createMarketTimeScale([utc(2026, 10, 26), utc(2026, 11, 2)], "W")
    expect(weekly.timeOfIndex(2)).toBe(utc(2026, 11, 9))
    const monthly = createMarketTimeScale([utc(2026, 9, 1), utc(2026, 10, 1)], "M")
    expect(ictParts(monthly.timeOfIndex(2)).month).toBe(11)
    expect(ictParts(monthly.timeOfIndex(3)).month).toBe(12)
    expect(ictParts(monthly.timeOfIndex(5)).year).toBe(2027)
  })
})

describe("thang theo session (Flashback)", () => {
  const scale = createSessionTimeScale(60, 90)

  it("chỉ số là số phiên; neo theo thời gian không đổi được", () => {
    expect(scale.indexOfAnchor({ session: 12.5, price: 1 })).toBe(12.5)
    expect(scale.indexOfAnchor({ time: 1, price: 1 })).toBeNull()
    expect(scale.anchorAt(7, 100)).toEqual({ session: 7, price: 100 })
    expect(scale.slots).toBe(90)
  })

  it("tổng ô không bao giờ nhỏ hơn số nến", () => {
    expect(createSessionTimeScale(100, 90).slots).toBe(100)
  })
})

describe("vạch ngăn khi nhảy ngày", () => {
  it("khung trong ngày: đánh dấu nến đầu mỗi ngày và số ngày bị bỏ qua", () => {
    const times = [ict(2021, 11, 5, 14, 43), ict(2021, 11, 5, 14, 44), ict(2021, 12, 31, 9, 0), ict(2021, 12, 31, 9, 1), ict(2022, 1, 4, 9, 0)]
    expect(dayBreaks(times, "1", 0, 4)).toEqual([
      { index: 2, gapDays: 56 },
      { index: 4, gapDays: 4 },
    ])
  })

  it("khung ngày không có vạch ngăn", () => {
    expect(dayBreaks([utc(2026, 11, 5), utc(2026, 11, 6)], "D", 0, 1)).toEqual([])
  })
})
