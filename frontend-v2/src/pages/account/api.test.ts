import { describe, expect, it } from "vitest"

import { adaptPremiumOrder, adaptPremiumPlan, adaptPremiumSubscription } from "./api"
import { premiumOrdersPollInterval } from "./hooks"

describe("premium v2 adapters", () => {
  it("keeps a nullable entitlement explicit", () => {
    expect(adaptPremiumSubscription(null)).toEqual({
      isPremium: false,
      isTrial: false,
      status: null,
      plan: null,
      periodStart: null,
      periodEnd: null,
    })
  })

  it("preserves an expired entitlement and its nullable plan", () => {
    const value = adaptPremiumSubscription({
      is_premium: false,
      is_trial: false,
      status: "expired",
      current_plan: null,
      current_period_start: "2026-01-01T00:00:00.000Z",
      current_period_end: "2026-02-01T00:00:00.000Z",
    })
    expect(value.isPremium).toBe(false)
    expect(value.status).toBe("expired")
    expect(value.plan).toBeNull()
    expect(value.periodEnd).toBe("2026-02-01T00:00:00.000Z")
  })

  it("maps server plan money and duration without changing the wire meaning", () => {
    expect(
      adaptPremiumPlan({
        id: "plan-1",
        code: "MONTHLY",
        name: "Hàng tháng",
        description: null,
        price_vnd: 99000,
        duration_days: 30,
        is_active: true,
        sort_order: 1,
      }),
    ).toMatchObject({ id: "plan-1", priceVnd: 99000, durationDays: 30, description: null })
  })

  it("preserves a partially refunded order and the exact refunded amount", () => {
    const raw = {
      id: "order-1",
      invoiceNumber: "IQX_1",
      amount: 99000,
      refundedAmount: 24000,
      currency: "VND",
      status: "partially_refunded",
      planName: "Hàng tháng",
      planCode: "MONTHLY",
      paidAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    expect(adaptPremiumOrder(raw)).toMatchObject({ status: "partially_refunded", amount: 99000, refundedAmount: 24000 })
    expect(adaptPremiumOrder({ ...raw, status: "under_review" }).status).toBe("under_review")
  })

  it("stops a polling session at a terminal order and at its bounded window", () => {
    const paid = {
      id: "order-1",
      invoiceNumber: "IQX_1",
      amount: 99000,
      refundedAmount: 0,
      currency: "VND",
      status: "paid" as const,
      planName: null,
      planCode: null,
      paidAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    const session = { current: null as { key: string; startedAt: number } | null }
    expect(
      premiumOrdersPollInterval([paid], { pollMs: 1000, pollKey: paid.id, userId: "u", now: 0 }, session),
    ).toBe(false)
    const pending = { ...paid, status: "pending" as const }
    expect(
      premiumOrdersPollInterval([pending], { pollMs: 1000, pollKey: pending.id, userId: "u", now: 0 }, session),
    ).toBe(1000)
    expect(
      premiumOrdersPollInterval([pending], { pollMs: 1000, pollKey: pending.id, userId: "u", now: 12_000 }, session),
    ).toBe(false)
  })
})
