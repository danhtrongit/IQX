import { describe, expect, it, vi } from "vitest"
import { ApiError, createApiClient } from "../src"
describe("api client", () => {
 it("parses errors and sends idempotency", async () => { const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:"X",message:"bad"}}),{status:409})); const api=createApiClient({fetch:fetcher}); await expect(api("/x",{method:"POST",body:{a:1},idempotencyKey:"k"})).rejects.toBeInstanceOf(ApiError); expect(fetcher.mock.calls[0][1].headers.get("Idempotency-Key")).toBe("k") })
})
