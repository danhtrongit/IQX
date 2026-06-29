import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Masthead } from "./Masthead"
import { HeroScore } from "./HeroScore"
import { ProgressCompare } from "./ProgressCompare"
import { sampleAnalysis, sampleNarrative } from "../__fixtures__/sample"

describe("Masthead", () => {
  it("renders the report title", () => {
    render(
      <Masthead
        title={sampleNarrative.title}
        meta={sampleAnalysis.meta}
        nav={sampleAnalysis.overview.nav}
      />,
    )
    // title text (may be split across elements due to newline)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Danh mục bạn khỏe lên",
    )
  })

  it("renders the portfolio id and nav value", () => {
    render(
      <Masthead
        title={sampleNarrative.title}
        meta={sampleAnalysis.meta}
        nav={sampleAnalysis.overview.nav}
      />,
    )
    expect(screen.getByText(/#A-0412/)).toBeInTheDocument()
    // 534.000.000 ₫ (vi-VN locale)
    expect(screen.getByText(/534/)).toBeInTheDocument()
  })

  it("renders the formatted date", () => {
    render(
      <Masthead
        title={sampleNarrative.title}
        meta={sampleAnalysis.meta}
        nav={sampleAnalysis.overview.nav}
      />,
    )
    expect(screen.getByText(/23\.06\.2026/)).toBeInTheDocument()
  })
})

describe("HeroScore", () => {
  it("renders the overall score as '3,5'", () => {
    render(
      <HeroScore
        scores={sampleAnalysis.scores}
        verdict={sampleNarrative.verdict}
      />,
    )
    // score(3.5) → "3,5"
    expect(screen.getByText(/3,5/)).toBeInTheDocument()
  })

  it("renders the trend line showing previous score", () => {
    render(
      <HeroScore
        scores={sampleAnalysis.scores}
        verdict={sampleNarrative.verdict}
      />,
    )
    expect(screen.getByText(/3,2/)).toBeInTheDocument()
  })

  it("renders the verdict text", () => {
    render(
      <HeroScore
        scores={sampleAnalysis.scores}
        verdict={sampleNarrative.verdict}
      />,
    )
    expect(screen.getByText(/Kết luận/i)).toBeInTheDocument()
  })
})

describe("ProgressCompare", () => {
  it("renders when mode is not 'first'", () => {
    const { container } = render(
      <ProgressCompare
        meta={sampleAnalysis.meta}
        scores={sampleAnalysis.scores}
        progress={sampleAnalysis.progress}
        progress_text={sampleNarrative.progress_text}
      />,
    )
    // mode = "full_changed" → should render
    expect(container.querySelector(".compare")).toBeInTheDocument()
  })

  it("renders the score delta '3,2 → 3,5'", () => {
    render(
      <ProgressCompare
        meta={sampleAnalysis.meta}
        scores={sampleAnalysis.scores}
        progress={sampleAnalysis.progress}
        progress_text={sampleNarrative.progress_text}
      />,
    )
    expect(screen.getByText(/3,2 → 3,5/)).toBeInTheDocument()
  })

  it("returns null when mode is 'first'", () => {
    const firstMeta = { ...sampleAnalysis.meta, mode: "first" as const }
    const { container } = render(
      <ProgressCompare
        meta={firstMeta}
        scores={sampleAnalysis.scores}
        progress={sampleAnalysis.progress}
        progress_text={sampleNarrative.progress_text}
      />,
    )
    expect(container.querySelector(".compare")).not.toBeInTheDocument()
  })
})
