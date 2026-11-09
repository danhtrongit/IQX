/**
 * Test support for the Candle Dojo screens: an in-memory stand-in for `/api/v2/candle-dojo/**` behind the mocked
 * `api()` transport, with call recording and per-request fault injection. It follows the server's rules (stars
 * unlock the next lesson, a belt opens the next Dojo, 6 of 8 pass an exam) so the screens are driven by realistic
 * answers; it is not a second implementation of the product.
 */
import { type ReactElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"

import { ApiError } from "@/lib/api"
import { CD_DOJOS, CD_EXAM, CD_LESSONS, CD_CATALOG_VERSION } from "@/lib/candle-dojo/lessons"
import type { CandleDojoExam, CandleDojoExamAnswer, CandleDojoIntroResult, CandleDojoState } from "./candle-dojo-api"
import { CandleDojoProvider } from "./candle-dojo-provider"

export type Call = { method: string; path: string; body?: Record<string, unknown> }

export type StateOptions = {
  belt?: number
  introDone?: boolean
  /** Best stars per lesson id; a lesson listed here counts as studied. */
  stars?: Record<string, number>
  owned?: string[]
  balance?: number
  streak?: number
  drillDoneToday?: boolean
}

const lessonsOf = (dojo: number) => CD_LESSONS.filter((lesson) => lesson.dojo === dojo)

/** Every lesson of the first `count` Dojos, each with one star. */
export function starsForDojos(count: number, value = 1): Record<string, number> {
  return Object.fromEntries(CD_LESSONS.filter((lesson) => lesson.dojo <= count).map((lesson) => [lesson.id, value]))
}

export function makeState(options: StateOptions = {}): CandleDojoState {
  const belt = options.belt ?? -1
  const stars = options.stars ?? {}
  const done = new Set(Object.keys(stars))
  const unlocked = (dojo: number) => belt >= dojo - 1
  const isOpen = (lessonId: string) => {
    const lesson = CD_LESSONS.find((item) => item.id === lessonId)
    if (!lesson || !unlocked(lesson.dojo)) return false
    if (done.has(lessonId)) return true
    const list = lessonsOf(lesson.dojo)
    const position = list.findIndex((item) => item.id === lessonId)
    return position <= 0 || done.has(list[position - 1].id)
  }
  const owned = options.owned ?? []
  return {
    catalog_version: CD_CATALOG_VERSION,
    wallet: { balance: options.balance ?? 1500 },
    progress: {
      belt,
      belt_name: belt >= 0 ? `Đai ${CD_DOJOS[belt].belt.toLowerCase()}` : null,
      intro_completed: options.introDone ?? belt >= 0,
      streak_days: options.streak ?? 0,
      best_streak: options.streak ?? 0,
      drills_total: 0,
      drill_unlocked: belt >= 1,
      drill_done_today: options.drillDoneToday ?? false,
    },
    lessons: Object.entries(stars).map(([lesson_id, value]) => ({
      lesson_id,
      dojo: CD_LESSONS.find((lesson) => lesson.id === lesson_id)?.dojo ?? 1,
      stars: value,
      hunt_star: value >= 2,
      twin_star: value >= 3,
      attempts: 1,
      completed_at: "2026-11-01T00:00:00.000Z",
    })),
    open_lessons: CD_LESSONS.filter((lesson) => isOpen(lesson.id)).map((lesson) => lesson.id),
    dojos: CD_DOJOS.filter((dojo) => dojo.n >= 1).map((dojo) => {
      const list = lessonsOf(dojo.n)
      return {
        n: dojo.n,
        unlocked: unlocked(dojo.n),
        lessons_total: list.length,
        lessons_done: list.filter((lesson) => done.has(lesson.id)).length,
        exam_ready: unlocked(dojo.n) && list.every((lesson) => done.has(lesson.id)),
        passed: belt >= dojo.n,
      }
    }),
    cards: {
      total: 47,
      owned_count: owned.length,
      owned: owned.map((card_id) => ({ card_id, acquired_at: "2026-11-01T00:00:00.000Z", seen_at: null })),
    },
    rewards: { intro_xu: 100, lesson_xu: 100, belt_xu: 300, drill_xu: 20 },
  }
}

export function apiError(status: number, code: string, message: string): ApiError {
  return new ApiError(message, status, { code })
}

/** The cards offered as options of the exam questions (names come from the shared catalogue). */
const OPTION_SETS = [
  ["marubozu_tang", "marubozu_giam", "doji", "bua"],
  ["doji", "bua", "treo_co", "bua_nguoc"],
  ["bua", "treo_co", "bua_nguoc", "sao_bang"],
  ["tran_trang", "san_trang", "keo_tran", "dap_san"],
  ["marubozu_tang", "doji", "bua"],
  ["sao_bang", "bua_nguoc", "treo_co", "bua"],
  ["marubozu_giam", "doji", "treo_co", "san_trang"],
  ["keo_tran", "dap_san", "doji", "bua"],
] as const

const BARS = Array.from({ length: 14 }, (_, index) => {
  const base = 100 + index
  return { o: base, h: base + 3, l: base - 2, c: base + 1, v: 100 + index }
})

/** The right answer of question `index`: always the option at position `index % options.length`. */
export const examAnswer = (index: number) => OPTION_SETS[index][index % OPTION_SETS[index].length]

export function createDojoBackend(options: StateOptions & { introFirstTime?: boolean } = {}) {
  let stateOptions: StateOptions = options
  const calls: Call[] = []
  const rules: { match: (call: Call) => boolean; respond: (call: Call) => unknown; once: boolean }[] = []
  let attempts = 0
  let session: { id: string; dojo: number; answered: Map<number, string> } | null = null

  function startExam(call: Call): CandleDojoExam {
    const dojo = Number(call.body?.dojo)
    const state = makeState(stateOptions)
    const info = state.dojos.find((item) => item.n === dojo)
    if (!info?.exam_ready) throw apiError(409, "EXAM_LOCKED", "Học xong mọi bài của Dojo này để mở bài thi đai.")
    attempts += 1
    const id = `00000000-0000-4000-8000-${String(attempts).padStart(12, "0")}`
    session = { id, dojo, answered: new Map() }
    return {
      attempt_id: id,
      dojo,
      belt_name: CD_DOJOS[dojo].belt,
      pass_mark: CD_EXAM.passMark,
      total: CD_EXAM.questions,
      questions: OPTION_SETS.map((set, index) => ({ index, n: index % 3 === 0 ? 1 : 2, bars: BARS, options: [...set] })),
    }
  }

  function answer(call: Call): CandleDojoExamAnswer {
    const id = call.path.split("/")[3]
    if (!session || session.id !== id) throw apiError(404, "EXAM_NOT_FOUND", "Không tìm thấy lượt thi")
    const index = Number(call.body?.index)
    const option = String(call.body?.option)
    if (session.answered.has(index)) throw apiError(409, "EXAM_ALREADY_ANSWERED", "Câu này đã được trả lời.")
    session.answered.set(index, option)
    const correct = option === examAnswer(index)
    const finished = session.answered.size === CD_EXAM.questions
    let result: CandleDojoExamAnswer["result"] = null
    if (finished) {
      const score = [...session.answered].filter(([question, given]) => given === examAnswer(question)).length
      const passed = score >= CD_EXAM.passMark
      const belt = stateOptions.belt ?? -1
      const beltUp = passed && belt < session.dojo
      const reward = beltUp ? 300 : 0
      result = {
        score,
        total: CD_EXAM.questions,
        pass_mark: CD_EXAM.passMark,
        passed,
        belt: beltUp ? session.dojo : belt,
        belt_up: beltUp,
        reward_xu: reward,
        balance: (stateOptions.balance ?? 1500) + reward,
      }
      if (beltUp) stateOptions = { ...stateOptions, belt: session.dojo, balance: (stateOptions.balance ?? 1500) + reward }
    }
    return { attempt_id: id, index, correct, answer: examAnswer(index), answered: session.answered.size, finished, result }
  }

  function intro(): CandleDojoIntroResult {
    const first = options.introFirstTime ?? true
    if (first) stateOptions = { ...stateOptions, belt: Math.max(stateOptions.belt ?? -1, 0), introDone: true, balance: (stateOptions.balance ?? 1500) + 100 }
    return { reward_xu: first ? 100 : 0, first_time: first, balance: stateOptions.balance ?? 1500, belt: Math.max(stateOptions.belt ?? 0, 0) }
  }

  async function handle(path: string, init?: RequestInit): Promise<unknown> {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    const call: Call = { method, path, body }
    calls.push(call)
    const index = rules.findIndex((rule) => rule.match(call))
    if (index >= 0) {
      const rule = rules[index]
      if (rule.once) rules.splice(index, 1)
      return rule.respond(call)
    }
    if (method === "GET" && path === "/candle-dojo/state") return makeState(stateOptions)
    if (method === "POST" && path === "/candle-dojo/intro/complete") return intro()
    if (method === "POST" && path === "/candle-dojo/exams") return startExam(call)
    if (method === "POST" && /^\/candle-dojo\/exams\/[^/]+\/answers$/.test(path)) return answer(call)
    throw apiError(404, "NOT_FOUND", `Chưa có tuyến ${method} ${path}`)
  }

  return {
    handle,
    calls,
    /** Answers (or throws for) the next matching request instead of the in-memory server. */
    intercept(match: (call: Call) => boolean, respond: (call: Call) => unknown, once = true) {
      rules.push({ match, respond, once })
    },
    /** Replaces what the next state reads return (a learner who progressed elsewhere). */
    setState(next: StateOptions) {
      stateOptions = next
    },
    callsTo: (method: string, prefix: string) => calls.filter((call) => call.method === method && call.path.startsWith(prefix)),
    /** Calls that write: everything but a GET. */
    writes: () => calls.filter((call) => call.method !== "GET"),
  }
}

export type DojoBackend = ReturnType<typeof createDojoBackend>

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Renders `ui` inside a query client and the Candle Dojo provider (the screens read the preview flag from it). */
export function renderDojo(ui: ReactElement, client: QueryClient = newQueryClient()) {
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <CandleDojoProvider>{children}</CandleDojoProvider>
    </QueryClientProvider>
  )
  const view = render(wrap(ui))
  return { ...view, client }
}
