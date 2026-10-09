// @vitest-environment node
import { describe, expect, it } from "vitest"

import { render } from "./entry-server"

describe("SSR entry", () => {
  it("renders the introduction page content on the server", async () => {
    const result = await render({ url: "http://iqx.test/" })
    expect(result.status).toBe(200)
    expect(result.html).toContain("Tập đầu tư có hệ thống")
    expect(result.head.lang).toBe("vi")
    expect(result.html).not.toContain('<template id="B:')
  })

  it("renders the about page content on the server", async () => {
    const result = await render({ url: "http://iqx.test/about" })
    expect(result.status).toBe(200)
    expect(result.html).toContain("About IQX")
    expect(result.html).toContain("0319077430")
    expect(result.head.lang).toBe("en")
    expect(result.html).not.toContain('<template id="B:')
  })
})
