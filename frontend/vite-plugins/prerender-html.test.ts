import { describe, expect, it } from "vitest"

import { collectAssets, injectPage } from "./prerender-html"

const template = `<!doctype html>
<html lang="vi">
  <head>
    <title>Old</title>
    <meta name="description" content="old" />
    <script type="module" crossorigin src="/assets/index-a.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

describe("injectPage", () => {
  const page = injectPage({
    template,
    html: "<main>Hi $& there</main>",
    head: { lang: "en", theme: "light", title: 'A & "B"', description: "desc <x>" },
    path: "/about",
    assets: { css: ["assets/a.css"], js: ["assets/index-a.js", "assets/about.js"] },
  })
  it("rewrites lang, theme, title and description", () => {
    expect(page).toContain('<html lang="en" class="light"')
    expect(page).toContain("<title>A &amp; &quot;B&quot;</title>")
    expect(page).toContain('content="desc &lt;x&gt;"')
  })
  it("replaces the root and keeps replacement text literal", () => {
    expect(page).toContain('<div id="root" data-ssr="/about"><main>Hi $& there</main></div>')
  })
  it("adds only assets missing from the template", () => {
    expect(page).toContain('href="/assets/a.css"')
    expect(page).toContain('rel="modulepreload" crossorigin href="/assets/about.js"')
    expect(page).not.toContain('modulepreload" crossorigin href="/assets/index-a.js"')
  })
})

describe("collectAssets", () => {
  it("walks imports transitively", () => {
    const manifest = {
      "index.html": { file: "assets/i.js", css: ["assets/i.css"] },
      "r.tsx": { file: "assets/r.js", imports: ["c.ts"] },
      "c.ts": { file: "assets/c.js", css: ["assets/c.css"] },
    }
    expect(collectAssets(manifest, "r.tsx")).toEqual({
      css: ["assets/i.css", "assets/c.css"],
      js: ["assets/i.js", "assets/r.js", "assets/c.js"],
    })
  })
})
