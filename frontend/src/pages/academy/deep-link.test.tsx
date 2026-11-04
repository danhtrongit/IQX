import { act, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createFakeAcademyApi } from "./test-api"
import { renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn(), auth: { authenticated: true } }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mocks.auth.authenticated ? { id: "learner-1" } : null,
    isAuthenticated: mocks.auth.authenticated,
    isLoading: false,
    openAuth: vi.fn(),
  }),
}))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

let fake: ReturnType<typeof createFakeAcademyApi>

function install(options: Parameters<typeof createFakeAcademyApi>[0] = {}) {
  fake = createFakeAcademyApi(options)
  mocks.api.mockImplementation(fake.handler)
}

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  mocks.auth.authenticated = true
  Element.prototype.scrollIntoView = vi.fn()
  install()
})
afterEach(() => vi.unstubAllGlobals())

const linkCalls = () => fake.calls.filter((call) => call.startsWith("GET /academy/link"))
const linkRequests = () => mocks.api.mock.calls.map(([path]) => String(path)).filter((path) => path.startsWith("/academy/link"))

describe("deep link by metric (spec v4 §6)", () => {
  it("opens the lesson of a metric_key and replaces the metric parameter with the lesson", async () => {
    const { router } = renderAcademy("/demo-trading?view=academy&symbol=FPT&metric=nim")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 10.1" })).toBeTruthy()
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT&lesson=ch10-l01")
    expect(linkRequests()).toEqual(["/academy/link?metric=nim"])
    // The panel shows the chapter of that lesson and marks its row as the open one.
    const panel = screen.getByRole("complementary", { name: "Học viện" })
    await waitFor(() => expect(panel.querySelector('[data-academy-row="ch10-l01"] [aria-current="true"]')).not.toBeNull())
    expect(within(panel).getByRole("button", { name: /^Chương 10 · Phân tích ngân hàng/ }).getAttribute("aria-expanded")).toBe("true")
  })

  it("matches a metric_key without regard to case and surrounding spaces, and a lesson name too", async () => {
    const first = renderAcademy("/demo-trading?view=academy&metric=%20Provision_To_Loans%20")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 10.7" })).toBeTruthy()
    expect(first.router.state.location.search).toBe("?view=academy&lesson=ch10-l07")
    first.unmount()

    // The fake catalog names lessons "Bài học c.n": an exact name resolves like a title match does on the server.
    const byName = renderAcademy("/demo-trading?view=academy&metric=B%C3%A0i%20h%E1%BB%8Dc%2012.3")
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 12.3" })).toBeTruthy()
    expect(byName.router.state.location.search).toBe("?view=academy&lesson=ch12-l03")
  })

  it("never shows an error for a name no lesson teaches: it opens the lesson being learned", async () => {
    install({ completed: ["concept:ch01_l01"] })
    const { router } = renderAcademy("/demo-trading?view=academy&metric=khong-co-chi-tieu-nay")
    // Nothing was opened before and one lesson is passed: the first lesson still to pass is the current one.
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 1.2" })).toBeTruthy()
    expect(router.state.location.search).toBe("?view=academy&lesson=ch01-l02")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("opens the lesson opened last when the name does not match", async () => {
    install()
    const { router } = renderAcademy("/demo-trading?view=academy&lesson=ch07-l03")
    await screen.findByRole("heading", { level: 2, name: "Bài học 7.3" })
    await act(async () => {
      await router.navigate("/demo-trading?view=academy&lesson=ch01-l01&metric=nope")
    })
    // The server remembers ch07-l03 as the lesson opened last, so a miss leads back to it.
    await waitFor(() => expect(router.state.location.search).toBe("?view=academy&lesson=ch07-l03"))
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 7.3" })).toBeTruthy()
  })

  it("switches at once when the link changes while the tool is open", async () => {
    const { router } = renderAcademy("/demo-trading?view=academy&metric=nim")
    await screen.findByRole("heading", { level: 2, name: "Bài học 10.1" })
    await act(async () => {
      await router.navigate("/demo-trading?view=academy&lesson=ch10-l01&metric=ldr")
    })
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 10.9" })).toBeTruthy()
    expect(router.state.location.search).toBe("?view=academy&lesson=ch10-l09")
    expect(linkRequests()).toEqual(["/academy/link?metric=nim", "/academy/link?metric=ldr"])
  })

  it("shows a placeholder, not the mascot, while the link is being resolved", async () => {
    const release = fake.hold("/academy/link")
    renderAcademy("/demo-trading?view=academy&metric=nim", { panel: false })
    expect(await screen.findByRole("status", { name: "Đang mở bài học" })).toBeTruthy()
    expect(screen.queryByTestId("mascot-stage")).toBeNull()
    release()
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 10.1" })).toBeTruthy()
    expect(screen.queryByRole("status", { name: "Đang mở bài học" })).toBeNull()
  })

  it("drops the parameter without an error when the request fails", async () => {
    fake.fail("link", new ApiError("Dịch vụ tạm thời không khả dụng", 503, "SERVICE_UNAVAILABLE"))
    const { router } = renderAcademy("/demo-trading?view=academy&metric=nim")
    await waitFor(() => expect(router.state.location.search).toBe("?view=academy"))
    expect(await screen.findByTestId("mascot-stage")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("drops an empty or oversized value without asking the server", async () => {
    const empty = renderAcademy("/demo-trading?view=academy&metric=%20%20")
    await waitFor(() => expect(empty.router.state.location.search).toBe("?view=academy"))
    empty.unmount()
    const oversized = renderAcademy(`/demo-trading?view=academy&metric=${"x".repeat(121)}`)
    await waitFor(() => expect(oversized.router.state.location.search).toBe("?view=academy"))
    expect(linkCalls()).toEqual([])
  })

  it("keeps the parameter for a guest, asks nothing, and resolves it after sign-in", async () => {
    mocks.auth.authenticated = false
    const { router } = renderAcademy("/demo-trading?view=academy&metric=nim")
    expect(screen.getByText("Đăng nhập để học")).toBeTruthy()
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    expect(router.state.location.search).toBe("?view=academy&metric=nim")
    expect(mocks.api).not.toHaveBeenCalled()

    mocks.auth.authenticated = true
    await act(async () => {
      await router.navigate("/demo-trading?view=academy&metric=nim&symbol=FPT")
    })
    expect(await screen.findByRole("heading", { level: 2, name: "Bài học 10.1" })).toBeTruthy()
    expect(router.state.location.search).toBe("?view=academy&symbol=FPT&lesson=ch10-l01")
  })
})
