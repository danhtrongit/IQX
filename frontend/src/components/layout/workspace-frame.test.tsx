import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { demoChrome } from "@/config/chrome"
import { RailProvider } from "@/context/rail"

import { SidebarPanel } from "./sidebar-panel"
import { WorkspaceFrame, WorkspacePanelToggle } from "./workspace-frame"

const media = { matches: false, listeners: new Set<() => void>() }

function setOverlay(matches: boolean) {
  media.matches = matches
  act(() => media.listeners.forEach((listener) => listener()))
}

function Panel() {
  return (
    <SidebarPanel title="Bảng công cụ" description="Mô tả">
      <p>Nội dung panel</p>
    </SidebarPanel>
  )
}

function renderFrame(initialPanelOpen = false, url = "/demo-trading", phoneRail?: "column" | "bar") {
  const router = createMemoryRouter(
    [
      {
        path: "/demo-trading",
        handle: { chrome: demoChrome },
        element: (
          <RailProvider>
            <WorkspaceFrame
              panelLabel="Bảng công cụ"
              defaultPanelOpen={initialPanelOpen}
              phoneRail={phoneRail}
              main={<div><WorkspacePanelToggle /><p>Nội dung chính</p></div>}
              panel={<Panel />}
            />
          </RailProvider>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

/** A frame whose panel can be left out and brought back from the main area. */
function HiddenHarness({ initiallyHidden, defaultPanelOpen }: { initiallyHidden: boolean; defaultPanelOpen: boolean }) {
  const [hidden, setHidden] = useState(initiallyHidden)
  return (
    <RailProvider>
      <WorkspaceFrame
        panelLabel="Bảng công cụ"
        defaultPanelOpen={defaultPanelOpen}
        panelHidden={hidden}
        main={<div><button type="button" onClick={() => setHidden((value) => !value)}>Đổi panel</button><p>Nội dung chính</p></div>}
        panel={<Panel />}
      />
    </RailProvider>
  )
}

function renderHidden(initiallyHidden = true, defaultPanelOpen = false) {
  const router = createMemoryRouter(
    [{ path: "/demo-trading", handle: { chrome: demoChrome }, element: <HiddenHarness initiallyHidden={initiallyHidden} defaultPanelOpen={defaultPanelOpen} /> }],
    { initialEntries: ["/demo-trading"] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const rail = () => screen.getByRole("navigation", { name: "Công cụ theo trang" })
const tool = (name: string) => within(rail()).getByRole("button", { name })
const panel = () => screen.getByRole("complementary", { name: "Bảng công cụ", hidden: true })
const frame = () => screen.getByTestId("workspace-frame")
const toggle = () => screen.queryByRole("button", { name: "Bảng công cụ", expanded: false }) ?? screen.queryByRole("button", { name: "Bảng công cụ", expanded: true })

beforeEach(() => {
  media.matches = false
  media.listeners = new Set()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 900px)" && media.matches,
    media: query,
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("WorkspaceFrame on wide screens", () => {
  it("shows main, the panel and the rail together with no toggle or close button", async () => {
    renderFrame()
    await screen.findByText("Nội dung chính")
    expect(screen.getByRole("complementary", { name: "Bảng công cụ" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Công cụ theo trang" })).toBeTruthy()
    expect(toggle()).toBeNull()
    expect(screen.queryByRole("button", { name: "Đóng công cụ" })).toBeNull()
    expect(frame().getAttribute("data-panel-open")).toBe("false")
  })

  it("lists the route's visible rail tools without the hidden ones", async () => {
    renderFrame()
    const nav = await screen.findByRole("navigation", { name: "Công cụ theo trang" })
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Đặt lệnh", "Danh mục", "Tin tức", "Insight", "Dashboard phân tích", "Học viện", "Bot", "Shop", "Flashback",
    ])
  })

  it("shows the panel, so only the active panel tool is pressed and expanded", async () => {
    renderFrame()
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(false)
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")
    expect(tool("Đặt lệnh").getAttribute("aria-expanded")).toBe("true")
    expect(tool("Đặt lệnh").getAttribute("aria-controls")).toBe(panel().id)
    expect(tool("Danh mục").getAttribute("aria-pressed")).toBe("false")
    expect(tool("Danh mục").getAttribute("aria-expanded")).toBe("false")
    // Insight is a main-area tool: no aria-controls/aria-expanded, pressed only while it is shown.
    expect(tool("Insight").getAttribute("aria-pressed")).toBe("false")
    expect(tool("Insight").hasAttribute("aria-expanded")).toBe(false)
    expect(tool("Insight").hasAttribute("aria-controls")).toBe(false)
  })

  it("collapses on a second click of the active tool and leaves no tool pressed", async () => {
    const { user, router } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(panel().hasAttribute("inert")).toBe(true)
    // The panel stays mounted so its state survives.
    expect(screen.getByText("Nội dung panel")).toBeTruthy()
    expect(within(rail()).getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true")).toEqual([])
    expect(tool("Đặt lệnh").getAttribute("aria-expanded")).toBe("false")
    // The tool stays selected in the URL; nothing was navigated.
    expect(router.state.location.search).toBe("")

    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")
  })

  it("switches to another tool without collapsing, and shows a collapsed panel again", async () => {
    const { user, router } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(tool("Danh mục"))
    expect(router.state.location.search).toBe("?view=portfolio")
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(tool("Danh mục").getAttribute("aria-pressed")).toBe("true")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("false")

    await user.click(tool("Danh mục"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    await user.click(tool("Tin tức"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(router.state.location.search).toBe("?view=news")
    expect(tool("Tin tức").getAttribute("aria-pressed")).toBe("true")
  })

  it("Insight takes the main area and collapses the panel; the panel tools then switch it back", async () => {
    const { user, router } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(tool("Insight"))
    expect(router.state.location.search).toBe("?content=insight")
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(tool("Insight").getAttribute("aria-pressed")).toBe("true")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("false")
    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")
  })

  it("can be controlled: reports collapses and follows `collapsed`", async () => {
    const onCollapsedChange = vi.fn()
    const router = createMemoryRouter(
      [{
        path: "/demo-trading",
        handle: { chrome: demoChrome },
        element: (
          <RailProvider>
            <WorkspaceFrame panelLabel="Bảng công cụ" collapsed onCollapsedChange={onCollapsedChange} main={<p>Nội dung chính</p>} panel={<Panel />} />
          </RailProvider>
        ),
      }],
      { initialEntries: ["/demo-trading"] },
    )
    render(<RouterProvider router={router} />)
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    await userEvent.setup().click(tool("Đặt lệnh"))
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
    // Still controlled: the parent decides.
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
  })

  it("uses the `rail` prop instead of the route chrome when given", async () => {
    const onSelectTool = vi.fn()
    const items = demoChrome.items.filter((item) => item.section === "academy")
    const router = createMemoryRouter(
      [{
        path: "/demo-trading",
        element: (
          <RailProvider>
            <WorkspaceFrame
              panelLabel="Bảng công cụ"
              rail={{ items, activeTool: "bot", mainToolId: null, onSelectTool, onSelectMainTool: vi.fn() }}
              main={<p>Nội dung chính</p>}
              panel={<Panel />}
            />
          </RailProvider>
        ),
      }],
      { initialEntries: ["/demo-trading"] },
    )
    render(<RouterProvider router={router} />)
    await screen.findByText("Nội dung chính")
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Học viện", "Bot", "Shop", "Flashback"])
    expect(tool("Bot").getAttribute("aria-pressed")).toBe("true")
    await userEvent.setup().click(tool("Shop"))
    expect(onSelectTool).toHaveBeenCalledWith("shop")
  })
})

describe("WorkspaceFrame as a layer (900px and below)", () => {
  // jsdom has no layout: report every attached element as rendered so focus can return to its trigger.
  beforeEach(() => {
    media.matches = true
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode } })
  })
  afterEach(() => {
    delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent
  })

  it("starts closed and opens from the toggle, moving focus into the panel", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    const button = toggle()!
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.getAttribute("aria-controls")).toBe(screen.getByRole("complementary", { name: "Bảng công cụ" }).id)
    expect(frame().getAttribute("data-panel-open")).toBe("false")

    await user.click(button)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    expect(button.getAttribute("aria-expanded")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng công cụ" })))
  })

  it("closes with Escape from anywhere and returns focus to the toggle", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(toggle()!)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng công cụ" })))
    await user.keyboard("{Escape}")
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    expect(document.activeElement).toBe(toggle())

    // focus left in the main content: Escape still closes the open layer
    await user.click(toggle()!)
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard("{Escape}")
    expect(frame().getAttribute("data-panel-open")).toBe("false")
  })

  it("leaves Escape to a menu or dialog that already handled it", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(toggle()!)
    const takeKey = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener("keydown", takeKey, true)
    await user.keyboard("{Escape}")
    document.removeEventListener("keydown", takeKey, true)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
  })

  it("opens when a tool is picked on the rail and closes with its own button", async () => {
    const { user, router } = renderFrame()
    const nav = await screen.findByRole("navigation", { name: "Công cụ theo trang" })
    await user.click(within(nav).getByRole("button", { name: "Đặt lệnh" }))
    expect(router.state.location.search).toBe("?view=trading")
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Đóng công cụ" }))
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    // Opened from the rail: focus goes back to the rail button.
    expect(document.activeElement).toBe(tool("Đặt lệnh"))
  })

  it("closes with Escape and returns focus to the rail button that opened the layer", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(tool("Danh mục"))
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng công cụ" })))
    await user.keyboard("{Escape}")
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    expect(document.activeElement).toBe(tool("Danh mục"))
  })

  it("hides the layer with a second click on the active tool while it shows", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("false")
    await user.click(tool("Đặt lệnh"))
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")
    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("false")
    // The layer is a layer: it never reports the wide-screen collapse.
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
  })

  it("can start open for a direct link to a tool", async () => {
    renderFrame(true)
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-panel-open")).toBe("true")
  })

  it("forgets the open state when the screen grows back to a wide layout", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    await user.click(toggle()!)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    setOverlay(false)
    await waitFor(() => expect(frame().getAttribute("data-panel-open")).toBe("false"))
    expect(toggle()).toBeNull()
    setOverlay(true)
    await waitFor(() => expect(toggle()).not.toBeNull())
    expect(frame().getAttribute("data-panel-open")).toBe("false")
  })

  it("does not react to Escape while closed", async () => {
    renderFrame()
    await screen.findByText("Nội dung chính")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(frame().getAttribute("data-panel-open")).toBe("false")
  })
})

describe("WorkspaceFrame with the phone tool bar", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode } })
  })
  afterEach(() => {
    delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent
  })

  it("keeps the rail column on wide screens", async () => {
    renderFrame(false, "/demo-trading", "bar")
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-rail")).toBe("column")
    expect(rail().classList.contains("workspace-rail")).toBe(true)
    expect(within(screen.getByRole("main")).queryByRole("navigation")).toBeNull()
  })

  it("turns the rail into a bar above main at 900px and below, so main takes the whole width", async () => {
    media.matches = true
    const { user, router } = renderFrame(false, "/demo-trading", "bar")
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-rail")).toBe("bar")
    // One tool list only, inside main and before the content; no rail column and no separate toggle.
    expect(screen.getAllByRole("navigation", { name: "Công cụ theo trang" })).toHaveLength(1)
    const main = screen.getByRole("main")
    expect(main.firstElementChild).toBe(rail())
    expect(frame().querySelector(".workspace-rail")).toBeNull()
    expect(toggle()).toBeNull()
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Đặt lệnh", "Danh mục", "Tin tức", "Insight", "Dashboard phân tích", "Học viện", "Bot", "Shop", "Flashback",
    ])

    // The bar's tools work as the rail's: open the layer, a second click closes it, focus comes back.
    await user.click(tool("Danh mục"))
    expect(router.state.location.search).toBe("?view=portfolio")
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    expect(tool("Danh mục").getAttribute("aria-expanded")).toBe("true")
    expect(tool("Danh mục").getAttribute("aria-controls")).toBe(panel().id)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng công cụ" })))
    await user.keyboard("{Escape}")
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    expect(document.activeElement).toBe(tool("Danh mục"))
    // The tool whose view is on screen stays marked while its layer is closed.
    expect(tool("Danh mục").getAttribute("data-current")).toBe("true")
    expect(tool("Đặt lệnh").hasAttribute("data-current")).toBe(false)

    setOverlay(false)
    await waitFor(() => expect(frame().getAttribute("data-rail")).toBe("column"))
    expect(rail().classList.contains("workspace-rail")).toBe(true)
  })
})

describe("WorkspaceFrame without a panel (panelHidden)", () => {
  it("leaves the panel out but keeps the rail with the active tool marked and controlling nothing", async () => {
    renderHidden()
    await screen.findByText("Nội dung chính")
    expect(frame().getAttribute("data-panel-hidden")).toBe("true")
    expect(panel().hasAttribute("inert")).toBe(true)
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")
    expect(tool("Đặt lệnh").hasAttribute("aria-expanded")).toBe(false)
    expect(tool("Đặt lệnh").hasAttribute("aria-controls")).toBe(false)
    expect(tool("Danh mục").getAttribute("aria-pressed")).toBe("false")
    // No tool controls a panel that is not there.
    expect(tool("Danh mục").hasAttribute("aria-expanded")).toBe(false)
    expect(tool("Danh mục").hasAttribute("aria-controls")).toBe(false)
  })

  it("a click on the active tool changes nothing; another tool is selected as usual", async () => {
    const { user, router } = renderHidden()
    await screen.findByText("Nội dung chính")
    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(router.state.location.search).toBe("")
    expect(tool("Đặt lệnh").getAttribute("aria-pressed")).toBe("true")

    await user.click(tool("Danh mục"))
    expect(router.state.location.search).toBe("?view=portfolio")
  })

  it("brings the panel back when it is no longer hidden, and a second click on the active tool then collapses it", async () => {
    const { user } = renderHidden()
    await screen.findByText("Nội dung chính")
    await user.click(screen.getByRole("button", { name: "Đổi panel" }))
    expect(frame().getAttribute("data-panel-hidden")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(false)
    expect(tool("Đặt lệnh").getAttribute("aria-expanded")).toBe("true")

    await user.click(tool("Đặt lệnh"))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
  })

  describe("as a layer (900px and below)", () => {
    beforeEach(() => {
      media.matches = true
      Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode } })
    })
    afterEach(() => {
      delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent
    })

    it("never opens the layer while hidden, even for a direct link, and does not pop up when the panel returns", async () => {
      const { user } = renderHidden(true, true)
      await screen.findByText("Nội dung chính")
      expect(frame().getAttribute("data-panel-open")).toBe("false")

      await user.click(tool("Danh mục"))
      expect(frame().getAttribute("data-panel-open")).toBe("false")

      await user.click(screen.getByRole("button", { name: "Đổi panel" }))
      expect(frame().getAttribute("data-panel-hidden")).toBe("false")
      expect(frame().getAttribute("data-panel-open")).toBe("false")
    })

    it("opens the layer from the rail once the panel is there", async () => {
      const { user } = renderHidden(false, false)
      await screen.findByText("Nội dung chính")
      await user.click(tool("Danh mục"))
      expect(frame().getAttribute("data-panel-open")).toBe("true")
    })
  })
})
