import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PropFlowCard } from "./prop-flow-card"

describe("proprietary money flow labels", () => {
  it("keeps negative net sign and does not infer comparison when foreign flow is missing", () => {
    const html = renderToStaticMarkup(<PropFlowCard data={{ total_buy_vnd_billion: 100, total_sell_vnd_billion: 200, net_vnd_billion: -100, last_12_sessions: [], top_buy: [], top_sell: [] }} />)
    expect(html).toContain("Tổng mua")
    expect(html).toContain("Tổng bán")
    expect(html).toContain("-100")
    expect(html).toContain("Chưa có số liệu khối ngoại để đối chiếu")
    expect(html).not.toContain("cùng chiều khối ngoại")
  })
})
