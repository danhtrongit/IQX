import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { matchRoutes } from "react-router"

import "./index.css"
import App, { routes, type PreloadableComponent } from "./App.tsx"
import { AppProviders, createAppQueryClient } from "./app-providers"

const container = document.getElementById("root")!
const queryClient = createAppQueryClient()
const pathname = window.location.pathname

const app = (
  <StrictMode>
    <AppProviders pathname={pathname} queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>
)

/** Load the lazy page modules of the current URL so hydration can complete synchronously. */
async function preloadMatchedRoutes() {
  const matches = matchRoutes(routes, window.location) ?? []
  await Promise.all(
    matches.map((match) =>
      (match.route.Component as PreloadableComponent | undefined)?.preload?.()
    )
  )
}

const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname

// Hydrate only when this document was prerendered for the current path; any
// other route gets the plain SPA shell (app.html) and a fresh client render.
if (container.dataset.ssr === normalizedPath) {
  preloadMatchedRoutes()
    .catch(() => undefined)
    .then(() => hydrateRoot(container, app))
} else {
  createRoot(container).render(app)
}
