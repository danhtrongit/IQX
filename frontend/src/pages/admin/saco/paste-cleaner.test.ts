import { describe, expect, it } from "vitest"

import { cleanPastedHtml } from "./paste-cleaner"

describe("cleanPastedHtml", () => {
  it("drops comments, scripts, iframes, styles and Word junk", () => {
    const html = [
      "<!--[if gte mso 9]><xml><w:WordDocument></w:WordDocument></xml><![endif]-->",
      "<style>p.MsoNormal{margin:0}</style>",
      "<script>alert(1)</script>",
      '<iframe src="https://evil.example"></iframe>',
      '<p class="MsoNormal" style="mso-margin-top-alt:auto;font-family:Calibri;font-size:14pt;text-align:center;color:#C00000" lang="vi">',
      'Thanh khoản <b style="mso-bidi-font-weight:normal">tăng</b><o:p></o:p></p>',
      '<p onclick="steal()"><font face="Arial" size="5">Font cũ</font></p>',
    ].join("")
    const out = cleanPastedHtml(html)
    expect(out).not.toMatch(/<!--|<style|<script|<iframe|<xml|o:p|mso-|class=|lang=|onclick|font-family|font-size|<font/i)
    expect(out).toContain('<p style="text-align: center; color: #C00000">Thanh khoản <b>tăng</b></p>')
    expect(out).toContain("<p>Font cũ</p>")
  })

  it("keeps https links and unwraps every other link", () => {
    const out = cleanPastedHtml(
      '<p><a href="https://iqx.vn/x" target="_self" class="x">ok</a> <a href="http://insecure.example">http</a> <a href="javascript:alert(1)">js</a> <a href="/relative">rel</a></p>',
    )
    expect(out).toBe('<p><a href="https://iqx.vn/x">ok</a> http js rel</p>')
  })

  it("drops pasted external images but keeps text, lists and tables", () => {
    const out = cleanPastedHtml(
      '<ul><li>Một</li></ul><p><img src="https://cdn.example/a.png">Ảnh</p><table><tbody><tr><td colspan="2" width="200" style="width:200px">A</td></tr></tbody></table>',
    )
    expect(out).toBe('<ul><li>Một</li></ul><p>Ảnh</p><table><tbody><tr><td colspan="2">A</td></tr></tbody></table>')
  })

  it("keeps the emphasis styles the schema reads and nothing unsafe", () => {
    const out = cleanPastedHtml('<span style="font-weight:700;font-style:italic;background:url(x);color:var(--x)">A</span>')
    expect(out).toBe('<span style="font-weight: 700; font-style: italic">A</span>')
  })
})
