import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { WorldCellCard } from "./PreMarketView"

describe("WorldCellCard", () => {
  it("stale nhưng có value → hiện số + tag 'cũ', không '—'", () => {
    render(
      <WorldCellCard
        cell={{
          id: "^GSPC",
          label: "S&P 500",
          value: 7483.24,
          change_pct: 1.71,
          sentiment: "up",
          stale: true,
        }}
      />
    )
    expect(screen.getByText("7.483,24")).toBeInTheDocument()
    expect(screen.getByText(/cũ/i)).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
  })

  it("value null → hiện '—'", () => {
    render(
      <WorldCellCard
        cell={{
          id: "^N225",
          label: "NIKKEI",
          value: null,
          change_pct: null,
          sentiment: "flat",
          stale: true,
        }}
      />
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("tươi (không stale) → số + không tag 'cũ'", () => {
    render(
      <WorldCellCard
        cell={{
          id: "VND=X",
          label: "USD/VND",
          value: 26470,
          change_pct: null,
          sentiment: "flat",
          stale: false,
        }}
      />
    )
    expect(screen.getByText("26.470")).toBeInTheDocument()
    expect(screen.queryByText(/cũ/i)).not.toBeInTheDocument()
  })
})
