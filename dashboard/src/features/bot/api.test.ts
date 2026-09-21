import { describe, expect, it } from "vitest"
import { adaptBotJournal, adaptBotOverview, adaptBotPerformance, adaptBotPositions } from "./api"

const disclosure = "Bot demo IQX mô phỏng mua và bán theo giá đóng cửa của chính phiên tạo tín hiệu. Kết quả không tái hiện đầy đủ khả năng khớp lệnh, thanh khoản và thời gian thanh toán của giao dịch thực tế. Đây không phải cam kết lợi nhuận hoặc khuyến nghị giao dịch tiền thật."

describe("Bot API adapters", () => {
  it("giữ Decimal dạng chuỗi và không dùng GET để tự tạo Bot", () => {
    const result = adaptBotOverview({
      eligible: true,
      current_level: 6,
      cap6_graduated_at: "2026-09-08T08:00:00Z",
      disclosure,
      bot: {
        strategy_id: "iqx_standard",
        strategy_version: 1,
        execution_model: "same_session_close",
        initial_cash_vnd: "100000000",
        activated_at: "2026-09-08T08:01:00Z",
      },
      account: {
        cash_vnd: "87990000",
        market_value_vnd: "12000000",
        nav_vnd: "99990000",
        pnl_total_net_vnd: "-10000",
        return_total: "-0.0001",
        valuation_complete: true,
        as_of_session: "2026-09-14",
      },
      bot_run: {
        status: "succeeded",
        latest_run_id: "run-1",
        last_updated_at: "2026-09-14T10:00:00Z",
        processed_unseen_sessions: 1,
        issues: [],
      },
    })
    expect(result.eligible).toBe(true)
    expect(result.bot?.initialCashVnd).toBe("100000000")
    expect(result.account?.navVnd).toBe("99990000")
    expect(result.botRun.status).toBe("succeeded")
  })

  it("thể hiện đúng eligibility trước tốt nghiệp mà không cần bot/account", () => {
    const result = adaptBotOverview({
      eligible: false,
      current_level: 5,
      cap6_graduated_at: null,
      disclosure,
      bot: null,
      account: null,
      bot_run: {
        status: "idle",
        latest_run_id: null,
        last_updated_at: null,
        processed_unseen_sessions: 0,
        issues: [],
      },
    })
    expect(result).toMatchObject({ eligible: false, currentLevel: 5, bot: null, account: null })
  })

  it("giữ các tổng định giá là null khi backend không có đủ giá đóng cửa", () => {
    const result = adaptBotOverview({
      eligible: true,
      current_level: 6,
      cap6_graduated_at: "2026-09-08T08:00:00Z",
      disclosure,
      bot: {
        strategy_id: "iqx_standard",
        strategy_version: 1,
        execution_model: "same_session_close",
        initial_cash_vnd: "100000000",
        activated_at: "2026-09-08T08:01:00Z",
      },
      account: {
        cash_vnd: "87990000",
        market_value_vnd: null,
        nav_vnd: null,
        pnl_total_net_vnd: null,
        return_total: null,
        valuation_complete: false,
        as_of_session: "2026-09-14",
      },
      bot_run: {
        status: "succeeded",
        latest_run_id: "run-1",
        last_updated_at: "2026-09-14T10:00:00Z",
        processed_unseen_sessions: 1,
        issues: [],
      },
    })

    expect(result.account).toMatchObject({
      cashVnd: "87990000",
      marketValueVnd: null,
      navVnd: null,
      pnlTotalNetVnd: null,
      returnTotal: null,
      valuationComplete: false,
    })
  })

  it("đọc danh mục và trạng thái định giá từ response canonical", () => {
    const [position] = adaptBotPositions({
      items: [{
        id: "p-1",
        symbol: "fpt",
        qty: 500,
        entry_price_vnd: "20000",
        current_close_vnd: null,
        market_value_vnd: null,
        weight_pct: null,
        amplitude_at_entry_vnd: "1000",
        amplitude_source_ref: "snapshot-1",
        stop_loss_vnd: "18000",
        take_profit_vnd: "24000",
        unrealized_pnl_net_vnd: null,
        filter_ids: ["ngoai", "kl"],
        opened_session: "2026-09-12",
        sector: null,
      }],
      valuation_complete: false,
      as_of_session: "2026-09-14",
    })
    expect(position).toMatchObject({ symbol: "FPT", qtyOpen: 500, valuationComplete: false })
    expect(position.closePriceVnd).toBeNull()
  })

  it("phân biệt execution đã ghi với quyết định bỏ qua", () => {
    const page = adaptBotJournal({
      items: [
        {
          id: "j-1",
          run_id: "r-1",
          trading_date: "2026-09-14",
          action: "buy",
          reason_code: "bought",
          reason: "Đã mua theo quy tắc",
          execution: {
            id: "e-1",
            side: "buy",
            qty: 500,
            price_vnd: "20000",
            gross_value_vnd: "10000000",
            fee_vnd: "10000",
            tax_vnd: "0",
          },
          symbol: "FPT",
          filter_ids: ["ngoai"],
          supporting_count: 4,
          threshold_vnd: null,
          created_at: "2026-09-14T10:00:00Z",
        },
        {
          id: "j-2",
          run_id: "r-1",
          trading_date: "2026-09-14",
          action: "skip",
          reason_code: "missing_layers",
          reason: null,
          execution: null,
          symbol: "VNM",
          filter_ids: [],
          supporting_count: 2,
          threshold_vnd: null,
          created_at: "2026-09-14T10:01:00Z",
        },
      ],
      next_cursor: "j-2",
      issues: [{ code: "source_error", symbol: null, detail: "Nguồn tạm lỗi" }],
    })
    expect(page.items[0]).toMatchObject({ kind: "execution", qty: 500, priceVnd: "20000" })
    expect(page.items[1]).toMatchObject({ kind: "decision", action: "skip" })
    expect(page.nextCursor).toBe("j-2")
    expect(page.issues).toEqual([{ code: "source_error", symbol: null, detail: "Nguồn tạm lỗi" }])
  })

  it("không điền VN-Index bằng 0 khi comparison không có", () => {
    const result = adaptBotPerformance({
      base: { trading_date: "2026-09-10", bot_nav_vnd: "100000000", vnindex_value: null },
      comparison_available: false,
      series: [{
        trading_date: "2026-09-10",
        cash_vnd: "100000000",
        market_value_vnd: "0",
        nav_vnd: "100000000",
        valuation_complete: true,
        bot_return_since_base: "0",
        vnindex_value: null,
        vnindex_return_since_base: null,
      }],
    })
    expect(result.comparisonAvailable).toBe(false)
    expect(result.vnindexBase).toBeNull()
    expect(result.points[0].vnindexReturn).toBeNull()
  })
})
