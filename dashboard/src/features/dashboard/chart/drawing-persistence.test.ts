import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAccessToken } from "@/shared/http/client"
import { chartDrawingsApi } from "./drawings-api"
import { createDrawingPersistence } from "./drawing-persistence"

vi.mock("@/shared/http/client", () => ({ getAccessToken: vi.fn() }))
vi.mock("./drawings-api", () => ({
  chartDrawingsApi: { get: vi.fn(), put: vi.fn() },
}))

function signIn(sub: string, version = 1) {
  vi.mocked(getAccessToken).mockReturnValue(`header.${btoa(JSON.stringify({ sub, version }))}.signature`)
}

const stateA = { charts: [{ name: "account-a-drawing" }] }
const stateB = { charts: [{ name: "account-b-drawing" }] }

describe("drawing ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(chartDrawingsApi.get).mockResolvedValue({ symbol: "VNM", state: null, updated_at: null })
    vi.mocked(chartDrawingsApi.put).mockResolvedValue({ symbol: "VNM", state: null, updated_at: null })
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("restores guest drawings without uploading them to a new account", async () => {
    const persistence = createDrawingPersistence()
    persistence.save("vnm", stateA)
    expect(await persistence.load("VNM")).toEqual(stateA)
    signIn("account-a")
    expect(await persistence.load("VNM")).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(chartDrawingsApi.put).not.toHaveBeenCalled()
  })

  it("keeps offline copies separate across accounts and logout", async () => {
    const persistence = createDrawingPersistence()
    vi.mocked(chartDrawingsApi.get).mockRejectedValue(new Error("offline"))
    signIn("account-a")
    persistence.save("VNM", stateA)
    signIn("account-b")
    expect(await persistence.load("VNM")).toBeNull()
    persistence.save("VNM", stateB)
    expect(await persistence.load("VNM")).toEqual(stateB)
    vi.mocked(getAccessToken).mockReturnValue(null)
    expect(await persistence.load("VNM")).toBeNull()
    signIn("account-a", 2)
    expect(await persistence.load("VNM")).toEqual(stateA)
  })

  it("does not import unowned legacy drawings into any session", async () => {
    localStorage.setItem("tv_drawings_VNM", JSON.stringify(stateA))
    const persistence = createDrawingPersistence()
    expect(await persistence.load("VNM")).toBeNull()
    signIn("account-b")
    expect(await persistence.load("VNM")).toBeNull()
    expect(localStorage.getItem("tv_drawings_VNM")).not.toBeNull()
  })

  it("drops a delayed load response after switching accounts", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof chartDrawingsApi.get>>) => void
    vi.mocked(chartDrawingsApi.get).mockReturnValue(new Promise((done) => { resolve = done }))
    signIn("account-a")
    const pending = createDrawingPersistence().load("VNM")
    signIn("account-b")
    resolve({ symbol: "VNM", state: stateA, updated_at: null })
    expect(await pending).toBeNull()
  })

  it("never sends a queued save using the next account's session", async () => {
    const persistence = createDrawingPersistence()
    signIn("account-a")
    persistence.save("VNM", stateA)
    signIn("account-b")
    persistence.save("FPT", stateB)
    await vi.advanceTimersByTimeAsync(1500)
    expect(chartDrawingsApi.put).toHaveBeenCalledTimes(1)
    expect(chartDrawingsApi.put).toHaveBeenCalledWith("FPT", stateB)
  })

  it("allows a token refresh for the same account while a save is pending", async () => {
    const persistence = createDrawingPersistence()
    signIn("account-a")
    persistence.save("VNM", stateA)
    signIn("account-a", 2)
    await vi.advanceTimersByTimeAsync(1500)
    expect(chartDrawingsApi.put).toHaveBeenCalledWith("VNM", stateA)
  })

  it("does not use the guest cache for a malformed signed-in token", async () => {
    const persistence = createDrawingPersistence()
    persistence.save("VNM", stateA)
    vi.mocked(getAccessToken).mockReturnValue("invalid-token")
    persistence.save("VNM", stateB)
    expect(await persistence.load("VNM")).toBeNull()
    expect(chartDrawingsApi.get).not.toHaveBeenCalled()
    expect(chartDrawingsApi.put).not.toHaveBeenCalled()
  })
})
