import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import { currentRevisionOf } from "../api"
import { configFieldErrors, fieldErrorFor, lockedCapabilitiesOf, ruleErrorsFor, saveOutcomeFromError, sideOfError } from "./api"

const names: Record<string, string> = { rsi: "RSI", macd: "MACD" }
const nameOf = (id: string) => names[id]

describe("409 REVISION_CONFLICT", () => {
  const error = new ApiError("Cấu hình đã được lưu ở nơi khác.", 409, {
    code: "REVISION_CONFLICT",
    details: [{ field: "expected_revision", current_revision: 7 }],
  })

  it("reads the current revision from details[]", () => {
    expect(currentRevisionOf(error)).toBe(7)
    expect(saveOutcomeFromError(error)).toMatchObject({ ok: false, reason: "conflict", currentRevision: 7, retryable: false })
  })

  it("keeps working when the server sent no details", () => {
    expect(saveOutcomeFromError(new ApiError("Xung đột", 409, { code: "REVISION_CONFLICT" }))).toMatchObject({ reason: "conflict", currentRevision: null })
  })
})

describe("422 CONFIG_INVALID and SIDE_REQUIRED", () => {
  const invalid = new ApiError("Cấu hình không hợp lệ.", 422, {
    code: "CONFIG_INVALID",
    details: [
      { path: "indicators.macd.sell.params.fast", message: "macd Bán: Chu kỳ EMA nhanh phải nhỏ hơn Chu kỳ EMA chậm." },
      { path: "indicators.macd.buy.rules.0", message: "macd Mua: dấu không được phép." },
      { path: "indicators.nope", message: "Chỉ báo không được hỗ trợ: nope." },
    ],
  })

  it("maps each {path, message} to its param field, its rules or neither", () => {
    const outcome = saveOutcomeFromError(invalid)
    expect(outcome).toMatchObject({ ok: false, reason: "invalid", code: "CONFIG_INVALID", retryable: false })
    const errors = configFieldErrors(invalid)
    expect(errors).toHaveLength(3)
    expect(fieldErrorFor(errors, "sell", "fast")).toMatch(/phải nhỏ hơn/)
    expect(fieldErrorFor(errors, "buy", "fast")).toBeNull()
    expect(ruleErrorsFor(errors, "buy").map((entry) => entry.message)).toEqual(["macd Mua: dấu không được phép."])
    expect(ruleErrorsFor(errors, "sell")).toEqual([])
    expect(errors.map(sideOfError)).toEqual(["sell", "buy", null])
  })

  it("SIDE_REQUIRED carries its one message with the indicator path", () => {
    const sideRequired = new ApiError("Chọn ít nhất một phía Mua hoặc Bán trước khi bật chỉ báo rsi.", 422, {
      code: "SIDE_REQUIRED",
      details: [{ path: "indicators.rsi", message: "Chọn ít nhất một phía Mua hoặc Bán trước khi bật chỉ báo rsi." }],
    })
    const outcome = saveOutcomeFromError(sideRequired)
    expect(outcome).toMatchObject({ ok: false, reason: "invalid", code: "SIDE_REQUIRED" })
    expect(!outcome.ok && outcome.reason === "invalid" && outcome.errors).toEqual([{ path: "indicators.rsi", message: sideRequired.message }])
    expect(sideOfError({ path: "indicators.rsi", message: "" })).toBeNull()
  })

  it("tolerates a details object that wraps the list, and malformed items", () => {
    const wrapped = new ApiError("x", 422, { code: "CONFIG_INVALID", details: { errors: [{ path: "indicators.rsi.buy.params.level", message: "Sai" }, null, { path: 3 }] } })
    expect(configFieldErrors(wrapped)).toEqual([{ path: "indicators.rsi.buy.params.level", message: "Sai" }])
    expect(configFieldErrors(new Error("plain"))).toEqual([])
  })
})

describe("403 CAPABILITY_LOCKED", () => {
  const locked = new ApiError("Cần hoàn thành bài học của chỉ báo rsi (8/8) trước khi bật.", 403, {
    code: "CAPABILITY_LOCKED",
    details: [{ capability: "indicator:rsi", reason: "not_learned", indicator: "rsi" }],
  })

  it("names the locked indicator from the details", () => {
    expect(lockedCapabilitiesOf(locked)).toEqual([{ capability: "indicator:rsi", reason: "not_learned", indicator: "rsi" }])
    expect(saveOutcomeFromError(locked, nameOf)).toMatchObject({
      ok: false, reason: "locked", code: "CAPABILITY_LOCKED", retryable: false,
      message: "Hoàn thành bài kiểm tra 8/8 của chỉ báo RSI để bật.",
    })
  })

  it("uses the id when the registry name is unknown, and a generic line without details", () => {
    expect(saveOutcomeFromError(locked)).toMatchObject({ message: "Hoàn thành bài kiểm tra 8/8 của chỉ báo rsi để bật." })
    const bare = new ApiError("Bị khóa", 403, { code: "CAPABILITY_LOCKED" })
    expect(saveOutcomeFromError(bare, nameOf)).toMatchObject({ reason: "locked", message: "Hoàn thành bài kiểm tra 8/8 của chỉ báo này để bật." })
    expect(lockedCapabilitiesOf(new ApiError("x", 403, { code: "OTHER", details: [{ capability: "a" }] }))).toEqual([])
  })
})

describe("other failures", () => {
  it("a network or 5xx failure may have been applied, so it is retryable with the same key", () => {
    expect(saveOutcomeFromError(new ApiError("Mất kết nối", 503))).toMatchObject({ ok: false, reason: "error", retryable: true, message: "Mất kết nối" })
    expect(saveOutcomeFromError(new TypeError("Failed to fetch"))).toMatchObject({ reason: "error", retryable: true })
  })
})
