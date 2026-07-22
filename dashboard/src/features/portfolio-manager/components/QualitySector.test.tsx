import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { QualitySector } from "./QualitySector"
import { sampleAnalysis, sampleNarrative } from "../__fixtures__/sample"

const voice = sampleNarrative.layers.quality

describe("QualitySector", () => {
  it("renders .chips block", () => {
    const { container } = render(
      <QualitySector quality={sampleAnalysis.quality} managerVoice={voice} />,
    )
    expect(container.querySelector(".chips")).not.toBeNull()
  })

  it("sector_benchmark: null — NO .sectorbench element", () => {
    const qualityNoSb = { ...sampleAnalysis.quality, sector_benchmark: null }
    const { container } = render(
      <QualitySector quality={qualityNoSb} managerVoice={voice} />,
    )
    expect(container.querySelector(".sectorbench")).toBeNull()
  })

  it("non-null sector_benchmark — renders .sectorbench with gap value", () => {
    // sampleAnalysis.quality already has a sector_benchmark
    const qualityWithSb = {
      ...sampleAnalysis.quality,
      sector_benchmark: {
        sector: "Ngân hàng",
        your_return: 0.09,
        industry_return: 0.14,
        gap: -0.05,
      },
    }
    const { container } = render(
      <QualitySector quality={qualityWithSb} managerVoice={voice} />,
    )
    const sb = container.querySelector(".sectorbench")
    expect(sb).not.toBeNull()
    // Should show your_return and industry_return formatted values
    expect(sb?.textContent).toContain("+9.0%")
    expect(sb?.textContent).toContain("+14.0%")
  })

  it("null pe/pb/roe/dividend show — dash", () => {
    const qualityNulls = { pe: null, pb: null, roe: null, dividend: null, sector_benchmark: null }
    const { container } = render(
      <QualitySector quality={qualityNulls} managerVoice={voice} />,
    )
    const chips = container.querySelectorAll(".chip .v")
    chips.forEach((chip) => {
      expect(chip.textContent).toBe("—")
    })
  })

  it("renders manager voice as plain text in .mgr", () => {
    const { container } = render(
      <QualitySector quality={sampleAnalysis.quality} managerVoice={voice} />,
    )
    const mgr = container.querySelector(".mgr")
    expect(mgr).not.toBeNull()
    expect(mgr?.textContent).toBe(voice)
    expect(mgr?.innerHTML).not.toContain("<")
  })
})
