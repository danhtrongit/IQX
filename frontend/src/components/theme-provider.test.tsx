import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider, useTheme } from "./theme-provider"

function ThemeProbe() {
  const { theme } = useTheme()
  return <output data-testid="theme">{theme}</output>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("light", "dark")
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})

describe("ThemeProvider keyboard shortcut", () => {
  it("toggles theme on 'd' press during normal app usage", () => {
    render(
      <ThemeProvider defaultTheme="dark" disableTransitionOnChange={false}>
        <ThemeProbe />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme").textContent).toBe("dark")
    fireEvent.keyDown(window, { key: "d" })
    expect(screen.getByTestId("theme").textContent).toBe("light")
    fireEvent.keyDown(window, { key: "D" })
    expect(screen.getByTestId("theme").textContent).toBe("dark")
  })

  it("ignores 'd' theme shortcut while a 3D WASD world ([data-wasd-world='true']) is mounted", () => {
    const { rerender } = render(
      <ThemeProvider defaultTheme="dark" disableTransitionOnChange={false}>
        <div data-wasd-world="true">3D World</div>
        <ThemeProbe />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme").textContent).toBe("dark")
    fireEvent.keyDown(window, { key: "d" })
    fireEvent.keyDown(window, { key: "D" })
    expect(screen.getByTestId("theme").textContent).toBe("dark")

    // Leaving the 3D world restores the normal 'd' theme shortcut
    rerender(
      <ThemeProvider defaultTheme="dark" disableTransitionOnChange={false}>
        <ThemeProbe />
      </ThemeProvider>
    )
    fireEvent.keyDown(window, { key: "d" })
    expect(screen.getByTestId("theme").textContent).toBe("light")
  })
})
