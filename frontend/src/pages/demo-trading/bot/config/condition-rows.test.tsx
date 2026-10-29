import { useState } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { buildRegistry, rowsIndicator } from "../test-support"
import { ConditionRows } from "./condition-rows"
import { createDraft, templateConfig, type DraftRow } from "./draft"
import { fieldAriaLabel, rowSwitchLabel } from "./labels"
import type { RowsIndicator, Side } from "./types"

afterEach(cleanup)

const registry = buildRegistry()

/** SPEC V3 §3 order and §7.1.1 row counts. */
const SPEC_ORDER: [string, number][] = [
  ["ma", 3], ["ema", 3], ["ma_cross", 1], ["rsi", 2], ["macd", 3], ["stochastic", 2], ["cci", 1], ["mfi", 1],
  ["roc", 1], ["williams_r", 1], ["bollinger", 3], ["donchian", 1], ["dmi", 2], ["obv", 2], ["cmf", 1],
]

/** The first default sentence of each indicator, Mua (SPEC V3 §3 / sample HTML). */
const FIRST_ROW: Record<string, string> = {
  ma: "Giá cắt lên SMA 20",
  ema: "Giá cắt lên EMA 20",
  ma_cross: "SMA 20 cắt lên SMA 50",
  rsi: "RSI 14 < 30",
  macd: "MACD 12 / 26 cắt lên Signal 9",
  stochastic: "%K 14 làm mượt 3 < 20",
  cci: "CCI 20 cắt lên -100",
  mfi: "MFI 14 cắt lên 20",
  roc: "ROC 20 cắt lên 5 %",
  williams_r: "Williams %R 14 cắt lên -80",
  bollinger: "Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2",
  donchian: "Giá đóng cửa > dải trên Donchian 20",
  dmi: "DMI 14 : +DI cắt lên −DI",
  obv: "OBV cắt lên SMA 20 của OBV",
  cmf: "CMF 20 cắt lên 0",
}

/** The sentence a row shows: fixed text, typed values and the chosen option labels, in order. */
function sentenceOf(item: HTMLElement): string {
  const sentence = item.querySelector("div")!
  return [...sentence.children]
    .map((node) => {
      if (node instanceof HTMLInputElement) return node.value
      if (node instanceof HTMLSelectElement) return node.selectedOptions[0]?.textContent ?? ""
      return node.textContent ?? ""
    })
    .join(" ")
}

function rowsOfList(side: Side = "buy"): HTMLElement[] {
  return within(screen.getByRole("list", { name: `Điều kiện ${side === "buy" ? "Mua" : "Bán"}` })).getAllByRole("listitem")
}

/** A stateful host, as the config form is: the rows are edited through `onRowChange`. */
function Editable({ indicator, side = "buy", spy }: { indicator: RowsIndicator; side?: Side; spy?: (index: number, row: DraftRow) => void }) {
  const [rows, setRows] = useState(() => createDraft(templateConfig(indicator))[side].rows)
  return (
    <ConditionRows
      definitions={indicator.rows}
      side={side}
      rows={rows}
      onRowChange={(index, row) => {
        spy?.(index, row)
        setRows((previous) => previous.map((item, at) => (at === index ? row : item)))
      }}
    />
  )
}

describe("the 15 row-based indicators", () => {
  it("are all in the registry, Volume aside", () => {
    expect(registry.filter((entry) => entry.model === "rows").map((entry) => entry.id).sort()).toEqual(SPEC_ORDER.map(([id]) => id).sort())
    expect(registry.find((entry) => entry.id === "volume")?.model).toBe("legacy_params")
  })

  it.each(SPEC_ORDER)("%s has %i rows per tab, each one sentence with its own inputs and switch", (id, count) => {
    const indicator = rowsIndicator(id, registry)
    for (const side of ["buy", "sell"] as const) {
      render(<Editable indicator={indicator} side={side} />)
      const items = rowsOfList(side)
      expect(items).toHaveLength(count)
      items.forEach((item, index) => {
        expect(within(item).getByRole("switch", { name: rowSwitchLabel(side, index + 1) })).toBeTruthy()
        for (const field of indicator.rows[index]!.fields) {
          expect(within(item).getByLabelText(fieldAriaLabel(field, side, index + 1))).toBeTruthy()
        }
      })
      cleanup()
    }
    render(<Editable indicator={indicator} />)
    expect(sentenceOf(rowsOfList()[0]!)).toBe(FIRST_ROW[id])
  })

  it("has no parameter field outside the rows", () => {
    const { container } = render(<Editable indicator={rowsIndicator("macd", registry)} />)
    const list = screen.getByRole("list", { name: "Điều kiện Mua" })
    for (const control of container.querySelectorAll("input, select")) expect(list.contains(control)).toBe(true)
  })
})

describe("operators (SPEC V3 §7.1.4)", () => {
  const optionsOf = (id: string, row: number, key = "op") => {
    const indicator = rowsIndicator(id, registry)
    render(<Editable indicator={indicator} />)
    const field = indicator.rows[row - 1]!.fields.find((item) => item.key === key)!
    const select = screen.getByLabelText(fieldAriaLabel(field, "buy", row)) as HTMLSelectElement
    const labels = [...select.options].map((option) => option.textContent)
    cleanup()
    return labels
  }

  it("RSI row 1 and Stochastic row 1 only have > and <", () => {
    expect(optionsOf("rsi", 1)).toEqual([">", "<"])
    expect(optionsOf("stochastic", 1)).toEqual([">", "<"])
  })

  it("Stochastic row 2, CCI, MFI, ROC, Williams %R and CMF only cross", () => {
    expect(optionsOf("stochastic", 2)).toEqual(["cắt lên", "cắt xuống"])
    for (const id of ["cci", "mfi", "roc", "williams_r", "cmf"]) expect(optionsOf(id, 1)).toEqual(["cắt lên", "cắt xuống"])
  })

  it("RSI row 2 is a trend lên/xuống, MACD row 1 has the four operators, Bollinger row 1 the six actions", () => {
    expect(optionsOf("rsi", 2, "dir")).toEqual(["lên", "xuống"])
    expect(optionsOf("macd", 1)).toEqual(["cắt lên", "cắt xuống", ">", "<"])
    expect(optionsOf("bollinger", 1, "action")).toEqual([
      "quay vào dải từ dưới", "quay vào dải từ trên", "vượt dải trên", "phá dải dưới", "cắt lên dải giữa", "cắt xuống dải giữa",
    ])
  })

  it("SMA and MA Cross periods are selects of 5, 10, 20, 50, 100, 200; EMA periods are typed", () => {
    const presets = ["5", "10", "20", "50", "100", "200"]
    expect(optionsOf("ma", 1, "period")).toEqual(presets)
    expect(optionsOf("ma", 2, "fast")).toEqual(presets)
    expect(optionsOf("ma", 2, "slow")).toEqual(presets)
    expect(optionsOf("ma", 3, "period")).toEqual(presets)
    expect(optionsOf("ma_cross", 1, "fast")).toEqual(presets)
    expect(optionsOf("ma_cross", 1, "slow")).toEqual(presets)
    const ema = rowsIndicator("ema", registry)
    render(<Editable indicator={ema} />)
    expect(screen.getByLabelText(fieldAriaLabel(ema.rows[0]!.fields[1]!, "buy", 1)).tagName).toBe("INPUT")
  })
})

describe("editing", () => {
  it("dims the rows that are off and keeps them editable", () => {
    render(<Editable indicator={rowsIndicator("macd", registry)} />)
    const [first, second] = rowsOfList()
    expect(first!.getAttribute("data-enabled")).toBe("true")
    expect(first!.querySelector("div")!.className).not.toMatch(/opacity-60/)
    expect(second!.getAttribute("data-enabled")).toBe("false")
    expect(second!.querySelector("div")!.className).toMatch(/opacity-60/)
    expect((within(second!).getAllByRole("textbox")[0] as HTMLInputElement).disabled).toBe(false)
  })

  it("changing one row's period or switch reports only that row; the other rows keep their values", async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    const rsi = rowsIndicator("rsi", registry)
    render(<Editable indicator={rsi} spy={spy} />)
    const period1 = screen.getByLabelText("Chu kỳ RSI (dòng 1, Mua)") as HTMLInputElement
    await user.clear(period1)
    await user.type(period1, "9")
    expect(period1.value).toBe("9")
    expect((screen.getByLabelText("Chu kỳ RSI (dòng 2, Mua)") as HTMLInputElement).value).toBe("14")
    expect(spy.mock.calls.every(([index]) => index === 0)).toBe(true)
    expect(spy.mock.calls.at(-1)![1]).toEqual({ id: "rsi.level", enabled: true, values: { period: "9", op: "<", threshold: "30" } })

    await user.click(screen.getByRole("switch", { name: "Bật điều kiện 2 (Mua)" }))
    expect(spy.mock.calls.at(-1)).toEqual([1, { id: "rsi.trend", enabled: false, values: { period: "14", dir: "up" } }])
    expect(screen.getByTestId("row-count-buy").textContent).toBe("1/2 điều kiện được bật · Các điều kiện đang bật phải đồng thời thỏa mãn")
  })

  it.each([
    ["cmf", "Ngưỡng CMF", "-0.05"],
    ["cci", "Ngưỡng CCI", "-100"],
    ["williams_r", "Ngưỡng Williams %R", "-80"],
    ["roc", "Ngưỡng ROC (%)", "5"],
    ["roc", "Ngưỡng ROC (%)", "-2.5"],
  ])("%s accepts %s = %s as typed (negative and decimal), with a keyboard that has a minus", async (id, label, typed) => {
    const user = userEvent.setup()
    render(<Editable indicator={rowsIndicator(id, registry)} />)
    const field = screen.getByLabelText(`${label} (dòng 1, Mua)`) as HTMLInputElement
    await user.clear(field)
    await user.type(field, typed)
    expect(field.value).toBe(typed)
    if (typed.startsWith("-") || id !== "roc") expect(field.inputMode).toBe("text")
  })
})

describe("read-only mode (Luyện tập)", () => {
  it("shows the same sentences with the values as text, no inputs, switches locked", () => {
    const rsi = rowsIndicator("rsi", registry)
    const rows = createDraft(templateConfig(rsi)).sell.rows
    rows[1] = { ...rows[1]!, enabled: false }
    render(<ConditionRows definitions={rsi.rows} side="sell" rows={rows} mode="read" />)
    const items = rowsOfList("sell")
    expect(items.map(sentenceOf)).toEqual(["RSI 14 > 70", "RSI 14 xu hướng xuống"])
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
    expect(screen.queryAllByRole("combobox")).toHaveLength(0)
    expect((screen.getByRole("switch", { name: "Bật điều kiện 2 (Bán)" }) as HTMLButtonElement).disabled).toBe(true)
    expect(items[1]!.querySelector("div")!.className).toMatch(/opacity-60/)
  })

  it("lists the given messages under the rows and flags the named fields", () => {
    const rsi = rowsIndicator("rsi", registry)
    const rows = createDraft(templateConfig(rsi)).buy.rows
    render(
      <ConditionRows
        definitions={rsi.rows}
        side="buy"
        rows={rows}
        onRowChange={() => {}}
        invalid={[{ row: 2, field: "period" }]}
        messages={["Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên."]}
      />,
    )
    expect(screen.getByRole("alert").textContent).toBe("Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
    expect(screen.getByLabelText("Chu kỳ RSI (dòng 2, Mua)").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByLabelText("Chu kỳ RSI (dòng 1, Mua)").getAttribute("aria-invalid")).toBeNull()
  })
})
