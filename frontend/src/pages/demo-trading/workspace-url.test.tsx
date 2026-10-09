import { render, screen, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider, useLocation } from "react-router"
import { describe, expect, it } from "vitest"

import { AcademyRedirect } from "./academy-redirect"
import { academyWorkspaceLocation, demoTradingLoader, normalizeWorkspaceSearch } from "./workspace-url"

function Where() {
  const location = useLocation()
  return <output aria-label="where">{location.pathname}{location.search}{location.hash}</output>
}

function renderRoutes(initial: string) {
  const router = createMemoryRouter(
    [
      { path: "/demo-trading", loader: demoTradingLoader, element: <Where /> },
      { path: "/hoc-vien", element: <AcademyRedirect /> },
      { path: "/hoc-vien/:lessonId", element: <AcademyRedirect /> },
    ],
    { initialEntries: [initial] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe("legacy journey URLs", () => {
  it.each([
    ["?view=journey", "?view=academy"],
    ["?view=identity&symbol=FPT", "?view=academy&symbol=FPT"],
    ["?view=analysis", "?view=academy"],
    ["?content=journey", ""],
    ["?view=journey&content=journey&tour=bantin", "?view=academy&tour=bantin"],
  ])("rewrites %s", (search, expected) => {
    expect(normalizeWorkspaceSearch(search)).toEqual({ search: expected, changed: true })
  })

  it.each(["", "?view=trading", "?view=academy&lesson=ch01-l01", "?content=chart&symbol=VNM", "?view=unknown"])(
    "leaves %s alone",
    (search) => {
      expect(normalizeWorkspaceSearch(search).changed).toBe(false)
    },
  )

  it("redirects /demo-trading?view=journey to the Học viện tool before anything renders", async () => {
    const router = renderRoutes("/demo-trading?view=journey&symbol=FPT")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=academy&symbol=FPT"))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT")
  })

  it("does not redirect a current URL", async () => {
    renderRoutes("/demo-trading?view=bot&content=board")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=bot&content=board"))
  })
})

describe("/hoc-vien redirect", () => {
  it("opens the workspace Học viện tool", async () => {
    renderRoutes("/hoc-vien")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=academy"))
  })

  it("preserves the lesson id as a URL param", async () => {
    renderRoutes("/hoc-vien/ch01-l01")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=academy&lesson=ch01-l01"))
  })

  it("keeps other query params and drops a lesson id that is not a plausible id", () => {
    expect(academyWorkspaceLocation("ch02-l14", "?from=chien-luoc", "#x")).toEqual({
      pathname: "/demo-trading",
      search: "?from=chien-luoc&view=academy&lesson=ch02-l14",
      hash: "#x",
    })
    expect(academyWorkspaceLocation("../etc/passwd").search).toBe("?view=academy")
    expect(academyWorkspaceLocation(undefined).search).toBe("?view=academy")
  })
})
