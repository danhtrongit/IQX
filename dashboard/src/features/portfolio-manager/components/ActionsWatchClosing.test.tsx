import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { ActionsWatchClosing } from "./ActionsWatchClosing"
import { sampleNarrative } from "../__fixtures__/sample"

describe("ActionsWatchClosing", () => {
  it("renders 3 action rows with their detail text", () => {
    const { container } = render(
      <ActionsWatchClosing
        actions={sampleNarrative.actions}
        watch={sampleNarrative.watch}
        closing={sampleNarrative.closing}
      />,
    )

    const actionEls = container.querySelectorAll(".action")
    expect(actionEls).toHaveLength(3)

    sampleNarrative.actions.forEach((action) => {
      const adEls = Array.from(container.querySelectorAll(".ad"))
      const found = adEls.some((el) => el.textContent === action.detail)
      expect(found).toBe(true)
    })
  })

  it("renders each action detail text as plain text (no dangerouslySetInnerHTML)", () => {
    const { container } = render(
      <ActionsWatchClosing
        actions={sampleNarrative.actions}
        watch={sampleNarrative.watch}
        closing={sampleNarrative.closing}
      />,
    )

    const adEls = container.querySelectorAll(".ad")
    adEls.forEach((el) => {
      // plain text means innerHTML === textContent (no child elements)
      expect(el.innerHTML).toBe(el.textContent)
    })
  })

  it("renders closing text", () => {
    const { container } = render(
      <ActionsWatchClosing
        actions={sampleNarrative.actions}
        watch={sampleNarrative.watch}
        closing={sampleNarrative.closing}
      />,
    )

    const closingEl = container.querySelector(".closing")
    expect(closingEl).not.toBeNull()
    expect(closingEl?.textContent).toBe(sampleNarrative.closing)
  })

  it("renders watch block with label and text", () => {
    const { container } = render(
      <ActionsWatchClosing
        actions={sampleNarrative.actions}
        watch={sampleNarrative.watch}
        closing={sampleNarrative.closing}
      />,
    )

    const watchEl = container.querySelector(".watch")
    expect(watchEl).not.toBeNull()
    expect(watchEl?.querySelector(".wt")?.textContent).toBe(
      "Điều cần theo dõi tới kỳ sau",
    )
    expect(watchEl?.querySelector("p")?.textContent).toBe(sampleNarrative.watch)
  })

  it("renders static signoff and foot", () => {
    const { container } = render(
      <ActionsWatchClosing
        actions={sampleNarrative.actions}
        watch={sampleNarrative.watch}
        closing={sampleNarrative.closing}
      />,
    )

    expect(container.querySelector(".signoff")).not.toBeNull()
    expect(container.querySelector(".foot")).not.toBeNull()
    expect(container.querySelector(".signoff .sn b")?.textContent).toBe(
      "Người quản lý danh mục của bạn",
    )
  })
})
