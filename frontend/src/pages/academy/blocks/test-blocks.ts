/**
 * Renderer fixtures: one block of every static type of the v3.2 schema and one chart model of
 * every kind, shaped like the real content (`backend/src/modules/academy/content/v3/lessons`).
 */
import type { ChartModel, InteractiveBlock, LessonBlock, StaticBlock } from "../content-types"

const range = (n: number, f: (k: number) => number) => Array.from({ length: n }, (_, k) => Math.round(f(k) * 100) / 100)

const closes = range(30, (k) => 50 + Math.sin(k / 3) * 4 + k * 0.2)

export const CHARTS: Record<string, ChartModel> = {
  "c4l7-g6": {
    kind: "series_panels",
    alt: "Giá và MACD: histogram chuyển dương thì mua",
    x: { start: 70, end: 99, shade: [{ from: 72, to: 76, tone: "pos", label: "Tích lũy" }] },
    marks: [{ i: 80, label: "A" }],
    points: [
      { i: 85, panel: 0, value: closes[15], tone: "pos", label: "Mua", pos: "above" },
      { i: 85, panel: 1, value: 0.3, tone: "pos", shape: "ring" },
    ],
    panels: [
      {
        title: "Giá",
        digits: 1,
        series: [
          { name: "Giá", role: "price", width: 2, values: closes },
          { name: "MA20", role: "p1", dash: true, values: range(30, (k) => 50 + k * 0.2) },
        ],
        candles: {
          open: closes.map((c) => c - 0.5),
          high: closes.map((c) => c + 1),
          low: closes.map((c) => c - 1.2),
          close: closes,
        },
        band: { upper: closes.map((c) => c + 2), lower: closes.map((c) => c - 2), tone: "p1" },
        zones: [{ from: 52, to: 54, tone: "warn", label: "Vùng cản" }],
        levels: [{ value: 55, role: "sell", label: "Kháng cự" }],
        segments: [{ from: [75, 50], to: [85, 53], tone: "pos", extend: 5, dash: true }],
        fib: { lo: { i: 72, v: 48 }, hi: { i: 90, v: 56 }, dir: "up", levels: [0, 0.382, 0.5, 0.618, 1], zone: [0.5, 0.618] },
        notes: [{ i: 95, value: 49, text: "Cắt lỗ", tone: "neg" }],
      },
      {
        title: "MACD (12, 26, 9)",
        zero: true,
        series: [
          { name: "MACD", role: "p1", values: range(30, (k) => Math.sin(k / 4)) },
          { name: "Đường tín hiệu", role: "warn", values: range(30, (k) => Math.sin((k - 2) / 4)) },
        ],
        fill_between: { a: 0, b: 1, above: "pos", below: "neg" },
        bars: {
          name: "Histogram",
          values: range(30, (k) => Math.sin(k / 4) - Math.sin((k - 2) / 4)),
          colors: range(30, (k) => Math.sin(k / 4) - Math.sin((k - 2) / 4)).map((v) => (v >= 0 ? "pos" : "neg")),
        },
      },
    ],
  },
  "c4l1-g4": {
    kind: "series_panels",
    axes: false,
    x: { start: 0, end: 9 },
    marks: [],
    panels: [
      {
        title: "",
        series: [],
        candles: { open: range(10, (k) => 10 + k), high: range(10, (k) => 12 + k), low: range(10, (k) => 9 + k), close: range(10, (k) => 11 + k) },
      },
    ],
  },
  "c1l1-g1": {
    kind: "category",
    mode: "line",
    labels: ["2015", "2016", "2017", "2018"],
    unit: "triệu",
    animate: "draw",
    bounds: [0, 350],
    ticks: [0, 100, 200, 300],
    end_labels: ["308 triệu", "179 triệu"],
    value_labels: "none",
    series: [
      { name: "Đầu tư theo VN-Index", tone: "p1", values: [100, 150, 220, 308] },
      { name: "Gửi tiết kiệm 6%/năm", tone: "p2", values: [100, 120, 150, 179] },
    ],
  },
  "c5l1-g2": {
    kind: "category",
    mode: "grouped",
    labels: ["Tháng 1", "Tháng 2", "Tháng 3"],
    sublabels: ["20.000 đ", "15.000 đ", "12.000 đ"],
    unit: "chứng chỉ",
    value_labels: "all",
    threshold: { value: 180, label: "Mục tiêu", tone_at_or_above: "pos", tone_below: "neg" },
    series: [{ name: "Số chứng chỉ quỹ", values: [150, 200, 250] }],
  },
  "c3l2-g1": {
    kind: "category",
    mode: "stacked",
    orientation: "h",
    labels: ["Kênh mạng xã hội", "Người quen"],
    unit: "%",
    value_labels: "last",
    series: [
      { name: "Tự tìm", values: [30, 50] },
      { name: "Được giới thiệu", values: [20, null] },
    ],
  },
  "c1l1-g2": {
    kind: "segment_bar",
    max: 10,
    pictogram: { per_unit: 1, icon: "banknote" },
    alt: "Sức mua 100 triệu sau 10 năm",
    rows: [
      { label: "Năm 2015", total: { text: "100 triệu" }, segments: [{ value: 10, tone: "pos" }] },
      { label: "Năm 2025", total: { text: "≈ 74 triệu", tone: "neg" }, segments: [{ value: 7.4, tone: "pos" }, { value: 2.6, tone: "neutral", ghost: true }] },
    ],
  },
  "c1l1-a2": {
    kind: "segment_bar",
    max: 20,
    unit: "ngày",
    legend: [{ tone: "p1", label: "Chứng khoán" }],
    brackets: [{ row: 1, from: 2, to: 18, label: "chênh lệch", tone: "warn" }],
    rows: [
      { label: "Chứng khoán", sub: "T+2", segments: [{ value: 2, tone: "p1", label: "2 ngày" }] },
      { label: "Bất động sản", segments: [{ value: 18, tone: "p5", label: "vài tuần đến vài tháng", sub: "có thể lâu hơn" }] },
    ],
  },
  "c1l3-g2": {
    kind: "scale",
    orientation: "v",
    domain: [23250, 26750],
    gradient: ["p4", "pos", "warn", "neg", "info"],
    zones: [{ from: 25000, to: 26750, tone: "pos", label: "Tăng: màu xanh lá" }],
    markers: [
      { v: 26750, label: "Giá trần", sub: "26.750 · +7%", tone: "p4" },
      { v: 23250, label: "Giá sàn", sub: "23.250", tone: "info" },
    ],
    ticks: [{ v: 25000, label: "25.000" }],
    ends: ["Thấp", "Cao"],
  },
  "c5l2-g1": {
    kind: "scale",
    orientation: "h",
    domain: [0, 30],
    ticks: [
      { v: 0, label: "0" },
      { v: 30, label: "30" },
    ],
    zones: [{ from: 0, to: 10, tone: "pos", label: "Rẻ" }],
    ends: ["Rẻ", "Đắt"],
    markers: [
      { v: 12, label: "P/E hiện tại", sub: "12,0", tone: "p1", side: "a" },
      { v: 14.3, label: "Trung bình 5 năm", tone: "warn", side: "b" },
    ],
  },
  "c1l5-g3": {
    kind: "schematic",
    alt: "Rủi ro càng cao, lợi nhuận kỳ vọng càng cao",
    domain: { x: [0, 1], y: [0, 1] },
    axes: { x: { title: "Rủi ro", arrow: true, ticks: [{ v: 0.5, label: "Vừa" }] }, y: { title: "Lợi nhuận kỳ vọng", arrow: true } },
    layers: [
      { t: "zone", x: [0, 0.3], tone: "pos", label: "An toàn" },
      { t: "line", pts: [[0.05, 0.1], [0.5, 0.45], [0.95, 0.9]], tone: "p1", width: 2, dash: true },
      { t: "line", pts: [[0.1, 0.2], [0.3, 0.6], [0.5, 0.3]], tone: "p1", colors: ["pos", "neg"] },
      { t: "segment", from: [0.2, 0.8], to: [0.4, 0.8], tone: "warn", arrow: true },
      { t: "point", at: [0.86, 0.82], tone: "p1", size: "l", label: "Cổ phiếu", pos: "left" },
      { t: "point", at: [0.08, 0.12], tone: "p3", shape: "ring", label: "Tiền gửi tiết kiệm", pos: "right" },
      { t: "tag", at: [0.6, 0.5], text: "Mua", tone: "pos", pos: "above" },
      { t: "bracket", x: [0.6, 0.9], y: 0.2, label: "Biên an toàn", tone: "p2" },
      { t: "bars", x: [0.7, 0.75, 0.8], h: [0.05, -0.03, 0.08], tones: ["pos", "neg", "pos"], base: 0.1 },
      { t: "text", at: [0.5, 0.95], text: "Đường kỳ vọng", tone: "p1" },
    ],
  },
  "c4l6-g4": {
    kind: "schematic",
    alt: "Phân kỳ giá và RSI",
    panels: [
      { title: "Giá", y: [0, 10] },
      { title: "RSI", y: [0, 100] },
    ],
    layers: [
      { t: "line", pts: [[0, 2], [5, 8], [10, 9]], tone: "price", panel: 0 },
      { t: "line", pts: [[0, 30], [5, 70], [10, 60]], tone: "p4", panel: 1 },
      { t: "zone", y: [70, 100], tone: "neg", panel: 1 },
    ],
  },
  "c1l3-g3": {
    kind: "gantt",
    alt: "Các phiên giao dịch trong ngày",
    domain: [540, 900],
    tick_format: "hhmm",
    ticks: [
      { v: 540, label: "9:00" },
      { v: 900, label: "15:00" },
    ],
    legend: [{ tone: "p4", label: "Mở cửa 9:00-9:15" }],
    highlight: { from: 540, to: 555, label: "ATO" },
    rows: [
      {
        name: "HOSE",
        segments: [
          { from: 540, to: 555, label: "ATO", tone: "p4" },
          { from: 555, to: 690, label: "Liên tục", tone: "p1" },
          { from: 690, to: 780, label: "Nghỉ trưa", tone: "neutral", muted: true },
          { from: 780, to: 900, label: "Liên tục", tone: "p1" },
        ],
        markers: [{ at: 885, text: "ATC", tone: "p5" }],
        note: "Sau giờ là phiên thỏa thuận",
      },
    ],
  },
  "c1l4-g3": {
    kind: "gantt",
    domain: [0, 5],
    tick_format: "day",
    ticks: [{ v: 0.5, label: "T" }],
    columns: [{ label: "T" }, { label: "T+1" }, { label: "T+2" }, { label: "Thứ 7", dim: true }, { label: "CN", dim: true }],
    rows: [{ name: "Tiền về", segments: [{ from: 2, to: 3, label: "Tiền về", tone: "pos" }] }],
  },
  "c1l7-g1": {
    kind: "milestones",
    alt: "Mốc thời gian của một sự kiện quyền",
    brace: { from: 0.42, to: 0.6, label: "1 ngày làm việc" },
    points: [
      { at: 0, title: "Công bố", detail: ["sự kiện"], tone: "p3" },
      { at: 0.42, title: "Giao dịch", detail: ["không hưởng quyền"], tone: "neg" },
      { at: 0.6, title: "Đăng ký", detail: ["cuối cùng"], tone: "p1" },
      { at: 1, title: "Thanh toán", tone: "pos" },
    ],
    spans: [
      { from: 0, to: 0.42, label: "Mua trong giai đoạn này: được hưởng quyền", tone: "pos", side: "above" },
      { from: 0.42, to: 1, label: "Mua từ đây: không được hưởng quyền", tone: "neg", side: "below" },
    ],
  },
  "c4l1-g1": {
    kind: "candle_glyphs",
    alt: "Cấu tạo nến tăng và nến giảm",
    domain: [0, 110],
    join: "+",
    groups: [
      { title: "Nến tăng", annotate: "ohlc", candles: [{ o: 40, h: 100, l: 15, c: 80, size: "l" }] },
      { title: "Nến giảm", candles: [{ o: 80, h: 100, l: 15, c: 40, label: "Giảm" }, { o: 50, h: 60, l: 45, c: 55, size: "s" }] },
    ],
  },
  "c1l2-g3": {
    kind: "flow",
    alt: "Lệnh đi từ nhà đầu tư đến sở giao dịch",
    layout: "row",
    edges: "sequential",
    header: { text: "Ủy ban Chứng khoán Nhà nước", tone: "warn" },
    nodes: [
      { id: "nha-dau-tu", title: "Nhà đầu tư", caption: "Đặt lệnh" },
      { id: "cong-ty", title: "Công ty chứng khoán" },
      { id: "so", title: "Sở giao dịch", sub: "HOSE · HNX", emph: true, tone: "p1", children: [{ title: "Doanh nghiệp phát hành", tone: "p1" }] },
      { id: "vsdc", title: "VSDC", value: "T+2" },
    ],
  },
  "c1l8-g4": {
    kind: "flow",
    alt: "Vòng lặp lạm phát và lãi suất",
    layout: "cycle",
    edges: "sequential",
    nodes: [
      { id: "lam-phat-tang", title: "Lạm phát tăng", tone: "neg" },
      { id: "tang-lai-suat", title: "Tăng lãi suất", tone: "warn" },
      { id: "kinh-te-ha-nhiet", title: "Kinh tế hạ nhiệt", tone: "p3" },
    ],
  },
  "c1l1-a1": {
    kind: "diagram",
    alt: "Một căn nhà cần hàng tỷ đồng",
    view_box: [200, 120],
    shapes: [
      { t: "path", d: "M14 58 L52 26 L90 58", stroke: "p5", width: 3 },
      { t: "rect", x: 22, y: 56, w: 60, h: 40, fill: "p5", opacity: 0.2, stroke: "p5", dash: true },
      { t: "circle", cx: 150, cy: 30, r: 10, fill: "p1" },
      { t: "line", x1: 100, y1: 60, x2: 120, y2: 60, stroke: "p1", arrow: "end" },
      { t: "text", x: 52, y: 114, text: "hàng tỷ đồng", anchor: "middle", size: "s" },
      { t: "text", x: 152, y: 114, text: "vài triệu đồng", anchor: "middle", tone: "p1", weight: "bold" },
    ],
  },
  "c4l6-g0": {
    kind: "compare",
    layout: "row",
    title: "Ba kịch bản RSI",
    items: [
      {
        title: "Phần lớn phiên tăng",
        tone: "pos",
        model: {
          kind: "category",
          mode: "grouped",
          labels: ["1", "2", "3", "4"],
          unit: "",
          value_labels: "none",
          caption_value: "RSI ≈ 81",
          caption_tone: "neg",
          series: [{ name: "Thay đổi giá", tone_by_sign: { pos: "pos", neg: "neg" }, values: [3, 2, -2, 1] }],
        },
      },
      {
        title: "Thị trường sơ cấp",
        model: {
          kind: "flow",
          layout: "row",
          edges: [
            { from: "doanh-nghiep", to: "nha-dau-tu", label: "Cổ phiếu" },
            { from: "nha-dau-tu", to: "doanh-nghiep", label: "Tiền" },
          ],
          nodes: [
            { id: "doanh-nghiep", title: "Doanh nghiệp", emph: true, tone: "p1" },
            { id: "nha-dau-tu", title: "Nhà đầu tư" },
          ],
        },
      },
    ],
  },
}

export const STATIC_BLOCKS: StaticBlock[] = [
  { type: "paragraph", text: 'Giá <b>tăng</b> khi <span class="tone-pos">cầu</span> lớn hơn cung &amp; ngược lại.' },
  { type: "heading", text: "Một tiêu đề phụ" },
  { type: "note", text: "Số liệu giả định để minh họa" },
  {
    type: "chart",
    chart_id: "c4l7-g6",
    title: "MACD và giá",
    legend: [
      { tone: "price", label: "Giá" },
      { tone: "p1", label: "MACD" },
    ],
    note: "Dữ liệu minh họa",
    table_toggle: true,
  },
  {
    type: "chart_grid",
    layout: "grid",
    columns: 2,
    items: [
      { chart_id: "c4l1-g4", title: "Doji", text: "Thị trường <b>lưỡng lự</b>." },
      { chart_id: "c4l1-g1", title: "Búa" },
    ],
  },
  {
    type: "chart_grid",
    layout: "rows",
    columns: 2,
    items: [
      { chart_id: "c1l1-a1", title: "Vốn đầu tư linh hoạt", text: "Chỉ từ <b>vài triệu đồng</b>." },
      { chart_id: "c1l1-a2", title: "Thanh khoản cao" },
    ],
  },
  {
    type: "table",
    variant: "grid",
    title: "So sánh kênh đầu tư",
    columns: [{ label: "Tiêu chí" }, { label: "Cổ phiếu", highlight: true }, { label: "Tiết kiệm", tone: "bad", align: "r" }],
    rows: [
      { cells: ["Rủi ro", { rating: "bad", text: "Cao" }, { rating: "good", text: "Thấp" }] },
      { cells: ["Kết hợp", { text: "Cả hai kênh", colspan: 2, highlight: true }] },
      { cells: ["Lợi nhuận", { text: "Không giới hạn", tone: "pos" }, "6%/năm"] },
    ],
  },
  {
    type: "table",
    variant: "rows",
    aria_label: "Hai loại tài khoản",
    columns: [{ label: "" }, { label: "Thường" }, { label: "Ký quỹ" }],
    rows: [{ cells: ["Đòn bẩy", "Không", { rating: "mid", text: "Có" }] }],
  },
  {
    type: "table",
    variant: "grouped",
    columns: [{ label: "Bước" }, { label: "Việc" }, { label: "Kết quả" }],
    rows: [
      { group: { label: "Chuẩn bị", span: 2 }, cells: ["Đọc báo cáo", "Hiểu doanh nghiệp"] },
      { cells: ["Định giá", "Giá hợp lý"] },
    ],
  },
  {
    type: "cards",
    columns: 2,
    style: "card",
    items: [
      { title: "Tăng", tone: "pos", title_tone: "pos", subtitle: "Phiên 1", text: "Giá <b>tăng</b>.", bullets: ["Ý 1", "Ý 2"] },
      { title: "Quỹ mở", eyebrow: "Loại 2", tone: "highlight", facts: [{ label: "Phí", value: "1%" }] },
    ],
  },
  { type: "cards", columns: 3, style: "tip", items: [{ title: "Mẹo", text: "Đọc kỹ." }] },
  { type: "cards", columns: 2, style: "mistake", items: [{ title: "Mua theo tin đồn", text: "Dễ thua lỗ." }] },
  {
    type: "steps",
    items: [
      { label: "Bước 1", title: "Mở tài khoản", text: "Trực tuyến." },
      { title: "Nạp tiền", value: "10 triệu" },
      { title: "Đặt lệnh" },
      { title: "Theo dõi" },
    ],
  },
  { type: "definitions", title: "Các vai trò", items: [{ term: "Cổ đông", text: "Chủ sở hữu", tone: "info" }, { term: "Trái chủ", text: "Chủ nợ" }] },
  { type: "definitions", marker: "check", items: [{ term: "Tiền nhàn rỗi", text: "chỉ dùng tiền không cần đến." }] },
  {
    type: "stats",
    variant: "hero",
    items: [
      { icon: "vault", label: "Giữ tiền mặt", note: "sức mua còn lại", value: "74 triệu" },
      { icon: "landmark", label: "Gửi tiết kiệm", tone: "pos", value: "179 triệu" },
      { icon: "chart-line", label: "Đầu tư chứng khoán", highlight: true, value: "308 triệu" },
    ],
  },
  { type: "stats", variant: "chip", items: [{ label: "HOSE", value: "±7%" }, { label: "HNX", value: "±10%" }] },
  { type: "stats", variant: "big", items: [{ label: "doanh nghiệp", value: "1.600" }, { label: "tài khoản", value: "9 triệu" }] },
  {
    type: "gauges",
    items: [
      { label: "Khi mua", value: "50%", pct: 50, caption: "Tài sản 200 · Nợ 100", badge: "An toàn", tone: "ok" },
      { label: "Giá giảm 20%", value: "37,5%", pct: 37.5, caption: "Tài sản 160", badge: "Bổ sung ký quỹ", tone: "warn" },
      { label: "Giá giảm 30%", value: "28,6%", pct: 28.6, caption: "Tài sản 140", badge: "Bán giải chấp", tone: "bad" },
    ],
  },
  {
    type: "kv_cards",
    items: [
      { title: "MUA", tone: "pos", rows: [{ label: "Khối lượng", value: "500" }], total: { label: "Giá trị lệnh", value: "12.575.000 đ", tone: "info" } },
      { title: "BÁN", tone: "neg", rows: [{ label: "Thuế", value: "0,1%" }] },
    ],
  },
  { type: "formula", rows: [{ label: "P/E", a: "Giá 24.000 đ", op: "÷", b: "EPS 2.000 đ", result: "12 lần" }] },
  {
    type: "tiles",
    items: [{ glyph: "M1", title: "Ý nghĩa", sub: "Meaning" }, { glyph: "M2", title: "Lợi thế" }, { glyph: "M4", highlight: true, title: "Biên an toàn" }],
    groups: [{ from: 0, to: 1, label: "Doanh nghiệp tốt" }],
    facts: [{ label: "34 ÷ 55 ≈ 0,618", value: "61,8%" }],
  },
  { type: "quote", label: "Nên", text: "“Dạo này anh ổn không?”", tone: "good" },
  { type: "objection", objection: "“Chứng khoán là cờ bạc.”", response: "“Em hiểu, <b>nhưng</b> mua cổ phiếu là góp vốn.”" },
  {
    type: "funnel",
    items: [
      { label: "Traffic", note: "100 người", pct: 100, tone: "p1" },
      { label: "Chuyển đổi", pct: 57.7, tone: "warn" },
    ],
  },
  {
    type: "sample_post",
    kicker: "Bài mẫu · Câu chuyện",
    author: "Lan Nguyễn",
    audience: "Công khai",
    body: "Dòng một\n\nDòng hai",
    why: "<b>Vì sao hiệu quả:</b> gợi tò mò.",
  },
]

export const INTERACTIVE_BLOCK: InteractiveBlock = {
  type: "workpad",
  id: "l1-pad",
  title: "Bài tập",
  prompts: ["Bạn sẽ làm gì?"],
}

export const ALL_BLOCKS: LessonBlock[] = [...STATIC_BLOCKS, INTERACTIVE_BLOCK]

/**
 * Makes every measured element report `width` px, so `useChartWidth` lays charts out as on a
 * phone (358) or a desktop reader (760). Returns the restore function.
 */
export function mockReaderWidth(width: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width })
  return () => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, "clientWidth", descriptor)
  }
}

const GLYPH = 0.56

/**
 * Every SVG drawn at the measured width stays inside it: the viewBox is not wider than the reader
 * and no text (estimated at 0.56em per glyph, as the renderers do) starts or ends outside it.
 * Diagrams (`data-scaled`) scale with their box and are skipped.
 */
export function svgOverflows(container: HTMLElement, width: number): string[] {
  const problems: string[] = []
  container.querySelectorAll("svg[viewBox]").forEach((svg) => {
    if (svg.getAttribute("data-scaled") === "true") return
    const w = Number((svg.getAttribute("viewBox") ?? "").split(/\s+/)[2])
    if (!(w > 0)) return
    if (w > width + 0.5) problems.push(`viewBox ${w} wider than ${width}`)
    svg.querySelectorAll("text, tspan").forEach((node) => {
      const rawX = node.getAttribute("x")
      const x = Number(rawX)
      if (!rawX || !Number.isFinite(x)) return
      if (node.tagName.toLowerCase() === "text" && node.querySelector("tspan[x]")) return
      const text = node.textContent ?? ""
      if (!text) return
      const owner = node.tagName.toLowerCase() === "text" ? node : node.closest("text")
      const size = Number(/text-\[(\d+(?:\.\d+)?)px\]/.exec(owner?.getAttribute("class") ?? "")?.[1] ?? 11)
      const anchor = owner?.getAttribute("text-anchor") ?? "start"
      const extent = text.length * size * GLYPH
      const left = anchor === "middle" ? x - extent / 2 : anchor === "end" ? x - extent : x
      const right = left + extent
      if (left < -2 || right > w + 2) problems.push(`"${text}" spans ${left.toFixed(0)}..${right.toFixed(0)} in ${w}`)
    })
  })
  return problems
}
