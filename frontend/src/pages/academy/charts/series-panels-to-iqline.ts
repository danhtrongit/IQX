/**
 * Chuyển một biểu đồ `series_panels` của Học viện sang các `StaticPanel` của IQLine (chế độ `static`,
 * docs/iqline-design.md §13). Hàm thuần, không mất trường nào: mọi mảng số liệu, mọi chú thích và nhãn đều
 * đi sang. Vai trò màu của nội dung (`price`, `p1`, `pos`...) đổi thành tên token tại đây, theo cùng bảng với
 * `chart-theme.ts`; thư viện chỉ biết token.
 *
 * Quy ước chỉ số giữ nguyên: mọi `i`, `from`, `to` là chỉ số quan sát tuyệt đối trong [x.start, x.end].
 */
import type { ColorToken } from "@/lib/iqline/types"
import type {
  StaticFrame,
  StaticLevelRole,
  StaticPanel,
  StaticPoint,
} from "@/lib/iqline/static-types"
import type { ChartTone } from "../content-types"
import type { SeriesPanelsModel } from "./chart-math"

/**
 * Vai trò màu -> token. `p5` là `var(--s2)` (cam) trong `chart-theme.ts` mà `ColorToken` chưa có token tương
 * ứng, nên tạm dùng `chart-8`; đổi một dòng này khi `types.ts` thêm token cam.
 */
const TONE_TOKEN: Record<ChartTone, ColorToken> = {
  price: "foreground",
  p1: "chart-1",
  p2: "chart-2",
  p3: "chart-5",
  p4: "chart-7",
  p5: "chart-8",
  pos: "price-up",
  neg: "price-down",
  warn: "chart-2",
  info: "chart-6",
  neutral: "border",
}

/** Chữ không bao giờ xám: sắc thái xám (`p3`, `neutral`) hoặc thiếu thì dùng `academy-label`. */
function textToken(tone: ChartTone | undefined): ColorToken {
  return tone === undefined || tone === "p3" || tone === "neutral" ? "academy-label" : TONE_TOKEN[tone]
}

const LEVEL_TONE: Record<StaticLevelRole, ChartTone> = { buy: "pos", sell: "neg", neutral: "p3", avg: "p2" }
const BAR_TONE = { pos: "pos", neg: "neg", neutral: "p3" } as const
const FIB_TOKEN: ColorToken = "chart-2"

type SourcePanel = SeriesPanelsModel["panels"][number]

function convertPanel(panel: SourcePanel, frame: StaticFrame, points: readonly StaticPoint[]): StaticPanel {
  return {
    frame,
    title: panel.title,
    ...(panel.candles ? { candles: { open: panel.candles.open, high: panel.candles.high, low: panel.candles.low, close: panel.candles.close } } : {}),
    series: panel.series.map((series) => ({
      name: series.name,
      token: TONE_TOKEN[series.role],
      ...(series.dash ? { dash: true } : {}),
      ...(series.width !== undefined ? { width: series.width } : {}),
      values: series.values,
    })),
    ...(panel.bars
      ? { bars: { name: panel.bars.name, values: panel.bars.values, tokens: panel.bars.colors.map((color) => TONE_TOKEN[BAR_TONE[color]]) } }
      : {}),
    ...(panel.band ? { band: { upper: panel.band.upper, lower: panel.band.lower, token: TONE_TOKEN[panel.band.tone ?? "p1"] } } : {}),
    ...(panel.fill_between
      ? { fill_between: { a: panel.fill_between.a, b: panel.fill_between.b, aboveToken: TONE_TOKEN[panel.fill_between.above], belowToken: TONE_TOKEN[panel.fill_between.below] } }
      : {}),
    ...(panel.zero ? { zero: true } : {}),
    ...(panel.nonnegative ? { nonnegative: true } : {}),
    ...(panel.bounds ? { bounds: [panel.bounds[0], panel.bounds[1]] as const } : {}),
    ...(panel.ticks ? { ticks: panel.ticks } : {}),
    ...(panel.digits !== undefined ? { digits: panel.digits } : {}),
    ...(panel.levels
      ? {
          levels: panel.levels.map((level) => ({
            value: level.value,
            role: level.role,
            token: TONE_TOKEN[LEVEL_TONE[level.role]],
            ...(level.label !== undefined ? { label: level.label } : {}),
            labelToken: textToken(LEVEL_TONE[level.role]),
          })),
        }
      : {}),
    ...(panel.zones
      ? {
          zones: panel.zones.map((zone) => ({
            from: zone.from,
            to: zone.to,
            token: TONE_TOKEN[zone.tone],
            ...(zone.label !== undefined ? { label: zone.label } : {}),
            labelToken: textToken(zone.tone),
          })),
        }
      : {}),
    ...(panel.fib
      ? {
          fib: {
            lo: { i: panel.fib.lo.i, v: panel.fib.lo.v },
            hi: { i: panel.fib.hi.i, v: panel.fib.hi.v },
            dir: panel.fib.dir,
            levels: panel.fib.levels,
            ...(panel.fib.zone ? { zone: [panel.fib.zone[0], panel.fib.zone[1]] as const } : {}),
            token: FIB_TOKEN,
          },
        }
      : {}),
    ...(panel.segments
      ? {
          segments: panel.segments.map((segment) => ({
            from: [segment.from[0], segment.from[1]] as const,
            to: [segment.to[0], segment.to[1]] as const,
            token: TONE_TOKEN[segment.tone],
            ...(segment.dash ? { dash: true } : {}),
            ...(segment.extend !== undefined ? { extend: segment.extend } : {}),
          })),
        }
      : {}),
    ...(panel.notes ? { notes: panel.notes.map((note) => ({ i: note.i, value: note.value, text: note.text, token: textToken(note.tone) })) } : {}),
    ...(points.length > 0 ? { points } : {}),
  }
}

/**
 * Mỗi ô của `series_panels` thành một `StaticPanel`. Trục x, nền, đường đánh dấu và `axes` nằm trong `frame`,
 * dùng chung (cùng một đối tượng) cho mọi ô; `points` được lọc theo ô.
 */
export function seriesPanelsToIQLine(model: SeriesPanelsModel): StaticPanel[] {
  const frame: StaticFrame = {
    start: model.x.start,
    end: model.x.end,
    ...(model.x.ticks ? { ticks: model.x.ticks } : {}),
    ...(model.x.shade
      ? {
          shade: model.x.shade.map((shade) => ({
            from: shade.from,
            to: shade.to,
            token: TONE_TOKEN[shade.tone],
            ...(shade.label !== undefined ? { label: shade.label } : {}),
            labelToken: textToken(shade.tone),
          })),
        }
      : {}),
    marks: model.marks.map((mark) => ({ i: mark.i, label: mark.label })),
    axes: model.axes !== false,
    ...(model.alt !== undefined ? { alt: model.alt } : {}),
  }
  return model.panels.map((panel, panelIndex) => {
    const points: StaticPoint[] = (model.points ?? [])
      .filter((point) => point.panel === panelIndex)
      .map((point) => ({
        i: point.i,
        value: point.value,
        token: TONE_TOKEN[point.tone],
        labelToken: textToken(point.tone),
        ...(point.shape ? { shape: point.shape } : {}),
        ...(point.label !== undefined ? { label: point.label } : {}),
        ...(point.pos ? { pos: point.pos } : {}),
      }))
    return convertPanel(panel, frame, points)
  })
}
