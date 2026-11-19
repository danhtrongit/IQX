import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider, useSearchParams } from "react-router"
import { describe, expect, it } from "vitest"
import { flashbackChrome, practiceChrome, type RouteChrome } from "@/config/chrome"
import { RailProvider, useRail } from "./rail"

function Probe() {
  const { activeId, activeContentId, setActive } = useRail()
  const [params] = useSearchParams()
  return <><output aria-label="state">{JSON.stringify({ activeId, activeContentId, params: Object.fromEntries(params) })}</output>
    <button onClick={() => setActive("insight")}>Insight</button>
    <button onClick={() => setActive("bot")}>Bot</button>
  </>
}

function renderRail(chrome: RouteChrome, url: string) {
  const path = url.split("?")[0]
  const router = createMemoryRouter([{ path, handle: { chrome }, element: <RailProvider><Probe /></RailProvider> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

const state = () => JSON.parse(screen.getByLabelText("state").textContent!)

describe("rail selection through the URL", () => {
  it.each([
    ["/luyen-tap", "candle-dojo"],
    ["/luyen-tap?tool=unknown&symbol=FPT", "candle-dojo"],
    ["/luyen-tap?tool=giao-dich&tab=danh-muc", "giao-dich"],
    ["/luyen-tap?tool=hoc-vien", "hoc-vien"],
    ["/luyen-tap?tool=phan-tich", "phan-tich"],
    // Hidden tools are never active: they fall back to the default tool.
    ["/luyen-tap?tool=hunt", "candle-dojo"],
    // Insight replaces the main area, it is not a panel tool.
    ["/luyen-tap?tool=insight", "candle-dojo"],
    // A tool of the other section is not one of this rail.
    ["/luyen-tap?tool=shop", "candle-dojo"],
  ])("opens %s on the %s tool of LUYỆN TẬP", (url, expected) => {
    renderRail(practiceChrome, url)
    expect(state().activeId).toBe(expected)
  })

  it.each([
    ["/flashback", "flashback"],
    ["/flashback?tool=shop", "shop"],
    ["/flashback?tool=bot", "flashback"],
  ])("opens %s on the %s tool of FLASHBACK", (url, expected) => {
    renderRail(flashbackChrome, url)
    expect(state().activeId).toBe(expected)
  })

  it("selecting a tool only changes the tool param", async () => {
    const user = userEvent.setup()
    renderRail(practiceChrome, "/luyen-tap?symbol=VNM&tool=hoc-vien")
    await user.click(screen.getByText("Bot", { selector: "button" }))
    await waitFor(() => expect(state()).toMatchObject({ activeId: "bot", params: { tool: "bot", symbol: "VNM" } }))
  })

  it("a main-area tool goes to `content` and keeps the panel tool", async () => {
    const user = userEvent.setup()
    renderRail(practiceChrome, "/luyen-tap?tool=giao-dich&content=board")
    await user.click(screen.getByText("Insight", { selector: "button" }))
    await waitFor(() => expect(state()).toMatchObject({ activeId: "giao-dich", activeContentId: "insight" }))
  })
})
