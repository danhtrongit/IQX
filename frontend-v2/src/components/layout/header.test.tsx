import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"

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
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
}

const SHARED_NAV = [
  ["Giới thiệu", "/"],
  ["Demo Trading", "/demo-trading"],
  ["Chiến lược", "/chien-luoc"],
  ["Bài học", "/bai-hoc"],
] as const

describe("Header", () => {
  it.each(["/", "/gioi-thieu"])("uses shared chrome and introduction links on %s", async (pathname) => {
    const user = userEvent.setup()
    renderHeader(pathname)

    const header = screen.getByRole("banner")
    expect(header.className).toContain("h-(--header-top)")
    expect(within(header).getByRole("link", { name: "IQX - Trang chủ" }).getAttribute("href")).toBe("/")
    const nav = within(header).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(SHARED_NAV)
    expect(within(header).getByRole("link", { name: "Bắt đầu ngay" }).getAttribute("href")).toBe("/demo-trading?view=journey")

    await user.click(within(header).getByRole("button", { name: "Chế độ sáng" }))
    expect(within(header).getByRole("button", { name: "Chế độ tối" })).toBeTruthy()
    await user.click(within(header).getByRole("button", { name: "Đăng nhập" }))
    expect(openAuth).toHaveBeenCalledOnce()
  })

  it("keeps workspace navigation and account controls on the trading route", async () => {
    const user = userEvent.setup()
    renderHeader("/demo-trading?view=trading&symbol=VIC&content=ai-analysis")

    const header = screen.getByRole("banner")
    const nav = within(header).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(SHARED_NAV.map(([label]) => label))
    expect(within(header).queryByRole("link", { name: "Bắt đầu ngay" })).toBeNull()
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
    expect(within(menu).getByRole("link", { name: "Bắt đầu ngay" }).getAttribute("href")).toBe("/demo-trading?view=journey")

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
    await user.click(within(menu).getByRole("link", { name: "Demo Trading" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
    expect(screen.getByTestId("location").textContent).toBe("/demo-trading")
  })

  it("keeps workspace active navigation in the mobile menu and closes after a route change", async () => {
    const user = userEvent.setup()
    renderHeader("/demo-trading?view=trading&symbol=VIC&content=ai-analysis")
    await user.click(screen.getByRole("button", { name: "Mở menu điều hướng" }))
    const menu = screen.getByRole("dialog", { name: "Điều hướng IQX" })
    const nav = within(menu).getByRole("navigation", { name: "Điều hướng di động" })
    expect(within(menu).queryByRole("link", { name: "Bắt đầu ngay" })).toBeNull()

    await user.click(within(nav).getByRole("link", { name: "Chiến lược" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Điều hướng IQX" })).toBeNull())
    expect(screen.getByTestId("location").textContent).toBe("/chien-luoc")
  })

  it.each([
    ["/demo-trading", "Demo Trading"],
  ])("marks only %s as the active content route", (pathname, label) => {
    renderHeader(pathname)
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Điều hướng chính" })
    expect(within(nav).getAllByRole("link", { current: "page" }).map((link) => link.textContent)).toEqual([label])
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
})
