import { act, render, screen, within } from "@testing-library/react"
import { useEffect } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ALL_TOOLS, TOOL_SPECS } from "../drawings"
import { makeTimedBars } from "../scene/test-support"
import type { Drawing } from "../types"
import DrawingToolbar, { DrawingStyleBar } from "./drawing-toolbar"
import { IQLineCanvasView } from "./IQLineCanvas"
import { installCanvasEnv, installRadixPolyfills, type CanvasEnv } from "./test-env"
import { useIQLineChart, type ChartController } from "./use-iqline-chart"

installRadixPolyfills()

let env: CanvasEnv
beforeEach(() => {
  env = installCanvasEnv()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const BARS = makeTimedBars(200, "D")
const trend = (id: string, extra: Partial<Drawing> = {}): Drawing => ({
  id,
  tool: "trend",
  anchors: [
    { time: BARS[120].time, price: 100 },
    { time: BARS[160].time, price: 110 },
  ],
  style: { ...TOOL_SPECS.trend.defaultStyle },
  ...extra,
})

let controller: ChartController | null = null

function Harness() {
  const chart = useIQLineChart({ mode: "market", theme: "dark", bars: BARS, interval: "D" })
  // Lưu bộ điều khiển để test đẩy hình vào như khi nạp từ kho lưu trữ (gán trong effect, không gán lúc render).
  useEffect(() => {
    controller = chart.controller
  })
  return (
    <div style={{ width: 800, height: 600 }}>
      <IQLineCanvasView chart={chart} />
      <DrawingToolbar chart={chart} />
      <DrawingStyleBar chart={chart} />
    </div>
  )
}

const load = (shapes: Drawing[]) => act(() => controller!.dispatch({ type: "set-drawings", drawings: shapes }))
const rail = () => screen.getByRole("toolbar", { name: "Công cụ vẽ" })

describe("thanh công cụ vẽ", () => {
  it("đủ 14 công cụ chia thành sáu nhóm", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const groups = within(rail()).getAllByRole("button", { pressed: false }).filter((button) => button.dataset.toolGroup)
    expect(groups).toHaveLength(6)
    const names: string[] = []
    for (const group of groups) {
      await user.click(group)
      names.push(...screen.getAllByRole("menuitem").map((item) => item.textContent ?? ""))
      await user.keyboard("{Escape}")
    }
    expect(names.sort()).toEqual(ALL_TOOLS.map((tool) => TOOL_SPECS[tool].label).sort())
  })

  it("chọn công cụ thì nút nhóm sáng; chọn lại công cụ đó thì tắt", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    await user.click(within(rail()).getByRole("button", { name: "Đường: Đường xu hướng" }))
    await user.click(screen.getByRole("menuitem", { name: "Đường ngang" }))
    expect(controller!.getState().drawings.tool).toBe("horizontal")
    const group = within(rail()).getByRole("button", { name: "Đường: Đường ngang" })
    expect(group.getAttribute("aria-pressed")).toBe("true")
    await user.click(group)
    await user.click(screen.getByRole("menuitem", { name: "Đường ngang" }))
    expect(controller!.getState().drawings.tool).toBeNull()
  })

  it("nút hút vào OHLC bật tắt chế độ nam châm", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const magnet = within(rail()).getByRole("button", { name: "Hút vào giá OHLC" })
    await user.click(magnet)
    expect(controller!.getState().magnet).toBe(true)
    expect(magnet.getAttribute("aria-pressed")).toBe("true")
  })

  it("danh sách hình vẽ: trống thì hướng dẫn, có hình thì liệt kê và chọn được", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    await user.click(within(rail()).getByRole("button", { name: "Danh sách hình vẽ" }))
    expect(screen.getByText(/Chưa có hình nào/)).toBeTruthy()
    await user.keyboard("{Escape}")
    load([trend("d1"), trend("d2", { text: "Hỗ trợ" })])
    await user.click(within(rail()).getByRole("button", { name: /Danh sách hình vẽ/ }))
    const list = screen.getByRole("list", { name: "Hình vẽ trên biểu đồ" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    await user.click(within(list).getByRole("button", { name: "Đường xu hướng: Hỗ trợ" }))
    expect(controller!.getState().drawings.selectedId).toBe("d2")
  })

  it("trong danh sách: khoá, ẩn, xoá từng hình và xoá tất cả cần bấm hai lần", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([trend("d1"), trend("d2")])
    const user = userEvent.setup()
    await user.click(within(rail()).getByRole("button", { name: /Danh sách hình vẽ/ }))
    const list = screen.getByRole("list", { name: "Hình vẽ trên biểu đồ" })
    const [first] = within(list).getAllByRole("listitem")
    await user.click(within(first).getByRole("button", { name: /^Khoá/ }))
    await user.click(within(first).getByRole("button", { name: /^Ẩn/ }))
    expect(controller!.getState().drawings.shapes.find((shape) => shape.id === "d2")).toMatchObject({ locked: true, hidden: true })
    // Hình đã khoá không xoá được: nút bị khoá cho tới khi mở khoá.
    expect(within(first).getByRole("button", { name: /^Xoá/ }).hasAttribute("disabled")).toBe(true)
    const second = within(list).getAllByRole("listitem")[1]
    await user.click(within(second).getByRole("button", { name: /^Xoá/ }))
    expect(controller!.getState().drawings.shapes.map((shape) => shape.id)).toEqual(["d2"])
    // Xoá tất cả bỏ qua hình đã khoá và cần bấm hai lần.
    const clear = screen.getByRole("button", { name: "Xoá tất cả" })
    await user.click(clear)
    expect(controller!.getState().drawings.shapes).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Bấm lần nữa để xoá" }))
    expect(controller!.getState().drawings.shapes.map((shape) => shape.id)).toEqual(["d2"])
  })
})

describe("thanh kiểu của hình đang chọn", () => {
  const select = (id: string) => act(() => controller!.dispatch({ type: "drawing", action: { type: "select", id } }))

  it("không chọn hình nào thì không hiện", () => {
    render(<Harness />)
    env.measure(800, 600)
    expect(screen.queryByRole("toolbar", { name: /Kiểu của/ })).toBeNull()
  })

  it("đổi màu, độ dày, nét đứt", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([trend("d1")])
    select("d1")
    const user = userEvent.setup()
    const bar = screen.getByRole("toolbar", { name: "Kiểu của Đường xu hướng" })
    await user.click(within(bar).getByRole("button", { name: /^Màu/ }))
    await user.click(screen.getByRole("radio", { name: "Hồng" }))
    await user.click(within(bar).getByRole("radio", { name: "Nét dày" }))
    await user.click(within(bar).getByRole("button", { name: "Nét đứt" }))
    expect(controller!.getState().drawings.shapes[0].style).toMatchObject({ color: "chart-6", width: 3, dash: "dashed" })
  })

  it("khoá, nhân bản, xoá", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([trend("d1")])
    select("d1")
    const user = userEvent.setup()
    const bar = () => screen.getByRole("toolbar", { name: /Kiểu của/ })
    await user.click(within(bar()).getByRole("button", { name: "Khoá hình" }))
    expect(controller!.getState().drawings.shapes[0].locked).toBe(true)
    await user.click(within(bar()).getByRole("button", { name: "Mở khoá hình" }))
    await user.click(within(bar()).getByRole("button", { name: "Nhân bản hình" }))
    expect(controller!.getState().drawings.shapes).toHaveLength(2)
    await user.click(within(bar()).getByRole("button", { name: "Xoá hình" }))
    expect(controller!.getState().drawings.shapes).toHaveLength(1)
  })

  it("mẫu kiểu: lưu kiểu hiện tại rồi áp cho hình khác, bền qua lần mở sau", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([trend("d1", { style: { color: "chart-8", width: 3, dash: "dashed" } }), trend("d2")])
    select("d1")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Mẫu" }))
    await user.click(screen.getByRole("menuitem", { name: "Lưu kiểu này làm mẫu" }))
    expect(JSON.parse(localStorage.getItem("iqx.iqline_style_templates_v1")!)).toEqual([{ color: "chart-8", width: 3, dash: "dashed" }])
    select("d2")
    await user.click(screen.getByRole("button", { name: "Mẫu" }))
    await user.click(screen.getByRole("menuitem", { name: /Tím nhạt, 3 px, nét đứt/ }))
    expect(controller!.getState().drawings.shapes.find((shape) => shape.id === "d2")!.style).toMatchObject({ color: "chart-8", width: 3, dash: "dashed" })
  })

  it("ghi chú có ô nhập nội dung; hình khác không có", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([{ ...trend("n1"), tool: "note", anchors: [{ time: BARS[130].time, price: 100 }], style: { ...TOOL_SPECS.note.defaultStyle } }])
    select("n1")
    const user = userEvent.setup()
    await user.type(screen.getByRole("textbox", { name: "Nội dung ghi chú" }), "Mua")
    expect(controller!.getState().drawings.shapes[0].text).toBe("Mua")
  })

  it("mọi thay đổi kiểu đi qua hoàn tác", async () => {
    render(<Harness />)
    env.measure(800, 600)
    load([trend("d1")])
    select("d1")
    const user = userEvent.setup()
    await user.click(within(screen.getByRole("toolbar", { name: /Kiểu của/ })).getByRole("button", { name: "Nét đứt" }))
    expect(controller!.getState().drawings.shapes[0].style.dash).toBe("dashed")
    act(() => controller!.dispatch({ type: "undo" }))
    expect(controller!.getState().drawings.shapes[0].style.dash).toBe("solid")
  })
})
