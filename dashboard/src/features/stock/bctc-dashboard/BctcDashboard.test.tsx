import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"

import type { BctcDashboardData, BctcNarrative } from "./types"

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Mock the data hooks so the component renders from fixtures without a network /
// QueryClient, and stub PremiumGate to a pass-through so the AI memo renders
// (premium gating is tested elsewhere — here we assert assembly).
const h = vi.hoisted(() => ({
  compute: null as unknown,
  ai: null as unknown,
}))

vi.mock("./hooks", () => ({
  useBctcDashboard: () => ({
    data: h.compute,
    isLoading: h.compute == null,
    isError: false,
  }),
  useBctcDashboardAi: () => ({
    data: h.ai,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { BctcDashboard } from "./BctcDashboard"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const metric = (key: string, label: string, value: number, unit: string) => ({
  key,
  label,
  value,
  unit,
  peer_median: null,
  color: null,
})

const fixtureA: BctcDashboardData = {
  template: "A",
  sub_sector: "CNTT/Dịch vụ",
  hero: {
    ticker: "FPT",
    name: "CTCP FPT",
    exchange: "HOSE",
    sector: "Công nghệ thông tin",
    price: 135000,
    fair_value: 141000,
    upside_pct: 0.044,
  },
  radar: {
    dims: [
      { key: "business", label: "Kinh doanh", score: 80, band: "good", value_label: "18.7%", value: 0.187 },
      { key: "profitability", label: "Sinh lời", score: 90, band: "good", value_label: "24.1%", value: 0.241 },
      { key: "cashflow", label: "Dòng tiền", score: 75, band: "good", value_label: "1.18×", value: 1.18 },
      { key: "safety", label: "An toàn tài chính", score: 85, band: "good", value_label: "-0.50×", value: -0.5 },
      { key: "valuation", label: "Định giá", score: 55, band: "warn", value_label: "4.4%", value: 0.044 },
    ],
  },
  blocks: {
    financial: {
      stacked_abs: [
        { year: 2020, equity: 20000e9, other_liab: 8000e9, debt: 5000e9 },
        { year: 2024, equity: 40000e9, other_liab: 12000e9, debt: 9000e9 },
      ],
      growth_sources: [
        { label: "Lợi nhuận giữ lại", amount: 20000e9, pct: 0.72 },
        { label: "Nợ vận hành", amount: 4000e9, pct: 0.14 },
        { label: "Vay nợ", amount: 4000e9, pct: 0.14 },
      ],
      totals: [
        { label: "Tổng tài sản", value: 61000e9, mult: 2.1 },
        { label: "Vốn chủ sở hữu", value: 40000e9, mult: 2.0 },
        { label: "Nợ phải trả", value: 21000e9, mult: 1.6 },
      ],
      asset_mix: [
        { label: "Tiền & ĐT ngắn hạn", pct: 0.38 },
        { label: "Phải thu khách hàng", pct: 0.27 },
        { label: "Tài sản cố định", pct: 0.16 },
        { label: "Khác", pct: 0.19 },
      ],
    },
    business: {
      revenue_series: [
        { year: 2020, revenue: 30000e9, gross_margin: 0.39, net_margin: 0.15 },
        { year: 2024, revenue: 60000e9, gross_margin: 0.41, net_margin: 0.16 },
      ],
      metrics: [
        metric("revenue_growth", "Tăng trưởng doanh thu", 0.187, "%"),
        metric("gross_margin", "Biên lợi nhuận gộp", 0.41, "%"),
        metric("roe", "ROE", 0.241, "%"),
      ],
      earnings_quality: { core_pct: 0.92, oneoff_pct: 0.08, peer_median: null },
    },
    cashflow: {
      profit_vs_cash: [
        { year: 2020, profit: 5000e9, cfo: 5500e9 },
        { year: 2024, profit: 9600e9, cfo: 11300e9 },
      ],
      metrics: [
        metric("cfo_ni", "Tiền từ KD / Lợi nhuận", 1.18, "x"),
        metric("fcf_margin", "Dòng tiền tự do / Doanh thu", 0.12, "%"),
        metric("accrual", "Phần lãi chưa thành tiền", 0.05, "%"),
      ],
      waterfall: [
        { label: "LNST", value: 9600e9, kind: "base" },
        { label: "+ Khấu hao", value: 2000e9, kind: "delta" },
        { label: "± Vốn lưu động", value: -300e9, kind: "delta" },
        { label: "Tiền từ KD", value: 11300e9, kind: "base" },
      ],
    },
    valuation: {
      methods: [
        { name: "P/E lịch sử", bear: 110000, base: 135000, bull: 160000 },
        { name: "Thu nhập thặng dư (RIM)", bear: null, base: 142000, bull: null },
        { name: "Sàn sổ sách", bear: null, base: 90000, bull: null },
        { name: "Trung vị tổng hợp", bear: 110000, base: 141000, bull: 160000 },
      ],
      current_price: 135000,
      fair_median: 141000,
      upside_pct: 0.044,
      metrics: [
        { key: "pe", label: "P/E", value: 15.2, peer_median: 13.0 },
        { key: "pb", label: "P/B", value: 3.4, peer_median: 2.1 },
        { key: "roe", label: "ROE", value: 0.241, peer_median: 0.18 },
      ],
    },
    health: {
      sub_a: {
        series: [
          { year: 2020, value: 0.2 },
          { year: 2024, value: -0.5 },
        ],
        peer: [
          { label: "Nợ vay / Vốn chủ (công ty)", value: 0.22 },
          { label: "Trung vị ngành", value: 0.5 },
        ],
      },
      sub_b: {
        series: [
          { year: 2020, value: 8 },
          { year: 2024, value: 14 },
        ],
        peer: [
          { label: "Thanh khoản hiện hành (công ty)", value: 1.8 },
          { label: "Trung vị ngành", value: 1.4 },
        ],
      },
      sub_c: {
        series: [
          { year: 2020, company: 76, peer: null },
          { year: 2024, company: 89, peer: null },
        ],
        checklist: [
          { label: "Lợi nhuận có khớp với tiền mặt thu về?", ok: true },
          { label: "Không pha loãng cổ phiếu của cổ đông?", ok: true },
          { label: "Khách hàng không trả tiền chậm dần?", ok: false },
        ],
      },
    },
    dividend: {
      series: [
        { year: 2020, value: 2000 },
        { year: 2024, value: 2500 },
      ],
      yield: 0.018,
      payout: 0.4,
      form: "tiền mặt",
    },
  },
  meta: {
    periods: ["2020", "2021", "2022", "2023", "2024"],
    is_estimated_fields: ["blocks.business.earnings_quality"],
    peer_count: 12,
    peer_asof: "2026-07-14",
    disclaimers: [
      "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT).",
      "Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách.",
    ],
  },
}

const narrativeA: BctcNarrative = {
  verdict_oneliner: "Công ty phần mềm tăng trưởng đều, kiếm ra tiền thật, tài chính rất vững.",
  story: {
    lead: "FPT là mẫu doanh nghiệp tăng trưởng chất lượng.",
    paragraphs: ["Đoạn một.", "Đoạn hai.", "Đoạn ba."],
    strengths: ["ROE bền vững 24%", "Biên lợi nhuận nở rộng"],
    watchlist: ["Ngày thu tiền tăng 76 → 89 ngày"],
  },
  blocks: {
    valuation: { answer: "Giá đang gần vùng hợp lý, hơi thiên rẻ." },
    financial: { answer: "Công ty phình to gấp đôi, chủ yếu bằng lợi nhuận giữ lại." },
    business: { answer: "Doanh thu tăng đều hai chữ số suốt 5 năm." },
    cashflow: { answer: "Có — mỗi đồng lợi nhuận tạo ra hơn một đồng tiền mặt." },
    health: {
      answer: "Rất vững — gần như không vay nợ.",
      sub: {
        a: "Nợ vay giảm liên tục, nay đã dư tiền.",
        b: "Khả năng trả lãi vay rất cao.",
        c: "Chất lượng sổ sách tốt, chỉ lưu ý ngày thu tiền.",
      },
    },
    dividend: { answer: "Chia cổ tức tiền mặt đều đặn." },
  },
}

// ── Template B (bank) fixture — only the parts that differ from A that the
//    template-B branch touches (block 4 NIM, health 2-sub). ────────────────────
const fixtureB: BctcDashboardData = {
  ...fixtureA,
  template: "B",
  sub_sector: null,
  hero: { ...fixtureA.hero, ticker: "VCB", name: "Vietcombank", sector: "Ngân hàng" },
  radar: {
    dims: [
      { key: "growth", label: "Tăng trưởng", score: 70, band: "good", value_label: "12.0%", value: 0.12 },
      { key: "profitability", label: "Sinh lời", score: 85, band: "good", value_label: "21.0%", value: 0.21 },
      { key: "asset_quality", label: "Chất lượng tài sản", score: 80, band: "good", value_label: "1.2%", value: 0.012 },
      { key: "capital", label: "An toàn vốn", score: 75, band: "good", value_label: "9.5%", value: 0.095 },
      { key: "valuation", label: "Định giá", score: 50, band: "warn", value_label: "2.0%", value: 0.02 },
    ],
  },
  blocks: {
    financial: fixtureA.blocks.financial,
    business: {
      revenue_series: [
        { year: 2020, revenue: 40000e9, gross_margin: null, net_margin: 0.42 },
        { year: 2024, revenue: 68000e9, gross_margin: null, net_margin: 0.45 },
      ],
      metrics: [
        metric("nim", "NIM", 0.032, "%"),
        metric("roa", "ROA", 0.018, "%"),
        metric("roe", "ROE", 0.21, "%"),
      ],
      nim_series: [
        { year: 2020, nim: 0.029 },
        { year: 2024, nim: 0.032 },
      ],
      income_mix: [
        { label: "Lãi thuần", pct: 0.72 },
        { label: "Phí dịch vụ", pct: 0.18 },
        { label: "Ngoại hối & KD chứng khoán", pct: 0.06 },
        { label: "Khác", pct: 0.04 },
      ],
    },
    cashflow: {
      cir_series: [
        { year: 2020, cir: 0.35 },
        { year: 2024, cir: 0.31 },
      ],
      metrics: [
        metric("cir", "CIR (chi phí / thu nhập)", 0.31, "%"),
        metric("cost_of_risk", "Chi phí tín dụng / Cho vay", 0.012, "%"),
        metric("provision_ppop", "Chi phí dự phòng / PPOP", 0.22, "%"),
      ],
      ppop: 42000e9,
    },
    valuation: {
      methods: [],
      current_price: 90000,
      fair_median: 92000,
      upside_pct: 0.022,
      metrics: [
        { key: "pb", label: "P/B hiện tại", value: 2.6, peer_median: 1.8 },
        { key: "justified_pb", label: "P/B hợp lý", value: 3.0, peer_median: null },
        { key: "pe", label: "P/E hiện tại", value: 12.0, peer_median: 10.0 },
        { key: "roe", label: "ROE", value: 0.21, peer_median: 0.17 },
      ],
    },
    health: {
      sub_a: {
        series: [
          { year: 2020, value: 0.015 },
          { year: 2024, value: 0.012 },
        ],
        peer: [
          { label: "Dự phòng / Cho vay (công ty)", value: 0.012 },
          { label: "Ngưỡng cảnh báo", value: 0.03 },
          { label: "Trung vị ngành", value: 0.018 },
        ],
      },
      sub_b: {
        series: [
          { year: 2020, value: 0.25 },
          { year: 2024, value: 0.22 },
        ],
        peer: [
          { label: "Chi phí dự phòng / PPOP (công ty)", value: 0.22 },
          { label: "Đòn bẩy (Tổng TS / VCSH)", value: 12 },
          { label: "Trung vị ngành", value: null },
        ],
      },
    },
    dividend: {
      series: [
        { year: 2020, value: 8 },
        { year: 2024, value: 12 },
      ],
      yield: 0.01,
      payout: 0.2,
      form: "cổ phiếu",
    },
  },
  meta: {
    ...fixtureA.meta,
    is_estimated_fields: ["blocks.health.sub_a.series", "blocks.health.sub_b.series"],
    disclaimers: [
      "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT).",
      "Thiếu thuyết minh: nợ xấu theo nhóm, CAR và CASA không có sẵn.",
    ],
  },
}

const narrativeB: BctcNarrative = {
  verdict_oneliner: "Ngân hàng sinh lời cao, chất lượng tài sản tốt.",
  story: {
    lead: "VCB là ngân hàng đầu ngành.",
    paragraphs: ["A.", "B.", "C."],
    strengths: ["ROE 21%"],
    watchlist: ["Định giá không rẻ"],
  },
  blocks: {
    valuation: { answer: "P/B cao nhưng chính đáng nhờ ROE cao." },
    financial: { answer: "Bảng cân đối lớn, chủ yếu là cho vay." },
    earning: { answer: "Kiếm tiền chủ yếu từ NIM ổn định." },
    efficiency: { answer: "CIR giảm dần, vận hành tiết kiệm." },
    asset_quality: {
      answer: "Chất lượng tài sản tốt.",
      sub: {
        a: "Nợ xấu ở mức thấp.",
        b: "Bộ đệm dự phòng dày.",
      },
    },
    dividend: { answer: "Thường chia cổ phiếu." },
  },
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BctcDashboard — loading & error", () => {
  beforeEach(() => {
    h.compute = null
    h.ai = null
  })

  it("shows a spinner while the compute query is loading", () => {
    h.compute = null
    const { container } = render(<BctcDashboard symbol="FPT" />)
    expect(container.querySelector(".bctc-dash")).not.toBeNull()
    // Arco Spin renders an element with a class containing "spin"
    expect(container.querySelector('[class*="spin"]')).not.toBeNull()
  })

  it("renders a friendly notice (no crash) for an empty-blocks dashboard", () => {
    // Backend returns a 200 empty dashboard (blocks: {}) for symbols with no BCTC.
    h.compute = {
      template: "A",
      sub_sector: null,
      hero: { ticker: "XYZ" },
      radar: { dims: [] },
      blocks: {},
      meta: { periods: [], is_estimated_fields: [], disclaimers: ["Không đủ dữ liệu báo cáo tài chính để dựng phân tích cho mã này."] },
    } as unknown as BctcDashboardData
    h.ai = null
    const { container } = render(<BctcDashboard symbol="XYZ" />)
    expect(container.querySelector(".bctc-dash")).not.toBeNull()
    expect(container.textContent).toContain("Không đủ dữ liệu")
    // no chart / question card rendered
    expect(container.querySelector(".bctc-qcard")).toBeNull()
  })
})

describe("BctcDashboard — Template A (FPT)", () => {
  beforeEach(() => {
    h.compute = fixtureA
    h.ai = narrativeA
  })

  it("renders the hero ticker + the one-line verdict from the narrative", () => {
    const { getByText } = render(<BctcDashboard symbol="FPT" />)
    expect(getByText("FPT")).not.toBeNull()
    expect(getByText(narrativeA.verdict_oneliner!)).not.toBeNull()
  })

  it("renders the story (AiMemo lead) from the narrative", () => {
    const { getByText } = render(<BctcDashboard symbol="FPT" />)
    expect(getByText(narrativeA.story!.lead)).not.toBeNull()
  })

  it("renders exactly 6 QuestionBlocks with the template-A titles", () => {
    const { container, getByText } = render(<BctcDashboard symbol="FPT" />)
    expect(container.querySelectorAll(".bctc-qcard").length).toBe(6)
    ;[
      "Giá đang đắt hay rẻ?",
      "Bức tranh tài chính",
      "Kinh doanh có ổn không?",
      "Tiền có thật không?",
      "Sức khỏe tài chính có vững không?",
      "Cổ đông nhận được gì?",
    ].forEach((t) => expect(getByText(t)).not.toBeNull())
  })

  it("renders the football field (valuation block)", () => {
    const { getByLabelText } = render(<BctcDashboard symbol="FPT" />)
    expect(getByLabelText(/Dải định giá/)).not.toBeNull()
  })

  it("renders the 3 health sub-questions (6A/6B/6C)", () => {
    const { getByText } = render(<BctcDashboard symbol="FPT" />)
    expect(getByText("6A")).not.toBeNull()
    expect(getByText("6B")).not.toBeNull()
    expect(getByText("6C")).not.toBeNull()
  })

  // NEGATIVE CONSTRAINT (SPEC §3): NO verdict tag / badge on any block.
  it("renders NO verdict badge / pill on the blocks", () => {
    const { container } = render(<BctcDashboard symbol="FPT" />)
    expect(container.querySelectorAll('[class*="badge"]').length).toBe(0)
    // no verdict element lives inside a question card (hero's is separate)
    for (const card of container.querySelectorAll(".bctc-qcard")) {
      expect(card.querySelector('[class*="verdict"]')).toBeNull()
      expect(card.querySelector('[class*="pill"]')).toBeNull()
    }
  })

  it("renders the footer disclaimers", () => {
    const { getByText } = render(<BctcDashboard symbol="FPT" />)
    expect(getByText(/tính từ 3 báo cáo tài chính/)).not.toBeNull()
  })

  it("colours via CSS var tokens — no raw hex in the markup", () => {
    const { container } = render(<BctcDashboard symbol="FPT" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/NaN/)
  })
})

describe("BctcDashboard — Template B (VCB)", () => {
  beforeEach(() => {
    h.compute = fixtureB
    h.ai = narrativeB
  })

  it("renders the bank block-4 title 'Ngân hàng kiếm tiền thế nào?'", () => {
    const { getByText } = render(<BctcDashboard symbol="VCB" />)
    expect(getByText("Ngân hàng kiếm tiền thế nào?")).not.toBeNull()
  })

  it("surfaces NIM (the bank earning metric) and the 'earning' narrative answer", () => {
    const { getAllByText, getByText } = render(<BctcDashboard symbol="VCB" />)
    expect(getAllByText("NIM").length).toBeGreaterThanOrEqual(1)
    expect(getByText(narrativeB.blocks!.earning!.answer!)).not.toBeNull()
  })

  it("renders the asset-quality block with exactly 2 sub-questions (6A/6B, no 6C)", () => {
    const { getByText, queryByText } = render(<BctcDashboard symbol="VCB" />)
    expect(getByText("Chất lượng tài sản có tốt không?")).not.toBeNull()
    expect(getByText("6A")).not.toBeNull()
    expect(getByText("6B")).not.toBeNull()
    expect(queryByText("6C")).toBeNull()
  })

  it("renders NO football field for a bank (methods empty)", () => {
    const { queryByLabelText } = render(<BctcDashboard symbol="VCB" />)
    expect(queryByLabelText(/Dải định giá/)).toBeNull()
  })

  it("colours via CSS var tokens — no raw hex / NaN", () => {
    const { container } = render(<BctcDashboard symbol="VCB" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/NaN/)
  })
})
