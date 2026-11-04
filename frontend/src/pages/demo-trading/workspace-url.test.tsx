import { render, screen, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider, useLocation } from "react-router"
import { describe, expect, it } from "vitest"

import { AcademyMetricRedirect, AcademyRedirect } from "./academy-redirect"
import { academyWorkspaceLocation, demoTradingLoader, normalizeWorkspaceSearch, parseMetricParam } from "./workspace-url"

function Where() {
  const location = useLocation()
  return <output aria-label="where">{location.pathname}{location.search}{location.hash}</output>
}

function renderRoutes(initial: string) {
  const router = createMemoryRouter(
    [
      { path: "/demo-trading", loader: demoTradingLoader, element: <Where /> },
      { path: "/hoc-vien", element: <AcademyRedirect /> },
      { path: "/hoc-vien/bai/:metric", element: <AcademyMetricRedirect /> },
      { path: "/hoc-vien/:lessonId", element: <AcademyRedirect /> },
      { path: "/academy", element: <AcademyRedirect /> },
    ],
    { initialEntries: [initial] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe("legacy journey URLs", () => {
  it.each([
    // Retired journey tools land on Học viện.
    ["?view=journey", "?view=academy"],
    ["?view=identity&symbol=FPT", "?view=academy&symbol=FPT"],
    ["?view=analysis", "?view=academy"],
    ["?view=journey&content=journey&tour=bantin", "?view=academy&tour=bantin"],
    // Retired main tabs.
    ["?content=journey", ""],
    ["?content=overview", ""],
    ["?view=portfolio&content=overview&symbol=VNM", "?view=portfolio&symbol=VNM"],
    // Hidden tools open Demo Trading on the chart.
    ["?view=hunt", "?view=trading"],
    ["?view=patterns&symbol=FPT", "?view=trading&symbol=FPT"],
    ["?view=hunt&content=board&symbol=FPT", "?view=trading&symbol=FPT"],
    // "AI Phân Tích": market view, stock view (Insight), BCTC hidden.
    ["?content=ai-analysis", "?content=market"],
    ["?content=ai-analysis&analysis=market&symbol=VNM", "?content=market&symbol=VNM"],
    ["?content=ai-analysis&analysis=financial", "?content=market"],
    ["?content=ai-analysis&analysis=stock&symbol=VNM", "?content=insight&symbol=VNM"],
    ["?view=portfolio&content=ai-analysis&tour=phantich", "?view=portfolio&content=insight&tour=phantich"],
    ["?content=ai-analysis&analysis=stock&tour=bantin", "?content=market&tour=bantin"],
    ["?content=ai-analysis&analysis=stock&tour=bctc", "?content=insight"],
    ["?content=ai-analysis&tour=bctc", "?content=market"],
    // Academy tools have no DEMO TRADING tab.
    ["?view=bot&content=board", "?view=bot"],
    ["?view=shop&content=market&analysis=stock&symbol=FPT", "?view=shop&symbol=FPT"],
    ["?view=academy&lesson=ch01-l01&content=board", "?view=academy&lesson=ch01-l01"],
    ["?view=journey&content=ai-analysis&analysis=stock", "?view=academy"],
  ])("rewrites %s", (search, expected) => {
    expect(normalizeWorkspaceSearch(search)).toEqual({ search: expected, changed: true })
  })

  it.each([
    "",
    "?view=trading",
    "?view=academy&lesson=ch01-l01",
    "?view=bot&practice=x",
    "?view=news&content=board",
    "?content=chart&symbol=VNM",
    "?content=market",
    "?content=insight&symbol=FPT",
    "?view=unknown",
  ])(
    "leaves %s alone",
    (search) => {
      expect(normalizeWorkspaceSearch(search).changed).toBe(false)
      expect(normalizeWorkspaceSearch(search).search).toBe(search)
    },
  )

  it.each([
    "?view=journey&content=ai-analysis&analysis=stock",
    "?view=hunt&content=board",
    "?content=ai-analysis&tour=bctc",
    "?view=bot&content=board&analysis=stock",
  ])("is idempotent: %s settles after one rewrite", (search) => {
    const once = normalizeWorkspaceSearch(search)
    expect(normalizeWorkspaceSearch(once.search)).toEqual({ search: once.search, changed: false })
  })

  it("redirects /demo-trading?view=journey to the Học viện tool before anything renders", async () => {
    const router = renderRoutes("/demo-trading?view=journey&symbol=FPT")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=academy&symbol=FPT"))
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT")
  })

  it("redirects a retired AI Phân Tích link to the new tab before anything renders", async () => {
    renderRoutes("/demo-trading?view=trading&content=ai-analysis&analysis=stock&symbol=FPT")
    await waitFor(() =>
      expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=trading&content=insight&symbol=FPT"),
    )
  })

  it("does not redirect a current URL", async () => {
    renderRoutes("/demo-trading?view=news&content=board")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=news&content=board"))
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

  it("sends /hoc-vien/bai/:metric to the tool with the metric name (spec v4 §6)", async () => {
    renderRoutes("/hoc-vien/bai/NIM")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?view=academy&metric=NIM"))
  })

  it("decodes a metric name with accents, spaces and a slash", async () => {
    renderRoutes(`/hoc-vien/bai/${encodeURIComponent("Tỷ lệ dự phòng / Dư nợ")}`)
    await waitFor(() => {
      const where = screen.getByLabelText("where").textContent ?? ""
      expect(new URLSearchParams(where.split("?")[1]).get("metric")).toBe("Tỷ lệ dự phòng / Dư nợ")
      expect(where.startsWith("/demo-trading?view=academy&")).toBe(true)
    })
  })

  it("keeps ?metric= from /hoc-vien and from the /academy alias, with the other parameters", async () => {
    renderRoutes("/hoc-vien?metric=roe")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?metric=roe&view=academy"))
  })

  it("serves /academy?metric= like /hoc-vien?metric=", async () => {
    renderRoutes("/academy?metric=ldr&from=dashboard")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/demo-trading?metric=ldr&from=dashboard&view=academy"))
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

  it("keeps a usable metric (argument first, else the query) and drops an empty or oversized one", () => {
    expect(academyWorkspaceLocation(undefined, "", "", "NIM").search).toBe("?view=academy&metric=NIM")
    expect(academyWorkspaceLocation(undefined, "?metric=old", "", "  new  ").search).toBe("?metric=new&view=academy")
    expect(academyWorkspaceLocation(undefined, "?metric=roe").search).toBe("?metric=roe&view=academy")
    expect(academyWorkspaceLocation(undefined, "?metric=%20%20").search).toBe("?view=academy")
    expect(academyWorkspaceLocation(undefined, "", "", "x".repeat(121)).search).toBe("?view=academy")
    expect(academyWorkspaceLocation("ch10-l01", "", "", "nim").search).toBe("?view=academy&lesson=ch10-l01&metric=nim")
  })
})

describe("parseMetricParam", () => {
  it("trims, and refuses empty, missing and oversized values", () => {
    expect(parseMetricParam(" NIM ")).toBe("NIM")
    expect(parseMetricParam("x".repeat(120))).toBe("x".repeat(120))
    expect(parseMetricParam("x".repeat(121))).toBeNull()
    expect(parseMetricParam("   ")).toBeNull()
    expect(parseMetricParam(null)).toBeNull()
    expect(parseMetricParam(undefined)).toBeNull()
  })
})
