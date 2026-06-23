import React from "react"
import { render, screen } from "@testing-library/react"
import { IndicatorInfoPopover } from "./IndicatorInfoPopover"

it("renders the trigger child", () => {
  render(
    <IndicatorInfoPopover indicatorId="rsi_14" label="RSI 14">
      <button>info</button>
    </IndicatorInfoPopover>,
  )
  expect(screen.getByText("info")).toBeInTheDocument()
})

it("unknown indicator: passthrough — trigger renders, no popover wrapper side-effects", () => {
  render(
    <IndicatorInfoPopover indicatorId="nope" label="X">
      <button>t</button>
    </IndicatorInfoPopover>,
  )
  expect(screen.getByText("t")).toBeInTheDocument()
})
