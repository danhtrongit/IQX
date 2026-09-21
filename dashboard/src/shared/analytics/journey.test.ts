import { beforeEach, describe, expect, it, vi } from "vitest"
import { trackJourneyEvent } from "./journey"

const { post, getAccessToken } = vi.hoisted(() => ({
  post: vi.fn(() => Promise.resolve()), getAccessToken: vi.fn((): string | null => "session-token"),
}))
vi.mock("@/shared/http/client", () => ({ api: { post }, getAccessToken }))

beforeEach(() => {
  post.mockReset().mockResolvedValue(undefined)
  getAccessToken.mockReset().mockReturnValue("session-token")
})

describe("journey telemetry", () => {
  it("sends a unique event without client identity or client timestamps", () => {
    trackJourneyEvent("tour_bctc_step_view", { step_id: 2 })
    const [path, options] = post.mock.calls[0] as unknown as [string, { json: Record<string, unknown> }]
    expect(path).toBe("journey/events")
    expect(options.json).toEqual({ event_id: expect.any(String), name: "tour_bctc_step_view", fields: { step_id: 2 } })
  })

  it("does not send anonymous events through an authenticated API", () => {
    getAccessToken.mockReturnValue(null)
    trackJourneyEvent("mascot_view")
    expect(post).not.toHaveBeenCalled()
  })

  it("never interrupts a user action when telemetry transport fails", async () => {
    post.mockRejectedValue(new Error("offline"))
    expect(() => trackJourneyEvent("cap3_ketso_view")).not.toThrow()
    await Promise.resolve()
    getAccessToken.mockImplementation(() => { throw new Error("storage unavailable") })
    expect(() => trackJourneyEvent("cap3_ketso_view")).not.toThrow()
  })
})
