import { beforeEach, describe, expect, it, vi } from "vitest"

const shared = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, api: shared.api }
})

import { getFilter, getScreenerMetrics, listLists, runScreener } from "./api"

beforeEach(() => shared.api.mockReset())

describe("filter api client", () => {
  it("unwraps the {data} envelope and calls the /strategy paths", async () => {
    shared.api.mockResolvedValueOnce({ data: [{ id: "roe" }] })
    expect(await getScreenerMetrics()).toEqual([{ id: "roe" }])
    expect(shared.api.mock.calls[0][0]).toBe("/strategy/screener/metrics")

    shared.api.mockResolvedValueOnce({ data: { as_of: "2026-05-04", results: [] } })
    const definition = {
      schema_version: "2.0" as const,
      name: "x",
      logic: "AND" as const,
      rules: [],
      scope: { market: "all", sector: "all", period: "TTM" as const },
    }
    expect(await runScreener(definition)).toEqual({ as_of: "2026-05-04", results: [] })
    const [path, init] = shared.api.mock.calls[1]
    expect(path).toBe("/strategy/screener/run")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual(definition)
  })

  it("normalizes saved filters and lists from enveloped payloads", async () => {
    shared.api.mockResolvedValueOnce({
      data: { id: "f1", name: "ROE cao", current_version: 3, versions: [{ version: 2, definition: { v: 2 } }, { version: 3, definition: { v: 3 } }] },
    })
    expect(await getFilter("f1")).toMatchObject({ id: "f1", current_version: 3, definition: { v: 3 } })
    expect(shared.api.mock.calls[0][0]).toBe("/strategy/filters/f1")

    shared.api.mockResolvedValueOnce({ data: [{ id: "l1", name: "DS", tickers: ["AAA", 1], as_of: "2026-05-04" }] })
    expect(await listLists()).toEqual([
      expect.objectContaining({ id: "l1", tickers: ["AAA"], as_of: "2026-05-04", filter_id: null }),
    ])
    expect(shared.api.mock.calls[1][0]).toBe("/strategy/lists")
  })
})
