import React from "react"
import { describe, it, expect, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { MemoryRouter, Outlet } from "react-router"

// Stub the lazy page modules to avoid pulling the whole feature trees.
vi.mock("@/features/home-workspace", () => ({
  HomeWorkspace: () => <div>home-workspace</div>,
}))
vi.mock("@/features/dashboard", () => ({ DashboardPage: () => <div>TERMINAL</div> }))
// `/dau-truong` is now served by the level-progression router (Task FE3) —
// stub `DauTruongPage` itself rather than `Cap0TradingPage` (which it picks
// between internally, along with `Cap1TradingPage`, by the user's progress).
vi.mock("@/features/cap1", () => ({ DauTruongPage: () => <div>DAU-TRUONG-ROUTER</div> }))
// AppShell pulls navigation features with heavy providers; stub it to a pass-through.
vi.mock("./shell/AppShell", () => ({ AppShell: () => <Outlet /> }))
// TopLoadingBar (Suspense fallback) calls useIsFetching which needs QueryClientProvider.
vi.mock("@/shared/ui/TopLoadingBar", () => ({ TopLoadingBar: () => null }))

import { AppRouter } from "./router"

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  )
}

describe("AppRouter swap", () => {
  it("renders the home workspace at /", async () => {
    await act(async () => {
      renderAt("/")
    })
    expect(await screen.findByText("home-workspace")).toBeInTheDocument()
  })
  it("renders the terminal at /bieu-do", async () => {
    renderAt("/bieu-do")
    expect(await screen.findByText("TERMINAL")).toBeInTheDocument()
  })
  it("renders the level-progression router at /dau-truong", async () => {
    renderAt("/dau-truong")
    expect(await screen.findByText("DAU-TRUONG-ROUTER")).toBeInTheDocument()
  })
})
