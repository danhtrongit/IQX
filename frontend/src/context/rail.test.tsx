import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider, useSearchParams } from "react-router"
import { describe, expect, it } from "vitest"
import { demoChrome } from "@/config/chrome"
import { RailProvider, useRail } from "./rail"

function Probe() {
  const { activeId, activeContentId, setActive } = useRail()
  const [params] = useSearchParams()
  return <><output aria-label="state">{JSON.stringify({ activeId, activeContentId, params: Object.fromEntries(params) })}</output>
    <button onClick={() => setActive("insight")}>Insight</button>
    <button onClick={() => setActive("portfolio")}>Danh mục</button>
  </>
}

describe("independent demo content and sidebar", () => {
  it("Insight rail action keeps sidebar selection and its query state", async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: "/demo-trading", handle: { chrome: demoChrome }, element: <RailProvider><Probe /></RailProvider> }], {
      initialEntries: ["/demo-trading?view=trading&content=board&symbol=VNM"],
    })
    render(<RouterProvider router={router} />)
    await user.click(screen.getByText("Insight", { selector: "button" }))
    await waitFor(() => expect(JSON.parse(screen.getByLabelText("state").textContent!)).toMatchObject({ activeId: "trading", activeContentId: "insight", params: { view: "trading", symbol: "VNM", content: "insight" } }))
    await user.click(screen.getByText("Danh mục", { selector: "button" }))
    await waitFor(() => expect(JSON.parse(screen.getByLabelText("state").textContent!)).toMatchObject({ activeId: "portfolio", activeContentId: "insight" }))
  })

  it.each([
    ["/demo-trading", "trading"],
    ["/demo-trading?view=unknown&symbol=FPT", "trading"],
    ["/demo-trading?view=portfolio", "portfolio"],
    ["/demo-trading?view=academy", "academy"],
    ["/demo-trading?view=shop", "shop"],
    // Hidden tools are never active: they fall back to the default tool.
    ["/demo-trading?view=hunt", "trading"],
    // Insight replaces the main area, it is not a panel tool.
    ["/demo-trading?view=insight", "trading"],
  ])("opens %s on the %s tool without locking any tool", (url, expected) => {
    const router = createMemoryRouter([{ path: "/demo-trading", handle: { chrome: demoChrome }, element: <RailProvider><Probe /></RailProvider> }], {
      initialEntries: [url],
    })
    render(<RouterProvider router={router} />)
    expect(JSON.parse(screen.getByLabelText("state").textContent!).activeId).toBe(expected)
  })

  it("selecting a tool only changes the view param", async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: "/demo-trading", handle: { chrome: demoChrome }, element: <RailProvider><Probe /></RailProvider> }], {
      initialEntries: ["/demo-trading?symbol=VNM&content=board"],
    })
    render(<RouterProvider router={router} />)
    await user.click(screen.getByText("Danh mục", { selector: "button" }))
    await waitFor(() => expect(JSON.parse(screen.getByLabelText("state").textContent!)).toMatchObject({ activeId: "portfolio", params: { view: "portfolio", symbol: "VNM", content: "board" } }))
  })
})
