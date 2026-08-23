import { describe, expect, it } from "vitest"
import {
  CAP5_WATCH_STATUS_LABEL,
  NOTABLE_MIN_LOP,
  cap5WatchStatus,
  countWatchTabs,
  describeConsensus,
  describeConsensusTrend,
  describeHuntSource,
  lopIconRow,
  lopMark,
  soLopChuaRo,
  soLopDaCham,
  type Cap5WatchlistItem,
} from "./watchlistTypes"

function item(over: Partial<Cap5WatchlistItem> = {}): Cap5WatchlistItem {
  return {
    symbol: "HPG",
    added_at: "2026-08-10T02:00:00Z",
    hunt_filter: "ngoai",
    hunt_signal: "+45,2 tỷ ròng · 4/5 phiên",
    so_phien_tu_khi_san: 2,
    lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "ok" },
    consensus_today: 4,
    consensus_prev: 2,
    consensus_at: "2026-08-18T09:00:00Z",
    ...over,
  }
}

describe("cap5WatchStatus — spec §6.1", () => {
  it("≥4/5 lớp ủng hộ → Đáng chú ý", () => {
    expect(NOTABLE_MIN_LOP).toBe(4)
    expect(cap5WatchStatus(item({ consensus_today: 4 }))).toBe("notable")
    expect(cap5WatchStatus(item({ consensus_today: 5 }))).toBe("notable")
  })

  it("<4 lớp → Đang quan sát", () => {
    expect(cap5WatchStatus(item({ consensus_today: 3 }))).toBe("watching")
    expect(cap5WatchStatus(item({ consensus_today: 0 }))).toBe("watching")
  })

  it("★ CHƯA chấm là trạng thái RIÊNG, không phải «Đang quan sát»", () => {
    expect(cap5WatchStatus(item({ consensus_today: null }))).toBe("chua_cham")
    expect(CAP5_WATCH_STATUS_LABEL.chua_cham).not.toBe(CAP5_WATCH_STATUS_LABEL.watching)
  })
})

describe("soLopChuaRo / describeConsensus — luật «chưa biết ≠ 0»", () => {
  it("đủ 5 lớp → không lớp nào chưa rõ, không cảnh báo", () => {
    expect(soLopChuaRo(item())).toBe(0)
    expect(describeConsensus(item())).toEqual({ text: "4/5", canhBao: null })
  })

  it("★ lớp thiếu / null được ĐẾM là chưa rõ và có cảnh báo kèm «4/5»", () => {
    const i = item({ lop: { ky_thuat: "ok", dong_tien: "ok", tin_tuc: "ok", dinh_gia: null } })
    expect(soLopChuaRo(i)).toBe(2)
    const d = describeConsensus(i)
    expect(d.text).toBe("4/5")
    expect(d.canhBao).toContain("2 lớp chưa có dữ liệu")
  })

  it("★ chưa chấm lần nào → «—/5», KHÔNG phải «0/5»", () => {
    const d = describeConsensus(item({ consensus_today: null, lop: null }))
    expect(d.text).toBe("—/5")
    expect(d.text).not.toContain("0/5")
    expect(d.canhBao).toBe("Chưa chấm 5 lớp cho mã này")
    expect(soLopChuaRo(item({ lop: null }))).toBeNull()
  })

  it("0 lớp ủng hộ THẬT vẫn in 0/5", () => {
    expect(describeConsensus(item({ consensus_today: 0 })).text).toBe("0/5")
  })
})

describe("describeConsensusTrend — spec §6.2", () => {
  it("cải thiện / yếu đi / đi ngang", () => {
    expect(describeConsensusTrend(item({ consensus_prev: 2, consensus_today: 4 }))).toEqual({
      text: "2/5 → 4/5 (cải thiện)",
      tone: "up",
    })
    expect(describeConsensusTrend(item({ consensus_prev: 3, consensus_today: 2 }))).toEqual({
      text: "3/5 → 2/5 (yếu đi)",
      tone: "down",
    })
    expect(describeConsensusTrend(item({ consensus_prev: 2, consensus_today: 2 }))).toEqual({
      text: "2/5 → 2/5 (đi ngang)",
      tone: "flat",
    })
  })

  it("★ thiếu phiên trước → nói thẳng, không vẽ mũi tên từ 0", () => {
    const t = describeConsensusTrend(item({ consensus_prev: null }))
    expect(t.text).toBe("chưa có phiên trước để so")
    expect(t.tone).toBe("unknown")
    expect(t.text).not.toContain("0/5")
  })

  it("★ chưa chấm lần nào → «chưa chấm lần nào»", () => {
    expect(describeConsensusTrend(item({ consensus_today: null })).tone).toBe("unknown")
  })
})

describe("describeHuntSource — spec §6.2", () => {
  it("có bộ lọc + số phiên", () => {
    expect(describeHuntSource(item())).toBe("Săn từ Khối ngoại gom · 2 phiên trước")
  })

  it("★ thiếu số phiên → lùi về NGÀY THÊM thật (vi-VN), không bịa «0 phiên trước»", () => {
    const s = describeHuntSource(item({ so_phien_tu_khi_san: null }))
    expect(s).toContain("Săn từ Khối ngoại gom")
    expect(s).toContain("thêm ngày")
    expect(s).not.toContain("0 phiên trước")
  })

  it("★ mã thêm tay (không bộ lọc) không bị gán cho một bộ lọc bất kỳ", () => {
    const s = describeHuntSource(item({ hunt_filter: null }))
    expect(s).toContain("Thêm tay")
    expect(s).not.toContain("Săn từ")
  })
})

describe("lopMark / lopIconRow", () => {
  it("✅ ủng hộ · ⚠ ngược chiều · ⚪ trung tính · – chưa rõ", () => {
    expect(lopMark("ok")).toBe("✅")
    expect(lopMark("bad")).toBe("⚠")
    expect(lopMark("neu")).toBe("⚪")
    expect(lopMark(null)).toBe("–")
    expect(lopMark(undefined)).toBe("–")
  })

  it("★ lớp chưa rõ KHÔNG được vẽ thành ⚪ (trung tính = đã chấm)", () => {
    expect(lopMark(null)).not.toBe(lopMark("neu"))
  })

  it("cụm icon đúng 5 lớp, đúng thứ tự 🎯 💰 👤 📰 💎", () => {
    const row = lopIconRow(item())
    expect(row.map((r) => r.lop)).toEqual([
      "ky_thuat",
      "dong_tien",
      "noi_bo",
      "tin_tuc",
      "dinh_gia",
    ])
    expect(row.map((r) => r.icon)).toEqual(["🎯", "💰", "👤", "📰", "💎"])
  })
})

describe("countWatchTabs — spec §6.3", () => {
  it("đếm Tất cả / Đáng chú ý", () => {
    expect(
      countWatchTabs([
        item({ consensus_today: 4 }),
        item({ consensus_today: 2 }),
        item({ consensus_today: null }),
      ]),
    ).toEqual({ tatCa: 3, dangChuY: 1 })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   MẪU SỐ THẬT — `consensus_da_cham` (cột BE `watchlist_items`)
   ══════════════════════════════════════════════════════════════════════════
   Nguồn 5 lớp (AI Insight v2) KHÔNG có lớp 💎 Định giá, nên gần như mọi mã chỉ
   chấm được tối đa 4/5 lớp. Vì thế "3 lớp ủng hộ" một mình KHÔNG kết luận được
   là "<4 lớp" — nếu lớp chưa chấm hoá ra ủng hộ thì mã ĐÃ đủ 4. Gọi nó là
   "Đang quan sát" là bịa ra một kết luận chưa từng có (đúng lớp lỗi luật 1).
*/
describe("soLopDaCham — mẫu số thật của điểm đồng thuận", () => {
  it("ưu tiên `consensus_da_cham` do máy chủ gửi", () => {
    expect(soLopDaCham(item({ consensus_da_cham: 4 }))).toBe(4)
  })

  it("thiếu `consensus_da_cham` → đếm các lớp có nhãn trong `lop`", () => {
    expect(soLopDaCham(item({ consensus_da_cham: null }))).toBe(5)
    expect(
      soLopDaCham(item({ consensus_da_cham: null, lop: { ky_thuat: "ok", dong_tien: "bad" } })),
    ).toBe(2)
  })

  it("★ không có nguồn nào → `null` (chưa biết), KHÔNG phải 0", () => {
    expect(soLopDaCham(item({ consensus_da_cham: null, lop: null }))).toBeNull()
  })
})

describe("cap5WatchStatus — vùng CHƯA KẾT LUẬN (spec §6.1 + mẫu số thật)", () => {
  it("★ 3 lớp ủng hộ / mới chấm 4 lớp → «chưa kết luận», KHÔNG phải «Đang quan sát»", () => {
    const i = item({ consensus_today: 3, consensus_da_cham: 4, lop: null })
    expect(cap5WatchStatus(i)).toBe("chua_ket_luan")
    expect(cap5WatchStatus(i)).not.toBe("watching")
  })

  it("3 lớp ủng hộ / đã chấm ĐỦ 5 lớp → «Đang quan sát» (kết luận thật)", () => {
    expect(cap5WatchStatus(item({ consensus_today: 3, consensus_da_cham: 5, lop: null }))).toBe(
      "watching",
    )
  })

  it("2 lớp ủng hộ / mới chấm 4 lớp → «Đang quan sát» (2+1 vẫn < 4)", () => {
    expect(cap5WatchStatus(item({ consensus_today: 2, consensus_da_cham: 4, lop: null }))).toBe(
      "watching",
    )
  })

  it("≥4 lớp ĐÃ xác nhận → «Đáng chú ý» kể cả khi còn lớp chưa chấm", () => {
    expect(cap5WatchStatus(item({ consensus_today: 4, consensus_da_cham: 4, lop: null }))).toBe(
      "notable",
    )
  })

  it("★ không biết đã chấm mấy lớp → «chưa kết luận», không đoán về phía nào", () => {
    const i = item({ consensus_today: 2, consensus_da_cham: null, lop: null })
    expect(cap5WatchStatus(i)).toBe("chua_ket_luan")
    expect(CAP5_WATCH_STATUS_LABEL.chua_ket_luan).not.toBe(CAP5_WATCH_STATUS_LABEL.watching)
    expect(CAP5_WATCH_STATUS_LABEL.chua_ket_luan).not.toBe(CAP5_WATCH_STATUS_LABEL.chua_cham)
  })

  it("«chưa kết luận» KHÔNG được đếm vào tab Đáng chú ý", () => {
    expect(
      countWatchTabs([
        item({ consensus_today: 3, consensus_da_cham: 4, lop: null }),
        item({ consensus_today: 4, consensus_da_cham: 4, lop: null }),
      ]),
    ).toEqual({ tatCa: 2, dangChuY: 1 })
  })
})

describe("describeConsensus — cảnh báo đọc theo `consensus_da_cham`", () => {
  it("★ máy chủ nói mới chấm 4/5 lớp → cảnh báo 1 lớp chưa có dữ liệu", () => {
    const d = describeConsensus(item({ consensus_today: 3, consensus_da_cham: 4, lop: null }))
    expect(d.text).toBe("3/5")
    expect(d.canhBao).toContain("1 lớp chưa có dữ liệu")
  })

  it("đã chấm đủ 5 lớp → không cảnh báo", () => {
    expect(
      describeConsensus(item({ consensus_today: 3, consensus_da_cham: 5, lop: null })).canhBao,
    ).toBeNull()
  })
})

describe("lopIconRow — đọc `lop_chi_tiet` của máy chủ", () => {
  it("`ung_ho` true → ✅", () => {
    const row = lopIconRow(
      item({
        lop: null,
        lop_chi_tiet: [
          { lop: "ky_thuat", ung_ho: true },
          { lop: "dong_tien", ung_ho: false },
          { lop: "noi_bo", ung_ho: null },
          { lop: "tin_tuc", ung_ho: true },
          { lop: "dinh_gia", ung_ho: null },
        ],
      }),
    )
    expect(row.map((r) => r.mark)).toEqual(["✅", "⚪", "–", "✅", "–"])
  })

  it("★ `ung_ho: false` KHÔNG được vẽ thành ⚠ — máy chủ gộp «trung tính» với «ngược chiều»", () => {
    const row = lopIconRow(item({ lop: null, lop_chi_tiet: [{ lop: "ky_thuat", ung_ho: false }] }))
    expect(row[0].mark).toBe("⚪")
    expect(row[0].mark).not.toBe("⚠")
  })

  it("★ lớp VẮNG khỏi `lop_chi_tiet` là chưa rõ («–»), không phải không ủng hộ", () => {
    const row = lopIconRow(item({ lop: null, lop_chi_tiet: [{ lop: "ky_thuat", ung_ho: true }] }))
    expect(row.map((r) => r.mark)).toEqual(["✅", "–", "–", "–", "–"])
  })
})

describe("lopIconRow — `muc` chi tiết thắng `ung_ho` gộp", () => {
  it("`muc: bad` → ⚠ (ngược chiều), `muc: neu` → ⚪", () => {
    const row = lopIconRow(
      item({
        lop: null,
        lop_chi_tiet: [
          { lop: "ky_thuat", ung_ho: false, muc: "bad" },
          { lop: "dong_tien", ung_ho: false, muc: "neu" },
          { lop: "noi_bo", ung_ho: true, muc: "ok" },
        ],
      }),
    )
    expect(row.slice(0, 3).map((r) => r.mark)).toEqual(["⚠", "⚪", "✅"])
  })
})

describe("describeHuntSource — tên bộ lọc của máy chủ", () => {
  it("dùng `hunt_filter_ten` khi máy chủ gửi", () => {
    expect(describeHuntSource(item({ hunt_filter_ten: "Khối ngoại gom (mới)" }))).toContain(
      "Săn từ Khối ngoại gom (mới)",
    )
  })

  it("★ `hunt_filter` null thì KHÔNG nêu nguồn săn dù máy chủ lỡ gửi tên", () => {
    const s = describeHuntSource(item({ hunt_filter: null, hunt_filter_ten: "Khối ngoại gom" }))
    expect(s).toContain("Thêm tay")
    expect(s).not.toContain("Khối ngoại gom")
  })
})
