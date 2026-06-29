import { describe, it, expect, vi, beforeEach } from "vitest"

const post = vi.fn()
vi.mock("@/shared/http/client", () => ({ api: { post: (...a: unknown[]) => post(...a) } }))

import { portfolioManagerApi } from "./api"

describe("portfolioManagerApi.analyze", () => {
  beforeEach(() => post.mockReset())
  it("POSTs to portfolio-manager/analyze with a long timeout and returns the body", async () => {
    const body = { analysis: { meta: {} }, narrative: { title: "x" }, meta: { valid: true, cached: false } }
    post.mockReturnValue({ json: () => Promise.resolve(body) })
    const res = await portfolioManagerApi.analyze()
    expect(post).toHaveBeenCalledWith("portfolio-manager/analyze", { timeout: 120_000 })
    expect(res).toEqual(body)
  })
})
