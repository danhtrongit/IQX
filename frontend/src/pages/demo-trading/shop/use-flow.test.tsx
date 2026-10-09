import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useWorkspace } from "../workspace/use-workspace"
import { resetEnsuredWorkspaces } from "../workspace/workspace-api"
import { ShopMain } from "./shop-main"
import { createShopBackend, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend

/** What the rest of the workspace draws: the mascot stage reads this exact hook. */
function StageProbe() {
  const { mascotId } = useWorkspace()
  return <output data-testid="stage-mascot">{mascotId}</output>
}

async function setup(options: BackendOptions = {}) {
  backend = createShopBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const view = renderWithProviders(<><StageProbe /><ShopMain onNavigate={vi.fn()} /></>)
  await screen.findByRole("heading", { name: "Linh thú" })
  return view
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-shop-card="${id}"]`) as HTMLElement
const puts = () => backend.callsTo("PUT", "/shop/active-mascot")

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  resetEnsuredWorkspaces()
})

describe("Sử dụng", () => {
  it("switches with the revision it read and the mascot stage everywhere follows without a reload", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long"], active: "bach_ho", revision: 3 })
    await waitFor(() => expect(screen.getByTestId("stage-mascot").textContent).toBe("bach_ho"))
    const workspaceReads = () => backend.callsTo("GET", "/workspace/state").length
    const before = workspaceReads()

    await user.click(within(card("thanh_long")).getByRole("button", { name: "Sử dụng" }))

    await waitFor(() => expect(screen.getByTestId("stage-mascot").textContent).toBe("thanh_long"))
    expect(puts()).toHaveLength(1)
    expect(puts()[0].body).toEqual({ mascot_id: "thanh_long", expected_revision: 3 })
    expect(workspaceReads()).toBeGreaterThan(before)
    expect(mocks.toast.success).toHaveBeenCalledWith("Đang sử dụng Thanh Long", expect.anything())
    await waitFor(() => expect(card("thanh_long").getAttribute("data-card-state")).toBe("active"))
    // Switching is free and touches nothing but the display profile.
    expect(backend.state.balance).toBe(500)
    expect(backend.callsTo("POST", "/shop/purchases")).toHaveLength(0)
  })

  it("switching back to Bạch Hổ is free and keeps every owned mascot", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long"], active: "thanh_long" })
    await user.click(screen.getByRole("tab", { name: "Đã sở hữu" }))
    await user.click(within(card("bach_ho")).getByRole("button", { name: "Sử dụng" }))
    await waitFor(() => expect(screen.getByTestId("stage-mascot").textContent).toBe("bach_ho"))
    expect(backend.state.owned).toEqual(["bach_ho", "thanh_long"])
    expect(backend.state.balance).toBe(500)
  })

  it("ignores a second click while the first request is in flight", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long", "kim_quy"] })
    let release: (() => void) | undefined
    backend.intercept((call) => call.method === "PUT", (call) => new Promise((resolve) => {
      release = () => resolve(backend.handle(call.path, { method: "PUT", body: JSON.stringify(call.body) }))
    }))
    await user.click(within(card("thanh_long")).getByRole("button", { name: "Sử dụng" }))
    const other = within(card("kim_quy")).getByRole("button", { name: "Sử dụng" }) as HTMLButtonElement
    await waitFor(() => expect(other.disabled).toBe(true))
    await user.click(other)
    expect(puts()).toHaveLength(1)
    release?.()
    await waitFor(() => expect(card("thanh_long").getAttribute("data-card-state")).toBe("active"))
  })

  it("on a revision conflict (another tab switched first) it refetches, says so and does not overwrite", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long", "loc_huou"], active: "bach_ho" })
    backend.state.active = "loc_huou"
    backend.state.revision = 2

    await user.click(within(card("thanh_long")).getByRole("button", { name: "Sử dụng" }))

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(mocks.toast.error.mock.calls[0][0]).toContain("đã được thay đổi ở nơi khác")
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(puts()).toHaveLength(1)
    expect(backend.state.active).toBe("loc_huou")
    await waitFor(() => expect(card("loc_huou").getAttribute("data-card-state")).toBe("active"))
    expect(card("thanh_long").getAttribute("data-card-state")).toBe("owned")
    await waitFor(() => expect(screen.getByTestId("stage-mascot").textContent).toBe("loc_huou"))
  })

  it("when the server says the mascot is not owned it refetches and shows it as buyable again", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long"] })
    backend.state.owned = ["bach_ho"]

    await user.click(within(card("thanh_long")).getByRole("button", { name: "Sử dụng" }))

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(mocks.toast.error.mock.calls[0][0]).toContain("Bạn chưa sở hữu Thanh Long")
    await waitFor(() => expect(card("thanh_long").getAttribute("data-card-state")).toBe("buy"))
    expect(screen.getByTestId("shop-owned-count").textContent).toBe("1 / 5 đã sở hữu")
    expect(screen.getByTestId("stage-mascot").textContent).toBe("bach_ho")
  })

  it("a network failure is never reported as a change", async () => {
    const user = userEvent.setup()
    await setup({ owned: ["bach_ho", "thanh_long"] })
    backend.intercept((call) => call.method === "PUT", () => { throw new TypeError("Failed to fetch") })
    await user.click(within(card("thanh_long")).getByRole("button", { name: "Sử dụng" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(card("thanh_long").getAttribute("data-card-state")).toBe("owned")
    expect(screen.getByTestId("stage-mascot").textContent).toBe("bach_ho")
  })
})
