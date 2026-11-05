import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatVi } from "../core/ticks"
import { makeTimedBars } from "../scene/test-support"
import type { ChartIndicatorInput } from "../types"
import { ChartLegend, type ChartLegendProps } from "./chart-legend"
import { IQLineCanvasView } from "./IQLineCanvas"
import { installCanvasEnv, type CanvasEnv } from "./test-env"
import { useIQLineChart } from "./use-iqline-chart"

let env: CanvasEnv
beforeEach(() => {
  env = installCanvasEnv()
})
afterEach(() => vi.unstubAllGlobals())

const BARS = makeTimedBars(200, "D")
const INDICATORS: ChartIndicatorInput[] = [
  { key: "volume", id: "volume", params: {} },
  { key: "rsi-1", id: "rsi", params: {} },
  { key: "ema-1", id: "ema", params: { period: 21 } },
]

function Harness({ indicators = INDICATORS, ...legend }: Partial<ChartLegendProps> & { indicators?: ChartIndicatorInput[] }) {
  const chart = useIQLineChart({ mode: "market", theme: "dark", bars: BARS, interval: "D", indicatorInputs: indicators })
  return (
    <div style={{ width: 800, height: 600, position: "relative" }}>
      <IQLineCanvasView chart={chart} />
      <ChartLegend chart={chart} symbol="FPT" {...legend} />
    </div>
  )
}

const legend = () => screen.getByRole("group", { name: "Chú giải biểu đồ" })

describe("ChartLegend", () => {
  it("chưa đo được kích thước thì chưa có gì", () => {
    render(<Harness />)
    expect(screen.queryByRole("group", { name: "Chú giải biểu đồ" })).toBeNull()
  })

  it("đọc được O H L C của nến cuối bằng chữ thật, có tên đầy đủ cho trình đọc màn hình", () => {
    render(<Harness />)
    env.measure(800, 600)
    const last = BARS.at(-1)!
    const text = legend().textContent ?? ""
    expect(text).toContain("FPT")
    for (const value of [last.open, last.high, last.low, last.close]) expect(text).toContain(formatVi(value, 2))
    for (const name of ["Giá mở cửa", "Giá cao nhất", "Giá thấp nhất", "Giá đóng cửa"]) expect(within(legend()).getByText(name)).toBeTruthy()
  })

  it("nằm ngoài khung role=img của canvas (con của role=img bị coi là trang trí)", () => {
    const { container } = render(<Harness />)
    env.measure(800, 600)
    const host = container.querySelector('[role="img"]')!
    expect(host.contains(legend())).toBe(false)
  })

  it("mỗi chỉ báo một dòng có tên kèm tham số và giá trị tại nến", () => {
    render(<Harness />)
    env.measure(800, 600)
    expect(within(legend()).getByText("RSI (14)")).toBeTruthy()
    expect(within(legend()).getByText("EMA (21)")).toBeTruthy()
    expect(within(legend()).getByText("Khối lượng (20)")).toBeTruthy()
  })

  it("không có handler thì không có nút ẩn, sửa, xoá", () => {
    render(<Harness />)
    env.measure(800, 600)
    expect(screen.queryByRole("button", { name: /Ẩn RSI/ })).toBeNull()
  })

  it("nút ẩn, sửa, xoá gọi đúng khoá chỉ báo", async () => {
    const onToggleIndicator = vi.fn()
    const onEditIndicator = vi.fn()
    const onRemoveIndicator = vi.fn()
    render(<Harness editable onToggleIndicator={onToggleIndicator} onEditIndicator={onEditIndicator} onRemoveIndicator={onRemoveIndicator} />)
    env.measure(800, 600)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Ẩn RSI (14)" }))
    await user.click(screen.getByRole("button", { name: "Cài đặt EMA (21)" }))
    await user.click(screen.getByRole("button", { name: "Xoá RSI (14)" }))
    expect(onToggleIndicator).toHaveBeenCalledWith("rsi-1")
    expect(onEditIndicator).toHaveBeenCalledWith("ema-1")
    expect(onRemoveIndicator).toHaveBeenCalledWith("rsi-1")
  })

  it("chỉ báo đang ẩn đổi nhãn nút và không hiện giá trị", () => {
    render(<Harness editable indicators={[{ key: "rsi-1", id: "rsi", params: {}, hidden: true }]} />)
    env.measure(800, 600)
    const button = screen.getByRole("button", { name: "Hiện RSI (14)" })
    expect(button.getAttribute("aria-pressed")).toBe("true")
    const row = button.closest("[data-indicator-key]")!
    expect(row.textContent).not.toMatch(/\d{2},\d{2}/)
  })

  it("rê chuột sang nến khác thì chú giải đổi theo nến đó", () => {
    const { container } = render(<Harness />)
    env.measure(800, 600)
    const before = legend().textContent
    const top = container.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
    act(() => void top.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 100, bubbles: true })))
    env.flush()
    expect(legend().textContent).not.toBe(before)
    expect(legend().textContent).toContain("FPT")
  })

  it("màn hình hẹp tách O H L C thành hai dòng và bỏ ngày", () => {
    render(<Harness />)
    env.measure(360, 500)
    const price = legend().querySelector('[data-legend-pane="p"]')!
    expect(price.querySelectorAll(":scope > div").length).toBeGreaterThanOrEqual(2)
  })
})
