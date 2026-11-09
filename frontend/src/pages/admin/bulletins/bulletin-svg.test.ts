import { describe, expect, it } from "vitest"

import { sanitizeSvg } from "./bulletin-svg"

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50">${inner}</svg>`

describe("sanitizeSvg", () => {
  it("keeps drawing primitives and the viewBox but drops the fixed size", () => {
    const out = sanitizeSvg(wrap('<rect width="10" height="10" fill="#fff"/><text x="1" y="2">Xin chào</text>'))
    expect(out).toContain('viewBox="0 0 100 50"')
    expect(out).toContain("Xin chào")
    expect(out).not.toMatch(/<svg[^>]*\swidth=/)
    expect(out).not.toMatch(/<svg[^>]*\sheight=/)
  })

  it("removes scripts, foreign objects and event handlers", () => {
    const out = sanitizeSvg(
      wrap('<script>alert(1)</script><foreignObject><div/></foreignObject><rect onclick="x()" width="1" height="1"/>'),
    )
    expect(out).not.toContain("script")
    expect(out.toLowerCase()).not.toContain("foreignobject")
    expect(out).not.toContain("onclick")
    expect(out).toContain("<rect")
  })

  it("keeps https links only", () => {
    const out = sanitizeSvg(
      wrap('<a href="https://iqx.vn/demo-trading?symbol=FPT"><rect width="1" height="1"/></a><a href="javascript:alert(1)"><rect width="1" height="1"/></a>'),
    )
    expect(out).toContain('href="https://iqx.vn/demo-trading?symbol=FPT"')
    expect(out).not.toContain("javascript:")
  })

  it("returns an empty string for anything that is not a well-formed svg", () => {
    expect(sanitizeSvg("<div>không phải svg</div>")).toBe("")
    expect(sanitizeSvg("<svg><rect></svg>")).toBe("")
  })
})
