/**
 * Typed v3.3 fixtures for the Học viện tests: a catalog shaped like the real one (13 published
 * chapters, 87 required lessons, one exam per chapter, the optional ch3 practice), item responses,
 * question banks, attempts and score-only results. Option `-a` is always the correct one.
 */
import type {
  AttemptResponse,
  CatalogItem,
  CatalogResponse,
  ItemKind,
  ItemResponse,
  ItemState,
  LessonContent,
  ProgressResponse,
  SubmitResult,
} from "./content-types"

export const CATALOG_VERSION = "iqx-academy-v3.3-13ch-87lessons"
export const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111"

/** The server answers null before a completion exists; the generated type drops null from nullable enums. */
export const NO_METHOD = null as unknown as "quiz"

const CHAPTERS: { title: string; lessons: number }[] = [
  { title: "Nền tảng", lessons: 10 },
  { title: "Kỹ năng Sale SACO", lessons: 10 },
  { title: "Thương hiệu cá nhân", lessons: 9 },
  { title: "Phương pháp kỹ thuật", lessons: 10 },
  { title: "Phương pháp cơ bản", lessons: 4 },
  { title: "Chỉ báo xu hướng", lessons: 4 },
  { title: "Chỉ báo động lượng và dòng tiền", lessons: 7 },
  { title: "Tốc độ tăng trưởng", lessons: 6 },
  { title: "Độ ổn định", lessons: 5 },
  { title: "Hiệu quả và biên lợi nhuận", lessons: 7 },
  { title: "Nợ và khả năng thanh toán", lessons: 4 },
  { title: "Dòng tiền", lessons: 5 },
  { title: "Định giá", lessons: 6 },
]

/** 16 chỉ báo kỹ thuật mở sau khi đạt bài kiểm tra (spec §4.2); capability = `indicator:<id>`. */
const INDICATORS: Record<string, { id: string; label: string }> = {
  "ch04-l04": { id: "volume", label: "Khối lượng" },
  "ch04-l05": { id: "ma", label: "MA" },
  "ch04-l06": { id: "rsi", label: "RSI" },
  "ch04-l07": { id: "macd", label: "MACD" },
  "ch04-l08": { id: "bollinger", label: "Bollinger Bands" },
  "ch06-l01": { id: "ema", label: "EMA" },
  "ch06-l02": { id: "ma_cross", label: "MA Cross" },
  "ch06-l03": { id: "dmi", label: "DMI" },
  "ch06-l04": { id: "donchian", label: "Donchian Channel" },
  "ch07-l01": { id: "stochastic", label: "Stochastic" },
  "ch07-l02": { id: "cci", label: "CCI" },
  "ch07-l03": { id: "roc", label: "ROC" },
  "ch07-l04": { id: "williams_r", label: "Williams %R" },
  "ch07-l05": { id: "obv", label: "OBV" },
  "ch07-l06": { id: "mfi", label: "MFI" },
  "ch07-l07": { id: "cmf", label: "Chaikin Money Flow" },
}

/** 33 chỉ tiêu cơ bản mở trong Bộ lọc (spec §4.2); capability = `metric:<id>`. */
const METRICS: Record<string, { id: string; label: string }> = {
  "ch08-l01": { id: "revenue_yoy", label: "Tăng trưởng doanh thu YoY" },
  "ch08-l02": { id: "profit_yoy", label: "Tăng trưởng LNST YoY" },
  "ch08-l03": { id: "eps_yoy", label: "Tăng trưởng EPS YoY" },
  "ch08-l04": { id: "revenue_cagr3", label: "Revenue CAGR 3Y" },
  "ch08-l05": { id: "profit_cagr3", label: "Net Profit CAGR 3Y" },
  "ch08-l06": { id: "eps_cagr3", label: "EPS CAGR 3Y" },
  "ch09-l01": { id: "profit_positive_streak", label: "Profit Positive Streak" },
  "ch09-l02": { id: "revenue_growth_stability", label: "Revenue Growth Stability" },
  "ch09-l03": { id: "net_margin_stability", label: "Margin Stability" },
  "ch09-l04": { id: "eps_growth_stability", label: "EPS Stability" },
  "ch09-l05": { id: "roic_stability", label: "ROIC Stability" },
  "ch10-l01": { id: "roe", label: "ROE" },
  "ch10-l02": { id: "roa", label: "ROA" },
  "ch10-l03": { id: "roic", label: "ROIC" },
  "ch10-l04": { id: "gross_margin", label: "Biên lợi nhuận gộp" },
  "ch10-l05": { id: "net_margin", label: "Biên lợi nhuận ròng" },
  "ch10-l06": { id: "asset_turnover", label: "Asset Turnover" },
  "ch10-l07": { id: "ccc", label: "Cash Conversion Cycle" },
  "ch11-l01": { id: "debt_equity", label: "D/E" },
  "ch11-l02": { id: "current_ratio", label: "Current Ratio" },
  "ch11-l03": { id: "interest_coverage", label: "Interest Coverage" },
  "ch11-l04": { id: "net_debt_ebitda", label: "Net Debt / EBITDA" },
  "ch12-l01": { id: "cfo_margin", label: "CFO Margin" },
  "ch12-l02": { id: "cfo_profit", label: "CFO / LNST" },
  "ch12-l03": { id: "capex_revenue", label: "Capex / Revenue" },
  "ch12-l04": { id: "fcf_margin", label: "FCF Margin" },
  "ch12-l05": { id: "fcf_positive_streak", label: "FCF Positive Streak" },
  "ch13-l01": { id: "pe", label: "P/E" },
  "ch13-l02": { id: "pb", label: "P/B" },
  "ch13-l03": { id: "ps", label: "P/S" },
  "ch13-l04": { id: "peg", label: "PEG" },
  "ch13-l05": { id: "ev_ebitda", label: "EV / EBITDA" },
  "ch13-l06": { id: "fcf_yield", label: "FCF Yield" },
}

const pad2 = (n: number) => String(n).padStart(2, "0")
export const itemId = (chapter: number, suffix: number | "exam" | "practice") =>
  `ch${pad2(chapter)}-${typeof suffix === "number" ? `l${pad2(suffix)}` : suffix}`

export function questionCountFor(chapter: number, kind: ItemKind): number {
  if (kind === "chapter_exam") return chapter <= 3 ? 20 : 30
  return chapter <= 3 ? 3 : 5
}

function catalogItem(chapter: number, order: number, kind: ItemKind, position: number | null): CatalogItem {
  const id = kind === "lesson" ? itemId(chapter, order) : itemId(chapter, kind === "chapter_exam" ? "exam" : "practice")
  const indicator = INDICATORS[id]
  const metric = METRICS[id]
  const unlock = indicator
    ? { kind: "technical" as const, id: indicator.id, label: indicator.label }
    : metric
      ? { kind: "fundamental" as const, id: metric.id, label: metric.label }
      : null
  const questions = questionCountFor(chapter, kind)
  return {
    id,
    kind,
    lesson_key: kind === "chapter_exam" ? `exam:ch${pad2(chapter)}` : unlock ? `${unlock.kind}:${unlock.id}` : `concept:${id.replace("-", "_")}`,
    chapter,
    order,
    position,
    name: kind === "chapter_exam" ? `Bài thi Chương ${chapter}` : kind === "practice" ? "Phòng tập thực chiến" : `Bài học ${chapter}.${order}`,
    optional: kind === "practice",
    question_count: questions,
    unlock: unlock ? { ...unlock, capability_id: `${unlock.kind === "technical" ? "indicator" : "metric"}:${unlock.id}` } : null,
    has_scenario: kind === "lesson" && (chapter === 2 || chapter === 3),
    intro: kind === "chapter_exam" ? `Bài thi gồm ${questions} câu hỏi về toàn bộ kiến thức Chương ${chapter}.` : null,
    content_version: kind === "chapter_exam" ? null : `cv-${id}`,
  }
}

export function buildCatalog(): CatalogResponse {
  return {
    catalog_version: CATALOG_VERSION,
    required_total: CHAPTERS.reduce((sum, chapter) => sum + chapter.lessons, 0),
    chapters: CHAPTERS.map((chapter, index) => {
      const no = index + 1
      const items = Array.from({ length: chapter.lessons }, (_, k) => catalogItem(no, k + 1, "lesson", k + 1))
      items.push(catalogItem(no, chapter.lessons + 1, "chapter_exam", null))
      if (no === 3) items.push(catalogItem(no, chapter.lessons + 2, "practice", null))
      return { no, title: chapter.title, audience: "all" as const, lesson_count: chapter.lessons, items }
    }),
    retired_lessons: [{ lesson_key: "concept:hop_luu", name: "Hợp lưu" }],
  }
}

export const catalogItemsOf = (catalog: CatalogResponse) => catalog.chapters.flatMap((chapter) => chapter.items)

/** Prefix rule of the server (design §3): open iff every earlier required item is passed. */
export function statesOf(catalog: CatalogResponse, completedKeys: ReadonlySet<string>): Map<string, ItemState> {
  const states = new Map<string, ItemState>()
  let prefixDone = true
  for (const item of catalogItemsOf(catalog)) {
    const passed = completedKeys.has(item.lesson_key)
    states.set(item.id, passed ? "passed" : prefixDone ? "open" : "locked")
    if (!item.optional && !passed) prefixDone = false
  }
  return states
}

export function buildProgress(completedKeys: ReadonlySet<string>, catalog: CatalogResponse = buildCatalog()): ProgressResponse {
  const states = statesOf(catalog, completedKeys)
  const items = catalogItemsOf(catalog)
  const passedLesson = (item: CatalogItem) => item.kind === "lesson" && states.get(item.id) === "passed"
  return {
    catalog_version: CATALOG_VERSION,
    progress_revision: completedKeys.size,
    course_done: items.filter(passedLesson).length,
    course_total: catalog.required_total,
    current_item_id: items.find((item) => !item.optional && states.get(item.id) === "open")?.id ?? null,
    items: items.map((item) => ({
      id: item.id,
      state: states.get(item.id) ?? "locked",
      completed_at: states.get(item.id) === "passed" ? "2026-10-08T01:00:00.000Z" : null,
      completion_method: states.get(item.id) === "passed" ? "quiz" : NO_METHOD,
      best_score: null,
      attempts_submitted: 0,
    })),
    chapters: catalog.chapters.map((chapter) => ({
      no: chapter.no,
      done: chapter.items.filter(passedLesson).length,
      total: chapter.lesson_count,
      exam_passed: chapter.items.some((item) => item.kind === "chapter_exam" && states.get(item.id) === "passed"),
    })),
    granted_capabilities: items.filter((item) => item.unlock && states.get(item.id) === "passed").map((item) => item.unlock!.capability_id),
  }
}

export function buildItem(item: CatalogItem, state: ItemState, overrides: Partial<LessonContent> = {}): ItemResponse {
  const status = {
    catalog_version: CATALOG_VERSION,
    state,
    completed_at: state === "passed" ? "2026-10-08T01:00:00.000Z" : null,
    best_score: null,
    attempts_submitted: 0,
  }
  if (item.kind === "chapter_exam") {
    return { ...item, ...status, kind: "chapter_exam", intro: item.intro ?? "", chapter_title: CHAPTERS[item.chapter - 1]?.title ?? "" }
  }
  const scenario = item.has_scenario
    ? [
        {
          type: "scenario" as const,
          title: "Tình huống",
          story: ["Khách hàng hỏi về một mã cổ phiếu đang tăng mạnh."],
          question: "Bạn xử lý thế nào?",
          options: ["Hỏi mục tiêu của khách", "Khuyên mua ngay", "Bỏ qua câu hỏi"] as [string, string, string],
          best_option: 0 as const,
          debrief: "Hỏi mục tiêu trước khi tư vấn.",
        },
      ]
    : []
  return {
    ...item,
    ...status,
    kind: item.kind,
    content_version: item.content_version ?? `cv-${item.id}`,
    title: item.name,
    lead: `Mở đầu của <b>${item.name}</b>.`,
    intro_blocks: [],
    sections: [{ id: "s1", title: "Nội dung chính", blocks: [{ type: "paragraph", text: "Đoạn văn của bài học." }, ...scenario] }],
    summary: ["Ý chính của bài học."],
    charts: {},
    scenario_choice: null,
    reward: state === "passed" ? { status: "credited", delta: 100, balance_after: 100 } : null,
    ...overrides,
  }
}

export type BankQuestion = { id: string; prompt: string; options: { id: string; text: string }[]; correct: string }

export function buildBank(item: CatalogItem): BankQuestion[] {
  return Array.from({ length: item.question_count }, (_, k) => {
    const id = `${item.id}-q${pad2(k + 1)}`
    return {
      id,
      prompt: `Câu hỏi ${k + 1} của ${item.name}`,
      options: ["a", "b", "c"].map((suffix) => ({ id: `${id}-${suffix}`, text: `Phương án ${suffix.toUpperCase()}` })),
      correct: `${id}-a`,
    }
  })
}

export function buildAttempt(item: CatalogItem, attemptId: string = ATTEMPT_ID): AttemptResponse {
  const questions = buildBank(item).map(({ id, prompt, options }) => ({ id, prompt, options }))
  return {
    attempt_id: attemptId,
    lesson_id: item.id,
    lesson_key: item.lesson_key,
    kind: item.kind === "chapter_exam" ? "chapter_exam" : "lesson",
    catalog_version: CATALOG_VERSION,
    content_version: item.content_version,
    status: "open",
    total: questions.length,
    questions,
  }
}

export const correctAnswers = (item: CatalogItem) =>
  buildBank(item).map((question) => ({ question_id: question.id, option_id: question.correct }))

export function gradeAnswers(item: CatalogItem, answers: readonly { question_id: string; option_id: string }[]): number {
  const correct = new Map(buildBank(item).map((question) => [question.id, question.correct]))
  return answers.filter((answer) => correct.get(answer.question_id) === answer.option_id).length
}

export function buildSubmitResult(item: CatalogItem, score: number, overrides: Partial<SubmitResult> = {}): SubmitResult {
  const passed = score === item.question_count
  return {
    attempt_id: ATTEMPT_ID,
    lesson_id: item.id,
    lesson_key: item.lesson_key,
    kind: item.kind === "chapter_exam" ? "chapter_exam" : "lesson",
    catalog_version: CATALOG_VERSION,
    score,
    total: item.question_count,
    passed,
    submitted_at: "2026-10-08T01:00:00.000Z",
    best_score: score,
    attempts_submitted: 1,
    completion: { completed: passed, newly_completed: passed, completed_at: passed ? "2026-10-08T01:00:00.000Z" : null },
    granted_capabilities: passed && item.unlock ? [item.unlock.capability_id] : [],
    newly_granted: passed && item.unlock ? [item.unlock.capability_id] : [],
    unlocked_labels: passed && item.unlock ? [item.unlock.label] : [],
    chapter_completed: passed && item.kind === "chapter_exam" ? item.chapter : null,
    next_item_id: null,
    progress_revision: 1,
    reward: passed && item.kind !== "chapter_exam" ? { status: "credited", delta: 100, balance_after: 100 } : null,
    ...overrides,
  }
}

/** Lesson keys of every required item before `itemId` in the chain: completing them opens `itemId`. */
export function keysBefore(itemId: string, catalog: CatalogResponse = buildCatalog()): string[] {
  const items = catalogItemsOf(catalog)
  const at = items.findIndex((item) => item.id === itemId)
  return items.slice(0, Math.max(0, at)).filter((item) => !item.optional).map((item) => item.lesson_key)
}

/** Lesson key of an item id in the fixture catalog. */
export function keyOf(itemId: string, catalog: CatalogResponse = buildCatalog()): string {
  const item = catalogItemsOf(catalog).find((candidate) => candidate.id === itemId)
  if (!item) throw new Error(`unknown item ${itemId}`)
  return item.lesson_key
}
