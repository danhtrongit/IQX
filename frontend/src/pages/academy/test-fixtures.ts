/** Typed fixtures for the Học viện tests: catalog, progress, lessons, chart models, attempts and reviews. */
import type {
  AcademyAttempt,
  AcademyCatalog,
  AcademyLesson,
  AcademyProgress,
  AcademySubmitResult,
  CatalogLesson,
  ChartModel,
  LessonBlock,
  ReviewItem,
} from "./api"

export const CATALOG_VERSION = "iqx-academy-outline-13ch-71lessons-v1"

/** The server answers null before a completion exists; the generated type cannot express it for this enum. */
export const NO_METHOD = null as unknown as "quiz"

const CHAPTERS: { title: string; type: "technical" | "fundamental" | "tool"; size: number }[] = [
  { title: "Chỉ báo kỹ thuật nền tảng", type: "technical", size: 6 },
  { title: "Sử dụng Backtest", type: "tool", size: 6 },
  { title: "Phân tích cơ bản nền tảng", type: "fundamental", size: 6 },
  { title: "Sử dụng Bộ lọc", type: "tool", size: 6 },
  { title: "Xu hướng và động lượng nâng cao", type: "technical", size: 5 },
  { title: "Sức khỏe tài chính doanh nghiệp", type: "fundamental", size: 6 },
  { title: "Khối lượng và dòng tiền", type: "technical", size: 3 },
  { title: "Chất lượng dòng tiền doanh nghiệp", type: "fundamental", size: 6 },
  { title: "Định giá doanh nghiệp", type: "fundamental", size: 6 },
  { title: "Kênh giá và động lượng", type: "technical", size: 3 },
  { title: "Tăng trưởng dài hạn và hiệu quả vận hành", type: "fundamental", size: 6 },
  { title: "Độ ổn định doanh nghiệp", type: "fundamental", size: 6 },
  { title: "Cổ đông và phân bổ vốn", type: "fundamental", size: 6 },
]

const CH1_NAMES = ["RSI", "MACD", "MA / SMA", "Bollinger Bands", "Khối lượng", "Hợp lưu"]
const CH2_NAMES = ["Bắt đầu với Backtest", "Thiết lập điều kiện Mua", "Thiết lập điều kiện Bán", "Chọn giả định và chạy kiểm thử", "Đọc kết quả và lịch sử giao dịch", "Điều chỉnh, so sánh và lưu kết quả"]
const CH3_NAMES = ["Tăng trưởng doanh thu YoY", "Tăng trưởng LNST YoY", "Tăng trưởng EPS YoY", "Biên lợi nhuận gộp", "Biên lợi nhuận ròng", "ROE"]
const CH4_NAMES = ["Bắt đầu với Bộ lọc", "Thiết lập điều kiện lọc", "Chọn kỳ tính cho từng chỉ tiêu", "Đọc và kiểm tra kết quả", "Điều chỉnh và lưu bộ lọc", "Lưu và áp dụng danh mục cho Bot"]
const INDICATORS = ["rsi", "macd", "ma", "bollinger", "volume"]

export const lessonId = (chapter: number, order: number) => `ch${String(chapter).padStart(2, "0")}-l${String(order).padStart(2, "0")}`

function catalogLesson(chapterNo: number, order: number, type: "technical" | "fundamental" | "tool"): CatalogLesson {
  const id = lessonId(chapterNo, order)
  const guide = chapterNo === 2 || chapterNo === 4
  const concept = chapterNo === 1 && order === 6
  const kind: CatalogLesson["kind"] = guide ? "guide" : concept ? "concept" : type === "technical" ? "technical" : "fundamental"
  const name =
    chapterNo === 1 ? CH1_NAMES[order - 1] : chapterNo === 2 ? CH2_NAMES[order - 1] : chapterNo === 3 ? CH3_NAMES[order - 1] : chapterNo === 4 ? CH4_NAMES[order - 1] : `Bài ${chapterNo}.${order}`
  const bindingId = chapterNo === 1 ? INDICATORS[order - 1] : `${chapterNo}_${order}`
  return {
    id,
    lesson_key: guide ? `guide:${id}` : concept ? "concept:hop_luu" : `${kind}:${bindingId}`,
    chapter: chapterNo,
    order,
    name,
    kind,
    completion: guide
      ? { mode: "guide", question_count: null, required_correct: null, assessment_ready: false, assessment_version: null, button_label: "Hoàn thành bài học" }
      : { mode: "quiz", question_count: 8, required_correct: 8, assessment_ready: true, assessment_version: "v1", button_label: null },
    capability_binding: kind === "technical" || kind === "fundamental" ? { kind, id: bindingId } : null,
    capability_id: kind === "technical" ? `indicator:${bindingId}` : kind === "fundamental" ? `metric:${bindingId}` : null,
    content_status: "published",
    content_version: `v-${id}`,
    legacy_lesson_ids: [],
  }
}

export function buildCatalog(): AcademyCatalog {
  return {
    catalog_version: CATALOG_VERSION,
    chapter_count: CHAPTERS.length,
    lesson_count: CHAPTERS.reduce((sum, chapter) => sum + chapter.size, 0),
    chapters: CHAPTERS.map((chapter, index) => ({
      no: index + 1,
      title: chapter.title,
      type: chapter.type,
      lessons: Array.from({ length: chapter.size }, (_, order) => catalogLesson(index + 1, order + 1, chapter.type)),
    })),
  }
}

export function buildProgress(completedIds: readonly string[] = [], catalog: AcademyCatalog = buildCatalog()): AcademyProgress {
  const completed = new Set(completedIds)
  return {
    catalog_version: CATALOG_VERSION,
    completed: completedIds.map((id) => ({ lesson_id: id, lesson_key: `key:${id}`, completion_method: "quiz", completed_at: "2026-10-05T09:00:00.000Z" })),
    completed_lesson_ids: [...completedIds],
    chapters: catalog.chapters.map((chapter) => ({ no: chapter.no, total: chapter.lessons.length, done: chapter.lessons.filter((lesson) => completed.has(lesson.id)).length })),
    course_done: completedIds.length,
    course_total: catalog.lesson_count,
    progress_revision: completedIds.length,
    granted_capabilities: [],
  }
}

/* ── Chart models (one per kind) ─────────────────────────────────────────── */

export const seriesPanelsModel: ChartModel = {
  kind: "series_panels",
  x: { start: 117, end: 123 },
  marks: [
    { i: 119, label: "A" },
    { i: 121, label: "B" },
  ],
  panels: [
    {
      title: "Giá đóng cửa · đơn vị giả định",
      series: [{ name: "Giá đóng cửa", role: "price", values: [100, 101, 102.5, 101.2, 103, null, 104.4] }],
    },
    {
      title: "RSI 14 · điểm",
      bounds: [0, 100],
      ticks: [0, 30, 50, 70, 100],
      digits: 0,
      levels: [
        { value: 30, role: "buy" },
        { value: 70, role: "sell" },
      ],
      series: [
        { name: "RSI 14", role: "p1", values: [40, 45, 52, 48, 60, null, 66] },
        { name: "RSI 7", role: "p2", dash: true, values: [35, 50, 58, 44, 64, null, 70] },
      ],
    },
    {
      title: "Khối lượng · triệu cổ phiếu",
      nonnegative: true,
      series: [{ name: "TB 20 phiên trước", role: "p1", values: [5, 5, 5, 5, 5, 5, 5] }],
      bars: { name: "Khối lượng", values: [4, 6, 7, 3, 9, 5, 6], colors: ["pos", "pos", "neg", "neg", "pos", "neutral", "pos"] },
      band: { upper: [6, 6, 6, 6, 6, null, 6], lower: [4, 4, 4, 4, 4, null, 4] },
    },
  ],
}

export const groupedModel: ChartModel = {
  kind: "grouped",
  title: "Doanh thu cùng quý của hai năm",
  labels: ["Quý I", "Quý II", "Quý III", "Quý IV"],
  unit: "tỷ đồng",
  series: [
    { name: "2024", values: [800, 1000, 1200, 1500] },
    { name: "2025", values: [960, 1250, 1380, 1650] },
  ],
}

export const lineModel: ChartModel = {
  kind: "line",
  title: "Biên bốn quý",
  labels: ["Q1", "Q2", "Q3", "Q4"],
  unit: "%",
  series: [
    { name: "Biên từng quý", values: [10, 20, null, 40] },
    { name: "Biên bốn quý", values: [30, 30, 30, 30] },
  ],
}

export const stackedModel: ChartModel = {
  kind: "stacked",
  title: "Doanh thu gồm giá vốn và lợi nhuận gộp",
  labels: ["Q2/2024", "Q2/2025"],
  unit: "tỷ đồng",
  series: [
    { name: "Giá vốn", values: [700, 850] },
    { name: "Lợi nhuận gộp", values: [300, 400] },
  ],
}

export const timelineModel: ChartModel = {
  kind: "timeline",
  title: "Hai cửa sổ bốn quý",
  labels: ["Q3/23", "Q4/23", "Q1/24", "Q2/24", "Q3/24", "Q4/24", "Q1/25", "Q2/25"],
  rows: [
    { name: "Kỳ so sánh", start: 0, end: 3, detail: "4.050 tỷ đồng" },
    { name: "Kỳ đang tính", start: 4, end: 7, detail: "4.910 tỷ đồng" },
  ],
}

export const waterfallModel: ChartModel = {
  kind: "waterfall",
  title: "Từ doanh thu đến lợi nhuận sau thuế",
  unit: "tỷ đồng",
  steps: [
    { name: "Doanh thu", value: 1250, total: true },
    { name: "Giá vốn", value: -850 },
    { name: "Lợi nhuận gộp", value: 400, total: true },
    { name: "Bán hàng, quản lý", value: -220 },
    { name: "Chi phí khác, thuần", value: -70 },
    { name: "Thuế thu nhập", value: -22 },
    { name: "LNST", value: 88, total: true },
  ],
}

export const panelsModel: ChartModel = {
  kind: "panels",
  title: "LNST tăng 10%, EPS vẫn không đổi",
  panels: [
    { kind: "grouped", title: "Lợi nhuận trong kỳ", labels: ["Q2/2024", "Q2/2025"], unit: "tỷ đồng", series: [{ name: "LNST dùng tính EPS", values: [80, 88] }] },
    { kind: "grouped", title: "Số cổ phiếu bình quân", labels: ["Q2/2024", "Q2/2025"], unit: "triệu CP", series: [{ name: "Cổ phiếu bình quân", values: [100, 110] }] },
    { kind: "line", title: "Lợi nhuận trên một cổ phiếu", labels: ["Q2/2024", "Q2/2025"], unit: "đồng/CP", series: [{ name: "EPS", values: [800, 800] }] },
  ],
}

export const ALL_CHART_MODELS: Record<string, ChartModel> = {
  "series-chart": seriesPanelsModel,
  "grouped-chart": groupedModel,
  "line-chart": lineModel,
  "stacked-chart": stackedModel,
  "timeline-chart": timelineModel,
  "waterfall-chart": waterfallModel,
  "panels-chart": panelsModel,
}

/* ── Lessons ─────────────────────────────────────────────────────────────── */

export const IMAGE_BLOCK: Extract<LessonBlock, { type: "image" }> = {
  type: "image",
  asset_id: "01-overview",
  src: "/assets/academy/ch02/01-overview.a6e2ba50.webp",
  width: 2160,
  height: 1175,
  alt: "Năm khu vực cần nhận diện",
  title: "Năm khu vực cần nhận diện",
  zoom_title: "Các khu vực của Backtest.",
  caption: "Chú thích ảnh",
}

export const DEFAULT_SECTIONS: AcademyLesson["sections"] = [
  {
    id: "s1",
    title: "Khái niệm và cách đọc",
    blocks: [
      { type: "html", html: "<p>RSI so sánh <strong>mức tăng</strong> với mức giảm.</p>" },
      { type: "chart", chart_id: "series-chart", title: "Giá đóng cửa và RSI 14", caption: "Trục giá dùng đơn vị giả định.", illustrative: true, table_toggle: true },
    ],
  },
  {
    id: "s2",
    title: "Công thức và ví dụ tính",
    blocks: [
      { type: "html", html: '<div class="formula-group"><div class="math-eq">RS = <span class="frac"><span>G</span><span>D</span></span></div></div>' },
      { type: "table", head: ["Giá trị RSI", "Ý nghĩa"], rows: [["Trên 50", "Mức tăng lớn hơn"], ["Dưới 50", "Mức giảm lớn hơn"]], align: ["l", "r"], aria_label: "Bảng ý nghĩa RSI" },
    ],
  },
  {
    id: "s3",
    title: "Chu kỳ và hai ngưỡng",
    blocks: [
      { type: "steps", items: [{ no: "01", title: "Chọn cổ phiếu", html: "<p>Chọn <strong>FPT</strong>.</p>" }] },
      { type: "details", summary: "Thao tác trên điện thoại", blocks: [{ type: "html", html: "<p>Bấm Chỉ báo.</p>" }] },
    ],
  },
  {
    id: "s4",
    title: "Tín hiệu và cách vận dụng",
    blocks: [
      { type: "callout", variant: "signal-buy", title: "Điều kiện Mua mẫu", blocks: [{ type: "html", html: "<p>RSI phiên trước <strong>&lt; ngưỡng Mua</strong>.</p>" }] },
      { type: "callout", variant: "signal-sell", title: "Điều kiện Bán mẫu", blocks: [{ type: "html", html: "<p>RSI hiện tại <strong>&gt; ngưỡng Bán</strong>.</p>" }] },
    ],
  },
]

export function buildLesson(id: string, overrides: Partial<AcademyLesson> = {}): AcademyLesson {
  const entry = buildCatalog().chapters.flatMap((chapter) => chapter.lessons).find((lesson) => lesson.id === id)
  if (!entry) throw new Error(`unknown lesson ${id}`)
  return {
    ...entry,
    catalog_version: CATALOG_VERSION,
    completed: false,
    completion_method: NO_METHOD,
    completed_at: null,
    reward: null,
    best_score: null,
    attempts_submitted: 0,
    title: `Tiêu đề ${entry.name}`,
    lead: `Đoạn dẫn của bài ${entry.name}.`,
    nav_labels: ["Khái niệm", "Công thức", "Tham số", "Vận dụng"],
    sections: DEFAULT_SECTIONS,
    charts: ALL_CHART_MODELS,
    fixture: null,
    sources: [],
    review_status: null,
    ...overrides,
  }
}

/* ── Attempts ────────────────────────────────────────────────────────────── */

export const QUESTION_COUNT = 8
export const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111"

type Bank = { id: string; prompt: string; topic: string | null; section: number | null; hint: string | null; figure: AcademyAttempt["questions"][number]["figure"]; options: { id: string; text: string; explanation: string | null }[]; correct: string; explanation: string | null }

export function buildBank(): Bank[] {
  return Array.from({ length: QUESTION_COUNT }, (_, index) => ({
    id: `q${index + 1}`,
    prompt: `Câu hỏi ${index + 1}: giá trị < 30 hay > 70?`,
    topic: `Chủ đề ${index + 1}`,
    section: (index % 4) + 1,
    hint: index === 0 ? "RS = G / D" : null,
    figure: index === 1 ? { type: "chart", chart_id: "series-chart", chart: seriesPanelsModel } : index === 2 ? { type: "table", head: ["Cột A", "Cột B"], rows: [["∈ tập", "∉ tập"]] } : null,
    options: ["a", "b", "c", "d"].map((letter) => ({ id: `q${index + 1}${letter}`, text: `Đáp án ${letter.toUpperCase()} của câu ${index + 1}`, explanation: `Giải thích ${letter} của câu ${index + 1}` })),
    // The right option sits at a different place per question, so letters never match option ids.
    correct: `q${index + 1}${["b", "c", "d", "a"][index % 4]}`,
    explanation: null,
  }))
}

export function buildAttempt(overrides: Partial<AcademyAttempt> = {}, bank: Bank[] = buildBank()): AcademyAttempt {
  return {
    attempt_id: ATTEMPT_ID,
    lesson_id: "ch01-l01",
    lesson_key: "technical:rsi",
    catalog_version: CATALOG_VERSION,
    content_version: "v-ch01-l01",
    assessment_version: "v1",
    status: "open",
    questions: bank.map((question) => ({ id: question.id, topic: question.topic, section: question.section, prompt: question.prompt, hint: question.hint, figure: question.figure, options: question.options.map(({ id, text }) => ({ id, text })) })),
    ...overrides,
  }
}

export function gradeAnswers(answers: { question_id: string; option_id: string }[], bank: Bank[] = buildBank()) {
  return bank.filter((question) => answers.find((answer) => answer.question_id === question.id)?.option_id === question.correct).length
}

export function buildReview(answers: { question_id: string; option_id: string }[], bank: Bank[] = buildBank()): ReviewItem[] {
  return bank.map((question) => {
    const chosen = answers.find((answer) => answer.question_id === question.id)?.option_id ?? ""
    return {
      question_id: question.id,
      topic: question.topic,
      section: question.section,
      prompt: question.prompt,
      hint: question.hint,
      figure: question.figure,
      option_id: chosen,
      correct: chosen === question.correct,
      correct_option_id: question.correct,
      explanation: question.explanation,
      options: question.options.map((option) => ({ id: option.id, text: option.text, chosen: option.id === chosen, correct: option.id === question.correct, explanation: option.explanation })),
    }
  })
}

export function buildSubmitResult(
  answers: { question_id: string; option_id: string }[],
  overrides: Partial<AcademySubmitResult> = {},
  bank: Bank[] = buildBank(),
): AcademySubmitResult {
  const score = gradeAnswers(answers, bank)
  return {
    attempt_id: ATTEMPT_ID,
    lesson_id: "ch01-l01",
    lesson_key: "technical:rsi",
    catalog_version: CATALOG_VERSION,
    score,
    total: 8,
    correct: score,
    wrong: 8 - score,
    passed: score === 8,
    submitted_at: "2026-10-08T01:00:00.000Z",
    best_score: score,
    attempts_submitted: 1,
    review_available: true,
    results: buildReview(answers, bank),
    completion: { completed: score === 8, completion_method: score === 8 ? "quiz" : NO_METHOD, completed_at: score === 8 ? "2026-10-08T01:00:00.000Z" : null, newly_completed: score === 8 },
    granted_capabilities: [],
    newly_granted: [],
    progress_revision: 1,
    reward: score === 8 ? { status: "credited", delta: 100, balance_after: 100 } : null,
    ...overrides,
  }
}

/** Answers with the first option of every question (always letter A). */
export function firstOptionAnswers(bank: Bank[] = buildBank()) {
  return bank.map((question) => ({ question_id: question.id, option_id: question.options[0].id }))
}

export function correctAnswers(bank: Bank[] = buildBank()) {
  return bank.map((question) => ({ question_id: question.id, option_id: question.correct }))
}
