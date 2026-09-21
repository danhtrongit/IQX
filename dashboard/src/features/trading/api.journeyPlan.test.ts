import { beforeEach, describe, expect, it, vi } from "vitest"

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock("@/shared/http/client", () => ({
  api: { get, post },
}))

import { tradingApi, type VTJourneyPlanInput } from "./api"

const response = {
  id: "order-1",
  symbol: "VNM",
  side: "BUY",
  order_type: "market",
  quantity: 300,
  filled_price_vnd: 62_500,
  gross_amount_vnd: 18_750_000,
  fee_vnd: 28_125,
  status: "FILLED",
  journey_plan_saved_levels: [1, 2, 3],
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  post.mockReturnValue({ json: () => Promise.resolve(response) })
})

describe("tradingApi journey_plan", () => {
  it("sends the inherited Cấp 1–3 plan in the order transaction", async () => {
    const journeyPlan: VTJourneyPlanInput = {
      lyDo: "ky_thuat",
      trangThai_luc_dat: "ung_ho",
      vung_mua: 62_400,
      phuong_phap_sl_tp: "bien_do_dao_dong",
      cat_lo: 60_000,
      chot_loi: 68_000,
      khau_vi: "can_bang",
      muc_tu_tin: 3,
      cach_khoi_luong: "khau_vi_tu_tin",
      nhoi_lenh_alert_id: "alert-buy-42",
    }

    const order = await tradingApi.buyMarket("VNM", 300, journeyPlan)

    expect(post).toHaveBeenCalledWith("virtual-trading/orders", {
      json: {
        symbol: "VNM",
        side: "buy",
        order_type: "market",
        quantity: 300,
        journey_plan: journeyPlan,
      },
    })
    expect(order.journeyPlanSavedLevels).toEqual([1, 2, 3])
  })

  it("does not attach a journey plan to SELL", async () => {
    post.mockReturnValueOnce({
      json: () =>
        Promise.resolve({
          ...response,
          side: "SELL",
          exit_matched_buy_order_id: "buy-42",
          journey_plan_saved_levels: [],
        }),
    })
    const order = await tradingApi.sellMarket("VNM", 100)
    expect(post).toHaveBeenCalledWith("virtual-trading/orders", {
      json: { symbol: "VNM", side: "sell", order_type: "market", quantity: 100 },
    })
    expect(order.exitMatchedBuyOrderId).toBe("buy-42")
  })

  it("keeps the active BUY-plan anchors returned with a holding", async () => {
    get.mockReturnValueOnce({
      json: () =>
        Promise.resolve({
          account: { cash_available_vnd: 10_000_000 },
          nav_vnd: 20_000_000,
          total_unrealized_pnl_vnd: 500_000,
          return_pct: 2.5,
          positions: [
            {
              symbol: "vnm",
              quantity_total: 300,
              avg_cost_vnd: 60_000,
              current_price_vnd: 62_000,
              market_value_vnd: 18_600_000,
              unrealized_pnl_vnd: 600_000,
              active_plan_buy_order_id: "buy-42",
              active_original_stop_vnd: 57_000,
              active_original_take_profit_vnd: 68_000,
              active_dynamic_stop_vnd: 61_000,
            },
          ],
        }),
    })

    const portfolio = await tradingApi.getPortfolio()
    expect(portfolio.positions[0]).toEqual(
      expect.objectContaining({
        symbol: "VNM",
        activePlanBuyOrderId: "buy-42",
        activeOriginalStop: 57_000,
        activeOriginalTakeProfit: 68_000,
        activeDynamicStop: 61_000,
      }),
    )
  })
})
