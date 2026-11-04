import { describe, expect, it } from "vitest"

import { clockCue, sellOutcome } from "./flashback-sound"

/** Chạy đồng hồ từ `from` xuống `to` giây, mỗi lần `step` giây, gom các âm báo. */
function run(from: number, to: number, step = 1) {
  const cues: string[] = []
  let previous: number | null = from
  for (let seconds = from - step; seconds >= to; seconds -= step) {
    const cue = clockCue(previous, seconds)
    if (cue) cues.push(cue.voice ?? cue.effect ?? "")
    previous = seconds
  }
  return cues
}

describe("clockCue: giọng đọc và tick theo đồng hồ", () => {
  it("ván 6 phút đọc đủ các mốc phút, 30 giây, tick 10 giây cuối, đếm 5-4-3-2-1 rồi hết giờ", () => {
    expect(run(360, 0)).toEqual([
      "left-5m",
      "left-4m",
      "left-3m",
      "left-2m",
      "left-1m",
      "left-30s",
      "tick",
      "tick",
      "tick",
      "tick",
      "tick",
      "count-5",
      "count-4",
      "count-3",
      "count-2",
      "count-1",
      "time-up",
    ])
  })

  it("lần đo đầu tiên (mở trang giữa ván) không đọc bù mốc đã qua", () => {
    expect(clockCue(null, 179)).toBeNull()
    expect(clockCue(null, 3)).toBeNull()
  })

  it("nhảy cóc nhiều giây (máy ngủ, tab ẩn) thì không đọc mốc đã trôi qua lâu và không đếm ngược sai", () => {
    expect(clockCue(400, 100)).toBeNull()
    expect(clockCue(20, 4)).toBeNull()
    expect(clockCue(300, 0)).toBeNull()
  })

  it("đồng hồ đứng yên hoặc tăng lên (server chỉnh giờ) thì im lặng", () => {
    expect(clockCue(120, 120)).toBeNull()
    expect(clockCue(100, 130)).toBeNull()
  })
})

describe("sellOutcome: bán là chốt lời hay cắt lỗ", () => {
  const positions = [
    { qty: 100, price: "20000" },
    { qty: 100, price: "22000" },
  ]
  it("tiền thu về sau phí, thuế cao hơn giá vốn bình quân là chốt lời", () => {
    expect(sellOutcome(positions, { qty: 100, amount: "2300000", fee: "3450", tax: "2300" })).toBe("profit")
  })
  it("thấp hơn giá vốn là cắt lỗ", () => {
    expect(sellOutcome(positions, { qty: 100, amount: "2000000", fee: "3000", tax: "2000" })).toBe("loss")
  })
  it("không có vị thế trước lệnh thì không xác định", () => {
    expect(sellOutcome([], { qty: 100, amount: "2000000", fee: "0", tax: "0" })).toBe("flat")
  })
})
