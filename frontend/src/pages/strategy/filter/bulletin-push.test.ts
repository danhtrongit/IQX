import { describe, expect, it } from "vitest"

import type { PushCandidate, PushContext } from "./bulletin-push-api"
import {
  bulletinBlockReason,
  conditionLines,
  defaultDisplayName,
  defaultSlot,
  initialPicks,
  MAX_BULLETIN_PICKS,
  pushedMessage,
  savedFilterBlockReason,
  togglePick,
} from "./bulletin-push"

const context = (overrides: Partial<PushContext> = {}): PushContext => ({
  trade_date: "2026-11-06",
  status: "draft",
  locked: false,
  slots: [
    { slot: 1, default_name: "Tăng giá mạnh", pushed: null },
    { slot: 2, default_name: null, pushed: null },
    { slot: 3, default_name: null, pushed: null },
  ],
  ...overrides,
})

function candidate(symbol: string, valueBn: number | null, close: number | null = 10): PushCandidate {
  return { symbol, close, change_pct: 1, value_bn: valueBn }
}

describe("savedFilterBlockReason (điều kiện 1 đến 3)", () => {
  it("chặn khi chưa lưu bộ lọc", () => {
    expect(savedFilterBlockReason({ loaded: null, draftSignature: "A", runSignature: "A" })).toBe(
      "Lưu bộ lọc trước khi đẩy vào bản tin. Bản tin dùng bộ lọc đã lưu để ghi nguồn.",
    )
  })

  it("chặn khi điều kiện đã sửa sau lần lưu, kể cả khi không dựng được điều kiện", () => {
    const message = "Điều kiện đã sửa sau lần lưu. Bấm Lưu bộ lọc (lưu thành phiên bản mới), chạy lại rồi đẩy."
    expect(savedFilterBlockReason({ loaded: { signature: "A" }, draftSignature: "B", runSignature: "B" })).toBe(message)
    expect(savedFilterBlockReason({ loaded: { signature: "A" }, draftSignature: null, runSignature: "A" })).toBe(message)
  })

  it("chặn khi điều kiện đã đổi sau lần chạy", () => {
    expect(savedFilterBlockReason({ loaded: { signature: "B" }, draftSignature: "B", runSignature: "A" })).toBe(
      "Điều kiện đã đổi sau lần chạy. Bấm Chạy bộ lọc trước khi đẩy.",
    )
  })

  it("cho qua khi bộ lọc đã lưu, kết quả và điều kiện đang soạn cùng một bản", () => {
    expect(savedFilterBlockReason({ loaded: { signature: "A" }, draftSignature: "A", runSignature: "A" })).toBeNull()
  })

  it("báo điều kiện sớm nhất theo thứ tự 1, 2, 3", () => {
    expect(savedFilterBlockReason({ loaded: null, draftSignature: "B", runSignature: "A" })).toContain("Lưu bộ lọc trước")
    expect(savedFilterBlockReason({ loaded: { signature: "C" }, draftSignature: "B", runSignature: "A" })).toContain("đã sửa sau lần lưu")
  })
})

describe("bulletinBlockReason (điều kiện 4 và 5)", () => {
  it("chặn khi phiên kết quả khác phiên bản tin", () => {
    expect(bulletinBlockReason("2026-11-05", context())).toBe(
      "Kết quả là của phiên 05/11, khác phiên bản tin 06/11. Chạy lại bộ lọc.",
    )
  })

  it("chặn khi bản tin đã Public và khoá danh sách mã", () => {
    expect(bulletinBlockReason("2026-11-06", context({ status: "public", locked: true }))).toBe(
      "Bản tin phiên 06/11/2026 đã Public, danh sách mã đã khoá.",
    )
  })

  it("báo phiên khác trước khi báo đã khoá", () => {
    expect(bulletinBlockReason("2026-11-05", context({ locked: true }))).toContain("khác phiên bản tin")
  })

  it("chặn khi chưa có bản nháp nào", () => {
    expect(bulletinBlockReason("2026-11-06", context({ trade_date: null }))).toContain("Chưa có bản tin nháp")
  })

  it("cho qua khi cùng phiên và chưa khoá", () => {
    expect(bulletinBlockReason("2026-11-06", context())).toBeNull()
  })
})

describe("danh sách chọn", () => {
  const list = [candidate("AAA", 300), candidate("BBB", 200), candidate("CCC", null, null), candidate("DDD", 100)]

  it("tick sẵn phần đã chọn trong bảng, bỏ mã thiếu số liệu", () => {
    expect([...initialPicks(list, new Set(["BBB", "CCC", "ZZZ"]))]).toEqual(["BBB"])
  })

  it("bảng không chọn riêng mã nào thì tick sẵn các mã GTGD lớn nhất, tối đa 10", () => {
    expect([...initialPicks(list, new Set())]).toEqual(["AAA", "BBB", "DDD"])
    const many = Array.from({ length: 14 }, (_, index) => candidate(`S${index}`, 100 - index))
    expect(initialPicks(many, new Set()).size).toBe(MAX_BULLETIN_PICKS)
  })

  it("khoá ở 10 mã: chọn thêm bị bỏ qua, bỏ chọn vẫn được", () => {
    const full = new Set(Array.from({ length: MAX_BULLETIN_PICKS }, (_, index) => `S${index}`))
    expect(togglePick(full, "X", true).has("X")).toBe(false)
    expect(togglePick(full, "S3", false).size).toBe(MAX_BULLETIN_PICKS - 1)
    expect(togglePick(new Set(["A"]), "B", true)).toEqual(new Set(["A", "B"]))
  })
})

describe("điều kiện, tên và ô", () => {
  it("dòng điều kiện cắt theo giới hạn máy chủ và có dòng thay thế khi không có tiêu chí", () => {
    expect(conditionLines([])).toEqual(["Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi"])
    expect(conditionLines([" HOSE ", "", "RSI (2 dòng)"])).toEqual(["HOSE", "RSI (2 dòng)"])
    expect(conditionLines(["x".repeat(300)])[0]).toHaveLength(160)
    expect(conditionLines(Array.from({ length: 30 }, (_, index) => `d${index}`))).toHaveLength(16)
  })

  it("tên hiển thị mặc định là tên đã dùng gần nhất của ô, chưa có thì tên bộ lọc, tối đa 60 ký tự", () => {
    expect(defaultDisplayName(context().slots[0], "Bộ lọc X")).toBe("Tăng giá mạnh")
    expect(defaultDisplayName(context().slots[1], "Bộ lọc X")).toBe("Bộ lọc X")
    expect(defaultDisplayName(undefined, "y".repeat(80))).toHaveLength(60)
  })

  it("chọn sẵn ô đầu tiên chưa đẩy", () => {
    expect(defaultSlot(context())).toBe(1)
    const pushed = { pushed_at: "2026-11-06T09:00:00.000Z", display_name: "a", picks: 3, passed_count: 5 }
    const slots = context().slots.map((slot, index) => (index === 0 ? { ...slot, pushed } : slot))
    expect(defaultSlot({ slots })).toBe(2)
    expect(defaultSlot({ slots: slots.map((slot) => ({ ...slot, pushed })) })).toBe(1)
  })

  it("câu báo thành công đúng spec", () => {
    expect(pushedMessage(4, 2, "2026-11-06")).toBe("Đã đẩy 4 mã vào Bộ lọc 2 của bản tin phiên 06/11/2026.")
  })
})
