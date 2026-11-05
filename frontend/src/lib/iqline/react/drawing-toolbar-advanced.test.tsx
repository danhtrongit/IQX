/** Thanh công cụ vẽ: chín công cụ đợt 2 nằm đúng nhóm, chọn được, vẽ xong có thanh kiểu, khoá, ẩn, nhân bản, xoá. */
import { act, render, screen, within } from "@testing-library/react"
import { useEffect } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ADVANCED_TOOLS, TOOL_SPECS, anchorCountOf, type AdvancedTool } from "../drawings"
import type { Drawing } from "../types"
import { ADVANCED_SAMPLE } from "../drawings/__fixtures__/advanced-samples"
import { makeTimedBars } from "../scene/test-support"
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
let controller: ChartController | null = null

function Harness() {
  const chart = useIQLineChart({ mode: "market", theme: "dark", bars: BARS, interval: "D" })
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

const rail = () => screen.getByRole("toolbar", { name: "Công cụ vẽ" })
const groupButton = (id: string) => within(rail()).getAllByRole("button").find((button) => button.dataset.toolGroup === id)!
const GROUP_OF: Record<AdvancedTool, string> = {
  "fib-time-zones": "fib",
  "fib-fan": "fib",
  "fib-channel": "fib",
  pitchfork: "pitchfork",
  "gann-fan": "pitchfork",
  "gann-box": "pitchfork",
  xabcd: "pattern",
  "head-shoulders": "pattern",
  "triangle-pattern": "pattern",
}

describe("thanh công cụ vẽ: công cụ đợt 2", () => {
  it("nhóm Fibonacci, Pitchfork và Gann, Mẫu hình có đúng công cụ, mỗi dòng có biểu tượng", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const toolsIn = async (id: string) => {
      await user.click(groupButton(id))
      const items = within(screen.getByRole("menu")).getAllByRole("menuitem")
      for (const item of items) expect(item.querySelector("svg"), item.dataset.tool).not.toBeNull()
      const tools = items.map((item) => item.dataset.tool)
      await user.keyboard("{Escape}")
      return tools
    }
    expect(await toolsIn("fib")).toEqual(["fib-retracement", "fib-extension", "fib-time-zones", "fib-fan", "fib-channel"])
    expect(await toolsIn("pitchfork")).toEqual(["pitchfork", "gann-fan", "gann-box"])
    expect(await toolsIn("pattern")).toEqual(expect.arrayContaining(["xabcd", "head-shoulders", "triangle-pattern"]))
    expect(groupButton("pitchfork").getAttribute("aria-label")).toBe("Pitchfork và Gann: Pitchfork Andrews")
  })

  for (const tool of ADVANCED_TOOLS) {
    it(`${tool}: chọn trong menu thì bật công cụ, nút nhóm sáng và ghi nhãn công cụ`, async () => {
      render(<Harness />)
      env.measure(800, 600)
      const user = userEvent.setup()
      await user.click(groupButton(GROUP_OF[tool]))
      await user.click(screen.getByRole("menuitem", { name: new RegExp(TOOL_SPECS[tool].label) }))
      expect(controller!.getState().drawings.tool).toBe(tool)
      expect(groupButton(GROUP_OF[tool]).getAttribute("aria-pressed")).toBe("true")
      expect(groupButton(GROUP_OF[tool]).getAttribute("aria-label")).toMatch(new RegExp(`: ${TOOL_SPECS[tool].label}$`))
    })

    it(`${tool}: hình ${anchorCountOf(tool)} điểm đang chọn có thanh kiểu; khoá, ẩn, nhân bản, xoá chạy đúng`, async () => {
      render(<Harness />)
      env.measure(800, 600)
      const user = userEvent.setup()
      const act2 = (action: Parameters<ChartController["dispatch"]>[0]) => act(() => controller!.dispatch(action))
      // Điểm neo do con trỏ tạo (vẽ bằng chuột có ở e2e và ở reducer); ở đây nạp hình như khi mở lại từ kho lưu trữ rồi chọn nó.
      const drawing: Drawing = {
        id: "d1",
        tool,
        anchors: ADVANCED_SAMPLE[tool].map(([index, price]) => ({ time: BARS[100 + index].time, price: 27 + price / 100 })),
        style: { ...TOOL_SPECS[tool].defaultStyle },
      }
      act2({ type: "set-drawings", drawings: [drawing] })
      act2({ type: "drawing", action: { type: "select", id: "d1" } })
      expect(controller!.getState().drawings.shapes).toHaveLength(1)
      const bar = screen.getByRole("toolbar", { name: `Kiểu của ${TOOL_SPECS[tool].label}` })

      await user.click(within(bar).getByRole("button", { name: "Khoá hình" }))
      expect(controller!.getState().drawings.shapes[0].locked).toBe(true)
      expect(within(bar).getByRole("button", { name: "Xoá hình" }).hasAttribute("disabled")).toBe(true)
      await user.click(within(bar).getByRole("button", { name: "Mở khoá hình" }))
      expect(controller!.getState().drawings.shapes[0].locked).toBeFalsy()

      await user.click(within(bar).getByRole("button", { name: "Nhân bản hình" }))
      expect(controller!.getState().drawings.shapes).toHaveLength(2)
      const copy = controller!.getState().drawings.shapes[1]
      expect(copy.tool).toBe(tool)
      expect(copy.anchors).toEqual(controller!.getState().drawings.shapes[0].anchors)

      await user.click(within(screen.getByRole("toolbar", { name: `Kiểu của ${TOOL_SPECS[tool].label}` })).getByRole("button", { name: "Ẩn hình" }))
      expect(controller!.getState().drawings.shapes[1].hidden).toBe(true)

      act2({ type: "drawing", action: { type: "select", id: controller!.getState().drawings.shapes[0].id } })
      await user.click(within(screen.getByRole("toolbar", { name: `Kiểu của ${TOOL_SPECS[tool].label}` })).getByRole("button", { name: "Xoá hình" }))
      expect(controller!.getState().drawings.shapes).toHaveLength(1)
    })
  }
})
