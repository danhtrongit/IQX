import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AboutPage } from "./about-page"
import { ThemeProvider } from "@/components/theme-provider"

afterEach(() => vi.unstubAllGlobals())

describe("AboutPage", () => {
  it("shows verifiable company information", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }))
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <AboutPage />
        </MemoryRouter>
      </ThemeProvider>
    )
    const main = screen.getByRole("main", { name: "About IQX" })
    expect(
      within(main).getByRole("heading", { level: 1, name: "About IQX" })
    ).toBeTruthy()
    expect(
      within(main).getAllByText(/Viet Nam Stock Express Company Limited/).length
    ).toBeGreaterThan(0)
    expect(within(main).getAllByText(/0319077430/).length).toBeGreaterThan(0)
    expect(within(main).getAllByText(/August 2025/).length).toBeGreaterThan(0)
  })
})
