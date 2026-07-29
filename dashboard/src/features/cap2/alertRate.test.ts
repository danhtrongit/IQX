import { describe, expect, it } from "vitest"
import {
  AUTO_MUTE_CLEAN_ORDERS_THRESHOLD,
  ESCALATION_GREYED_MIN,
  ESCALATION_TYPE_CONFIRM_MIN,
  GREYED_CONFIRM_SECONDS,
  MAX_IMPORTANT_ALERTS_PER_SESSION,
  evaluateAlertRate,
} from "./alertRate"

/** Baseline input where every gate is wide open — every test overrides just
 * the field(s) under test (spec §10 "Giới hạn số cảnh báo"). */
function input(overrides: Partial<Parameters<typeof evaluateAlertRate>[0]> = {}) {
  return {
    importantShownThisSession: 0,
    consecutiveCleanOrders: 0,
    timesThisViolationShown: 1,
    ...overrides,
  }
}

describe("evaluateAlertRate (spec §10 — Giới hạn số cảnh báo, pure logic)", () => {
  it("allows a normal first-time alert when every gate is open", () => {
    expect(evaluateAlertRate(input())).toEqual({ allow: true, level: "thuong" })
  })

  describe("≤2 important alerts per phiên", () => {
    it("still allows the 2nd alert of the session (1 already shown)", () => {
      const result = evaluateAlertRate(input({ importantShownThisSession: 1 }))
      expect(result.allow).toBe(true)
    })

    it("blocks once 2 important alerts already shown this session", () => {
      const result = evaluateAlertRate(input({ importantShownThisSession: 2 }))
      expect(result.allow).toBe(false)
      expect(result.reason).toBeTruthy()
    })

    it(`MAX_IMPORTANT_ALERTS_PER_SESSION constant is 2`, () => {
      expect(MAX_IMPORTANT_ALERTS_PER_SESSION).toBe(2)
    })
  })

  describe("auto-mute after 10 consecutive clean orders", () => {
    it("still allows at 9 consecutive clean orders", () => {
      const result = evaluateAlertRate(input({ consecutiveCleanOrders: 9 }))
      expect(result.allow).toBe(true)
    })

    it("auto-mutes (allow=false) at exactly 10 consecutive clean orders", () => {
      const result = evaluateAlertRate(input({ consecutiveCleanOrders: 10 }))
      expect(result.allow).toBe(false)
      expect(result.reason).toBeTruthy()
    })

    it("stays auto-muted beyond 10", () => {
      const result = evaluateAlertRate(input({ consecutiveCleanOrders: 25 }))
      expect(result.allow).toBe(false)
    })

    it(`AUTO_MUTE_CLEAN_ORDERS_THRESHOLD constant is 10`, () => {
      expect(AUTO_MUTE_CLEAN_ORDERS_THRESHOLD).toBe(10)
    })
  })

  describe("escalation by timesThisViolationShown", () => {
    it("lần 1 → thuong", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 1 })).level).toBe("thuong")
    })

    it("lần 2 → thuong", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 2 })).level).toBe("thuong")
    })

    it("lần 3 → greyed5s", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 3 })).level).toBe("greyed5s")
    })

    it("lần 4 → greyed5s", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 4 })).level).toBe("greyed5s")
    })

    it("lần 5 → typeToConfirm", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 5 })).level).toBe("typeToConfirm")
    })

    it("lần 9 (well past 5) → still typeToConfirm", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 9 })).level).toBe("typeToConfirm")
    })

    it("lần 0 (never shown before) defaults to thuong", () => {
      expect(evaluateAlertRate(input({ timesThisViolationShown: 0 })).level).toBe("thuong")
    })

    it("exposes the escalation boundaries as named constants (no magic numbers)", () => {
      expect(ESCALATION_GREYED_MIN).toBe(3)
      expect(ESCALATION_TYPE_CONFIRM_MIN).toBe(5)
      expect(GREYED_CONFIRM_SECONDS).toBe(5)
    })
  })

  describe("level is still reported even when a gate blocks the alert", () => {
    it("auto-muted at lần 5 still reports level typeToConfirm alongside allow=false", () => {
      const result = evaluateAlertRate(
        input({ consecutiveCleanOrders: 10, timesThisViolationShown: 5 }),
      )
      expect(result).toEqual({
        allow: false,
        level: "typeToConfirm",
        reason: expect.any(String),
      })
    })

    it("session cap reached at lần 4 still reports level greyed5s alongside allow=false", () => {
      const result = evaluateAlertRate(
        input({ importantShownThisSession: 2, timesThisViolationShown: 4 }),
      )
      expect(result.allow).toBe(false)
      expect(result.level).toBe("greyed5s")
    })
  })
})
