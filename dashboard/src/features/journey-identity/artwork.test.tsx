import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CreatureArtwork } from "./artwork/CreatureArtwork"
import { EggArtwork } from "./artwork/EggArtwork"
import type { MascotId } from "./types"

function expectSelfContainedArtwork(container: HTMLElement) {
  expect(container.querySelector("image, img, canvas, foreignObject")).toBeNull()
  const ids = [...container.querySelectorAll("[id]")].map(node => node.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const node of container.querySelectorAll("*")) {
    for (const attribute of ["fill", "stroke", "filter", "clip-path", "mask", "href"]) {
      const value = node.getAttribute(attribute)
      if (!value) continue
      const reference = value.match(/^url\(#(.+)\)$/)?.[1] ?? (attribute === "href" ? value.slice(1) : undefined)
      if (reference) expect(ids).toContain(reference)
      expect(value).not.toMatch(/https?:|data:image|\.(png|jpe?g|webp)/i)
    }
  }
}

describe("production vector artwork contract", () => {
  it.each<MascotId>(["bach_ho", "thanh_long", "loc_huou", "phung_hoang", "kim_quy"])("%s has self-contained drawings and explicit motion pivots", mascotId => {
    const view = render(<svg><CreatureArtwork mascotId={mascotId} idPrefix="first" /><CreatureArtwork mascotId={mascotId} idPrefix="second" /></svg>)
    expectSelfContainedArtwork(view.container)
    const heads = view.container.querySelectorAll('[data-part="head"]')
    expect(heads).toHaveLength(2)
    for (const node of view.container.querySelectorAll('[data-part="head"], [data-part$="-arm"], [data-part$="-wing"], [data-part="tail"], [data-part="sprout"]')) {
      expect(node).toHaveAttribute("data-pivot-x")
      expect(node).toHaveAttribute("data-pivot-y")
      expect(Number.isFinite(Number(node.getAttribute("data-pivot-x")))).toBe(true)
      expect(Number.isFinite(Number(node.getAttribute("data-pivot-y")))).toBe(true)
    }
  })
  it.each([0, 1, 2, 3, 4, 5, 6])("egg level %s has independent shell halves sharing a closed-shell pivot", level => {
    const view = render(<svg><EggArtwork level={level} accent="#bc8feb" idPrefix="first" /><EggArtwork level={level} accent="#bc8feb" idPrefix="second" /></svg>)
    expectSelfContainedArtwork(view.container)
    const top = view.container.querySelector('[data-part="egg-shell-top"]')!
    const bottom = view.container.querySelector('[data-part="egg-shell-bottom"]')!
    expect(top).not.toBe(bottom)
    for (const attribute of ["data-pivot-x", "data-pivot-y"]) {
      expect(top).toHaveAttribute(attribute)
      expect(top.getAttribute(attribute)).toBe(bottom.getAttribute(attribute))
    }
    expect(view.container.querySelector('[data-part="egg-core"]')).toHaveAttribute("opacity", "0")
  })
})
