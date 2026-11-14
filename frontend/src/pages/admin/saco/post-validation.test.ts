import { describe, expect, it } from "vitest"

import { headlineCounter, isBodyEmpty, POST_ERRORS, validateImageFile, validatePost } from "./post-validation"

describe("headline counter", () => {
  it("counts trimmed characters and turns red over 90", () => {
    expect(headlineCounter("")).toEqual({ label: "0/90", over: false })
    expect(headlineCounter("  Thanh khoản HOSE  ")).toEqual({ label: "16/90", over: false })
    expect(headlineCounter("a".repeat(90))).toEqual({ label: "90/90", over: false })
    expect(headlineCounter("ă".repeat(91))).toEqual({ label: "91/90", over: true })
  })
})

describe("validatePost", () => {
  const body = "<p>Dòng tiền vào nhóm ngân hàng.</p>"

  it("reports the three spec messages in order", () => {
    expect(validatePost({ headline: "   ", bodyHtml: body })).toBe("Cần nhập câu tiêu điểm")
    expect(validatePost({ headline: "x".repeat(91), bodyHtml: body })).toBe("Câu tiêu điểm tối đa 90 ký tự")
    expect(validatePost({ headline: "VN-Index giữ 1.250", bodyHtml: "<p></p><p> </p>" })).toBe("Nội dung bài đang trống")
    expect(validatePost({ headline: "VN-Index giữ 1.250", bodyHtml: body })).toBeNull()
  })

  it("treats an image-only body as content", () => {
    expect(isBodyEmpty('<figure data-align="center" data-width="60"><img src="/api/v2/trading-floor/post-images/1" alt=""><figcaption></figcaption></figure>')).toBe(false)
    expect(isBodyEmpty("")).toBe(true)
    expect(isBodyEmpty("<p> </p>")).toBe(true)
  })
})

describe("validateImageFile", () => {
  it("accepts JPG, PNG and WebP up to 5 MB", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 5 * 1024 * 1024 })).toBeNull()
    expect(validateImageFile({ type: "image/webp", size: 10 })).toBeNull()
    expect(validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe(POST_ERRORS.imageTooLarge)
    expect(validateImageFile({ type: "image/gif", size: 10 })).toBe(POST_ERRORS.imageType)
  })
})
