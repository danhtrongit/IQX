import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"

import { workspaceMemory } from "@/pages/demo-trading/workspace-sections"

import { Header } from "./header"

const { openAuth } = vi.hoisted(() => ({ openAuth: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    authOpen: false,
    authMode: "login",
    openAuth,
    setAuthOpen: vi.fn(),
  }),
}))

beforeEach(() => {
  workspaceMemory.reset()
  openAuth.mockClear()
  localStorage.clear()
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

function renderHeader(pathname: string) {
  return render(
    <ThemeProvider defaultTheme="dark" disableTransitionOnChange={false}>
      <MemoryRouter initialEntries={[pathname]}>
        <Header />
        <LocationProbe />
      </MemoryRouter>
    </ThemeProvider>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location" data-state={JSON.stringify(location.state)}>{location.pathname}{location.search}{location.hash}</output>
}

const SHARED_NAV = [
  ["Giới thiệu", "/"],
  ["Luyện tập", "/luyen-tap?tool=candle-dojo"],
  ["Flashback", "/flashback?tool=flashback"],
  ["Chiến lược", "/chien-luoc"],
  ["Khu giao dịch", "/khu-giao-dich"],
  ["Văn phòng", "/van-phong"],
] as const

describe("Header", () => {
  it.each(["/", "/gioi-thieu"])("uses shared chrome and introduction links on %s", async (pathname) => {
    const user = userEvent.setup()
    renderHeader(pathname)

    const header = screen.getByRole("banner")
    expect(header.className).toContain("h-(--header-top)")
    const homeLink = within(header).getByRole("link", { name: "IQX - Trang chủ" })
    expect(homeLink.getAttribute("href")).toBe("/")
    expect(within(homeLink).getByTestId("brain-wave-logo")).toBeTruthy()
    const nav = within(header).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(SHARED_NAV)
    expect(within(header).getByRole("link", { name: "Bắt đầu ngay" }).getAttribute("href")).toBe("/luyen-tap?tool=hoc-vien")

    await user.click(within(header).getByRole("button", { name: "Chế độ sáng" }))
    expect(within(header).getByRole("button", { name: "Chế độ tối" })).toBeTruthy()
    await user.click(within(header).getByRole("button", { name: "Đăng nhập" }))
    expect(openAuth).toHaveBeenCalledOnce()
  })

  it("keeps workspace navigation and account controls on the trading route", async () => {
    const user = userEvent.setup()
    renderHeader("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=VIC&content=market")

    const header = screen.getByRole("banner")
    const nav = within(header).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(SHARED_NAV.map(([label]) => label))
    expect(within(header).queryByRole("link", { name: "Bắt đầu ngay" })).toBeNull()
    // Guests have no coin wallet, so the header carries no coin chip for them.
    expect(within(header).queryByTestId("header-coin-chip")).toBeNull()
    await user.click(within(header).getByRole("button", { name: "Đăng nhập" }))
    expect(openAuth).toHaveBeenCalledOnce()
  })

  it("opens and closes the introduction menu with its close button and Escape", async () => {
    const user = userEvent.setup()
    renderHeader("/")
    const trigger = screen.getByRole("button", { name: "Mở menu điều hướng" })

    await user.click(trigger)
    let menu = screen.getByRole("dialog", { name: "Điều hướng IQX" })
    const nav = within(menu).getByRole("navigation", { name: "Điều hướng di động" })
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(SHARED_NAV)
    expect(within(menu).getByRole("link", { name: "Bắt đầu ngay" }).getAttribute("href")).toBe("/luyen-tap?tool=hoc-vien")

    await user.click(within(menu).getByRole("button", { name: "Đóng menu điều hướng" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
    await user.click(trigger)
    menu = screen.getByRole("dialog", { name: "Điều hướng IQX" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(menu.isConnected).toBe(false))

    await user.click(trigger)
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(overlay).not.toBeNull()
    await user.click(overlay!)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
  })

  it("closes the introduction menu after selecting a shared content route", async () => {
    const user = userEvent.setup()
    renderHeader("/")
    const trigger = screen.getByRole("button", { name: "Mở menu điều hướng" })

    await user.click(trigger)
    const menu = screen.getByRole("dialog", { name: "Điều hướng IQX" })
    await user.click(within(menu).getByRole("link", { name: "Luyện tập" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=candle-dojo")
  })

  it("keeps workspace active navigation in the mobile menu and closes after a route change", async () => {
    const user = userEvent.setup()
    renderHeader("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=VIC&content=market")
    await user.click(screen.getByRole("button", { name: "Mở menu điều hướng" }))
    const menu = screen.getByRole("dialog", { name: "Điều hướng IQX" })
    const nav = within(menu).getByRole("navigation", { name: "Điều hướng di động" })
    expect(within(menu).queryByRole("link", { name: "Bắt đầu ngay" })).toBeNull()

    await user.click(within(nav).getByRole("link", { name: "Chiến lược" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
    expect(screen.getByTestId("location").textContent).toBe("/chien-luoc")
  })

  it.each([
    ["/luyen-tap?tool=giao-dich&tab=dat-lenh", "Luyện tập"],
    ["/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT", "Luyện tập"],
    ["/luyen-tap?tool=hoc-vien&lesson=ch01-l01", "Luyện tập"],
    ["/luyen-tap?tool=bot", "Luyện tập"],
    ["/luyen-tap", "Luyện tập"],
    ["/flashback?tool=shop", "Flashback"],
    ["/flashback", "Flashback"],
    ["/chien-luoc?tab=bo-loc", "Chiến lược"],
  ])("marks only %s as the active entry", (path, label) => {
    renderHeader(path)
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link", { current: "page" }).map((link) => link.textContent)).toEqual([label])
  })

  it("opens FLASHBACK on its default tool from LUYỆN TẬP and keeps the symbol", async () => {
    const user = userEvent.setup()
    renderHeader("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT&content=board")
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    await user.click(within(nav).getByRole("link", { name: "Flashback" }))
    expect(screen.getByTestId("location").textContent).toBe("/flashback?tool=flashback&symbol=FPT")
  })

  it("keeps the current tool when the open section's entry is clicked", async () => {
    const user = userEvent.setup()
    renderHeader("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=VIC")
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    await user.click(within(nav).getByRole("link", { name: "Luyện tập" }))
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=VIC")
  })

  it("returns to each section as it was left: tool, Giao dịch tab", async () => {
    const user = userEvent.setup()
    workspaceMemory.remember("flashback", "?tool=shop")
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=tin-tuc&content=board")
    renderHeader("/luyen-tap?tool=bot&symbol=VIC")
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    // Same section: the current URL is kept.
    await user.click(within(nav).getByRole("link", { name: "Luyện tập" }))
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=bot&symbol=VIC")
    // Other section: its remembered tool on top of the shared symbol.
    await user.click(within(nav).getByRole("link", { name: "Flashback" }))
    expect(screen.getByTestId("location").textContent).toBe("/flashback?tool=shop&symbol=VIC")
    await user.click(within(nav).getByRole("link", { name: "Luyện tập" }))
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=board&symbol=VIC")
  })

  it("marks the workspace section switch in the navigation state", async () => {
    const user = userEvent.setup()
    renderHeader("/")
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    await user.click(within(nav).getByRole("link", { name: "Flashback" }))
    expect(JSON.parse(screen.getByTestId("location").getAttribute("data-state")!)).toEqual({ workspaceSection: true })
  })

  it("does not list Bài học in the header", () => {
    renderHeader("/")
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).queryByRole("link", { name: "Bài học" })).toBeNull()
  })

  it("closes an open mobile menu when the viewport reaches desktop width", async () => {
    const user = userEvent.setup()
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      addEventListener(event: string, listener: (event: MediaQueryListEvent) => void) {
        if (query === "(min-width: 1280px)" && event === "change") listeners.add(listener)
      },
      removeEventListener(event: string, listener: (event: MediaQueryListEvent) => void) {
        if (query === "(min-width: 1280px)" && event === "change") listeners.delete(listener)
      },
    }))
    renderHeader("/")
    await user.click(screen.getByRole("button", { name: "Mở menu điều hướng" }))
    expect(screen.getByRole("dialog", { name: "Điều hướng IQX" })).toBeTruthy()

    act(() => listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent)))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
  })

  it("renders the Brain Wave brand logo mark in the home navigation link", () => {
    renderHeader("/")
    const header = screen.getByRole("banner")
    const homeLink = within(header).getByRole("link", { name: "IQX - Trang chủ" })
    const logoMark = within(homeLink).getByTestId("brain-wave-logo")
    expect(logoMark).toBeTruthy()
    const logoImg = logoMark.querySelector("img")
    expect(logoImg?.getAttribute("src")).toContain("logo-mark")
  })

  it("skips the global 'd' theme shortcut while a 3D WASD world is mounted", async () => {
    const user = userEvent.setup()
    const worldRoot = document.createElement("div")
    worldRoot.setAttribute("data-wasd-world", "true")
    document.body.appendChild(worldRoot)
    try {
      renderHeader("/khu-giao-dich")
      const header = screen.getByRole("banner")
      expect(within(header).getByRole("button", { name: "Chế độ sáng" })).toBeTruthy()
      await user.keyboard("d")
      expect(within(header).getByRole("button", { name: "Chế độ sáng" })).toBeTruthy()
    } finally {
      worldRoot.remove()
    }
    await user.keyboard("d")
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Chế độ tối" })).toBeTruthy()
  })
})
