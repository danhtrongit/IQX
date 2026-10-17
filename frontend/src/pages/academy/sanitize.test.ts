import { describe, expect, it } from "vitest"

import { sanitizeLessonHtml } from "./sanitize"

function dom(html: string) {
  const container = document.createElement("div")
  container.innerHTML = sanitizeLessonHtml(html)
  return container
}

describe("sanitizeLessonHtml", () => {
  it("keeps the inline allowlist: b, strong, em, br and tone spans", () => {
    const html =
      'Giá <b>tăng</b>, <strong>mạnh</strong>, <em>nhẹ</em><br>dòng mới <span class="tone-pos">lãi</span> <span class="tone-neg">lỗ</span> <span class="tone-warn">chờ</span> <span class="tone-info">xanh</span> <span class="tone-violet">tím</span> <span class="tone-accent">nhấn</span> <span class="tone-strong">đậm</span>'
    expect(sanitizeLessonHtml(html)).toBe(html)
    expect(dom(html).querySelectorAll("span[class^='tone-']")).toHaveLength(7)
  })

  it("keeps < > ∈ & as literal text, never as markup", () => {
    const out = dom("RSI &lt; 30 và RSI &gt; 70; giá ∈ dải; A &amp; B; 5 < 6 và 7 > 2")
    expect(out.textContent).toBe("RSI < 30 và RSI > 70; giá ∈ dải; A & B; 5 < 6 và 7 > 2")
    expect(out.children).toHaveLength(0)
    expect(sanitizeLessonHtml("a &lt;b&gt; c")).toContain("&lt;b&gt;")
  })

  it("drops every class except one tone class on a span, and every attribute", () => {
    const out = dom(
      '<span class="evil tone-pos" style="color:red" onclick="steal()">a</span><b class="tone-neg">b</b><span class="tone-other">c</span>',
    )
    expect(out.innerHTML).toBe('<span class="tone-pos">a</span><b>b</b><span>c</span>')
    expect(out.querySelector("[style],[onclick]")).toBeNull()
  })

  it("drops scripts, frames, forms, images and links but keeps the link text", () => {
    const out = dom(
      '<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><img src=x onerror=alert(1)><form><input value="a"><button>b</button></form><a href="javascript:alert(1)">link</a><svg><circle/></svg>',
    )
    expect(out.innerHTML).toBe("link")
  })

  it("unwraps block and unknown elements, keeping their text", () => {
    expect(sanitizeLessonHtml("<p>a <b>b</b><sub>1</sub></p><div>x</div><custom-tag>y</custom-tag>")).toBe("a <b>b</b>1xy")
  })
})
