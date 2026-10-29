import { describe, expect, it } from "vitest"

import { buildRegistry, rowsIndicator } from "../test-support"
import { enabledCountText, operandLabel, ruleLine, ruleOpLabel, rowSentence, sentenceParts } from "./labels"
import type { ParamsIndicator } from "./types"

const registry = buildRegistry()

/** SPEC V3 §3 / the sample HTML: every row's default sentence, Mua / Bán. */
const GOLDEN: Record<string, [string, string][]> = {
  ma: [
    ["Giá cắt lên SMA 20", "Giá cắt xuống SMA 20"],
    ["SMA 10 cắt lên SMA 20", "SMA 10 cắt xuống SMA 20"],
    ["SMA 20 xu hướng lên", "SMA 20 xu hướng xuống"],
  ],
  ema: [
    ["Giá cắt lên EMA 20", "Giá cắt xuống EMA 20"],
    ["EMA 10 cắt lên EMA 20", "EMA 10 cắt xuống EMA 20"],
    ["EMA 20 xu hướng lên", "EMA 20 xu hướng xuống"],
  ],
  ma_cross: [["SMA 20 cắt lên SMA 50", "SMA 20 cắt xuống SMA 50"]],
  rsi: [
    ["RSI 14 < 30", "RSI 14 > 70"],
    ["RSI 14 xu hướng lên", "RSI 14 xu hướng xuống"],
  ],
  macd: [
    ["MACD 12 / 26 cắt lên Signal 9", "MACD 12 / 26 cắt xuống Signal 9"],
    ["MACD 12 / 26 > 0", "MACD 12 / 26 < 0"],
    ["Histogram MACD 12 / 26 / 9 tăng so với phiên trước", "Histogram MACD 12 / 26 / 9 giảm so với phiên trước"],
  ],
  stochastic: [
    ["%K 14 làm mượt 3 < 20", "%K 14 làm mượt 3 > 80"],
    ["%K 14 làm mượt 3 cắt lên %D 3", "%K 14 làm mượt 3 cắt xuống %D 3"],
  ],
  cci: [["CCI 20 cắt lên -100", "CCI 20 cắt xuống 100"]],
  mfi: [["MFI 14 cắt lên 20", "MFI 14 cắt xuống 80"]],
  roc: [["ROC 20 cắt lên 5 %", "ROC 20 cắt xuống -5 %"]],
  williams_r: [["Williams %R 14 cắt lên -80", "Williams %R 14 cắt xuống -20"]],
  bollinger: [
    ["Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2", "Giá đóng cửa quay vào dải từ trên Bollinger 20 hệ số 2"],
    ["Giá đóng cửa tăng so với phiên trước", "Giá đóng cửa giảm so với phiên trước"],
    ["Độ rộng Bollinger 20 hệ số 2 thu hẹp", "Độ rộng Bollinger 20 hệ số 2 mở rộng"],
  ],
  donchian: [["Giá đóng cửa > dải trên Donchian 20", "Giá đóng cửa < dải dưới Donchian 20"]],
  dmi: [
    ["DMI 14 : +DI cắt lên −DI", "DMI 14 : +DI cắt xuống −DI"],
    ["ADX 14 > 25", "ADX 14 > 25"],
  ],
  obv: [
    ["OBV cắt lên SMA 20 của OBV", "OBV cắt xuống SMA 20 của OBV"],
    ["OBV vượt đỉnh 20 phiên", "OBV phá đáy 20 phiên"],
  ],
  cmf: [["CMF 20 cắt lên 0", "CMF 20 cắt xuống 0"]],
}

describe("row sentences", () => {
  it.each(Object.entries(GOLDEN))("%s reads its default rows exactly as the spec, Mua and Bán", (id, rows) => {
    const indicator = rowsIndicator(id, registry)
    expect(indicator.rows.map((row) => rowSentence(row, row.buy))).toEqual(rows.map(([buy]) => buy))
    expect(indicator.rows.map((row) => rowSentence(row, row.sell))).toEqual(rows.map(([, sell]) => sell))
  })

  it("shows numbers exactly as stored and a missing value as ?", () => {
    const cmf = rowsIndicator("cmf", registry).rows[0]!
    expect(rowSentence(cmf, { period: 20, op: "cross_up", threshold: -0.05 })).toBe("CMF 20 cắt lên -0.05")
    expect(rowSentence(cmf, { period: 20, op: "cross_up" })).toBe("CMF 20 cắt lên ?")
  })

  it("splits a sentence into fixed text and field slots in order", () => {
    expect(sentenceParts("MACD {fast} / {slow} {op} Signal {signal}")).toEqual([
      { text: "MACD " }, { field: "fast" }, { text: " / " }, { field: "slow" }, { text: " " }, { field: "op" }, { text: " Signal " }, { field: "signal" },
    ])
  })

  it("counts the rows that are on and states the AND", () => {
    expect(enabledCountText([{ enabled: true }, { enabled: false }, { enabled: true }])).toBe("2/3 điều kiện được bật · Các điều kiện đang bật phải đồng thời thỏa mãn")
    expect(enabledCountText([{ enabled: true }])).toBe("1/1 điều kiện được bật")
  })
})

describe("Volume rule labels", () => {
  const volume = registry.find((entry) => entry.id === "volume") as ParamsIndicator

  it("renders the volume threshold from the side's multiplier and look-back", () => {
    expect(ruleLine(volume.buy.rules[0]!, ">", volume, { lookback: 20, mult: 1.5 })).toBe("Giá đóng cửa > Giá đóng cửa phiên trước")
    expect(ruleLine(volume.buy.rules[1]!, ">", volume, { lookback: 20, mult: 1.5 })).toBe("Khối lượng > 1,5 × TB 20 phiên")
  })

  it("never prints a raw key or a blank for a half-typed param", () => {
    expect(operandLabel({ kind: "series", key: "threshold" }, volume, { lookback: undefined, mult: 1 })).toBe("1 × TB — phiên")
  })

  it("names stored operator codes in Vietnamese", () => {
    expect(ruleOpLabel("cross_up")).toBe("cắt lên")
    expect(ruleOpLabel("reenter_lower")).toBe("quay vào dải từ dưới")
    expect(ruleOpLabel("break_high")).toBe("vượt đỉnh")
    expect(ruleOpLabel(">")).toBe(">")
  })
})
