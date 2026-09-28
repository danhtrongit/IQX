import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { NarrativeText } from "./narrative-text"

describe("NarrativeText injected-data fallback", () => {
  it("renders an injected plain string without calling map on it", () => {
    const html = renderToStaticMarkup(<NarrativeText fragments={"Nguyên văn" as never} />)
    expect(html).toContain("Nguyên văn")
  })

  it("does not render unsafe objects or non-string fragment content", () => {
    expect(renderToStaticMarkup(<NarrativeText fragments={{ unsafe: true } as never} />)).toBe("<span></span>")
    expect(renderToStaticMarkup(<NarrativeText fragments={[{ type: "text", content: { unsafe: true } }] as never} />))
      .toBe("<span></span>")
  })
})
