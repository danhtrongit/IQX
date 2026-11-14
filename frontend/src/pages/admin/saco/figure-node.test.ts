import { Editor, generateHTML, generateJSON } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"

import { Figure, postImagePath } from "./figure-node"

const extensions = [StarterKit, Figure]
const SRC = "/api/v2/trading-floor/post-images/0f2c"

describe("figure node", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("serialises exactly to the contract HTML and parses it back to the same attrs", () => {
    const html = `<figure data-align="left" data-width="35"><img src="${SRC}" alt=""><figcaption>Thanh khoản HOSE</figcaption></figure>`
    const json = generateJSON(html, extensions)
    const figure = json.content?.[0]
    expect(figure).toMatchObject({ type: "figure", attrs: { src: SRC, width: 35, align: "left" } })
    expect(figure?.content?.[0]).toMatchObject({ type: "text", text: "Thanh khoản HOSE" })
    const out = generateHTML(json, extensions)
    expect(out).toBe(html)
    expect(generateJSON(out, extensions)).toEqual(json)
  })

  it("uses the defaults, clamps the width and tolerates a missing caption", () => {
    const json = generateJSON(`<figure data-width="300" data-align="diagonal"><img src="${SRC}"></figure>`, extensions)
    expect(json.content?.[0]).toMatchObject({ type: "figure", attrs: { src: SRC, width: 100, align: "center" } })
    expect(generateHTML(json, extensions)).toBe(`<figure data-align="center" data-width="100"><img src="${SRC}" alt=""><figcaption></figcaption></figure>`)
    const small = generateJSON(`<figure data-width="3"><img src="${SRC}"><figcaption>x</figcaption></figure>`, extensions)
    expect(small.content?.[0]?.attrs?.width).toBe(15)
    const none = generateJSON(`<figure><img src="${SRC}"></figure>`, extensions)
    expect(none.content?.[0]?.attrs).toMatchObject({ width: 60, align: "center" })
  })

  it("ignores a figure without an image", () => {
    const json = generateJSON("<figure><figcaption>chỉ có chữ</figcaption></figure>", extensions)
    expect(json.content?.some((node: { type?: string }) => node.type === "figure")).toBe(false)
  })

  it("inserts uploaded images under the current block with 60% centered", () => {
    editor = new Editor({ extensions, content: "<p>Một</p><p>Hai</p>" })
    editor.commands.setTextSelection(2)
    editor.commands.insertFiguresBelow([`https://iqx.vn${SRC}`, `${SRC}b`])
    expect(editor.getHTML()).toBe(
      `<p>Một</p><figure data-align="center" data-width="60"><img src="${SRC}" alt=""><figcaption></figcaption></figure>`
      + `<figure data-align="center" data-width="60"><img src="${SRC}b" alt=""><figcaption></figcaption></figure><p>Hai</p>`,
    )
  })

  it("keeps only the post-image path of an absolute upload URL", () => {
    expect(postImagePath(`https://iqx.vn${SRC}`)).toBe(SRC)
    expect(postImagePath(SRC)).toBe(SRC)
  })
})
