import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SlTpBlock } from "./commitments"

describe("Cấp 2 stop/take choices", () => {
  it("enables and records Cách 2 when the insight contains 15 complete bars", () => {
    const onSelect = vi.fn()
    const bars = Array.from({ length: 15 }, (_, index) => ({
      high: 10_500 + index * 10,
      low: 9_500 + index * 10,
      close: 10_000 + index * 10,
    }))

    render(
      <SlTpBlock
        giaVao={10_000}
        selected={null}
        catLo={null}
        chotLoi={null}
        insight={{
          symbol: "VOS",
          layers: {},
          rawInput: { trend: { ohlcv: bars } },
        }}
        loading={false}
        onSelect={onSelect}
      />
    )

    const choices = screen.getAllByRole("button", { name: "Chọn cách này" })
    expect((choices[1] as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(choices[1]!)
    expect(onSelect).toHaveBeenCalledWith("bien_do_dao_dong", 8_000, 14_000)
  })

  it("keeps Cách 2 disabled when the evidence is incomplete", () => {
    render(
      <SlTpBlock
        giaVao={10_000}
        selected={null}
        catLo={null}
        chotLoi={null}
        insight={{
          symbol: "VOS",
          layers: {},
          rawInput: { trend: { ohlcv: [] } },
        }}
        loading={false}
        onSelect={() => undefined}
      />
    )

    const choices = screen.getAllByRole("button", { name: "Chọn cách này" })
    expect((choices[1] as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText("Chưa đủ dữ liệu giá để tính biên độ dao động.")
    ).toBeTruthy()
  })
})
