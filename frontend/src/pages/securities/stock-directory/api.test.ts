import { beforeEach, describe, expect, it, vi } from "vitest"

const { api } = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", () => ({ api }))

import { fetchDirectorySymbols } from "./api"

describe("fetchDirectorySymbols", () => {
  beforeEach(() => {
    api.mockReset()
  })

  it("maps the canonical data envelope to directory symbols", async () => {
    api.mockResolvedValue({
      data: [
        {
          symbol: " fpt ",
          name: "FPT Corporation",
          short_name: "FPT",
          exchange: "HOSE",
          asset_type: "stock",
          icb_lv1: "Technology",
          icb_lv2: "Software",
          logo_url: "https://example.test/fpt.png",
        },
        { ticker: "vnm", organ_name: "Vinamilk", is_index: true },
        { name: "missing symbol" },
      ],
      meta: { pagination: { total_pages: 1 } },
    })

    await expect(fetchDirectorySymbols()).resolves.toEqual([
      {
        symbol: "FPT",
        name: "FPT Corporation",
        shortName: "FPT",
        exchange: "HOSE",
        assetType: "stock",
        isIndex: false,
        icbLv1: "Technology",
        icbLv2: "Software",
        logoUrl: "https://example.test/fpt.png",
      },
      {
        symbol: "VNM",
        name: "Vinamilk",
        shortName: null,
        exchange: null,
        assetType: null,
        isIndex: true,
        icbLv1: null,
        icbLv2: null,
        logoUrl: null,
      },
    ])
    expect(api).toHaveBeenCalledWith("/instruments?asset_type=stock&page=1&page_size=100")
  })

  it("returns an empty list when data is null", async () => {
    api.mockResolvedValue({ data: null, meta: { pagination: { total_pages: 1 } } })
    await expect(fetchDirectorySymbols()).resolves.toEqual([])
  })

  it("propagates API failures to the caller", async () => {
    const error = new Error("catalog unavailable")
    api.mockRejectedValue(error)
    await expect(fetchDirectorySymbols()).rejects.toBe(error)
  })
})
