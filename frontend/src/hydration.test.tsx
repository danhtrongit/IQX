import { act } from "react"
import { hydrateRoot } from "react-dom/client"
import { matchRoutes } from "react-router"
import { afterEach, describe, expect, inject, it, vi } from "vitest"

import App, { resetClientRouter, routes } from "./App"
import { AppProviders, createAppQueryClient } from "./app-providers"

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }),
})
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Hydrates the markup prerendered by the Node global setup (render() output, as
// the build plugin writes it) with the real client tree; fails on any error.
async function hydrate(path: string) {
  resetClientRouter()
  window.history.pushState({}, "", path)
  const html = inject("prerenderedPages")[path]
  const container = document.createElement("div")
  container.dataset.ssr = path
  container.innerHTML = html
  document.body.append(container)
  await Promise.all(
    (matchRoutes(routes, path) ?? []).map((m) =>
      (m.route.Component as { preload?: () => Promise<unknown> }).preload?.()
    )
  )
  const errors: unknown[][] = []
  vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args) })
  await act(async () => {
    hydrateRoot(
      container,
      <AppProviders pathname={path} queryClient={createAppQueryClient()}>
        <App />
      </AppProviders>,
      { onRecoverableError: (error) => { errors.push([error]) } }
    )
  })
  return { errors, container }
}

describe("hydration of prerendered pages", () => {
  afterEach(() => { document.body.innerHTML = ""; resetClientRouter() })

  for (const [path, text] of [["/", "Tập đầu tư có hệ thống"], ["/about", "About IQX"]] as const) {
    it(`hydrates ${path} without errors`, async () => {
      const { errors, container } = await hydrate(path)
      expect(errors).toEqual([])
      expect(container.textContent).toContain(text)
    })
  }
})
