import { render, screen, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider, useLocation } from "react-router"
import { describe, expect, it } from "vitest"

import { AcademyMetricRedirect, AcademyRedirect } from "./academy-redirect"
import { academyWorkspaceLocation, legacyWorkspaceLoader, parseMetricParam, resolveWorkspaceLocation, workspaceLoader } from "./workspace-url"

function Where() {
  const location = useLocation()
  return <output aria-label="where">{location.pathname}{location.search}{location.hash}</output>
}

function renderRoutes(initial: string) {
  const router = createMemoryRouter(
    [
      { path: "/demo-trading", loader: workspaceLoader, element: <Where /> },
      { path: "/dau-truong", loader: legacyWorkspaceLoader, element: <Where /> },
      { path: "/luyen-tap", loader: workspaceLoader, element: <Where /> },
      { path: "/flashback", loader: workspaceLoader, element: <Where /> },
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

const resolve = (url: string) => {
  const [pathname, search = ""] = url.split("?")
  const result = resolveWorkspaceLocation(pathname, search ? `?${search}` : "")
  return `${result.pathname}${result.search}`
}

describe("old /demo-trading links (layout v1.3 §6)", () => {
  it.each([
    // Đặt lệnh, Danh mục, Tin tức: one Giao dịch panel with three tabs.
    ["/demo-trading", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/demo-trading?view=trading&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/demo-trading?view=portfolio", "/luyen-tap?tool=giao-dich&tab=danh-muc"],
    ["/demo-trading?view=news&content=board", "/luyen-tap?tool=giao-dich&tab=tin-tuc&content=board"],
    ["/demo-trading?view=unknown", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    // Insight is hidden: its links open Đặt lệnh with the symbol.
    ["/demo-trading?view=insight&symbol=VNM", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=VNM"],
    ["/demo-trading?content=insight&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/demo-trading?view=portfolio&content=insight", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/demo-trading?content=ai-analysis&analysis=stock&symbol=VNM", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=VNM"],
    ["/demo-trading?content=ai-analysis&tour=phantich", "/luyen-tap?tool=giao-dich&tab=dat-lenh&tour=phantich"],
    // "AI Phân Tích" market view and the Thị trường tab.
    ["/demo-trading?content=ai-analysis&analysis=market&symbol=VNM", "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=market&symbol=VNM"],
    ["/demo-trading?content=ai-analysis&analysis=financial", "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=market"],
    ["/demo-trading?content=ai-analysis&analysis=stock&tour=bantin", "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=market&tour=bantin"],
    ["/demo-trading?content=ai-analysis&tour=bctc", "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=market"],
    ["/demo-trading?content=market", "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=market"],
    ["/demo-trading?content=chart&symbol=VNM", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=VNM"],
    // Retired main tabs and hidden tools land on the chart.
    ["/demo-trading?content=overview", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/demo-trading?content=journey", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/demo-trading?view=hunt&content=board&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/demo-trading?view=patterns", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    // Dashboard phân tích.
    ["/demo-trading?view=dashboard", "/luyen-tap?tool=phan-tich"],
    ["/demo-trading?content=dashboard&symbol=FPT", "/luyen-tap?tool=phan-tich&symbol=FPT"],
    ["/demo-trading?view=portfolio&content=dashboard", "/luyen-tap?tool=phan-tich"],
    // Học viện, Bot, Candle Dojo.
    ["/demo-trading?view=academy", "/luyen-tap?tool=hoc-vien"],
    ["/demo-trading?view=academy&lesson=ch01-l01&content=board", "/luyen-tap?tool=hoc-vien&lesson=ch01-l01"],
    ["/demo-trading?view=academy&metric=NIM", "/luyen-tap?tool=hoc-vien&metric=NIM"],
    ["/demo-trading?view=journey&symbol=FPT", "/luyen-tap?tool=hoc-vien&symbol=FPT"],
    ["/demo-trading?view=identity", "/luyen-tap?tool=hoc-vien"],
    ["/demo-trading?view=bot&practice=rsi&content=board", "/luyen-tap?tool=bot&practice=rsi"],
    ["/demo-trading?view=candle-dojo", "/luyen-tap?tool=candle-dojo"],
    // Shop and Flashback (an invite link keeps its room).
    ["/demo-trading?view=shop&content=market&analysis=stock&symbol=FPT", "/flashback?tool=shop&symbol=FPT"],
    ["/demo-trading?view=flashback&room=abc123", "/flashback?tool=flashback&room=abc123"],
    // Other params ride along; the old chart shell's `tool=` does not.
    ["/demo-trading?view=trading&tool=news&interval=W&tour=bantin", "/luyen-tap?tool=giao-dich&tab=dat-lenh&interval=W&tour=bantin"],
  ])("%s → %s", (from, to) => {
    expect(resolve(from)).toBe(to)
  })
})

describe("section routes", () => {
  it.each([
    "/luyen-tap",
    "/luyen-tap?tool=candle-dojo",
    "/luyen-tap?tool=hoc-vien&lesson=ch01-l01",
    "/luyen-tap?tool=bot&practice=x",
    "/luyen-tap?tool=giao-dich&tab=danh-muc&content=board&symbol=FPT",
    "/luyen-tap?symbol=FPT&tool=giao-dich&tab=tin-tuc",
    "/luyen-tap?tool=giao-dich&tab=dat-lenh&content=chart",
    "/luyen-tap?tool=phan-tich&symbol=FPT",
    "/flashback",
    "/flashback?tool=shop",
    "/flashback?tool=flashback&room=abc",
  ])("leaves %s alone", (url) => {
    const [pathname, search = ""] = url.split("?")
    expect(resolveWorkspaceLocation(pathname, search ? `?${search}` : "")).toEqual({ pathname, search: search ? `?${search}` : "", changed: false })
  })

  it.each([
    ["/luyen-tap?tool=giao-dich", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/luyen-tap?tool=giao-dich&tab=xyz", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/luyen-tap?tool=giao-dich&tab=danh-muc&content=dashboard", "/luyen-tap?tool=phan-tich"],
    ["/luyen-tap?tool=giao-dich&tab=danh-muc&content=insight&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/luyen-tap?tool=bot&tab=danh-muc&content=board", "/luyen-tap?tool=bot"],
    ["/luyen-tap?tool=unknown&symbol=FPT", "/luyen-tap?symbol=FPT"],
    ["/luyen-tap?tool=hunt", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
    ["/luyen-tap?view=academy&lesson=ch01-l01", "/luyen-tap?tool=hoc-vien&lesson=ch01-l01"],
    ["/luyen-tap?tool=portfolio&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT"],
    // A tool of the other section moves to its route.
    ["/luyen-tap?tool=shop&symbol=FPT", "/flashback?tool=shop&symbol=FPT"],
    ["/flashback?tool=giao-dich&tab=tin-tuc", "/luyen-tap?tool=giao-dich&tab=tin-tuc"],
    ["/flashback?tool=bot", "/luyen-tap?tool=bot"],
    ["/flashback?tool=shop&content=board&tab=dat-lenh", "/flashback?tool=shop"],
    ["/flashback?tool=nope", "/flashback"],
  ])("rewrites %s to %s", (from, to) => {
    expect(resolve(from)).toBe(to)
  })

  it.each([
    "/demo-trading?view=journey&content=ai-analysis&analysis=stock",
    "/demo-trading?view=hunt&content=board",
    "/demo-trading?content=ai-analysis&tour=bctc",
    "/demo-trading?view=shop&content=board&analysis=stock",
    "/luyen-tap?view=portfolio&content=dashboard",
    "/flashback?tool=giao-dich",
  ])("is idempotent: %s settles after one rewrite", (url) => {
    const once = resolve(url)
    const [pathname, search = ""] = once.split("?")
    expect(resolveWorkspaceLocation(pathname, search ? `?${search}` : "").changed).toBe(false)
  })

  it("redirects /demo-trading before anything renders", async () => {
    const router = renderRoutes("/demo-trading?view=journey&symbol=FPT")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=hoc-vien&symbol=FPT"))
    expect(router.state.location.pathname).toBe("/luyen-tap")
  })

  it("redirects an old Flashback invite link straight to the room's section", async () => {
    renderRoutes("/demo-trading?view=flashback&room=r-1")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/flashback?tool=flashback&room=r-1"))
  })

  it("redirects /dau-truong like /demo-trading", async () => {
    renderRoutes("/dau-truong?symbol=FPT")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"))
  })

  it("does not redirect a current URL", async () => {
    renderRoutes("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=board")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=board"))
  })
})

describe("/hoc-vien redirect", () => {
  it("opens the workspace Học viện tool", async () => {
    renderRoutes("/hoc-vien")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=hoc-vien"))
  })

  it("preserves the lesson id as a URL param", async () => {
    renderRoutes("/hoc-vien/ch01-l01")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=hoc-vien&lesson=ch01-l01"))
  })

  it("sends /hoc-vien/bai/:metric to the tool with the metric name (spec v4 §6)", async () => {
    renderRoutes("/hoc-vien/bai/NIM")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?tool=hoc-vien&metric=NIM"))
  })

  it("decodes a metric name with accents, spaces and a slash", async () => {
    renderRoutes(`/hoc-vien/bai/${encodeURIComponent("Tỷ lệ dự phòng / Dư nợ")}`)
    await waitFor(() => {
      const where = screen.getByLabelText("where").textContent ?? ""
      expect(new URLSearchParams(where.split("?")[1]).get("metric")).toBe("Tỷ lệ dự phòng / Dư nợ")
      expect(where.startsWith("/luyen-tap?tool=hoc-vien&")).toBe(true)
    })
  })

  it("keeps ?metric= from /hoc-vien and from the /academy alias, with the other parameters", async () => {
    renderRoutes("/hoc-vien?metric=roe")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?metric=roe&tool=hoc-vien"))
  })

  it("serves /academy?metric= like /hoc-vien?metric=", async () => {
    renderRoutes("/academy?metric=ldr&from=dashboard")
    await waitFor(() => expect(screen.getByLabelText("where").textContent).toBe("/luyen-tap?metric=ldr&from=dashboard&tool=hoc-vien"))
  })

  it("keeps other query params and drops a lesson id that is not a plausible id", () => {
    expect(academyWorkspaceLocation("ch02-l14", "?from=chien-luoc", "#x")).toEqual({
      pathname: "/luyen-tap",
      search: "?from=chien-luoc&tool=hoc-vien&lesson=ch02-l14",
      hash: "#x",
    })
    expect(academyWorkspaceLocation("../etc/passwd").search).toBe("?tool=hoc-vien")
    expect(academyWorkspaceLocation(undefined).search).toBe("?tool=hoc-vien")
  })

  it("keeps a usable metric (argument first, else the query) and drops an empty or oversized one", () => {
    expect(academyWorkspaceLocation(undefined, "", "", "NIM").search).toBe("?tool=hoc-vien&metric=NIM")
    expect(academyWorkspaceLocation(undefined, "?metric=old", "", "  new  ").search).toBe("?metric=new&tool=hoc-vien")
    expect(academyWorkspaceLocation(undefined, "?metric=roe").search).toBe("?metric=roe&tool=hoc-vien")
    expect(academyWorkspaceLocation(undefined, "?metric=%20%20").search).toBe("?tool=hoc-vien")
    expect(academyWorkspaceLocation(undefined, "", "", "x".repeat(121)).search).toBe("?tool=hoc-vien")
    expect(academyWorkspaceLocation("ch10-l01", "", "", "nim").search).toBe("?tool=hoc-vien&lesson=ch10-l01&metric=nim")
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
