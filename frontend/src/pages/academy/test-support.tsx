import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { vi } from "vitest"

import type { WorkspaceFrameState } from "@/components/layout/workspace-frame-context"
import { AcademyLayout, Where } from "./test-harness"

/** jsdom has no layout engine: the observers and `matchMedia` the UI relies on are stubbed. */
export function stubBrowser() {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
}

export function renderAcademy(initial: string, options: { panel?: boolean; main?: boolean; frame?: WorkspaceFrameState; children?: ReactNode } = {}) {
  const router = createMemoryRouter(
    [
      { path: "/demo-trading", element: <AcademyLayout panel={options.panel ?? true} main={options.main ?? true} frame={options.frame}>{options.children}</AcademyLayout> },
      { path: "/chien-luoc", element: <Where /> },
    ],
    { initialEntries: [initial] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, client, ...view }
}

export function overlayFrame(overrides: Partial<WorkspaceFrameState> = {}): WorkspaceFrameState {
  return { open: true, overlay: true, panelId: "panel", panelLabel: "Học viện", setOpen: vi.fn(), revealPanel: vi.fn(), ...overrides }
}
