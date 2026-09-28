import { describe, expect, it } from "vitest"

import { adaptPaginated, type PaymentBrief } from "./api"
import { paymentStatusLabel, paymentTone } from "./display"

describe("admin revenue pagination adapter", () => {
  it("normalizes camelCase page metadata and null items", () => {
    expect(adaptPaginated({ items: null, total: 0, page: 1, pageSize: 50, totalPages: 0 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 0,
    })
  })

  it("supports data payloads and derives missing totals", () => {
    expect(adaptPaginated({ data: ["a", "b"], page: 2, page_size: 1 })).toEqual({
      items: ["a", "b"],
      total: 2,
      page: 2,
      page_size: 1,
      total_pages: 2,
    })
  })

  it("represents the canonical partial refund state and money", () => {
    const row: PaymentBrief = {
      id: "order-1", invoice_number: "IQX_1", amount_vnd: 99000,
      refunded_amount_vnd: 24000, currency: "VND", status: "partially_refunded",
      grant_type: "payment", paid_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z", plan_id: "plan-1",
      plan_name: "Hàng tháng", plan_code: "MONTHLY", user_id: "user-1",
      user_email: "user@example.test", ipn_log_count: 1,
    }
    expect(row.refunded_amount_vnd).toBe(24000)
    expect(paymentStatusLabel(row.status)).toBe("Đã hoàn tiền một phần")
    expect(paymentTone(row.status)).toBe("danger")
  })
})
