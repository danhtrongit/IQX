import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"

// Arco Design's internal ResizeObserver/Trigger still read the deprecated
// `element.ref` under React 19 (see @arco-design/web-react/es/_util/resizeObserver).
// It's non-breaking, only emitted in React's dev build, and never produced by our
// own code — silence just this one library deprecation so the dev console stays clean.
if (import.meta.env.DEV) {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Accessing element.ref was removed in React 19")) {
      return
    }
    originalError(...args)
  }
}
// Arco owns the base reset; import its CSS BEFORE ./index.css so Tailwind
// utilities (loaded after) win where they're intentionally applied.
import "@arco-design/web-react/dist/css/arco.css"
import "./index.css"
import { AppProviders } from "@/app/providers"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
)
