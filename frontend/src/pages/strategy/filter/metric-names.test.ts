import { describe, expect, it } from "vitest"

import { metricsFixture } from "../test-support"
import { libraryBlocks, metricName } from "./metric-names"
import type { ScreenerMetric } from "./types"

const metrics = metricsFixture(["revenue_yoy", "profit_yoy", "eps_yoy", "gross_margin", "net_margin", "roe", "roic"])

describe("names and blocks of the Dashboard", () => {
  it("shows the Dashboard name instead of the lesson name", () => {
    const name = (id: string) => metricName(metrics.find((item) => item.id === id)!)
    expect(name("revenue_yoy")).toBe("Tăng trưởng doanh thu")
    expect(name("profit_yoy")).toBe("Tăng trưởng LNST")
    expect(name("net_margin")).toBe("Biên lợi nhuận ròng")
  })

  it("keeps the API name of a metric the Dashboard does not have", () => {
    expect(metricName({ id: "fcf_yoy", name: "Tăng trưởng FCF YoY" } as Pick<ScreenerMetric, "id" | "name">)).toBe("Tăng trưởng FCF YoY")
  })

  it("arranges the library in the blocks and groups of the Dashboard, without any chapter heading", () => {
    const blocks = libraryBlocks(metrics, "")
    expect(blocks.map((block) => block.title)).toEqual(["Chỉ tiêu chung", "Chỉ tiêu doanh nghiệp sản xuất"])
    expect(blocks[0]!.groups.map((group) => [group.title, group.metrics.map((item) => item.id)])).toEqual([
      ["Tăng trưởng", ["revenue_yoy", "profit_yoy", "eps_yoy"]],
      // ROA is not open for this account: it is not listed (the catalog dialog names it).
      ["Hiệu quả", ["roe", "net_margin"]],
    ])
    expect(blocks[1]!.groups.map((group) => [group.title, group.metrics.map((item) => item.id)])).toEqual([["Hiệu quả và biên lợi nhuận", ["gross_margin", "roic"]]])
    expect(JSON.stringify(blocks)).not.toMatch(/Chương|Chưa mở|đã mở/)
  })

  it("puts an open metric the Dashboard lacks in the last block Khác, and no locked one", () => {
    const extra = (learned: boolean) => ({ ...metrics[0]!, id: "fcf_yoy", name: "Tăng trưởng FCF YoY", learned }) as ScreenerMetric
    expect(libraryBlocks([...metrics, extra(true)], "").at(-1)).toMatchObject({ title: "Khác", groups: [{ title: null, metrics: [{ id: "fcf_yoy" }] }] })
    expect(libraryBlocks([...metrics, extra(false)], "").map((block) => block.title)).not.toContain("Khác")
  })

  it("searches by the Dashboard name, ignoring case and accents, and drops what is left empty", () => {
    const blocks = libraryBlocks(metrics, "tang truong")
    expect(blocks.map((block) => block.title)).toEqual(["Chỉ tiêu chung"])
    expect(blocks[0]!.groups.flatMap((group) => group.metrics.map((item) => item.id))).toEqual(["revenue_yoy", "profit_yoy", "eps_yoy"])
    expect(libraryBlocks(metrics, "khong co chi tieu nay")).toEqual([])
  })
})
