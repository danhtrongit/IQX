import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
    <SidebarPanel title="Học viện" description="13 chương · 71 bài học">
      <p>Nội dung panel</p>
    </SidebarPanel>
  )
}

function renderFrame(initialPanelOpen = false) {
  const router = createMemoryRouter(
    [
      {
        path: "/demo-trading",
        handle: { chrome: demoChrome },
        element: (
          <RailProvider>
            <WorkspaceFrame
              panelLabel="Học viện"
              defaultPanelOpen={initialPanelOpen}
              main={<div><WorkspacePanelToggle /><p>Nội dung chính</p></div>}
              panel={<Panel />}
            />
          </RailProvider>
        ),
      },
    ],
    { initialEntries: ["/demo-trading"] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const frame = () => screen.getByTestId("workspace-frame")
const toggle = () => screen.queryByRole("button", { name: "Học viện", expanded: false }) ?? screen.queryByRole("button", { name: "Học viện", expanded: true })

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
    expect(screen.getByRole("complementary", { name: "Học viện" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Công cụ theo trang" })).toBeTruthy()
    expect(toggle()).toBeNull()
    expect(screen.queryByRole("button", { name: "Đóng công cụ" })).toBeNull()
    expect(frame().getAttribute("data-panel-open")).toBe("false")
  })

  it("lists the rail tools in v4 order", async () => {
    renderFrame()
    const nav = await screen.findByRole("navigation", { name: "Công cụ theo trang" })
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Học viện", "Đặt lệnh", "Danh mục", "Bot", "Shop", "Săn mã", "Tin tức", "Mẫu nến",
    ])
  })
})

describe("WorkspaceFrame as a layer (900px and below)", () => {
  beforeEach(() => { media.matches = true })

  it("starts closed and opens from the toggle, moving focus into the panel", async () => {
    const { user } = renderFrame()
    await screen.findByText("Nội dung chính")
    const button = toggle()!
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.getAttribute("aria-controls")).toBe(screen.getByRole("complementary", { name: "Học viện" }).id)
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
    expect(document.activeElement).toBe(toggle())
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
