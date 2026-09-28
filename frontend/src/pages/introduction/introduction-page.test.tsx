import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IntroductionPage } from "./introduction-page"
import { ThemeProvider } from "@/components/theme-provider"

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: false, openAuth: vi.fn() }),
}))

afterEach(() => vi.unstubAllGlobals())

describe("IntroductionPage", () => {
  it("renders the canonical journey artwork and previews levels without a server mutation", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, "fetch")
    const { container } = render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <IntroductionPage />
        </MemoryRouter>
      </ThemeProvider>
    )
    const main = screen.getByRole("main", { name: "Giới thiệu IQX" })

    expect(
      within(main).getByRole("heading", {
        name: "Tập đầu tư có hệ thống, bắt đầu từ tư duy.",
      })
    ).toBeTruthy()
    expect(
      within(main)
        .getByRole("link", { name: "Bắt đầu hành trình" })
        .getAttribute("href")
    ).toBe("/demo-trading?view=journey")
    expect(
      within(main)
        .getByRole("img", { name: /Thanh Long, linh thú đồng hành/ })
        .getAttribute("src")
    ).toBe("/assets/mascots-2d/v2/thanh-long/hero-sharp-v1.webp")

    const roadmap = container.querySelector("#lo-trinh")
    expect(roadmap).not.toBeNull()
    const svgIds = Array.from(
      container.querySelectorAll("svg [id]"),
      (element) => element.id
    )
    expect(new Set(svgIds).size).toBe(svgIds.length)
    expect(
      Array.from(
        roadmap!.querySelectorAll('[data-artwork="recreated-egg"]'),
        (artwork) => Number(artwork.getAttribute("data-egg-level"))
      )
    ).toEqual([0, 1, 2, 3, 4, 5, 6])

    for (const level of [0, 2, 4]) {
      const preview = within(main).getByRole("button", {
        name: new RegExp(`Cấp ${level}\\b`),
      })
      await user.click(preview)
      expect(preview.getAttribute("aria-pressed")).toBe("true")
      expect(within(main).getByText(new RegExp(`^Cấp ${level} ·`))).toBeTruthy()
      expect(
        preview.querySelector(
          `[data-artwork="recreated-egg"][data-egg-level="${level}"]`
        )
      ).not.toBeNull()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
