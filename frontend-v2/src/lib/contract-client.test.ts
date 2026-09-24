import { afterEach, describe, expect, it, vi } from "vitest"
import { requestOperation, requestOperationResponse } from "./contract-client"
import { api, apiResponse } from "./api"

vi.mock("./api", () => ({ api: vi.fn(), apiResponse: vi.fn() }))
afterEach(() => vi.resetAllMocks())

describe("generated canonical API operation access", () => {
  it("serializes the generated binary upload body as multipart rather than empty JSON", async () => {
    const file = new File(["image"], "test.png", { type: "image/png" })
    await requestOperation("POST /api/v2/admin/lessons/courses/{courseId}/thumbnail", { path: { courseId: "course-1" }, body: { file } })
    const [path, options] = vi.mocked(api).mock.calls[0]!
    expect(path).toBe("/admin/lessons/courses/course-1/thumbnail")
    expect(options?.body).toBeInstanceOf(FormData)
    expect((options?.body as FormData).get("file")).toBe(file)
  })
  it("uses generated parameter names and retains false/zero query values", async () => {
    vi.mocked(api).mockResolvedValue({ data: [], meta: {} })
    await requestOperation("GET /api/v2/instruments", { query: { q: "VCB", include_indices: false, page: 1 } })
    expect(api).toHaveBeenCalledWith("/instruments?q=VCB&include_indices=false&page=1", { method: "GET", body: undefined })
  })
  it("encodes path components without interpreting them as URL paths", async () => {
    await requestOperation("GET /api/v2/instruments/{symbol}", { path: { symbol: "A/B" } })
    expect(api).toHaveBeenCalledWith("/instruments/A%2FB", expect.objectContaining({ method: "GET" }))
  })
  it("keeps CSV response headers and cancellation intact", async () => {
    const response = new Response("id,email", { headers: { "Content-Type": "text/csv" } })
    const controller = new AbortController()
    vi.mocked(apiResponse).mockResolvedValue(response)
    expect(await requestOperationResponse("GET /api/v2/admin/users/export", {}, { signal: controller.signal })).toBe(response)
    expect(apiResponse).toHaveBeenCalledWith("/admin/users/export", expect.objectContaining({ signal: controller.signal }))
  })
})
