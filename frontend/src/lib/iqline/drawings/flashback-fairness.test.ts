/**
 * Luật công bằng của Flashback cho 36 công cụ vẽ (docs/iqline-design.md §10, §12). Ràng buộc của game: nếu một test ở đây phải sửa để
 * qua, hãy hỏi lại vì sao.
 *
 * Hình vẽ của Flashback chỉ được cho thấy những gì người chơi tự đặt: giá và số nến giữa các điểm neo. Không công cụ nào được hiện ngày
 * thật (kể cả số ngày, tuần, tháng suy ra từ thời gian thật), mã cổ phiếu hay bất cứ thứ gì về nến chưa mở, dù kéo hình sang vùng tương lai.
 * Dùng trục thật của Flashback (`createChartData`, `createFrame`), không dùng phép đổi toạ độ giả.
 */
import { describe, expect, it } from "vitest"

import { createChartData } from "../scene/model"
import { flashbackInput, frameOf, makeBars } from "../scene/test-support"
import type { Anchor, DrawCommand, Drawing, DrawingTool, PaneCoords } from "../types"
import { evenTimes, makeCoords } from "./__fixtures__/coords"
import { ALL_SAMPLES } from "./__fixtures__/all-samples"
import { ALL_TOOLS, FLASHBACK_TOOLS, TOOL_SPECS, drawingCommands, handleCommands, previewCommands, rangeLabel, formatDuration } from "./index"

const WARMUP = 10
const COUNT = 60
const SLOTS = 90

const data = createChartData(flashbackInput({ bars: makeBars(COUNT + WARMUP), warmup: WARMUP, totalSlots: SLOTS }))
const frame = frameOf(data, { viewport: { from: -0.5, to: SLOTS - 0.5 } })
const coords: PaneCoords = frame.price.coords
const { low, high } = frame.price.range
/** Giá của điểm mẫu (0 đến 300) trên khoảng giá thật của khung. */
const priceOf = (sample: number) => low + ((high - low) * sample) / 300

/** Hình mẫu của một công cụ; `shift` dời mọi phiên sang phải (đẩy hình vào vùng tương lai) và `text` là ghi chú của người dùng. */
function shapeOf(tool: DrawingTool, shift = 0, text?: string): Drawing {
  const anchors = ALL_SAMPLES[tool].map(([session, price]): Anchor => ({ session: Math.min(SLOTS - 1, session + shift), price: priceOf(price) }))
  return { id: `d-${tool}`, tool, anchors, style: { ...TOOL_SPECS[tool].defaultStyle }, text }
}

const textsOf = (commands: readonly DrawCommand[]): string[] => commands.flatMap((command) => (command.op === "text" ? [command.text] : []))

/** Từ chỉ khoảng thời gian lịch, giờ giấc và mốc ngày: không được xuất hiện ở bất kỳ chữ nào trên hình vẽ của Flashback. */
const CALENDAR_WORDS = /(?<![\p{L}\p{N}])(ngày|tuần|tháng|quý|năm|giờ|phút|giây|thứ|hôm|day|week|month|year|hour|minute)(?![\p{L}\p{N}])/iu
const DATE_FORMS = /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2}|T\d{2}:\d{2}/

function allTexts(shape: Drawing): string[] {
  const options = { selectedId: shape.id, formatPrice: (price: number) => price.toFixed(2).replace(".", ",") }
  const partial = { tool: shape.tool, anchors: shape.anchors.slice(0, Math.max(1, shape.anchors.length - 1)) }
  const cursor = shape.anchors.at(-1) ?? null
  return [
    ...textsOf(drawingCommands([shape], coords, options)),
    ...textsOf(previewCommands(partial, cursor, coords, options)),
    ...textsOf(handleCommands(shape, coords, options)),
  ]
}

describe("Flashback dùng đủ 36 công cụ", () => {
  it("danh sách công cụ của Flashback là toàn bộ công cụ của thư viện", () => {
    expect(FLASHBACK_TOOLS).toHaveLength(36)
    expect([...FLASHBACK_TOOLS].sort()).toEqual([...ALL_TOOLS].sort())
    expect(Object.keys(ALL_SAMPLES).sort()).toEqual([...ALL_TOOLS].sort())
  })

  it("trục của Flashback neo theo phiên: không đổi được neo theo thời gian, và neo tạo ra không có trường thời gian", () => {
    expect(coords.indexOfAnchor({ time: 1_700_000_000, price: 1 })).toBeNull()
    for (const index of [0, 10.5, COUNT - 1, COUNT + 7, SLOTS - 1]) {
      const anchor = coords.anchorAt(index, 100)
      expect(Object.keys(anchor).sort()).toEqual(["price", "session"])
      expect(coords.indexOfAnchor(anchor)).toBe(index)
    }
  })
})

describe("Flashback: nhãn của từng công cụ chỉ có giá và số nến, không có ngày", () => {
  for (const shift of [0, 40]) {
    const where = shift === 0 ? "trong các nến đã mở" : "kéo sang vùng tương lai"
    for (const tool of ALL_TOOLS) {
      it(`${tool} (${where}): không chữ nào là ngày, tuần, tháng, giờ hay mốc thời gian`, () => {
        const shape = shapeOf(tool, shift)
        expect(drawingCommands([shape], coords).length, "hình phải vẽ được").toBeGreaterThan(0)
        for (const text of allTexts(shape)) {
          expect(text, `${tool}: "${text}"`).not.toMatch(CALENDAR_WORDS)
          expect(text, `${tool}: "${text}"`).not.toMatch(DATE_FORMS)
        }
      })
    }
  }

  it("phép kiểm không rỗng: công cụ có nhãn số thì có chữ để kiểm (không phải vì hình không ra chữ)", () => {
    const labelled = ALL_TOOLS.filter((tool) => allTexts(shapeOf(tool)).length > 0)
    for (const tool of ["fib-retracement", "fib-extension", "fib-time-zones", "gann-fan", "gann-box", "xabcd", "head-shoulders", "measure", "date-range", "date-price-range", "long-position", "short-position", "horizontal"] as const) {
      expect(labelled, tool).toContain(tool)
    }
    expect(labelled.length).toBeGreaterThanOrEqual(20)
  })

  it("ghi chú, hộp chú thích do người dùng gõ vẫn là chữ của chính họ, không có gì thêm vào", () => {
    for (const tool of ["note", "callout", "price-label"] as const) {
      const shape = shapeOf(tool, 0, "Vùng cầu")
      const out = textsOf(drawingCommands([shape], coords))
      if (tool !== "price-label") expect(out).toContain("Vùng cầu")
      for (const text of out) expect(text).not.toMatch(CALENDAR_WORDS)
    }
  })

  it("khoảng thời gian và khoảng giá và thời gian chỉ ghi số nến: đúng bằng số ô giữa hai neo, không đơn vị lịch", () => {
    for (const shift of [0, 40]) {
      for (const tool of ["date-range", "date-price-range", "measure"] as const) {
        const shape = shapeOf(tool, shift)
        const [a, b] = shape.anchors as { session: number }[]
        const bars = Math.round(Math.abs(b.session - a.session))
        const out = textsOf(drawingCommands([shape], coords))
        const label = out.find((text) => /nến/.test(text))
        expect(label, `${tool} có nhãn số nến`).toBeDefined()
        expect(label, tool).toMatch(new RegExp(`(^|· )${bars} nến$`))
        expect(out.filter((text) => /nến/.test(text)), `${tool} chỉ một nhãn thời gian`).toHaveLength(1)
      }
    }
  })

  it("vùng thời gian Fibonacci chỉ ghi số đơn vị (0, 1, 2, 3, 5, ...), kể cả phần vạch nằm ở tương lai", () => {
    const shape = shapeOf("fib-time-zones", 40)
    const out = textsOf(drawingCommands([shape], coords))
    expect(out.length).toBeGreaterThan(0)
    for (const text of out) expect(text).toMatch(/^\d+$/)
  })

  it("thước đo: số nến theo ô, kể cả đầu kia nằm ở ô tương lai", () => {
    const shape: Drawing = { ...shapeOf("measure"), anchors: [{ session: COUNT - 5, price: priceOf(100) }, { session: SLOTS - 1, price: priceOf(160) }] }
    const label = textsOf(drawingCommands([shape], coords)).find((text) => /nến/.test(text))
    expect(label).toMatch(new RegExp(`· ${SLOTS - 1 - (COUNT - 5)} nến$`))
  })
})

describe("Đối chứng: trục thị trường có thời gian thật thì có ngày, trục Flashback thì không", () => {
  const times = evenTimes(60, 1_700_000_000, 86_400)
  const market = makeCoords({ mode: "market", times, viewport: { from: -0.5, to: 59.5 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
  const session = makeCoords({ mode: "session", viewport: { from: -0.5, to: 59.5 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
  const span = (kind: "time" | "session"): Drawing => ({
    id: "r",
    tool: "date-range",
    anchors: kind === "time" ? [{ time: times[5], price: 100 }, { time: times[40], price: 150 }] : [{ session: 5, price: 100 }, { session: 40, price: 150 }],
    style: { ...TOOL_SPECS["date-range"].defaultStyle },
  })

  it("market: nhãn có số ngày suy ra từ thời gian thật; Flashback cùng khoảng cách chỉ có số nến", () => {
    const marketLabel = textsOf(drawingCommands([span("time")], market)).find((text) => /nến/.test(text))
    const sessionLabel = textsOf(drawingCommands([span("session")], session)).find((text) => /nến/.test(text))
    expect(marketLabel).toBe("35 nến · 35 ngày")
    expect(marketLabel).toMatch(CALENDAR_WORDS)
    expect(sessionLabel).toBe("35 nến")
    expect(sessionLabel).not.toMatch(CALENDAR_WORDS)
  })

  it("rangeLabel trên trục Flashback không đọc được thời gian dù neo có lẫn trường time", () => {
    const poisoned = { index: 40, price: 150, x: 0, y: 0 }
    const first = { index: 5, price: 100, x: 0, y: 0 }
    expect(rangeLabel(first, poisoned, session)).toBe("35 nến")
    expect(rangeLabel(first, poisoned, market)).toContain("ngày")
    // `formatDuration` chỉ chạy khi có thời gian; không có đường nào từ session sang nó.
    expect(formatDuration(35 * 86_400)).toBe("35 ngày")
  })
})

describe("Flashback: hình kéo vào vùng tương lai không để lộ gì về nến chưa mở", () => {
  it("hình vẽ chỉ phụ thuộc điểm neo và trục: bỏ hoặc thêm dữ liệu nến chưa mở không đổi lệnh vẽ", () => {
    // Hai bộ dữ liệu cùng các nến đã mở. Bộ thứ hai khai thêm 25 phiên tới trục dài hơn nhưng vẫn không có nến nào ở đó.
    const longer = createChartData(flashbackInput({ bars: makeBars(COUNT + WARMUP), warmup: WARMUP, totalSlots: SLOTS + 25 }))
    const longerFrame = frameOf(longer, { viewport: { from: -0.5, to: SLOTS - 0.5 } })
    expect(longerFrame.price.range).toEqual(frame.price.range)
    for (const tool of ALL_TOOLS) {
      const shape = shapeOf(tool, 40)
      expect(JSON.stringify(drawingCommands([shape], longerFrame.price.coords).map(commandKey)), tool).toBe(JSON.stringify(drawingCommands([shape], coords).map(commandKey)))
    }
  })

  it("khoảng giá của khung do nến đã mở quyết định: vẽ hình ở ô tương lai không làm khung giá đổi", () => {
    const range = { ...frame.price.range }
    for (const tool of ALL_TOOLS) drawingCommands([shapeOf(tool, 40)], coords)
    expect(frame.price.range).toEqual(range)
  })

  it("không công cụ nào vẽ chữ hay nét ngoài khung vẽ: mọi lệnh đã nằm trong clip của ô giá", () => {
    for (const tool of ALL_TOOLS) {
      const commands = drawingCommands([shapeOf(tool, 40)], coords)
      expect(commands[0]?.op, tool).toBe("clip")
      expect(commands.at(-1)?.op, tool).toBe("unclip")
    }
  })

  it("nhãn giá của công cụ một điểm ở ô tương lai là đúng giá người chơi đặt, không phải giá nào của nến", () => {
    const placed = priceOf(123)
    const shape: Drawing = { id: "p", tool: "price-label", anchors: [{ session: COUNT + 10, price: placed }], style: { ...TOOL_SPECS["price-label"].defaultStyle } }
    const out = textsOf(drawingCommands([shape], coords, { formatPrice: (price) => price.toFixed(3) }))
    expect(out).toContain(placed.toFixed(3))
    expect(out.join("|")).not.toMatch(CALENDAR_WORDS)
  })
})

/** Khoá so sánh một lệnh vẽ: kiểu lệnh, chữ và số liệu (làm tròn để bỏ sai số dấu phẩy động). */
function commandKey(command: DrawCommand): unknown {
  const entry = command as unknown as Record<string, unknown> & { data?: Float64Array; count?: number }
  const data = entry.data ? Array.from(entry.data.subarray(0, entry.count ?? entry.data.length), (value) => Math.round(value * 1e6) / 1e6) : undefined
  return { ...entry, data }
}
