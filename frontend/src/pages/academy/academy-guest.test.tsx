import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeAcademyApi } from "./test-api"
import { renderAcademy, stubBrowser } from "./test-support"
import { resetAcademyViewState } from "./view-state"

const mocks = vi.hoisted(() => ({ api: vi.fn(), openAuth: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false, openAuth: mocks.openAuth }) }))
vi.mock("@/pages/demo-trading/workspace/mascot-stage", () => ({ MascotStage: () => <div data-testid="mascot-stage" /> }))

beforeEach(() => {
  stubBrowser()
  resetAcademyViewState()
  mocks.openAuth.mockReset()
  mocks.api.mockImplementation(createFakeAcademyApi().handler)
})
afterEach(() => vi.unstubAllGlobals())

describe("Học viện for a guest", () => {
  it("asks to sign in instead of showing a list or a fake 0 / 71, and requests nothing", async () => {
    const user = userEvent.setup()
    renderAcademy("/demo-trading?view=academy&lesson=ch01-l01")
    expect(screen.getByText("Đăng nhập để học")).toBeTruthy()
    expect(screen.queryByText(/\/ 71/)).toBeNull()
    expect(screen.queryByRole("progressbar")).toBeNull()
    // The deep link does not leave a skeleton hanging on the left: the mascot stage stays.
    expect(screen.getByTestId("mascot-stage")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    expect(mocks.openAuth).toHaveBeenCalledWith("login")
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
