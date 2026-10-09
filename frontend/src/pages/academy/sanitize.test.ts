import { describe, expect, it } from "vitest"

import { sanitizeLessonHtml } from "./sanitize"

function dom(html: string, mode?: "flow" | "inline") {
  const container = document.createElement("div")
  container.innerHTML = sanitizeLessonHtml(html, mode)
  return container
}

describe("sanitizeLessonHtml", () => {
  it("keeps prose, emphasis, sub/sup and the formula classes", () => {
    const out = dom(
      '<p>Giá trị <strong>G</strong><sub>t</sub> và x<sup>2</sup></p><div class="formula-group"><div class="math-eq">RS = <span class="frac"><span>G</span><span>D</span></span></div></div><div class="formula">α = 2/(N+1)<br/>EMA</div>',
    )
    expect(out.querySelector("strong")?.textContent).toBe("G")
    expect(out.querySelector("sub")?.textContent).toBe("t")
    expect(out.querySelector("sup")?.textContent).toBe("2")
    expect(out.querySelector(".formula-group .math-eq .frac > span:first-child")?.textContent).toBe("G")
    expect(out.querySelector(".formula br")).not.toBeNull()
  })

  it("keeps < > ∈ ∉ & as literal text, never as markup", () => {
    const out = dom("<p>RSI &lt; 30 và RSI &gt; 70; giá ∈ dải, giá ∉ dải; A &amp; B; 5 < 6 và 7 > 2</p>")
    expect(out.textContent).toBe("RSI < 30 và RSI > 70; giá ∈ dải, giá ∉ dải; A & B; 5 < 6 và 7 > 2")
    expect(out.querySelector("p")?.children).toHaveLength(0)
    // The serialised form escapes them, so they cannot open a tag when injected.
    expect(sanitizeLessonHtml("<p>a &lt;b&gt; c</p>")).toContain("&lt;b&gt;")
  })

  it("drops scripts, styles, frames, forms, images, event handlers and inline styles", () => {
    const out = dom(
      '<p onclick="steal()" style="color:red" class="evil formula">ok</p><script>alert(1)</script><style>p{display:none}</style><iframe src="x"></iframe><img src=x onerror=alert(1)><form><input value="a"><button>b</button></form><a href="javascript:alert(1)">link</a><svg><circle/></svg>',
    )
    expect(out.innerHTML).toBe('<p class="formula">ok</p>link')
    expect(out.querySelector("script,style,iframe,img,form,input,button,svg,a")).toBeNull()
    expect(out.querySelector("[onclick],[style],[href]")).toBeNull()
  })

  it("removes the old chart-mount placeholders and unknown classes", () => {
    const out = dom('<div class="chart-mount" id="x">chart</div><p class="mystery good">Đạt</p>')
    expect(out.querySelector(".chart-mount")).toBeNull()
    expect(out.querySelector("p")?.className).toBe("good")
  })

  it("unwraps unknown elements and keeps their text", () => {
    expect(dom("<custom-tag>giữ <b>chữ</b></custom-tag>").innerHTML).toBe("giữ <b>chữ</b>")
  })

  it("puts every table in a focusable scroll region, once", () => {
    const bare = dom("<table><thead><tr><th scope='col'>Cột</th></tr></thead><tbody><tr><td colspan='2'>a</td></tr></tbody></table>")
    const region = bare.querySelector('[role="region"]')
    expect(region?.getAttribute("tabindex")).toBe("0")
    expect(region?.querySelector("table")).not.toBeNull()
    expect(bare.querySelector("td")?.getAttribute("colspan")).toBe("2")

    const wrapped = dom('<div class="table-wrap"><table><tr><td>x</td></tr></table></div>')
    expect(wrapped.querySelectorAll('[role="region"]')).toHaveLength(1)
    expect(wrapped.querySelector(".table-wrap")?.getAttribute("tabindex")).toBe("0")
  })

  it("inline mode keeps only inline formatting for table cells", () => {
    const out = dom('<p>a <b>b</b><sub>1</sub> &lt; c</p><div class="math-eq">x</div><script>1</script>', "inline")
    expect(out.innerHTML).toBe("a <b>b</b><sub>1</sub> &lt; cx")
  })
})
