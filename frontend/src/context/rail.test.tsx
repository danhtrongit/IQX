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
    <button onClick={() => setActive("ai-analysis")}>AI</button>
    <button onClick={() => setActive("portfolio")}>Danh mục</button>
  </>
}

describe("independent demo content and sidebar", () => {
  it("AI rail action keeps sidebar selection and its query state", async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: "/demo-trading", handle: { chrome: demoChrome }, element: <RailProvider><Probe /></RailProvider> }], {
      initialEntries: ["/demo-trading?view=trading&content=board&symbol=VNM"],
    })
    render(<RouterProvider router={router} />)
    await user.click(screen.getByText("AI", { selector: "button" }))
    await waitFor(() => expect(JSON.parse(screen.getByLabelText("state").textContent!)).toMatchObject({ activeId: "trading", activeContentId: "ai-analysis", params: { view: "trading", symbol: "VNM" } }))
    await user.click(screen.getByText("Danh mục", { selector: "button" }))
    await waitFor(() => expect(JSON.parse(screen.getByLabelText("state").textContent!)).toMatchObject({ activeId: "portfolio", activeContentId: "ai-analysis" }))
  })

  it.each([
    ["/demo-trading", "academy"],
    ["/demo-trading?view=journey", "academy"],
    ["/demo-trading?view=identity", "academy"],
    ["/demo-trading?view=unknown&symbol=FPT", "academy"],
    ["/demo-trading?view=shop", "shop"],
    ["/demo-trading?view=hunt", "hunt"],
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
