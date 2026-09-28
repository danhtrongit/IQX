import { describe, expect, it } from "vitest"

import { orderBody, orderRejectionMessage, type PlaceOrderInput } from "./use-trading-orders"

const base: PlaceOrderInput = {
  symbol: "fpt",
  side: "buy",
  method: "market",
  quantity: 100,
  price: 120000,
  level: 6,
  vonBanDau: 100000000,
  journeyPlan: {
    lyDo: "dinh_gia",
    trangThai_luc_dat: "ung_ho",
    vung_mua: 120000,
    phuong_phap_sl_tp: "ho_tro_khang_cu",
    cat_lo: 110000,
    chot_loi: 140000,
    khau_vi: "can_bang",
    muc_tu_tin: 2,
    cach_khoi_luong: "khau_vi_tu_tin",
    conflict_level: "ngai",
  },
}

describe("virtual trading v2 order contract", () => {
  it("distinguishes accepted fills from the persisted rejected-order response", () => {
    expect(orderRejectionMessage({ status: "filled", rejection_reason: null })).toBeNull()
    expect(orderRejectionMessage({ status: "rejected", rejection_reason: "Giá đã cũ" })).toBe("Giá đã cũ")
    expect(orderRejectionMessage({ status: "rejected", rejection_reason: null })).toBe("Lệnh bị từ chối")
  })

  it("sends the cumulative plan atomically and omits market limit price", () => {
    expect(JSON.parse(orderBody(base))).toEqual({
      symbol: "FPT",
      side: "buy",
      order_type: "market",
      quantity: 100,
      journey_plan: base.journeyPlan,
    })
  })

  it("sends a limit price only for a limit order and never adds cap-level POST bodies", () => {
    const body = JSON.parse(orderBody({ ...base, method: "limit", price: 119500 }))
    expect(body.limit_price_vnd).toBe(119500)
    expect(body.journey_plan).toEqual(base.journeyPlan)
    expect(Object.keys(body)).not.toContain("cap0")
    expect(Object.keys(body)).not.toContain("cap7")
    expect(Object.keys(body)).not.toContain("cap8")
  })
})
