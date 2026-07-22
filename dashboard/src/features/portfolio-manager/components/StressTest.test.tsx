import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StressTest } from "./StressTest"

const BETA = 1.25
const NAV = 534000000
const VOICE = "Đây không phải dự báo thị trường sẽ giảm."

describe("StressTest", () => {
  it("renders default d=10: shows −12.5%", () => {
    render(<StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />)
    // d=10: loss = 10 * 1.25 = 12.5 → signedPct(-0.125) = "−12.5%"
    expect(screen.getAllByText("−12.5%").length).toBeGreaterThan(0)
  })

  it("clicking −5.0% button shows −6.3%", async () => {
    const user = userEvent.setup()
    render(<StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />)

    const btn = screen.getByText("VN-Index −5.0%")
    await user.click(btn)

    // d=5: loss = 5 * 1.25 = 6.25 → signedPct(-0.0625) = "−6.3%"
    expect(screen.getAllByText("−6.3%").length).toBeGreaterThan(0)
  })

  it("clicking −15.0% button shows −18.8%", async () => {
    const user = userEvent.setup()
    render(<StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />)

    const btn = screen.getByText("−15.0%")
    await user.click(btn)

    // d=15: loss = 15 * 1.25 = 18.75 → signedPct(-0.1875) = "−18.8%"
    expect(screen.getAllByText("−18.8%").length).toBeGreaterThan(0)
  })

  it("renders manager voice as plain text in .mgr (no dangerouslySetInnerHTML)", () => {
    const { container } = render(
      <StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />,
    )
    const mgr = container.querySelector(".mgr")
    expect(mgr).toBeInTheDocument()
    expect(mgr?.textContent).toBe(VOICE)
    expect(mgr?.innerHTML).not.toContain("<")
  })

  it("default button VN-Index −10.0% has class 'on'", () => {
    const { container } = render(
      <StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />,
    )
    const buttons = container.querySelectorAll(".seg button")
    const onBtn = Array.from(buttons).find((b) => b.classList.contains("on"))
    expect(onBtn).toBeDefined()
    expect(onBtn?.textContent).toBe("−10.0%")
  })

  it("renders .stress-bar with i element having dynamic width", () => {
    const { container } = render(
      <StressTest beta={BETA} nav={NAV} managerVoice={VOICE} topHoldings={[]} />,
    )
    const bar = container.querySelector(".stress-bar i")
    expect(bar).toBeInTheDocument()
    // d=10: loss=12.5, width = min(12.5*4,100) = 50%
    expect((bar as HTMLElement).style.width).toBe("50%")
  })

  it("names the portfolio's actual top holdings in the scenario sentence", async () => {
    render(<StressTest beta={1.25} nav={534_000_000} managerVoice="x" topHoldings={["TCB", "HPG"]} />)
    // default d=10 is rendered; the explanation should reference the real holdings
    expect(screen.getByText(/TCB/)).toBeInTheDocument()
    expect(screen.getByText(/HPG/)).toBeInTheDocument()
  })
})
