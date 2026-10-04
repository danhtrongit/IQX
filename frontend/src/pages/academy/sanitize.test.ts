import { describe, expect, it } from "vitest"

import { sanitizeLessonHtml } from "./sanitize"

describe("sanitizeLessonHtml", () => {
  it("keeps lesson markup: paragraphs, tables, formula classes and table scope", () => {
    const html = '<p><strong>RSI</strong> đo đà giá.</p><div class="table-wrap"><table><thead><tr><th scope="col">Giá trị</th></tr></thead><tbody><tr><td colspan="2">Trên 50</td></tr></tbody></table></div><div class="formula">RS = G / D</div><span class="frac"><span>100</span><span>1 + RS</span></span>'
    expect(sanitizeLessonHtml(html)).toBe(html)
  })

  it("drops scripts, styles, embeds and event handler / style / href attributes", () => {
    const output = sanitizeLessonHtml('<p onclick="alert(1)" style="color:red">A<script>alert(1)</script></p><style>p{}</style><iframe src="https://x"></iframe><img src=x onerror="alert(1)"><svg><a href="javascript:alert(1)">x</a></svg>')
    expect(output).toBe("<p>A</p>")
  })

  it("unwraps unknown elements but keeps their text, and strips links", () => {
    expect(sanitizeLessonHtml('<p>Xem <a href="javascript:alert(1)">nguồn</a> <custom-tag data-x="1">ở đây</custom-tag></p>'))
      .toBe("<p>Xem nguồn ở đây</p>")
  })

  it("filters classes to the allowlist and removes chart placeholders", () => {
    expect(sanitizeLessonHtml('<div class="formula evil">x</div><div class="chart-mount">chart</div><span class="bg-red-500">y</span>'))
      .toBe('<div class="formula">x</div><span>y</span>')
  })

  it("rejects non-numeric colspan and unknown scope values", () => {
    expect(sanitizeLessonHtml('<table><tbody><tr><th scope="javascript">a</th><td colspan="x">b</td></tr></tbody></table>'))
      .toBe("<table><tbody><tr><th>a</th><td>b</td></tr></tbody></table>")
  })
})
