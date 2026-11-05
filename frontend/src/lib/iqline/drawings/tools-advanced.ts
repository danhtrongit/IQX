/**
 * Công cụ vẽ đợt 2 (docs/iqline-design.md §10): Fibonacci (vùng thời gian, quạt, kênh), Pitchfork Andrews, Gann (quạt, hộp)
 * và mẫu hình (XABCD, vai đầu vai, tam giác). Mỗi công cụ đủ vẽ, xem trước, chọn và kéo tay nắm qua cùng một mô hình hình học:
 * `shapeOf` trả về nét, mảng màu và nhãn theo CSS pixel; `advancedCommands` đổi thành lệnh vẽ (pixel thiết bị),
 * `advancedDistance` đo khoảng cách chọn hình từ chính các nét đó, nên hình vẽ và vùng bấm luôn khớp nhau.
 *
 * Quy ước toạ độ, nhất quán với các công cụ có sẵn và đúng ở thang tuyến tính, log, phần trăm:
 * - Đường xiên (tia, nhánh song song, góc Gann, cạnh của mẫu hình) tính trên toạ độ MÀN HÌNH của các điểm neo, như `trend` và `channel`.
 *   Thang phần trăm chỉ là phép co giãn của thang tuyến tính nên cho cùng hình. Ở thang log, đường thẳng trên màn hình là tăng
 *   trưởng phần trăm đều theo nến, và hai đường song song cách nhau một tỷ lệ không đổi.
 * - Mức ngang của hộp Gann và các điểm trên trục dọc của quạt Fibonacci tính trên GIÁ (nội suy tuyến tính theo giá) rồi mới đổi sang y,
 *   như `fib-retracement`. Nội suy tuyến tính theo giá không đổi dạng khi kéo cả hình, kể cả ở thang log (nhân cả hai giá với cùng một
 *   hệ số), nên kéo hình không làm méo mức.
 * - Khoảng ngang (vùng thời gian Fibonacci, vạch dọc của hộp Gann) tính theo chỉ số nến. Chỉ số không bị chặn ở nến cuối nên phần
 *   tương lai tính được bằng phần ngoại suy của thang thời gian (`indexOfAnchor`, `anchorAt`), không cần dữ liệu thật.
 * - Tỷ lệ XABCD tính trên giá tuyệt đối.
 * Điểm neo giữ nguyên `time` hoặc `session` do `PaneCoords` tạo; file này chỉ nhận điểm đã đổi sang màn hình.
 *
 * Mọi nét, mảng màu và nhãn có toạ độ không hữu hạn đều bị bỏ, nên hai điểm trùng, khoảng giá 0 hay số nến 0 không sinh NaN.
 */
import { annotationWidth, aroundPoint, labelBox, placeLabels, type Box, type Candidate, type LabelRequest } from "../labels/placement"
import type { ColorToken, DrawCommand, DrawingStyle, PaneCoords, TextAlign } from "../types"
import { FIB_RETRACEMENT_LEVELS, FIB_ZONE, FIB_ZONE_TOKEN, defaultFormatPrice, type FibLevel } from "./fib"
import { clipLine, distanceToSegment, type ScreenAnchor, type ScreenPoint } from "./geometry"

export const ADVANCED_TOOLS = ["fib-time-zones", "fib-fan", "fib-channel", "pitchfork", "gann-fan", "gann-box", "xabcd", "head-shoulders", "triangle-pattern"] as const
export type AdvancedTool = (typeof ADVANCED_TOOLS)[number]

/** Dãy Fibonacci của vùng thời gian: 0, 1, 2, 3, 5, 8, 13, 21... (bỏ số 1 lặp), đủ dài để phủ mọi khung nhìn thực tế. */
export const FIB_SEQUENCE: readonly number[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368]

/**
 * Ba tia của quạt Fibonacci. Đường dọc qua điểm thứ hai đo từ giá điểm đầu (0) tới giá điểm thứ hai (1); tia mức L đi từ điểm đầu qua
 * điểm có giá điểm đầu + (điểm thứ hai - điểm đầu) x L trên đường dọc đó. Mức 1 chính là đường nối hai điểm neo.
 */
export const FIB_FAN_LEVELS: readonly FibLevel[] = [
  { level: 0.382, token: "chart-2" },
  { level: 0.5, token: "chart-8" },
  { level: 0.618, token: "chart-1" },
]

/** Các đường song song của kênh Fibonacci: 0 là đường gốc, 1 là đường qua điểm thứ ba. Cùng bảy mức với thoái lui. */
export const FIB_CHANNEL_LEVELS: readonly FibLevel[] = FIB_RETRACEMENT_LEVELS

/** Góc Gann `time x price`: một đơn vị thời gian đi `price / time` đơn vị giá so với đường 1x1 qua điểm thứ hai. `token` null là đường chính. */
export type GannAngle = { time: number; price: number; label: string; token: ColorToken | null }
export const GANN_ANGLES: readonly GannAngle[] = [
  { time: 1, price: 8, label: "1x8", token: "chart-5" },
  { time: 1, price: 4, label: "1x4", token: "chart-6" },
  { time: 1, price: 3, label: "1x3", token: "chart-8" },
  { time: 1, price: 2, label: "1x2", token: "chart-1" },
  { time: 1, price: 1, label: "1x1", token: null },
  { time: 2, price: 1, label: "2x1", token: "chart-1" },
  { time: 3, price: 1, label: "3x1", token: "chart-8" },
  { time: 4, price: 1, label: "4x1", token: "chart-6" },
  { time: 8, price: 1, label: "8x1", token: "chart-5" },
]

/** Mức của hộp Gann theo cả hai chiều, từ điểm đầu (0) tới điểm cuối (1). */
export const GANN_BOX_LEVELS: readonly number[] = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1]

export const HEAD_SHOULDERS_LABELS = { 1: "Vai trái", 3: "Đầu", 5: "Vai phải" } as const

/** Giá của tia quạt Fibonacci mức L tại đường dọc qua điểm thứ hai: a + (b - a) x L. */
export function fibFanPrice(aPrice: number, bPrice: number, level: number): number {
  return aPrice + (bPrice - aPrice) * level
}

export function isAdvancedTool(tool: string): tool is AdvancedTool {
  return (ADVANCED_TOOLS as readonly string[]).includes(tool)
}

// ------------------------------------------------------------------ công thức thuần

/**
 * Vị trí x của các vạch vùng thời gian Fibonacci trong khoảng [left, right]. Đơn vị là khoảng x0 tới x1; vạch thứ n ở x0 + F(n) x (x1 - x0).
 * Hai điểm cùng x thì chỉ có vạch 0. Dừng khi vạch đã vượt ra ngoài phía đang đi tới.
 */
export function fibTimeZonePositions(x0: number, x1: number, left: number, right: number): { n: number; x: number }[] {
  const unit = x1 - x0
  const out: { n: number; x: number }[] = []
  for (const n of FIB_SEQUENCE) {
    const x = x0 + n * unit
    if (!Number.isFinite(x)) break
    if (unit > 0 ? x > right : unit < 0 ? x < left : n > 0) break
    if (unit > 0 ? x < left : unit < 0 ? x > right : false) continue
    out.push({ n, x })
  }
  return out
}

/** Hướng của tia Gann `angle` khi đường 1x1 đi theo (dx, dy) trên màn hình: đổi tỷ lệ giá theo `price / time`. */
export function gannDirection(dx: number, dy: number, angle: Pick<GannAngle, "time" | "price">): ScreenPoint {
  return { x: dx, y: (dy * angle.price) / angle.time }
}

export type XabcdRatios = { xab: number | null; abc: number | null; bcd: number | null; xad: number | null }

/**
 * Tỷ lệ của mẫu hình XABCD theo giá tuyệt đối: XAB = |AB| / |XA|, ABC = |BC| / |AB|, BCD = |CD| / |BC|, XAD = |AD| / |XA|.
 * Mẫu số bằng 0 (hai điểm cùng giá) cho null thay vì vô cực.
 */
export function xabcdRatios(prices: readonly [number, number, number, number, number]): XabcdRatios {
  const [x, a, b, c, d] = prices
  const ratio = (top: number, bottom: number): number | null => {
    const value = Math.abs(top) / Math.abs(bottom)
    return bottom !== 0 && Number.isFinite(value) ? value : null
  }
  return { xab: ratio(b - a, a - x), abc: ratio(c - b, b - a), bcd: ratio(d - c, c - b), xad: ratio(d - a, a - x) }
}

/** "0,618", "1,272", "2": tối đa ba chữ số thập phân, bỏ số 0 thừa, dấu phẩy. */
export function ratioText(value: number): string {
  return String(Number(value.toFixed(3))).replace(".", ",")
}

/** "61,8%" cho mức 0,618 (cùng cách viết với nhãn Fibonacci). */
function percentText(level: number): string {
  const percent = Math.round(level * 1000) / 10
  return `${Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(".", ",")}%`
}

// ------------------------------------------------------------------ mô hình hình học

type Segment = readonly [number, number, number, number]
type Weight = "main" | "thin" | "hair"
type Stroke = { token: ColorToken; weight: Weight; seg: Segment; dashed?: boolean; alpha?: number; hit?: boolean }
type Fill = { token: ColorToken; alpha: number; points: readonly ScreenPoint[] }
type Label = { token: ColorToken; text: string; x: number; y: number; align: TextAlign }
type Shape = { strokes: Stroke[]; fills: Fill[]; labels: Label[] }
type Plot = PaneCoords["plot"]
/** `labels` false (khi chỉ đo khoảng cách để chọn hình) bỏ qua bước đặt nhãn tránh đè, vốn tốn nhất. */
type Env = { coords: PaneCoords; plot: Plot; format: (price: number) => string; labels: boolean }

export type AdvancedContext = { coords: PaneCoords; dpr: number; format: (price: number) => string; selected: boolean }

const FILL_ALPHA = 0.1
const DASH: readonly number[] = [6, 4]
const LABEL_SIZE = 11
const SELECT_EXTRA_WIDTH = 0.9
/** Dưới ngưỡng này (pixel) hai điểm coi như trùng nhau: không có hướng để dựng đường. */
const MIN_LENGTH = 1e-6
const INTERIOR_ALPHA = 0.75

const emptyShape = (): Shape => ({ strokes: [], fills: [], labels: [] })
const isFinitePoint = (point: ScreenPoint): boolean => Number.isFinite(point.x) && Number.isFinite(point.y)
const textWidth = (text: string): number => annotationWidth(text, LABEL_SIZE, undefined, 600)

function addStroke(shape: Shape, token: ColorToken, weight: Weight, seg: Segment | null, extra: { dashed?: boolean; alpha?: number; hit?: boolean } = {}): void {
  if (seg && seg.every(Number.isFinite)) shape.strokes.push({ token, weight, seg, ...extra })
}

function addFill(shape: Shape, token: ColorToken, alpha: number, points: readonly ScreenPoint[]): void {
  if (points.length >= 3 && points.every(isFinitePoint)) shape.fills.push({ token, alpha, points })
}

function addLabel(shape: Shape, token: ColorToken, text: string, x: number, y: number, align: TextAlign): void {
  if (text && Number.isFinite(x) && Number.isFinite(y)) shape.labels.push({ token, text, x, y, align })
}

const segmentOf = (a: ScreenPoint, b: ScreenPoint): Segment => [a.x, a.y, b.x, b.y]
const midpoint = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Tia từ `origin` theo `dir`, cắt theo khung vẽ; null khi hướng bằng 0, không hữu hạn hoặc tia nằm ngoài khung. */
function rayIn(origin: ScreenPoint, dir: ScreenPoint, plot: Plot): Segment | null {
  if (!isFinitePoint(origin) || !isFinitePoint(dir) || Math.hypot(dir.x, dir.y) < MIN_LENGTH) return null
  return clipLine(origin, { x: origin.x + dir.x, y: origin.y + dir.y }, plot, "forward")
}

/**
 * Dịch để đường gốc a-b trùng đường song song đi qua c. Dịch dọc, hoặc dịch ngang khi đường gốc gần thẳng đứng (cùng một họ đường
 * song song, chỉ khác cách đo). Gốc hai điểm trùng thì dịch thẳng tới c.
 */
function parallelShift(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): ScreenPoint {
  const run = b.x - a.x
  const rise = b.y - a.y
  if (Math.abs(run) > MIN_LENGTH && Math.abs(run) * 1e3 >= Math.abs(rise)) return { x: 0, y: c.y - (a.y + ((c.x - a.x) * rise) / run) }
  if (Math.abs(rise) > MIN_LENGTH) return { x: c.x - (a.x + ((c.y - a.y) * run) / rise), y: 0 }
  return { x: c.x - a.x, y: c.y - a.y }
}

/** Nhãn của điểm thứ `index`: phía trên nếu là đỉnh so với các điểm kề, phía dưới nếu là đáy (cùng quy ước với nhãn sóng Elliott). */
function pointLabel(shape: Shape, points: readonly ScreenAnchor[], index: number, text: string, token: ColorToken): void {
  const here = points[index]
  if (!here) return
  const around = [points[index - 1], points[index + 1]].filter((point): point is ScreenAnchor => point !== undefined)
  const above = around.length === 0 || here.y <= around.reduce((sum, point) => sum + point.y, 0) / around.length
  addLabel(shape, token, text, here.x, here.y + (above ? -8 : 15), "center")
}

function polylineStrokes(shape: Shape, points: readonly ScreenPoint[], token: ColorToken, weight: Weight): void {
  for (let i = 1; i < points.length; i++) addStroke(shape, token, weight, segmentOf(points[i - 1], points[i]))
}

function alignOf(anchor: "start" | "middle" | "end"): TextAlign {
  return anchor === "start" ? "left" : anchor === "end" ? "right" : "center"
}

/** Đặt nhãn tránh đè nhau trong khung vẽ rồi thêm vào hình. Nhãn không có vị trí sạch dùng vị trí ít xấu nhất, không bao giờ bị bỏ. */
function placeInto(shape: Shape, requests: readonly (LabelRequest & { token: ColorToken })[], env: Env, obstacles: Box[] = []): void {
  if (!env.labels || requests.length === 0) return
  const { plot } = env
  // Ứng viên có toạ độ không hữu hạn (thang giá suy biến) bị bỏ trước khi đặt, để chi phí không thành NaN.
  const usable = requests.map((request) => ({ ...request, candidates: request.candidates.filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) }))
  const tokens = new Map(usable.map((request) => [request.key, request.token]))
  const placed = placeLabels(usable, { bounds: { l: plot.left, t: plot.top, r: plot.right, b: plot.bottom }, segments: [], obstacles: obstacles.map((box) => ({ box, weight: 20 })), pad: 1 })
  for (const label of placed) addLabel(shape, tokens.get(label.key) ?? "foreground", label.text, label.x, label.y, alignOf(label.anchor))
}

/** Vị trí ứng viên của nhãn đặt ở đầu xa của một đoạn: sát đầu mút, rồi lùi dần dọc theo đoạn. */
function endCandidates(seg: Segment, outward: boolean): Candidate[] {
  const [x1, y1, x2, y2] = seg
  const forward = x2 >= x1
  const [endX, endY, backX, backY] = forward ? [x2, y2, x1, y1] : [x1, y1, x2, y2]
  const length = Math.hypot(endX - backX, endY - backY)
  const ux = length > 0 ? (backX - endX) / length : 0
  const uy = length > 0 ? (backY - endY) / length : 0
  const candidates: Candidate[] = outward ? [{ x: endX + 4, y: endY + 4, anchor: "start" }] : []
  for (let column = 0; column < 6; column++) {
    const back = Math.min(length, column * 40)
    candidates.push({ x: endX + ux * back - 4, y: endY + uy * back - 4, anchor: "end" })
  }
  return candidates
}

// ------------------------------------------------------------------ từng công cụ

function fibTimeZones(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b] = points
  if (!b) return
  const { plot } = env
  addStroke(shape, style.color, "hair", segmentOf(a, b), { dashed: true })
  const rows: [number, number][][] = []
  for (const { n, x } of fibTimeZonePositions(a.x, b.x, plot.left, plot.right)) {
    addStroke(shape, style.color, "thin", [x, plot.top, x, plot.bottom])
    // Nhãn số Fibonacci ở chân vạch (đầu vạch là chỗ chú giải O, H, L, C của biểu đồ); hai vạch sát nhau thì nhãn sau dời lên hàng trên.
    const text = String(n)
    const width = textWidth(text)
    const flip = x + 3 + width > plot.right
    const left = flip ? x - 3 - width : x + 3
    const row = rows.findIndex((used) => used.every(([from, to]) => left + width + 2 <= from || left >= to + 2))
    const index = row >= 0 ? row : rows.length
    if (index >= 6) continue
    ;(rows[index] ??= []).push([left, left + width])
    addLabel(shape, style.color, text, flip ? x - 3 : x + 3, plot.bottom - 6 - index * 13, flip ? "right" : "left")
  }
}

function fibFan(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b] = points
  if (!b) return
  const { plot, coords } = env
  // Đường nối hai điểm neo là tia 100%; đường dọc qua điểm thứ hai đo khoảng giá từ điểm đầu tới điểm thứ hai.
  addStroke(shape, style.color, "main", segmentOf(a, b))
  addStroke(shape, style.color, "hair", [b.x, b.y, b.x, coords.yOfPrice(a.price)], { dashed: true, alpha: 0.6, hit: false })
  const requests: (LabelRequest & { token: ColorToken })[] = []
  for (const { level, token } of FIB_FAN_LEVELS) {
    const target = { x: b.x, y: coords.yOfPrice(fibFanPrice(a.price, b.price, level)) }
    const seg = rayIn(a, { x: target.x - a.x, y: target.y - a.y }, plot)
    if (!seg) continue
    addStroke(shape, token, "thin", seg)
    requests.push({ key: String(level), token, text: percentText(level), size: LABEL_SIZE, weight: 600, candidates: endCandidates(seg, false) })
  }
  placeInto(shape, requests, env)
}

function fibChannel(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b, c] = points
  if (!b) return
  if (!c) {
    addStroke(shape, style.color, "main", segmentOf(a, b))
    return
  }
  const shift = parallelShift(a, b, c)
  const at = (level: number): [ScreenPoint, ScreenPoint] => [
    { x: a.x + shift.x * level, y: a.y + shift.y * level },
    { x: b.x + shift.x * level, y: b.y + shift.y * level },
  ]
  if (style.fill) {
    const [near, far] = [at(FIB_ZONE[0]), at(FIB_ZONE[1])]
    addFill(shape, FIB_ZONE_TOKEN, FILL_ALPHA, [near[0], near[1], far[1], far[0]])
  }
  const requests: (LabelRequest & { token: ColorToken })[] = []
  FIB_CHANNEL_LEVELS.forEach(({ level, token }, index) => {
    const [from, to] = at(level)
    const seg = segmentOf(from, to)
    addStroke(shape, token, "thin", seg)
    requests.push({ key: String(index), token, text: percentText(level), size: LABEL_SIZE, weight: 600, candidates: endCandidates(seg, true) })
  })
  placeInto(shape, requests, env)
}

function pitchfork(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [p0, p1, p2] = points
  if (!p1) return
  const { plot } = env
  if (!p2) {
    addStroke(shape, style.color, "hair", segmentOf(p0, p1), { dashed: true })
    return
  }
  // Đường giữa đi từ điểm đầu qua trung điểm của đoạn p1-p2; hai nhánh xuất phát từ p1 và p2, song song với đường giữa.
  addStroke(shape, style.color, "hair", segmentOf(p1, p2), { dashed: true })
  const mid = midpoint(p1, p2)
  const dir = { x: mid.x - p0.x, y: mid.y - p0.y }
  const length = Math.hypot(dir.x, dir.y)
  if (!(length >= MIN_LENGTH)) return
  if (style.fill) {
    // Hai dải giữa đường giữa và từng nhánh, bắt đầu từ đoạn p1-p2 (cán nĩa từ p0 tới trung điểm không tô); kéo dài quá khung vẽ, khung cắt phần thừa.
    const centre = { x: (plot.left + plot.right) / 2, y: (plot.top + plot.bottom) / 2 }
    const reach = Math.hypot(plot.right - plot.left, plot.bottom - plot.top) + Math.max(...[p0, p1, p2].map((point) => Math.hypot(point.x - centre.x, point.y - centre.y)))
    const far = (point: ScreenPoint): ScreenPoint => ({ x: point.x + (dir.x / length) * reach, y: point.y + (dir.y / length) * reach })
    for (const prong of [p1, p2]) addFill(shape, style.color, FILL_ALPHA * 0.8, [mid, far(mid), far(prong), prong])
  }
  for (const origin of [p0, p1, p2]) addStroke(shape, style.color, "main", rayIn(origin, dir, plot))
}

function gannFan(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b] = points
  if (!b) return
  const { plot } = env
  const dx = b.x - a.x
  const dy = b.y - a.y
  // Thẳng đứng hoặc nằm ngang thì mọi góc trùng nhau: chỉ vẽ đường 1x1.
  const angles = Math.abs(dx) < MIN_LENGTH || Math.abs(dy) < MIN_LENGTH ? GANN_ANGLES.filter((angle) => angle.token === null) : GANN_ANGLES
  const requests: (LabelRequest & { token: ColorToken })[] = []
  for (const angle of angles) {
    const seg = rayIn(a, gannDirection(dx, dy, angle), plot)
    if (!seg) continue
    const token = angle.token ?? style.color
    addStroke(shape, token, angle.token === null ? "main" : "thin", seg)
    requests.push({ key: angle.label, token, text: angle.label, size: LABEL_SIZE, weight: 600, candidates: endCandidates(seg, false) })
  }
  placeInto(shape, requests, env)
}

function gannBox(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b] = points
  if (!b) return
  const { coords, format } = env
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  if (style.fill && right > left && bottom > top) {
    addFill(shape, style.color, FILL_ALPHA * 0.6, [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }])
  }
  // Đường chéo 1x1 nối hai góc đã chọn.
  addStroke(shape, style.color, "hair", segmentOf(a, b), { dashed: true })
  const requests: (LabelRequest & { token: ColorToken })[] = []
  // Hộp hẹp (điện thoại) thì bỏ nhãn tỷ lệ dọc: nhãn ngang cùng mức đã ghi tỷ lệ, còn nhãn dọc chen nhau không đọc được.
  const wideEnough = right - left >= (GANN_BOX_LEVELS.length - 2) * 48
  GANN_BOX_LEVELS.forEach((level, index) => {
    const edge = level === 0 || level === 1
    const weight = edge ? "main" : "thin"
    const alpha = edge ? undefined : INTERIOR_ALPHA
    // Mức ngang theo giá (nội suy tuyến tính, như Fibonacci), mức dọc theo chỉ số nến.
    const price = a.price + (b.price - a.price) * level
    const y = coords.yOfPrice(price)
    const x = a.x + (b.x - a.x) * level
    addStroke(shape, style.color, weight, [left, y, right, y], { alpha })
    addStroke(shape, style.color, weight, [x, top, x, bottom], { alpha })
    const horizontal = `${ratioText(level)} · ${format(price)}`
    requests.push({
      key: `h${index}`,
      token: style.color,
      text: horizontal,
      size: LABEL_SIZE,
      weight: 600,
      candidates: [0, 1, 2, 3].flatMap((row) => [{ x: left + 4, y: y - 3 - row * 12, anchor: "start" as const }, { x: right - 4, y: y - 3 - row * 12, anchor: "end" as const }]),
    })
    if (wideEnough) {
      requests.push({
        key: `v${index}`,
        token: style.color,
        text: ratioText(level),
        size: LABEL_SIZE,
        weight: 600,
        candidates: [0, 1, 2, 3].flatMap((row) => [{ x: x + 3, y: bottom - 4 - row * 12, anchor: "start" as const }, { x: x - 3, y: bottom - 4 - row * 12, anchor: "end" as const }]),
      })
    }
  })
  // Nhãn giá giữ ở cả bảy mức ngang; nhãn tỷ lệ dọc bỏ ở hai biên (0 và 1) vì đã có nhãn giá ngang cùng mức.
  placeInto(shape, requests.filter((request) => !/^v(0|6)$/.test(request.key)), env)
}

const XABCD_NAMES = ["X", "A", "B", "C", "D"] as const

function xabcd(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [x, a, b, c, d] = points
  if (!a) return
  polylineStrokes(shape, points, style.color, "main")
  const dashed = (from: ScreenPoint | undefined, to: ScreenPoint | undefined) => {
    if (from && to) addStroke(shape, style.color, "hair", segmentOf(from, to), { dashed: true })
  }
  dashed(x, b)
  dashed(a, c)
  dashed(b, d)
  dashed(x, d)
  if (style.fill) {
    if (b) addFill(shape, style.color, FILL_ALPHA, [x, a, b])
    if (d) addFill(shape, style.color, FILL_ALPHA, [b, c, d])
  }
  points.forEach((_, index) => pointLabel(shape, points, index, XABCD_NAMES[index], style.color))
  if (!d) return
  const ratios = xabcdRatios([x.price, a.price, b.price, c.price, d.price])
  const letters = shape.labels.map((label) => labelBox(label.text, LABEL_SIZE, label.x, label.y, "middle", 2, undefined, 600))
  const entries: [string, number | null, ScreenPoint, ScreenPoint][] = [
    ["xab", ratios.xab, x, b],
    ["abc", ratios.abc, a, c],
    ["bcd", ratios.bcd, b, d],
    ["xad", ratios.xad, x, d],
  ]
  const requests = entries.flatMap(([key, value, from, to]): (LabelRequest & { token: ColorToken })[] => {
    if (value === null) return []
    const centre = midpoint(from, to)
    return [{ key, token: style.color, text: ratioText(value), size: LABEL_SIZE, weight: 600, candidates: aroundPoint(centre.x, centre.y, 3, LABEL_SIZE, "above") }]
  })
  placeInto(shape, requests, env, letters)
}

function headShoulders(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle): void {
  const [p0, p1, p2, p3, p4, p5, p6] = points
  if (!p1) return
  polylineStrokes(shape, points, style.color, "main")
  if (style.fill) {
    if (p2) addFill(shape, style.color, FILL_ALPHA, [p0, p1, p2])
    if (p4) addFill(shape, style.color, FILL_ALPHA, [p2, p3, p4])
    if (p6) addFill(shape, style.color, FILL_ALPHA, [p4, p5, p6])
  }
  for (const [index, text] of Object.entries(HEAD_SHOULDERS_LABELS)) pointLabel(shape, points, Number(index), text, style.color)
  if (!p4) return
  // Đường cổ qua hai đáy p2 và p4, kéo dài nét đứt về phía p6 nếu p6 nằm sau p4.
  addStroke(shape, style.color, "main", segmentOf(p2, p4), { alpha: 0.9 })
  const run = p4.x - p2.x
  const slope = Math.abs(run) > MIN_LENGTH ? (p4.y - p2.y) / run : null
  const neckAt = (x: number): number => (slope === null ? p4.y : p2.y + slope * (x - p2.x))
  if (p6 && slope !== null && p6.x > p4.x && run > 0) addStroke(shape, style.color, "thin", [p4.x, p4.y, p6.x, neckAt(p6.x)], { dashed: true })
  const centre = midpoint(p2, p4)
  const below = p3 ? p3.y < neckAt(p3.x) : true
  addLabel(shape, style.color, "Đường cổ", centre.x, centre.y + (below ? 15 : -8), "center")
}

/** Giao điểm của đường p-q và đường r-s theo màn hình, và tham số t trên p-q; null nếu song song. */
function intersect(p: ScreenPoint, q: ScreenPoint, r: ScreenPoint, s: ScreenPoint): { point: ScreenPoint; t: number; u: number } | null {
  const d1 = { x: q.x - p.x, y: q.y - p.y }
  const d2 = { x: s.x - r.x, y: s.y - r.y }
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-9) return null
  const t = ((r.x - p.x) * d2.y - (r.y - p.y) * d2.x) / cross
  const u = ((r.x - p.x) * d1.y - (r.y - p.y) * d1.x) / cross
  return { point: { x: p.x + t * d1.x, y: p.y + t * d1.y }, t, u }
}

const TRIANGLE_NAMES = ["A", "B", "C", "D"] as const

function trianglePattern(shape: Shape, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): void {
  const [a, b, c, d] = points
  if (!b) return
  const { plot } = env
  polylineStrokes(shape, points, style.color, "thin")
  if (c) {
    // Đường trên đi qua A và C, đường dưới đi qua B và D. Hội tụ về phía trước thì kéo dài tới đỉnh tam giác.
    const apex = d ? intersect(a, c, b, d) : null
    const converging = apex !== null && apex.t > 1 && apex.u > 1
    addStroke(shape, style.color, "main", clipLine(a, converging ? apex.point : c, plot, "none") ?? segmentOf(a, c))
    if (d) addStroke(shape, style.color, "main", clipLine(b, converging ? apex.point : d, plot, "none") ?? segmentOf(b, d))
  }
  if (style.fill && d) addFill(shape, style.color, FILL_ALPHA, [a, b, d, c])
  points.forEach((_, index) => pointLabel(shape, points, index, TRIANGLE_NAMES[index], style.color))
}

function shapeOf(tool: AdvancedTool, points: readonly ScreenAnchor[], style: DrawingStyle, env: Env): Shape {
  const shape = emptyShape()
  if (points.length === 0) return shape
  switch (tool) {
    case "fib-time-zones":
      fibTimeZones(shape, points, style, env)
      break
    case "fib-fan":
      fibFan(shape, points, style, env)
      break
    case "fib-channel":
      fibChannel(shape, points, style, env)
      break
    case "pitchfork":
      pitchfork(shape, points, style, env)
      break
    case "gann-fan":
      gannFan(shape, points, style, env)
      break
    case "gann-box":
      gannBox(shape, points, style, env)
      break
    case "xabcd":
      xabcd(shape, points, style, env)
      break
    case "head-shoulders":
      headShoulders(shape, points, style)
      break
    case "triangle-pattern":
      trianglePattern(shape, points, style, env)
      break
  }
  return shape
}

// ------------------------------------------------------------------ lệnh vẽ và chọn hình

function strokeWidth(weight: Weight, style: DrawingStyle, selected: boolean): number {
  if (weight === "hair") return 1
  if (weight === "thin") return style.width * 0.65 + (selected ? 0.7 : 0)
  return style.width + (selected ? SELECT_EXTRA_WIDTH : 0)
}

/**
 * Lệnh vẽ của một công cụ đợt 2, chịu được hình chưa đủ điểm neo (bản xem trước khi đang vẽ). Mọi toạ độ, độ dày, nét đứt và cỡ chữ
 * nhân với `dpr`; `count` là số phần tử dùng được trong `data`.
 */
export function advancedCommands(tool: AdvancedTool, points: readonly ScreenAnchor[], style: DrawingStyle, ctx: AdvancedContext): DrawCommand[] {
  const shape = shapeOf(tool, points, style, { coords: ctx.coords, plot: ctx.coords.plot, format: ctx.format, labels: true })
  const { dpr } = ctx
  const out: DrawCommand[] = []
  for (const fill of shape.fills) {
    const data = new Float64Array(fill.points.length * 2)
    fill.points.forEach((point, index) => {
      data[index * 2] = point.x * dpr
      data[index * 2 + 1] = point.y * dpr
    })
    out.push({ op: "polygon", token: fill.token, alpha: fill.alpha, data, count: data.length })
  }
  const groups = new Map<string, { token: ColorToken; width: number; dashed: boolean; alpha: number | undefined; segments: Segment[] }>()
  for (const stroke of shape.strokes) {
    const width = strokeWidth(stroke.weight, style, ctx.selected)
    const key = `${stroke.token}|${width}|${stroke.dashed ? 1 : 0}|${stroke.alpha ?? 1}`
    const group = groups.get(key) ?? { token: stroke.token, width, dashed: stroke.dashed === true, alpha: stroke.alpha, segments: [] }
    group.segments.push(stroke.seg)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    const data = new Float64Array(group.segments.length * 4)
    group.segments.forEach((segment, index) => {
      for (let k = 0; k < 4; k++) data[index * 4 + k] = segment[k] * dpr
    })
    out.push({
      op: "lines",
      token: group.token,
      ...(group.alpha === undefined ? {} : { alpha: group.alpha }),
      width: group.width * dpr,
      dash: group.dashed ? DASH.map((value) => value * dpr) : undefined,
      data,
      count: data.length,
    })
  }
  for (const label of shape.labels) {
    out.push({ op: "text", token: label.token, text: label.text, x: label.x * dpr, y: label.y * dpr, align: label.align, size: LABEL_SIZE * dpr, weight: 600, tabular: /\d/.test(label.text) })
  }
  return out
}

/** Khoảng cách (pixel) từ một điểm tới các nét của hình; Infinity nếu hình không có nét nào. Không bao giờ NaN. */
export function advancedDistance(tool: AdvancedTool, points: readonly ScreenAnchor[], style: DrawingStyle, point: ScreenPoint, coords: PaneCoords): number {
  const shape = shapeOf(tool, points, style, { coords, plot: coords.plot, format: defaultFormatPrice, labels: false })
  let best = Infinity
  for (const stroke of shape.strokes) {
    if (stroke.hit === false) continue
    const [x1, y1, x2, y2] = stroke.seg
    best = Math.min(best, distanceToSegment(point, { x: x1, y: y1 }, { x: x2, y: y2 }))
  }
  return Number.isNaN(best) ? Infinity : best
}
