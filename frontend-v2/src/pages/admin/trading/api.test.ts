import { describe, expect, it } from "vitest"

import { adaptVtPage } from "./api"

describe("virtual trading pagination adapter", () => {
  it("keeps empty pages safe and computes a usable page count", () => {
    expect(adaptVtPage({ data: [], total: 0, page: 1, pageSize: 25 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
      total_pages: 1,
    })
  })
})
