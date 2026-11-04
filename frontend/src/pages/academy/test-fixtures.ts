/**
 * Typed v4.1 fixtures for the Học viện tests: a catalog shaped like the real one (12 chapters, 116 required
 * lessons, one exam per chapter, the optional practice of the personal-brand chapter), item responses, question
 * banks, attempts and score-only results. Option `-a` is always the correct one. A program is the learner's
 * config: `chapters` are the ORIGINAL chapter numbers it holds (fixed ids `ch01`..`ch12`), numbered again from 1
 * as `display_no`; learning is free by default (nothing locked) and `mode: "sequential"` applies the prefix lock.
 */
import type {
  AccessMode,
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

export const CATALOG_VERSION = "iqx-academy-v4.0-12ch-116lessons"
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
  { title: "Phân tích cơ bản chung", lessons: 17 },
  { title: "Phân tích doanh nghiệp sản xuất", lessons: 16 },
  { title: "Phân tích ngân hàng", lessons: 11 },
  { title: "Phân tích công ty chứng khoán", lessons: 10 },
  { title: "Phân tích công ty bảo hiểm", lessons: 8 },
]

/** 16 chỉ báo kỹ thuật: lesson key `technical:<id>`. Only the keys survive v4 (no tool is gated by them any more). */
const INDICATORS: Record<string, string> = {
  "ch04-l04": "volume",
  "ch04-l05": "ma",
  "ch04-l06": "rsi",
  "ch04-l07": "macd",
  "ch04-l08": "bollinger",
  "ch06-l01": "ema",
  "ch06-l02": "ma_cross",
  "ch06-l03": "dmi",
  "ch06-l04": "donchian",
  "ch07-l01": "stochastic",
  "ch07-l02": "cci",
  "ch07-l03": "roc",
  "ch07-l04": "williams_r",
  "ch07-l05": "obv",
  "ch07-l06": "mfi",
  "ch07-l07": "cmf",
}

/** `metric_key` of the 62 chỉ tiêu lessons of chapters 8-12, in lesson order (lesson key `fundamental:<key>`). */
const METRIC_KEYS: Record<number, string[]> = {
  8: ["revenue_yoy", "profit_yoy", "eps_yoy", "revenue_cagr3", "profit_cagr3", "eps_cagr3", "profit_positive_streak", "revenue_growth_stability", "net_margin_stability", "eps_growth_stability", "roe", "roa", "net_margin", "pe", "pb", "ps", "peg"],
  9: ["gross_margin", "roic", "roic_stability", "asset_turnover", "ccc", "debt_equity", "current_ratio", "interest_coverage", "net_debt_ebitda", "cfo_margin", "cfo_profit", "capex_revenue", "fcf_margin", "fcf_positive_streak", "ev_ebitda", "fcf_yield"],
  10: ["nim", "yield_cost", "cir", "non_interest_share", "ppop_growth", "credit_cost", "provision_to_loans", "credit_deposit_growth", "ldr", "accrued_to_loans", "equity_to_assets"],
  11: ["revenue_mix", "operating_margin", "margin_loan_growth", "margin_loan_to_equity", "margin_loan_yield", "brokerage_margin", "prop_asset_share", "prop_return", "opex_to_revenue", "borrowings_to_equity"],
  12: ["gwp_growth", "retention_ratio", "loss_ratio", "expense_ratio", "combined_ratio", "investment_yield", "profit_mix", "reserves_to_equity"],
}

const pad2 = (n: number) => String(n).padStart(2, "0")
export const itemId = (chapter: number, suffix: number | "exam" | "practice") =>
  `ch${pad2(chapter)}-${typeof suffix === "number" ? `l${pad2(suffix)}` : suffix}`

export function questionCountFor(chapter: number, kind: ItemKind): number {
  if (kind === "chapter_exam") return chapter <= 3 ? 20 : 30
  return chapter <= 3 ? 3 : 5
}

function catalogItem(chapter: number, displayNo: number, order: number, kind: ItemKind, position: number | null): CatalogItem {
  const id = kind === "lesson" ? itemId(chapter, order) : itemId(chapter, kind === "chapter_exam" ? "exam" : "practice")
  const indicator = INDICATORS[id]
  const metricKey = kind === "lesson" ? (METRIC_KEYS[chapter]?.[order - 1] ?? null) : null
  const questions = questionCountFor(chapter, kind)
  const lessonKey =
    kind === "chapter_exam"
      ? chapter <= 7
        ? `exam:ch${pad2(chapter)}`
        : `exam:ch${pad2(chapter)}-v4`
      : indicator
        ? `technical:${indicator}`
        : metricKey
          ? `fundamental:${metricKey}`
          : `concept:${id.replace("-", "_")}`
  return {
    id,
    kind,
    lesson_key: lessonKey,
    chapter_id: `ch${pad2(chapter)}`,
    chapter_display_no: displayNo,
    order,
    position,
    name: kind === "chapter_exam" ? `Bài thi Chương ${displayNo}` : kind === "practice" ? "Phòng tập thực chiến" : `Bài học ${chapter}.${order}`,
    optional: kind === "practice",
    question_count: questions,
    metric_key: metricKey,
    has_scenario: kind === "lesson" && (chapter === 2 || chapter === 3),
    intro: kind === "chapter_exam" ? `Bài thi gồm ${questions} câu hỏi về toàn bộ kiến thức Chương ${displayNo}.` : null,
    content_version: kind === "chapter_exam" ? null : `cv-${id}`,
  }
}

/** The learner's program: the ORIGINAL numbers of the chapters his config holds, and his mode. */
export type ProgramOptions = { chapters?: readonly number[]; mode?: AccessMode }

export const ALL_CHAPTERS: readonly number[] = CHAPTERS.map((_, index) => index + 1)

/** The original number of the chapter of an item (`ch04-l06` has chapter 4), whatever number the learner sees. */
export const chapterNoOf = (item: Pick<CatalogItem, "chapter_id">) => Number(item.chapter_id.slice(2))

export function buildCatalog({ chapters = ALL_CHAPTERS, mode = "free" }: ProgramOptions = {}): CatalogResponse {
  const chosen = ALL_CHAPTERS.filter((no) => chapters.includes(no))
  return {
    catalog_version: CATALOG_VERSION,
    mode,
    required_total: chosen.reduce((sum, no) => sum + CHAPTERS[no - 1].lessons, 0),
    chapters: chosen.map((no, index) => {
      const chapter = CHAPTERS[no - 1]
      const displayNo = index + 1
      const items = Array.from({ length: chapter.lessons }, (_, k) => catalogItem(no, displayNo, k + 1, "lesson", k + 1))
      items.push(catalogItem(no, displayNo, chapter.lessons + 1, "chapter_exam", null))
      if (no === 3) items.push(catalogItem(no, displayNo, chapter.lessons + 2, "practice", null))
      return { chapter_id: `ch${pad2(no)}`, display_no: displayNo, title: chapter.title, audience: "all" as const, lesson_count: chapter.lessons, items }
    }),
    retired_lessons: [{ lesson_key: "concept:hop_luu", name: "Hợp lưu" }],
  }
}

export const catalogItemsOf = (catalog: CatalogResponse) => catalog.chapters.flatMap((chapter) => chapter.items)

/**
 * States of the server: `free` (the default config, spec v4.1 §3.1) is passed or open for every item;
 * `sequential` (§3.2) opens an item iff every earlier required item of the program's chain is passed.
 */
export function statesOf(catalog: CatalogResponse, completedKeys: ReadonlySet<string>, mode: AccessMode = catalog.mode): Map<string, ItemState> {
  const states = new Map<string, ItemState>()
  let prefixDone = true
  for (const item of catalogItemsOf(catalog)) {
    const passed = completedKeys.has(item.lesson_key)
    states.set(item.id, passed ? "passed" : prefixDone || mode === "free" ? "open" : "locked")
    if (!item.optional && !passed) prefixDone = false
  }
  return states
}

/** `openedId` is the item opened last ("bài đang học"); without it the first required item still to pass is current. */
export function buildProgress(
  completedKeys: ReadonlySet<string>,
  catalog: CatalogResponse = buildCatalog(),
  mode: AccessMode = catalog.mode,
  openedId: string | null = null,
): ProgressResponse {
  const states = statesOf(catalog, completedKeys, mode)
  const items = catalogItemsOf(catalog)
  const passedLesson = (item: CatalogItem) => item.kind === "lesson" && states.get(item.id) === "passed"
  // "Học tiếp": the first required item that is open and not passed, whatever was opened last.
  const nextId = items.find((item) => !item.optional && states.get(item.id) === "open")?.id ?? null
  return {
    catalog_version: CATALOG_VERSION,
    access_mode: mode,
    progress_revision: completedKeys.size,
    course_done: items.filter(passedLesson).length,
    course_total: catalog.required_total,
    current_item_id: openedId ?? nextId,
    next_item_id: nextId,
    items: items.map((item) => ({
      id: item.id,
      state: states.get(item.id) ?? "locked",
      completed_at: states.get(item.id) === "passed" ? "2026-10-08T01:00:00.000Z" : null,
      completion_method: states.get(item.id) === "passed" ? "quiz" : NO_METHOD,
      best_score: null,
      attempts_submitted: 0,
    })),
    chapters: catalog.chapters.map((chapter) => ({
      chapter_id: chapter.chapter_id,
      display_no: chapter.display_no,
      done: chapter.items.filter(passedLesson).length,
      total: chapter.lesson_count,
      exam_passed: chapter.items.some((item) => item.kind === "chapter_exam" && states.get(item.id) === "passed"),
    })),
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
    return { ...item, ...status, kind: "chapter_exam", intro: item.intro ?? "", chapter_title: CHAPTERS[chapterNoOf(item) - 1]?.title ?? "" }
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
  // HV-02: the first question of ch10-l01 (NIM in v4) reads the lesson's representative chart.
  const questions = buildBank(item).map(({ id, prompt, options }, index) => ({
    id,
    prompt,
    options,
    ...(item.id === "ch10-l01" && index === 0 ? { chart_id: "c10l1-rep" } : {}),
  }))
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
    chapter_completed: passed && item.kind === "chapter_exam" ? item.chapter_display_no : null,
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
