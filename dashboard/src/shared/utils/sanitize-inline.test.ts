import { describe, it, expect } from "vitest"
import { sanitizeInline } from "./sanitize-inline"

describe("sanitizeInline", () => {
  it("keeps allowed spans/strong, strips the rest", () => {
    expect(sanitizeInline('<span class="num">1.824</span> ok')).toContain('class="num"')
    expect(sanitizeInline('<script>x()</script><b>no</b>')).toBe("no")
    expect(sanitizeInline('<span class="evil" onclick="x">a</span>')).not.toContain("onclick")
  })

  it("keeps up-text and down-text span classes", () => {
    expect(sanitizeInline('<span class="up-text">+5%</span>')).toContain('class="up-text"')
    expect(sanitizeInline('<span class="down-text">-3%</span>')).toContain('class="down-text"')
  })

  it("keeps strong tags and strips their extra attributes", () => {
    expect(sanitizeInline("<strong>bold</strong>")).toBe("<strong>bold</strong>")
    expect(sanitizeInline('<strong class="x">bold</strong>')).toBe("<strong>bold</strong>")
  })

  it("strips disallowed span classes but keeps inner text", () => {
    expect(sanitizeInline('<span class="danger">text</span>')).toBe("text")
  })

  it("strips all other html tags but keeps inner text", () => {
    expect(sanitizeInline("<div><p>hello</p></div>")).toBe("hello")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeInline("")).toBe("")
  })

  it("passes through plain text unchanged", () => {
    expect(sanitizeInline("plain text")).toBe("plain text")
  })
})
