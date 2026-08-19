import { describe, expect, it } from "vitest"
import {
  HUNT_FILTERS,
  HUNT_MAX_RESULTS,
  describeHuntTotal,
  huntFilterAvailability,
  huntFilterDef,
  huntFilterLabel,
  splitLocSan,
  type HuntResult,
  type SanMaIndex,
} from "./sanMaTypes"

const DEF = HUNT_FILTERS[0]

function result(over: Partial<HuntResult> = {}): HuntResult {
  return {
    ma: "ngoai",
    kha_dung: true,
    ly_do_chua_kha_dung: null,
    tong_so_ma: 23,
    hien_thi_toi_da: 10,
    loc_san: [],
    items: [{ hang: 1, symbol: "HPG", tin_hieu: "+45,2 tỷ ròng · 4/5 phiên" }],
    ...over,
  }
}

describe("HUNT_FILTERS — 5 bộ lọc đúng mockup/spec §5.3", () => {
  it("đúng 5 bộ lọc, đúng thứ tự mockup", () => {
    expect(HUNT_FILTERS.map((f) => f.ma)).toEqual(["ngoai", "tudoanh", "kl", "dinh", "tang"])
  })

  it("mỗi bộ lọc có đủ icon · tên · mô tả · điều kiện · định nghĩa", () => {
    for (const f of HUNT_FILTERS) {
      expect(f.icon).toBeTruthy()
      expect(f.ten).toBeTruthy()
      expect(f.mo_ta).toBeTruthy()
      expect(f.dieu_kien).toBeTruthy()
      expect(f.dinh_nghia).toBeTruthy()
      expect(f.ghi_chu_top).toBeTruthy()
    }
  })

  it("ngưỡng trong dòng điều kiện đúng spec §5.3", () => {
    const byKey = Object.fromEntries(HUNT_FILTERS.map((f) => [f.ma, f.dieu_kien]))
    expect(byKey.ngoai).toContain("≥3/5 phiên")
    expect(byKey.tudoanh).toContain("≥3/5 phiên")
    expect(byKey.kl).toContain("≥2×")
    expect(byKey.dinh).toContain("đỉnh 20 phiên")
    expect(byKey.tang).toContain("≥3%")
    expect(byKey.tang).toContain("≥1,5×")
  })

  it("hiện tối đa 10 mã", () => {
    expect(HUNT_MAX_RESULTS).toBe(10)
  })
})

describe("huntFilterDef / huntFilterLabel", () => {
  it("tra được bộ lọc có thật", () => {
    expect(huntFilterDef("kl")?.ten).toBe("Khối lượng đột biến")
    expect(huntFilterLabel("dinh")).toBe("Vượt đỉnh 20 phiên")
  })

  it("★ mã lạ/thiếu KHÔNG bị bịa thành một bộ lọc có thật", () => {
    expect(huntFilterDef(null)).toBeUndefined()
    expect(huntFilterLabel(null)).toBeNull()
    expect(huntFilterLabel("khong_ton_tai")).toBeNull()
  })
})

describe("huntFilterAvailability — ba trạng thái, KHÔNG gộp «chưa biết» vào «chạy được»", () => {
  const index: SanMaIndex = {
    loc_san: [],
    bo_loc: [
      { ma: "ngoai", kha_dung: true, ly_do_chua_kha_dung: null },
      { ma: "tudoanh", kha_dung: false, ly_do_chua_kha_dung: "Chưa có dữ liệu tự doanh theo phiên" },
    ],
  }

  it("bộ lọc chạy được", () => {
    expect(huntFilterAvailability(index, "ngoai")).toEqual({ kha_dung: true, ly_do: null })
  })

  it("bộ lọc thiếu dữ liệu trả kèm lý do NGUYÊN VĂN của server", () => {
    expect(huntFilterAvailability(index, "tudoanh")).toEqual({
      kha_dung: false,
      ly_do: "Chưa có dữ liệu tự doanh theo phiên",
    })
  })

  it("★ chưa tải xong → null, KHÔNG phải true", () => {
    expect(huntFilterAvailability(null, "ngoai").kha_dung).toBeNull()
    expect(huntFilterAvailability(undefined, "ngoai").kha_dung).toBeNull()
  })

  it("★ server không nhắc tới bộ lọc → null, KHÔNG phải false", () => {
    expect(huntFilterAvailability(index, "kl").kha_dung).toBeNull()
  })
})

describe("splitLocSan", () => {
  it("tách điều kiện đã áp dụng và chưa áp dụng được", () => {
    expect(
      splitLocSan([
        { ma: "hose", ten: "HOSE", ap_dung: true },
        { ma: "gia", ten: "giá ≥3.000đ", ap_dung: true },
        { ma: "canh_bao", ten: "loại mã diện cảnh báo", ap_dung: false },
      ]),
    ).toEqual({ apDung: ["HOSE", "giá ≥3.000đ"], chuaApDung: ["loại mã diện cảnh báo"] })
  })

  it("danh sách rỗng/thiếu không sinh ra điều kiện nào", () => {
    expect(splitLocSan(null)).toEqual({ apDung: [], chuaApDung: [] })
    expect(splitLocSan(undefined)).toEqual({ apDung: [], chuaApDung: [] })
  })
})

describe("describeHuntTotal — dòng minh bạch", () => {
  it("có tổng thật thì in tổng thật (số en-US)", () => {
    expect(describeHuntTotal(result({ tong_so_ma: 1234 }), DEF)).toBe(
      "1,234 mã HOSE thỏa điều kiện · hiện 1 mã NN mua ròng mạnh nhất",
    )
  })

  it("★ server không đếm được tổng → nói «chưa đếm được», KHÔNG in 0", () => {
    const s = describeHuntTotal(result({ tong_so_ma: null }), DEF)
    expect(s).toContain("Chưa đếm được tổng số mã")
    expect(s).not.toMatch(/\b0 mã HOSE/)
  })

  it("tổng = 0 thật vẫn được in là 0 (đã lọc xong, hôm nay không có mã)", () => {
    expect(describeHuntTotal(result({ tong_so_ma: 0, items: [] }), DEF)).toContain(
      "0 mã HOSE thỏa điều kiện",
    )
  })
})
