import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import { HeroCard } from "./HeroCard"
import { AiMemo } from "./AiMemo"
import { QuestionBlock } from "./QuestionBlock"
import { SubQuestion } from "./SubQuestion"
import { DuoPanel } from "./DuoPanel"
import { MetricCard } from "./MetricCard"
import { Checklist } from "./Checklist"
import { Drilldown } from "./Drilldown"
import { BLOCK_ORDER } from "../blockOrder"

// Same discipline as the chart primitives: no raw hex / rgba in the markup —
// every colour goes through a `.bctc-dash` CSS var / class.
const HEX = /#[0-9a-fA-F]{3,8}\b/
const RGBA = /rgba?\(/

function assertTokenized(html: string) {
  expect(html).not.toMatch(HEX)
  expect(html).not.toMatch(RGBA)
  expect(html).not.toMatch(/NaN/)
}

describe("HeroCard", () => {
  const base = {
    ticker: "FPT",
    name: "CTCP FPT",
    exchange: "HOSE",
    sector: "Công nghệ thông tin",
    price: 135000,
    fairValue: 141000,
    upsidePct: 4.4,
    verdictOneliner: "Tăng trưởng đều, kiếm ra tiền thật, tài chính vững.",
  }

  it("renders ticker, name, exchange, sector and the one-line verdict", () => {
    const { getByText, getAllByText, container } = render(<HeroCard {...base} />)
    expect(getByText("FPT")).not.toBeNull()
    expect(getByText("CTCP FPT")).not.toBeNull()
    expect(getByText(/HOSE/)).not.toBeNull()
    // sector appears in the sub line + the sector pill
    expect(getAllByText(/Công nghệ thông tin/).length).toBeGreaterThanOrEqual(1)
    expect(container.textContent ?? "").toContain("Công nghệ thông tin")
    expect(getByText(base.verdictOneliner)).not.toBeNull()
  })

  it("formats price + fair value with thousands separators and the upside %", () => {
    const { container } = render(<HeroCard {...base} />)
    const txt = container.textContent ?? ""
    expect(txt).toContain("135,000")
    expect(txt).toContain("141,000")
    expect(txt).toContain("+4.4%")
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(<HeroCard {...base} />)
    assertTokenized(container.innerHTML)
  })

  it("slots optional children (e.g. the scorecard) after the verdict", () => {
    const { getByTestId } = render(
      <HeroCard {...base}>
        <div data-testid="scorecard-slot">radar</div>
      </HeroCard>,
    )
    expect(getByTestId("scorecard-slot")).not.toBeNull()
  })

  // Tour wiring (increment 2b, docs/superpowers/plans/2026-07-27-feature-tours.md's
  // Global Constraints) — see phanTichBctcTour.ts's file header: the hero splits
  // into two adjacent, non-overlapping data-tour-id wrappers so the "kết luận
  // nhanh" step and the "thẻ điểm sức khỏe" step don't spotlight the same region.
  it("wraps ticker+price+verdict in data-tour-id=tour-bctc-hero-top", () => {
    const { container } = render(<HeroCard {...base} />)
    const el = container.querySelector('[data-tour-id="tour-bctc-hero-top"]')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain("FPT")
    expect(el?.textContent).toContain(base.verdictOneliner)
  })

  it("wraps the scorecard slot in data-tour-id=tour-bctc-scorecard", () => {
    const { container, getByTestId } = render(
      <HeroCard {...base}>
        <div data-testid="scorecard-slot">radar</div>
      </HeroCard>,
    )
    const el = container.querySelector('[data-tour-id="tour-bctc-scorecard"]')
    expect(el).not.toBeNull()
    expect(el?.contains(getByTestId("scorecard-slot"))).toBe(true)
  })
})

describe("AiMemo", () => {
  const props = {
    lead: "FPT là mẫu doanh nghiệp tăng trưởng chất lượng.",
    paragraphs: ["Đoạn một.", "Đoạn hai.", "Đoạn ba."],
    strengths: ["ROE bền vững 24%", "Biên lợi nhuận nở rộng"],
    watchlist: ["Ngày thu tiền tăng 76 → 89 ngày"],
  }

  it("renders the lead + every paragraph + both flag lists", () => {
    const { getByText, container } = render(<AiMemo {...props} />)
    expect(getByText(props.lead)).not.toBeNull()
    props.paragraphs.forEach((p) => expect(getByText(p)).not.toBeNull())
    props.strengths.forEach((s) => expect(getByText(s)).not.toBeNull())
    props.watchlist.forEach((w) => expect(getByText(w)).not.toBeNull())
    // one <li> per strength + watchlist item
    expect(container.querySelectorAll("li").length).toBe(
      props.strengths.length + props.watchlist.length,
    )
  })

  // NEGATIVE CONSTRAINT (SPEC §4): block 1 has NO "AI viết · N từ" label.
  it("does NOT render any 'AI viết' label", () => {
    const { container, queryByText } = render(<AiMemo {...props} />)
    expect(queryByText(/AI viết/i)).toBeNull()
    expect((container.textContent ?? "").toLowerCase()).not.toContain("ai viết")
    expect(container.querySelector('[class*="memo-tag"]')).toBeNull()
  })
})

describe("QuestionBlock", () => {
  const props = {
    num: 4,
    title: "Kinh doanh có ổn không?",
    question: "Doanh nghiệp kinh doanh có ổn không?",
    answer: "Doanh thu tăng đều hai chữ số suốt 5 năm.",
  }

  it("renders a zero-padded block number, the title, the question and the answer", () => {
    const { getByText } = render(<QuestionBlock {...props} />)
    expect(getByText("04")).not.toBeNull()
    expect(getByText(props.title)).not.toBeNull()
    expect(getByText(props.question)).not.toBeNull()
    expect(getByText(props.answer)).not.toBeNull()
  })

  it("renders its children (chart / metrics slot)", () => {
    const { getByTestId } = render(
      <QuestionBlock {...props}>
        <div data-testid="block-body">chart</div>
      </QuestionBlock>,
    )
    expect(getByTestId("block-body")).not.toBeNull()
  })

  // NEGATIVE CONSTRAINT (SPEC §4): NO verdict tag / badge at the block top-right.
  it("does NOT render a verdict pill / badge", () => {
    const { container } = render(<QuestionBlock {...props} />)
    expect(container.querySelectorAll('[class*="verdict"]').length).toBe(0)
    expect(container.querySelectorAll('[class*="badge"]').length).toBe(0)
    expect(container.querySelector('[data-testid="verdict"]')).toBeNull()
  })
})

describe("SubQuestion", () => {
  const props = {
    code: "6A",
    question: "Công ty có nợ nhiều không?",
    answer: "Nợ vay giảm liên tục 5 năm, nay đã ở trạng thái dư tiền.",
  }

  it("renders the code, question and answer", () => {
    const { getByText } = render(<SubQuestion {...props} />)
    expect(getByText("6A")).not.toBeNull()
    expect(getByText(props.question)).not.toBeNull()
    expect(getByText(props.answer)).not.toBeNull()
  })

  it("renders its children (the DuoPanel / chart)", () => {
    const { getByTestId } = render(
      <SubQuestion {...props}>
        <div data-testid="sub-body">panel</div>
      </SubQuestion>,
    )
    expect(getByTestId("sub-body")).not.toBeNull()
  })

  // NEGATIVE CONSTRAINT (SPEC §4): sub-questions carry NO verdict tag.
  it("does NOT render a verdict tag / badge", () => {
    const { container } = render(<SubQuestion {...props} />)
    expect(container.querySelectorAll('[class*="verdict"]').length).toBe(0)
    expect(container.querySelectorAll('[class*="badge"]').length).toBe(0)
    expect(container.querySelector('[class*="sub-tag"]')).toBeNull()
  })
})

describe("DuoPanel", () => {
  it("renders the left and right nodes in two panels", () => {
    const { getByTestId, container } = render(
      <DuoPanel
        left={<div data-testid="l">change</div>}
        right={<div data-testid="r">peers</div>}
      />,
    )
    expect(getByTestId("l")).not.toBeNull()
    expect(getByTestId("r")).not.toBeNull()
    expect(container.querySelectorAll('[class*="bctc-panel"]').length).toBeGreaterThanOrEqual(2)
  })
})

describe("MetricCard", () => {
  it("renders label, value and unit", () => {
    const { getByText } = render(
      <MetricCard label="Biên LN gộp" value="41.5" unit="%" />,
    )
    expect(getByText("Biên LN gộp")).not.toBeNull()
    expect(getByText("41.5")).not.toBeNull()
    expect(getByText("%")).not.toBeNull()
  })

  it("renders a peer-compare track only when peer data is supplied", () => {
    const { container: withPeer } = render(
      <MetricCard
        label="Tiền từ KD / Lợi nhuận"
        value="1.18"
        unit="×"
        peer={{ you: 70, median: 42, caption: "Ngưỡng > 1.0×", verdict: "Vượt ngưỡng", band: "good" }}
      />,
    )
    expect(withPeer.querySelectorAll('[class*="peer-track"]').length).toBe(1)
    expect((withPeer.textContent ?? "")).toContain("Vượt ngưỡng")

    const { container: noPeer } = render(<MetricCard label="X" value="1" unit="×" />)
    expect(noPeer.querySelectorAll('[class*="peer-track"]').length).toBe(0)
  })

  it("uses CSS var tokens, no raw hex", () => {
    const { container } = render(
      <MetricCard
        label="ROE"
        value="24"
        unit="%"
        peer={{ you: 80, median: 50, band: "good" }}
      />,
    )
    assertTokenized(container.innerHTML)
  })
})

describe("Checklist", () => {
  const items = [
    { label: "Lợi nhuận có khớp tiền mặt?", ok: true, detail: "Có (1.18×)." },
    { label: "Có pha loãng cổ phiếu?", ok: true },
    { label: "Khách trả tiền chậm dần?", ok: false, detail: "Có xu hướng chậm lại." },
  ]

  it("renders one row per item with the label + detail", () => {
    const { getByText, container } = render(<Checklist items={items} />)
    items.forEach((i) => expect(getByText(i.label)).not.toBeNull())
    expect(getByText(/1.18×/)).not.toBeNull()
    expect(container.querySelectorAll('[class*="bctc-chk"]').length).toBeGreaterThanOrEqual(items.length)
  })

  it("marks ok vs warning rows distinctly", () => {
    const { container } = render(<Checklist items={items} />)
    expect(container.querySelectorAll('[class*="chk-ico--ok"]').length).toBe(2)
    expect(container.querySelectorAll('[class*="chk-ico--warn"]').length).toBe(1)
  })
})

describe("Drilldown", () => {
  it("renders a native <details> with the summary text and hidden children", () => {
    const { container, getByText } = render(
      <Drilldown summary="Xem chi tiết — 4 phương pháp">
        <table data-testid="dd-table" />
      </Drilldown>,
    )
    const details = container.querySelector("details")
    expect(details).not.toBeNull()
    expect(details!.open).toBe(false)
    expect(getByText(/Xem chi tiết/)).not.toBeNull()
    // children live in the DOM even while collapsed
    expect(container.querySelector('[data-testid="dd-table"]')).not.toBeNull()
  })

  it("can start open", () => {
    const { container } = render(
      <Drilldown summary="s" open>
        <span>body</span>
      </Drilldown>,
    )
    expect(container.querySelector("details")!.open).toBe(true)
  })
})

describe("BLOCK_ORDER", () => {
  it("is the configurable 0..7 story order", () => {
    expect(BLOCK_ORDER).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(BLOCK_ORDER.length).toBe(8)
  })
})
