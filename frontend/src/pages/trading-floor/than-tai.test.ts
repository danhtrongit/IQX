import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import {
  altarCopy,
  describeFailure,
  effectiveStatus,
  exchangeLabel,
  formatRef,
  hexLines,
  openingStep,
  serverOffset,
  shouldAutoOpenThanTai,
  splitSegments,
  tickerSuggestions,
  topWidths,
  vnClock,
  vnDate,
} from "./than-tai.ts"

const at = (iso: string): number => Date.parse(iso)

describe("altarCopy", () => {
  it("gives the status line and button of each altar state", () => {
    expect(altarCopy("chua_khan", false)).toEqual({
      status: "Mỗi ngày một lần, trước 11:30.",
      button: "Thành tâm khấn",
      primary: true,
    })
    expect(altarCopy("dang_do", true).button).toBe("Khấn tiếp")
    expect(altarCopy("dang_do", true).status).toBe(
      "Bạn đang khấn dở. Thành tâm làm tiếp nhé."
    )
    expect(altarCopy("da_xong", true).button).toBe("Xem quẻ và kết quả hôm nay")
    expect(altarCopy("da_xong", true).status).toBe(
      "Lễ đã dâng. Lộc hôm nay đã về với bạn."
    )
  })

  it("tells a missed day from an unfinished ritual after 11:30", () => {
    expect(altarCopy("het_gio", false).status).toBe(
      "Đã qua giờ khấn hôm nay. Hẹn bạn sáng mai."
    )
    expect(altarCopy("het_gio", true).status).toBe(
      "Đã qua 11:30, lượt khấn dở dang khép lại."
    )
    expect(altarCopy("het_gio", true)).toMatchObject({
      button: "Xem kết quả cả sàn",
      primary: false,
    })
  })
})

describe("openingStep", () => {
  it("resumes at the open step, reviews from the card, shows results after 11:30", () => {
    expect(openingStep("chua_khan", 1)).toBe(1)
    expect(openingStep("dang_do", 3)).toBe(3)
    expect(openingStep("da_xong", 4)).toBe(1)
    expect(openingStep("het_gio", 2)).toBe(4)
  })
})

describe("server time", () => {
  it("measures the offset between the server and the browser clock", () => {
    expect(serverOffset(10_000, 7_500)).toBe(2_500)
    expect(serverOffset(5_000, 7_500)).toBe(-2_500)
    expect(serverOffset(Number.NaN, 7_500)).toBe(0)
  })

  it("reads Vietnam time whatever the browser zone", () => {
    expect(vnClock(at("2026-11-15T02:45:00Z"))).toBe("09:45")
    expect(vnClock(at("2026-11-15T17:05:00Z"))).toBe("00:05")
    expect(vnDate(at("2026-11-15T16:59:00Z"))).toBe("2026-11-15")
    expect(vnDate(at("2026-11-15T17:00:00Z"))).toBe("2026-11-16")
  })

  it("closes an unfinished ritual once the deadline passes", () => {
    const deadline = at("2026-11-15T04:30:00Z")
    const before = deadline - 1
    expect(effectiveStatus({ status: "chua_khan", deadline }, before)).toBe(
      "chua_khan"
    )
    expect(effectiveStatus({ status: "dang_do", deadline }, deadline)).toBe(
      "het_gio"
    )
    expect(effectiveStatus({ status: "chua_khan", deadline }, deadline)).toBe(
      "het_gio"
    )
    expect(
      effectiveStatus({ status: "da_xong", deadline }, deadline + 9_999)
    ).toBe("da_xong")
  })
})

describe("splitSegments", () => {
  it("rounds to one decimal and always adds up to 100", () => {
    const s = splitSegments({ up: 742, flat: 93, down: 449 })
    expect(s.map((x) => x.pct)).toEqual([57.8, 7.2, 35])
    expect(s.reduce((sum, x) => sum + x.pct, 0)).toBeCloseTo(100, 6)
    const thirds = splitSegments({ up: 1, flat: 1, down: 1 })
    expect(thirds.reduce((sum, x) => sum + x.pct, 0)).toBeCloseTo(100, 6)
  })

  it("prints no number in a segment under 10%", () => {
    const s = splitSegments({ up: 742, flat: 93, down: 449 })
    expect(s[0].label).toBe("57,8%")
    expect(s[1].label).toBeNull()
    expect(s[2].label).toBe("35%")
    expect(splitSegments({ up: 9, flat: 1, down: 0 })[1].label).toBe("10%")
  })

  it("shows an empty bar when nobody predicted", () => {
    expect(splitSegments({ up: 0, flat: 0, down: 0 })).toEqual([
      { key: "up", count: 0, pct: 0, label: null },
      { key: "flat", count: 0, pct: 0, label: null },
      { key: "down", count: 0, pct: 0, label: null },
    ])
  })
})

describe("topWidths", () => {
  it("scales every bar to the most prayed ticker", () => {
    expect(topWidths([{ count: 200 }, { count: 100 }, { count: 50 }])).toEqual([
      100, 50, 25,
    ])
    expect(topWidths([{ count: 0 }])).toEqual([0])
    expect(topWidths([])).toEqual([])
  })
})

describe("formatting and hexagram", () => {
  it("formats the VNINDEX reference the Vietnamese way", () => {
    expect(formatRef(1746.9)).toBe("1.746,90")
  })

  it("reads the six lines bottom first", () => {
    expect(hexLines("100010")).toEqual([true, false, false, false, true, false])
    expect(hexLines("1")).toEqual([true, false, false, false, false, false])
  })

  it("prints UPCoM like the spec", () => {
    expect(exchangeLabel("UPCOM")).toBe("UPCoM")
    expect(exchangeLabel("hose")).toBe("HOSE")
  })
})

describe("tickerSuggestions", () => {
  const rows = [
    { symbol: "FPT", name: "CTCP FPT", exchange: "HOSE" },
    { symbol: "FPTS", name: "Chứng khoán FPT", exchange: "HNX" },
    { symbol: "FOX", name: "FPT Telecom", exchange: "UPCOM" },
    { symbol: "FUE", name: "Quỹ ETF", exchange: "OTC" },
  ]

  it("keeps listed stocks only and hides the chosen ones", () => {
    expect(tickerSuggestions(rows, []).map((r) => r.symbol)).toEqual([
      "FPT",
      "FOX",
    ])
    expect(tickerSuggestions(rows, ["FPT"]).map((r) => r.symbol)).toEqual([
      "FOX",
    ])
  })

  it("stops at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      symbol: `A${String(i).padStart(2, "0")}`,
      name: "x",
      exchange: "HOSE",
    }))
    expect(tickerSuggestions(many, [])).toHaveLength(8)
  })
})

describe("describeFailure", () => {
  it("sorts deadline, network and known errors", () => {
    expect(
      describeFailure(new ApiError("x", 409, { code: "HET_GIO" })).kind
    ).toBe("het_gio")
    expect(describeFailure(new TypeError("Failed to fetch"))).toEqual({
      kind: "network",
      code: null,
      text: "Chưa gửi được, bạn thử lại nhé",
    })
    expect(describeFailure(new ApiError("x", 503)).kind).toBe("network")
    expect(
      describeFailure(new ApiError("x", 409, { code: "DA_CAU" }))
    ).toMatchObject({
      kind: "known",
      text: "Bạn đã dâng lễ cầu mã hôm nay rồi.",
    })
    expect(describeFailure(new ApiError("x", 400)).kind).toBe("other")
  })
})

describe("shouldAutoOpenThanTai", () => {
  const deadline = at("2026-11-15T04:30:00Z") // 11:30 VN
  const early = at("2026-11-15T02:45:00Z") // 09:45 VN
  const late = at("2026-11-15T05:00:00Z") // 12:00 VN

  it("opens for a visitor who can still pray, on a day not shown yet", () => {
    expect(
      shouldAutoOpenThanTai({ status: "chua_khan", deadline }, early, null)
    ).toBe(true)
    expect(
      shouldAutoOpenThanTai(
        { status: "dang_do", deadline },
        early,
        "2026-11-14"
      )
    ).toBe(true)
  })

  it("does not open twice on the same Vietnam day", () => {
    expect(
      shouldAutoOpenThanTai(
        { status: "chua_khan", deadline },
        early,
        "2026-11-15"
      )
    ).toBe(false)
    // 17:30 UTC on the 15th is already 00:30 VN of the 16th: a new day.
    expect(
      shouldAutoOpenThanTai(
        { status: "chua_khan", deadline: at("2026-11-16T04:30:00Z") },
        at("2026-11-15T17:30:00Z"),
        "2026-11-15"
      )
    ).toBe(true)
  })

  it("stays closed when the ritual is done or the 11:30 deadline has passed", () => {
    expect(
      shouldAutoOpenThanTai({ status: "da_xong", deadline }, early, null)
    ).toBe(false)
    expect(
      shouldAutoOpenThanTai({ status: "het_gio", deadline }, early, null)
    ).toBe(false)
    expect(
      shouldAutoOpenThanTai({ status: "chua_khan", deadline }, late, null)
    ).toBe(false)
    expect(
      shouldAutoOpenThanTai({ status: "dang_do", deadline }, deadline, null)
    ).toBe(false)
  })
})
