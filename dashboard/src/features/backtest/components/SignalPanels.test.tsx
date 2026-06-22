import { render, screen } from "@testing-library/react"
import { BUY_TITLE, SELL_TITLE } from "./SignalPanels"

describe("SignalPanels", () => {
  it("uses simplified Vietnamese headers", () => {
    expect(BUY_TITLE).toBe("▲ ĐIỀU KIỆN MUA")
    expect(SELL_TITLE).toBe("▼ ĐIỀU KIỆN BÁN")
  })
})
