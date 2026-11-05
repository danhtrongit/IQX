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

function Harness({ scope }: { scope?: string }) {
  const chart = useIQLineChart({ mode: "market", theme: "dark", bars: BARS, interval: "D" })
  // Lưu bộ điều khiển để test đẩy hình vào như khi nạp từ kho lưu trữ (gán trong effect, không gán lúc render).
  useEffect(() => {
    controller = chart.controller
  })
  return (
    <div style={{ width: 800, height: 600 }}>
      <IQLineCanvasView chart={chart} />
      <DrawingToolbar chart={chart} scope={scope} />
      <DrawingStyleBar chart={chart} />
    </div>
  )
}

const load = (shapes: Drawing[]) => act(() => controller!.dispatch({ type: "set-drawings", drawings: shapes }))
const rail = () => screen.getByRole("toolbar", { name: "Công cụ vẽ" })

describe("thanh công cụ vẽ", () => {
  it("mọi công cụ chia thành bảy nhóm gọn, mỗi công cụ đúng một lần", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const groups = within(rail()).getAllByRole("button", { pressed: false }).filter((button) => button.dataset.toolGroup)
    expect(groups.map((group) => group.dataset.toolGroup)).toEqual(["line", "fib", "pitchfork", "pattern", "shape", "position", "annotation"])
    expect(ALL_TOOLS.length).toBeGreaterThan(30)
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

  it("menu nhóm có tiêu đề từng loại; công cụ mới nằm đúng nhóm", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const open = async (id: string) => {
      await user.click(within(rail()).getAllByRole("button").find((button) => button.dataset.toolGroup === id)!)
      return screen.getByRole("menu")
    }
    let menu = await open("position")
    expect(within(menu).getByText("Vị thế")).toBeTruthy()
    expect(within(menu).getByText("Đo")).toBeTruthy()
    expect(within(menu).getAllByRole("menuitem").map((item) => item.dataset.tool)).toEqual(["long-position", "short-position", "measure", "date-range", "date-price-range"])
    await user.keyboard("{Escape}")
    menu = await open("shape")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.dataset.tool)).toEqual(["rectangle", "ellipse", "triangle", "path", "brush", "arrow", "arrow-up", "arrow-down"])
    await user.keyboard("{Escape}")
    menu = await open("annotation")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.dataset.tool)).toEqual(["note", "price-label", "callout"])
    await user.keyboard("{Escape}")
    menu = await open("line")
    expect(within(menu).getByText("Kênh")).toBeTruthy()
  })

  it("nhóm nhớ công cụ dùng gần nhất, kể cả sau khi tắt công cụ và dựng lại thanh", async () => {
    const { unmount } = render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    await user.click(within(rail()).getByRole("button", { name: /^Vị thế và đo:/ }))
    await user.click(screen.getByRole("menuitem", { name: "Vị thế bán" }))
    expect(controller!.getState().drawings.tool).toBe("short-position")
    await user.keyboard("{Escape}")
    act(() => controller!.dispatch({ type: "tool", tool: null }))
    expect(within(rail()).getByRole("button", { name: "Vị thế và đo: Vị thế bán" }).getAttribute("aria-pressed")).toBe("false")
    unmount()
    render(<Harness />)
    env.measure(800, 600)
    expect(within(rail()).getByRole("button", { name: "Vị thế và đo: Vị thế bán" })).toBeTruthy()
  })

  it("nam châm có ba mức tắt, yếu, mạnh; chọn mức nào thì trạng thái và nút đổi theo, và được nhớ", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    const trigger = () => within(rail()).getByRole("button", { name: /^Nam châm/ })
    expect(trigger().getAttribute("aria-label")).toBe("Nam châm hút vào giá OHLC: Tắt")
    expect(trigger().getAttribute("aria-pressed")).toBe("false")
    await user.click(trigger())
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Tắt"),
      expect.stringContaining("Yếu"),
      expect.stringContaining("Mạnh"),
    ])
    await user.click(screen.getByRole("menuitemradio", { name: /^Yếu/ }))
    expect(controller!.getState().magnet).toBe("weak")
    expect(trigger().getAttribute("aria-label")).toBe("Nam châm hút vào giá OHLC: Yếu")
    expect(trigger().getAttribute("aria-pressed")).toBe("true")
    await user.click(trigger())
    await user.click(screen.getByRole("menuitemradio", { name: /^Mạnh/ }))
    expect(controller!.getState().magnet).toBe("strong")
    expect(trigger().dataset.magnet).toBe("strong")
    expect(JSON.parse(localStorage.getItem("iqx.iqline_magnet_v1")!)).toBe("strong")
    await user.click(trigger())
    await user.click(screen.getByRole("menuitemradio", { name: /^Tắt/ }))
    expect(controller!.getState().magnet).toBe("off")
  })

  it("nam châm: lần mở sau nạp mức đã nhớ; boolean của layout cũ (true) thành yếu", () => {
    localStorage.setItem("iqx.iqline_magnet_v1", "true")
    render(<Harness />)
    env.measure(800, 600)
    expect(controller!.getState().magnet).toBe("weak")
    expect(within(rail()).getByRole("button", { name: /^Nam châm/ }).getAttribute("aria-label")).toContain("Yếu")
  })

  it("nam châm: giá trị lưu hỏng thì tắt, không ném", () => {
    localStorage.setItem("iqx.iqline_magnet_v1", "{hỏng")
    render(<Harness />)
    env.measure(800, 600)
    expect(controller!.getState().magnet).toBe("off")
  })

  describe("công cụ yêu thích", () => {
    const favorites = () => within(rail()).queryByRole("group", { name: "Công cụ yêu thích" })
    const star = async (user: ReturnType<typeof userEvent.setup>, group: string, tool: string) => {
      await user.click(within(rail()).getAllByRole("button").find((button) => button.dataset.toolGroup === group)!)
      await user.click(screen.getByRole("button", { name: new RegExp(`^(Thêm|Bỏ) ${tool}`) }))
    }

    it("chưa có yêu thích thì không có hàng; đánh sao thì hiện thành hàng truy cập nhanh, bấm là bật công cụ", async () => {
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      expect(favorites()).toBeNull()
      await star(user, "line", "Đường ngang")
      // Đánh sao không chọn công cụ và không đóng menu.
      expect(controller!.getState().drawings.tool).toBeNull()
      expect(screen.getByRole("menu")).toBeTruthy()
      await user.keyboard("{Escape}")
      const row = favorites()!
      expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Đường ngang"])
      await user.click(within(row).getByRole("button", { name: "Đường ngang" }))
      expect(controller!.getState().drawings.tool).toBe("horizontal")
      expect(within(row).getByRole("button", { name: "Đường ngang" }).getAttribute("aria-pressed")).toBe("true")
    })

    it("bỏ sao thì hàng mất; thứ tự theo lúc đánh sao", async () => {
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      await star(user, "position", "Vị thế mua")
      await user.keyboard("{Escape}")
      await star(user, "line", "Đường ngang")
      await user.keyboard("{Escape}")
      expect(within(favorites()!).getAllByRole("button").map((button) => button.dataset.favoriteTool)).toEqual(["long-position", "horizontal"])
      await star(user, "position", "Vị thế mua")
      await user.keyboard("{Escape}")
      expect(within(favorites()!).getAllByRole("button").map((button) => button.dataset.favoriteTool)).toEqual(["horizontal"])
      await star(user, "line", "Đường ngang")
      await user.keyboard("{Escape}")
      expect(favorites()).toBeNull()
    })

    it("bàn phím: Shift + Enter trên một dòng thêm vào yêu thích", async () => {
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      await user.click(within(rail()).getAllByRole("button").find((button) => button.dataset.toolGroup === "annotation")!)
      await user.keyboard("{ArrowDown}{Shift>}{Enter}{/Shift}")
      expect(controller!.getState().drawings.tool).toBeNull()
      await user.keyboard("{Escape}")
      expect(within(favorites()!).getAllByRole("button")).toHaveLength(1)
    })

    it("lưu theo tài khoản: cùng tài khoản thấy lại, tài khoản khác không thấy, đổi tài khoản đổi danh sách", async () => {
      const first = render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      await star(user, "line", "Đường ngang")
      await user.keyboard("{Escape}")
      expect(JSON.parse(localStorage.getItem("iqx.iqline_tool_favorites_v1:user:1")!)).toEqual(["horizontal"])
      first.unmount()
      const again = render(<Harness scope="user:1" />)
      env.measure(800, 600)
      expect(within(favorites()!).getAllByRole("button")).toHaveLength(1)
      again.rerender(<Harness scope="user:2" />)
      expect(favorites()).toBeNull()
      again.rerender(<Harness scope="user:1" />)
      expect(within(favorites()!).getAllByRole("button")).toHaveLength(1)
      again.unmount()
      render(<Harness scope="guest" />)
      env.measure(800, 600)
      expect(favorites()).toBeNull()
    })

    it("kho không dùng được: thanh vẫn hiện đúng và yêu thích vẫn chạy trong phiên", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("chặn")
      })
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("đầy", "QuotaExceededError")
      })
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      expect(favorites()).toBeNull()
      expect(within(rail()).getAllByRole("button").filter((button) => button.dataset.toolGroup)).toHaveLength(7)
      await star(user, "line", "Đường ngang")
      await user.keyboard("{Escape}")
      expect(within(favorites()!).getAllByRole("button")).toHaveLength(1)
      await user.click(within(favorites()!).getByRole("button", { name: "Đường ngang" }))
      expect(controller!.getState().drawings.tool).toBe("horizontal")
      vi.restoreAllMocks()
    })

    it("kho trả dữ liệu hỏng hoặc có công cụ lạ thì chỉ giữ công cụ thật", () => {
      localStorage.setItem("iqx.iqline_tool_favorites_v1:user:1", JSON.stringify(["horizontal", "không-có", "horizontal", 5, "brush"]))
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      expect(within(favorites()!).getAllByRole("button").map((button) => button.dataset.favoriteTool)).toEqual(["horizontal", "brush"])
      localStorage.setItem("iqx.iqline_tool_favorites_v1:user:2", "{hỏng")
    })

    it("tối đa 8: đủ rồi thì sao ở các công cụ còn lại bị khoá", async () => {
      localStorage.setItem("iqx.iqline_tool_favorites_v1:user:1", JSON.stringify(["trend", "ray", "extended", "horizontal", "horizontal-ray", "vertical", "channel", "rectangle", "ellipse"]))
      render(<Harness scope="user:1" />)
      env.measure(800, 600)
      const user = userEvent.setup()
      expect(within(favorites()!).getAllByRole("button")).toHaveLength(8)
      await user.click(within(rail()).getAllByRole("button").find((button) => button.dataset.toolGroup === "annotation")!)
      expect(screen.getByRole("button", { name: "Đã đủ 8 công cụ yêu thích, không thêm được Ghi chú" }).hasAttribute("disabled")).toBe(true)
      expect(screen.getAllByRole("button", { name: /^Đã đủ 8 công cụ yêu thích/ })).toHaveLength(3)
    })
  })

  it("đường gấp khúc đang vẽ có thanh Xong và Huỷ để hoàn tất không cần Enter hay nhấp đúp", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const user = userEvent.setup()
    act(() => controller!.dispatch({ type: "tool", tool: "path" }))
    for (const [x, y] of [[100, 150], [180, 100], [260, 160]]) {
      const target = controller!.targetAt(x, y)
      act(() => controller!.dispatch({ type: "pointer-down", pointer: { pointerId: 1, pointerType: "mouse", x, y, target } }))
      act(() => controller!.dispatch({ type: "pointer-up", pointer: { pointerId: 1, pointerType: "mouse", x, y, target } }))
    }
    const bar = screen.getByRole("toolbar", { name: "Hoàn tất Đường gấp khúc" })
    expect(bar.textContent).toContain("3 điểm")
    await user.click(within(bar).getByRole("button", { name: /Xong/ }))
    expect(controller!.getState().drawings.shapes).toHaveLength(1)
    expect(controller!.getState().drawings.shapes[0].anchors).toHaveLength(3)
    expect(screen.queryByRole("toolbar", { name: "Hoàn tất Đường gấp khúc" })).toBeNull()
    // Huỷ.
    act(() => controller!.dispatch({ type: "tool", tool: "path" }))
    const target = controller!.targetAt(100, 100)
    act(() => controller!.dispatch({ type: "pointer-down", pointer: { pointerId: 1, pointerType: "mouse", x: 100, y: 100, target } }))
    act(() => controller!.dispatch({ type: "pointer-up", pointer: { pointerId: 1, pointerType: "mouse", x: 100, y: 100, target } }))
    expect(within(screen.getByRole("toolbar", { name: "Hoàn tất Đường gấp khúc" })).getByRole("button", { name: /Xong/ }).hasAttribute("disabled")).toBe(true)
    await user.click(screen.getByRole("button", { name: /Huỷ/ }))
    expect(controller!.getState().drawings.pending).toBeNull()
    expect(controller!.getState().drawings.shapes).toHaveLength(1)
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
    await user.click(screen.getByRole("radio", { name: "Xanh lơ" }))
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
    await user.click(screen.getByRole("menuitem", { name: /Hồng tím, 3 px, nét đứt/ }))
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

  it("hộp chú thích có ô nhập nội dung như ghi chú; nhãn giá và mũi tên thì không", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const base = { ...trend("c1"), tool: "callout" as const, anchors: [{ time: BARS[130].time, price: 100 }, { time: BARS[150].time, price: 110 }], style: { ...TOOL_SPECS.callout.defaultStyle } }
    load([base, { ...base, id: "a1", tool: "arrow", style: { ...TOOL_SPECS.arrow.defaultStyle } }])
    select("c1")
    const user = userEvent.setup()
    await user.type(screen.getByRole("textbox", { name: "Nội dung ghi chú" }), "Hỗ trợ")
    expect(controller!.getState().drawings.shapes[0].text).toBe("Hỗ trợ")
    select("a1")
    expect(screen.queryByRole("textbox", { name: "Nội dung ghi chú" })).toBeNull()
  })

  it("mũi tên một điểm có thêm màu tăng giảm; các hình khác không", async () => {
    render(<Harness />)
    env.measure(800, 600)
    const arrow = { ...trend("u1"), tool: "arrow-up" as const, anchors: [{ time: BARS[130].time, price: 100 }], style: { ...TOOL_SPECS["arrow-up"].defaultStyle } }
    load([arrow, trend("d2")])
    select("u1")
    const user = userEvent.setup()
    await user.click(within(screen.getByRole("toolbar", { name: /Kiểu của/ })).getByRole("button", { name: /^Màu: Màu tăng/ }))
    expect(screen.getByRole("radio", { name: "Màu giảm" })).toBeTruthy()
    await user.click(screen.getByRole("radio", { name: "Màu giảm" }))
    expect(controller!.getState().drawings.shapes[0].style.color).toBe("price-down")
    await user.keyboard("{Escape}")
    select("d2")
    await user.click(within(screen.getByRole("toolbar", { name: /Kiểu của/ })).getByRole("button", { name: /^Màu/ }))
    expect(screen.queryByRole("radio", { name: "Màu giảm" })).toBeNull()
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
