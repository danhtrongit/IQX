import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { FactorLibrary } from "./FactorLibrary"

const lib = {
  count: 2,
  buy: [
    {
      group: "B1",
      group_label: "Xu hướng tăng",
      factors: [
        {
          id: "f_buy",
          label: "MA20",
          side: "buy",
          group: "B1",
          group_label: "",
          kind: "bin",
          indicator: "ma_20",
          op: ">",
          default: null,
          editable: false,
          min: null,
          max: null,
          step: null,
          unit: "",
          is_percent: false,
          desc: "",
        },
      ],
    },
  ],
  sell: [
    {
      group: "S1",
      group_label: "Xu hướng đảo",
      factors: [
        {
          id: "f_sell",
          label: "RSI 14",
          side: "sell",
          group: "S1",
          group_label: "",
          kind: "num",
          indicator: "rsi_14",
          op: ">",
          default: 70,
          editable: true,
          min: 60,
          max: 80,
          step: 1,
          unit: "",
          is_percent: false,
          desc: "",
        },
      ],
    },
  ],
}

it("defaults to MUA, switches to BÁN", () => {
  render(<FactorLibrary library={lib as any} selectedIds={new Set()} onAdd={() => {}} />)
  expect(screen.getByText("MA20")).toBeInTheDocument()
  expect(screen.queryByText("RSI 14")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: /Chỉ báo BÁN/i }))
  expect(screen.getByText("RSI 14")).toBeInTheDocument()
})

it("search spanning the other side auto-switches", () => {
  render(<FactorLibrary library={lib as any} selectedIds={new Set()} onAdd={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText(/Tìm chỉ tiêu/), { target: { value: "RSI" } })
  expect(screen.getByText("RSI 14")).toBeInTheDocument() // switched to sell automatically
})
