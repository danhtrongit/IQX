import { afterEach, describe, expect, it, vi } from "vitest"

import type { Layer, Scene } from "../types"
import { createCanvasStack, LAYERS, MAX_DPR, resolveDpr } from "./canvas-stack"
import { paintScene } from "./paint"
import { COLOR_TOKENS, observeTheme, type Palette } from "./palette"
import { DEFAULT_FONT_FAMILY, TextPainter, ensureFonts, fontOf } from "./text"
import { fakeContext, named, widthOf } from "./test-support"

const palette = Object.fromEntries(COLOR_TOKENS.map((token) => [token, `rgb(1, 2, ${COLOR_TOKENS.indexOf(token)})`])) as Palette

function paint(scene: Scene, context = fakeContext()) {
  paintScene(context, scene, { palette, fontFamily: DEFAULT_FONT_FAMILY, defaultSize: 22, text: new TextPainter() })
  return context
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.className = ""
  document.documentElement.removeAttribute("style")
})

describe("paintScene: đẩy danh sách lệnh ra Canvas 2D", () => {
  it("rects: một fillRect cho mỗi bốn số, dùng màu của token, độ mờ chỉ áp cho lệnh đó", () => {
    const context = paint([
      { op: "rects", token: "price-up", alpha: 0.5, data: Float64Array.of(1, 2, 3, 4, 5, 6, 7, 8, 99, 99), count: 8 },
      { op: "rects", token: "price-down", data: Float64Array.of(9, 9, 1, 1), count: 4 },
    ])
    expect(named(context, "fillRect")).toEqual([
      ["fillRect", 1, 2, 3, 4],
      ["fillRect", 5, 6, 7, 8],
      ["fillRect", 9, 9, 1, 1],
    ])
    const alphas = named(context, "set globalAlpha").map((call) => call[1])
    // Mỗi lệnh đặt độ mờ rồi trả về 1; cuối cùng cũng trả về 1 để khung hình sau không bị mờ.
    expect(alphas).toEqual([0.5, 1, 1, 1, 1])
    expect(context.state.fillStyle).toBe(palette["price-down"])
  })

  it("lines: nét lẻ được dịch nửa pixel, nét chẵn thì không; nét đứt chỉ áp cho lệnh có dash", () => {
    const context = paint([
      { op: "lines", token: "border", width: 1, dash: [4, 4], data: Float64Array.of(10, 20, 30, 20), count: 4 },
      { op: "lines", token: "border", width: 2, data: Float64Array.of(10, 20, 30, 20), count: 4 },
    ])
    expect(named(context, "moveTo")).toEqual([
      ["moveTo", 10.5, 20.5],
      ["moveTo", 10, 20],
    ])
    expect(named(context, "setLineDash").map((call) => call[1])).toEqual([[4, 4], [], [], []])
  })

  it("polyline: đi qua mọi điểm theo count; bỏ qua khi dưới hai điểm", () => {
    const context = paint([
      { op: "polyline", token: "chart-1", width: 2, data: Float64Array.of(1, 1, 2, 2, 3, 3, 9, 9), count: 6 },
      { op: "polyline", token: "chart-1", width: 2, data: Float64Array.of(1, 1), count: 2 },
    ])
    expect(named(context, "moveTo")).toEqual([["moveTo", 1, 1]])
    expect(named(context, "lineTo")).toEqual([
      ["lineTo", 2, 2],
      ["lineTo", 3, 3],
    ])
    expect(named(context, "stroke")).toHaveLength(1)
  })

  it("polygon: tô một màu với độ mờ rồi đưa độ mờ về 1; không có gradient", () => {
    const context = paint([{ op: "polygon", token: "chart-1", alpha: 0.15, data: Float64Array.of(0, 0, 10, 0, 10, 10), count: 6 }])
    expect(named(context, "fill")).toHaveLength(1)
    expect(named(context, "set globalAlpha").map((call) => call[1])).toEqual([0.15, 1, 1])
    expect(named(context, "createLinearGradient")).toHaveLength(0)
  })

  it("circle: tô đặc hoặc chỉ vẽ viền theo fill", () => {
    const filled = paint([{ op: "circle", token: "price-up", x: 5, y: 6, radius: 7, fill: true }])
    expect(named(filled, "arc")).toEqual([["arc", 5, 6, 7, 0, Math.PI * 2]])
    expect(named(filled, "fill")).toHaveLength(1)
    const ring = paint([{ op: "circle", token: "price-up", x: 5, y: 6, radius: 7, fill: false, width: 4 }])
    expect(named(ring, "stroke")).toHaveLength(1)
    expect(ring.state.lineWidth).toBe(4)
  })

  it("clip và unclip: save và restore cân bằng, kể cả khi bên dựng cảnh quên unclip", () => {
    const balanced = paint([{ op: "clip", x: 0, y: 0, width: 10, height: 10 }, { op: "unclip" }])
    expect(named(balanced, "save")).toHaveLength(1)
    expect(named(balanced, "restore")).toHaveLength(1)
    const forgot = paint([{ op: "clip", x: 0, y: 0, width: 10, height: 10 }, { op: "clip", x: 0, y: 0, width: 5, height: 5 }])
    expect(named(forgot, "save")).toHaveLength(2)
    expect(named(forgot, "restore")).toHaveLength(2)
    expect(named(paint([{ op: "unclip" }]), "restore")).toHaveLength(0)
  })

  it("không bao giờ gọi getImageData khi vẽ (ép Chrome rơi về raster phần mềm)", () => {
    const context = fakeContext()
    const spy = vi.fn()
    Object.defineProperty(context.state, "getImageData", { value: spy })
    paint([{ op: "rects", token: "price-up", data: Float64Array.of(0, 0, 1, 1), count: 4 }, { op: "text", token: "border", text: "12", x: 0, y: 0, align: "left" }], context)
    expect(named(context, "getImageData")).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it("chữ: cỡ theo pixel thiết bị, mặc định theo cấu hình, độ đậm đúng lệnh", () => {
    const context = paint([
      { op: "text", token: "border", text: "ab", x: 0, y: 0, align: "left" },
      { op: "text", token: "border", text: "ab", x: 0, y: 0, align: "left", size: 24, weight: 600 },
    ])
    expect(named(context, "set font").map((call) => call[1])).toEqual([fontOf(22, 400, DEFAULT_FONT_FAMILY), fontOf(24, 600, DEFAULT_FONT_FAMILY)])
  })
})

describe("TextPainter: căn số theo ô vì Be Vietnam Pro không có chữ số đều", () => {
  const font = fontOf(11, 400, DEFAULT_FONT_FAMILY)

  it("ô số bằng chữ số rộng nhất, nên chuỗi cùng độ dài có cùng bề rộng", () => {
    const painter = new TextPainter()
    const context = fakeContext()
    expect(painter.cell(context, font)).toBe(8)
    expect(painter.measure(context, font, "1111", true)).toBe(painter.measure(context, font, "4444", true))
    expect(painter.measure(context, font, "1111", false)).not.toBe(painter.measure(context, font, "4444", false))
    expect(widthOf("1111")).toBeLessThan(widthOf("4444"))
  })

  it("mỗi chữ số được vẽ vào giữa ô, dấu chấm giữ bề rộng riêng", () => {
    const painter = new TextPainter()
    const context = fakeContext()
    painter.draw(context, { op: "text", token: "border", text: "1.4", x: 100, y: 5, align: "left", tabular: true }, font)
    const draws = named(context, "fillText")
    expect(draws).toEqual([
      ["fillText", "1", 100 + (8 - 4) / 2, 5],
      ["fillText", ".", 108, 5],
      ["fillText", "4", 111 + (8 - 8) / 2, 5],
    ])
  })

  it("căn phải và căn giữa dùng tổng bề rộng đã căn ô", () => {
    const painter = new TextPainter()
    const right = fakeContext()
    painter.draw(right, { op: "text", token: "border", text: "11", x: 100, y: 0, align: "right", tabular: true }, font)
    expect(named(right, "fillText")[0][2]).toBe(100 - 16 + 2)
    const center = fakeContext()
    painter.draw(center, { op: "text", token: "border", text: "11", x: 100, y: 0, align: "center", tabular: true }, font)
    expect(named(center, "fillText")[0][2]).toBe(100 - 8 + 2)
  })

  it("không có chữ số hoặc không đặt tabular thì vẽ nguyên chuỗi một lần", () => {
    const painter = new TextPainter()
    const context = fakeContext()
    painter.draw(context, { op: "text", token: "border", text: "Phiên", x: 1, y: 2, align: "center", tabular: true }, font)
    painter.draw(context, { op: "text", token: "border", text: "123", x: 1, y: 2, align: "right" }, font)
    expect(named(context, "fillText")).toEqual([
      ["fillText", "Phiên", 1, 2],
      ["fillText", "123", 1, 2],
    ])
    expect(context.state.textAlign).toBe("right")
  })

  it("nhớ bề rộng glyph: đo mỗi glyph một lần, xoá nhớ khi đổi font", () => {
    const painter = new TextPainter()
    const context = fakeContext()
    let measured = 0
    const counting = new Proxy(context, {
      get(target, key, receiver) {
        if (key === "measureText") return (text: string) => ((measured += 1), target.measureText(text))
        return Reflect.get(target, key, receiver)
      },
    })
    painter.measure(counting, font, "1234", true)
    const first = measured
    painter.measure(counting, font, "1234", true)
    expect(measured).toBe(first)
    painter.reset()
    painter.measure(counting, font, "1234", true)
    expect(measured).toBe(first * 2)
  })
})

describe("palette: đổi token CSS sang rgb()", () => {
  async function load(colorOf: Parameters<typeof fakeContext>[0]) {
    vi.resetModules()
    const context = fakeContext(colorOf)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never)
    return import("./palette")
  }

  it("màu đục thành rgb(), màu trong suốt một phần thành rgba()", async () => {
    const mod = await load((fill) => (fill === "transparent-ish" ? [10, 20, 30, 51] : [0, 144, 246, 255]))
    expect(mod.toRgbColor("oklch(0.6 0.2 250)")).toBe("rgb(0, 144, 246)")
    expect(mod.toRgbColor("transparent-ish")).toBe("rgba(10, 20, 30, 0.200)")
  })

  it("không đổi được thì dùng màu dự phòng", async () => {
    const mod = await load(() => [1, 2, 3, 255])
    expect(mod.toRgbColor("", "#123456")).toBe("#123456")
    vi.resetModules()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const none = await import("./palette")
    expect(none.toRgbColor("red", "#abcdef")).toBe("#abcdef")
  })

  it("readPalette đọc đủ mọi token từ biến CSS của phần tử", async () => {
    const mod = await load((fill) => (fill === "#15803d" ? [21, 128, 61, 255] : [9, 9, 9, 255]))
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.style.setProperty("--price-up", "#15803d")
    const result = mod.readPalette(host)
    expect(Object.keys(result).sort()).toEqual([...mod.COLOR_TOKENS].sort())
    expect(result["price-up"]).toBe("rgb(21, 128, 61)")
    // Token chưa khai báo trong CSS dùng màu xám dự phòng, không làm hỏng cả bảng màu.
    expect(result["price-down"]).toBe("#888888")
    host.style.setProperty("--price-down", "#222222")
    expect(mod.readPalette(host)["price-down"]).toBe("rgb(9, 9, 9)")
    host.remove()
  })

  it("có đủ 20 token của ColorToken", () => {
    expect(COLOR_TOKENS).toHaveLength(20)
    expect(new Set(COLOR_TOKENS).size).toBe(20)
  })
})

describe("observeTheme: một MutationObserver chung theo class của html", () => {
  it("báo khi class đổi, ngừng báo sau khi huỷ", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = observeTheme(first)
    const stopSecond = observeTheme(second)
    document.documentElement.classList.add("dark")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    stopFirst()
    document.documentElement.classList.remove("dark")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    stopSecond()
    document.documentElement.classList.add("dark")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(second).toHaveBeenCalledTimes(2)
  })

  it("dùng chung một observer cho mọi biểu đồ", () => {
    const created: unknown[] = []
    const Original = MutationObserver
    vi.stubGlobal(
      "MutationObserver",
      class extends Original {
        constructor(callback: MutationCallback) {
          super(callback)
          created.push(this)
        }
      },
    )
    const stops = [observeTheme(() => undefined), observeTheme(() => undefined), observeTheme(() => undefined)]
    expect(created).toHaveLength(1)
    stops.forEach((stop) => stop())
  })
})

describe("DPR và font", () => {
  it("DPR giới hạn về 2, không hợp lệ thì 1", () => {
    expect(MAX_DPR).toBe(2)
    expect(resolveDpr(3)).toBe(2)
    expect(resolveDpr(1.5)).toBe(1.5)
    expect(resolveDpr(1)).toBe(1)
    expect(resolveDpr(0)).toBe(1)
    expect(resolveDpr(Number.NaN)).toBe(1)
  })

  it("tải đủ ba độ đậm 400, 500, 600 trước khi đo; không có document.fonts thì bỏ qua", async () => {
    const load = vi.fn().mockResolvedValue([])
    vi.stubGlobal("document", Object.assign(Object.create(document), { fonts: { load } }))
    await ensureFonts('"Be Vietnam Pro", sans-serif')
    expect(load.mock.calls.map((call) => String(call[0]).split(" ")[0])).toEqual(["400", "500", "600"])
    expect(String(load.mock.calls[0][1])).toContain("ê")
    vi.unstubAllGlobals()
    await expect(ensureFonts()).resolves.toBeUndefined()
  })

  it("tải font lỗi không làm hỏng biểu đồ", async () => {
    const load = vi.fn().mockRejectedValue(new Error("mạng"))
    vi.stubGlobal("document", Object.assign(Object.create(document), { fonts: { load } }))
    await expect(ensureFonts()).resolves.toBeUndefined()
  })
})

describe("createCanvasStack: bốn lớp, gom vào một rAF", () => {
  function setup() {
    const queue: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const context = fakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never)
    const host = document.createElement("div")
    document.body.appendChild(host)
    const built: Layer[] = []
    const stack = createCanvasStack(host, {
      build: (layer) => {
        built.push(layer)
        return [{ op: "rects", token: "price-up", data: Float64Array.of(0, 0, 1, 1), count: 4 }]
      },
    })
    const flush = () => {
      const callbacks = queue.splice(0)
      callbacks.forEach((callback) => callback(0))
    }
    return { stack, host, built, queue, flush, context }
  }

  it("tạo bốn canvas theo thứ tự lớp; chỉ lớp trên cùng nhận sự kiện con trỏ", () => {
    const { stack, host } = setup()
    const canvases = [...host.querySelectorAll("canvas")]
    expect(canvases.map((canvas) => canvas.dataset.iqlineLayer)).toEqual([...LAYERS])
    expect(stack.interactive).toBe(stack.canvases.top)
    expect(canvases.filter((canvas) => canvas.style.pointerEvents === "none")).toHaveLength(3)
    expect(stack.interactive.style.pointerEvents).not.toBe("none")
    stack.destroy()
  })

  it("nhiều yêu cầu trong một khung hình chỉ vẽ một lần mỗi lớp", () => {
    const { stack, built, queue, flush } = setup()
    stack.invalidate("data")
    stack.invalidate("data", "top")
    stack.invalidate("data")
    expect(queue).toHaveLength(1)
    flush()
    expect(built).toEqual(["data", "top"])
    stack.destroy()
  })

  it("chỉ lớp bị yêu cầu mới được vẽ: di chuột chỉ vẽ lớp trên cùng", () => {
    const { stack, built, flush } = setup()
    stack.invalidate()
    flush()
    expect(built).toEqual([...LAYERS])
    built.length = 0
    stack.invalidate("top")
    flush()
    expect(built).toEqual(["top"])
    stack.destroy()
  })

  it("mỗi lớp được xoá trước khi vẽ lại", () => {
    const { stack, flush, context } = setup()
    stack.invalidate("data")
    flush()
    expect(named(context, "clearRect").length).toBeGreaterThanOrEqual(1)
    expect(named(context, "fillRect").length).toBeGreaterThanOrEqual(1)
    stack.destroy()
  })

  it("đổi kích thước nhân DPR, không đổi thì không xoá canvas, rồi vẽ lại mọi lớp", () => {
    const { stack, built, flush } = setup()
    stack.resize(400, 300, 2)
    for (const layer of LAYERS) {
      expect(stack.canvases[layer].width).toBe(800)
      expect(stack.canvases[layer].height).toBe(600)
    }
    flush()
    expect(built).toEqual([...LAYERS])
    stack.destroy()
  })

  it("đổi giao diện đọc lại token và vẽ lại mọi lớp", async () => {
    const { stack, built, flush } = setup()
    stack.invalidate()
    flush()
    built.length = 0
    document.documentElement.classList.add("dark")
    await new Promise((resolve) => setTimeout(resolve, 0))
    flush()
    expect(built).toEqual([...LAYERS])
    stack.destroy()
  })

  it("huỷ: bỏ canvas, huỷ rAF đang chờ, không vẽ nữa và không nghe giao diện", async () => {
    const { stack, host, built, queue, flush } = setup()
    stack.invalidate("data")
    stack.destroy()
    expect(host.querySelectorAll("canvas")).toHaveLength(0)
    flush()
    expect(built).toEqual([])
    stack.invalidate("data")
    expect(queue).toHaveLength(0)
    document.documentElement.classList.add("dark")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(built).toEqual([])
  })
})
