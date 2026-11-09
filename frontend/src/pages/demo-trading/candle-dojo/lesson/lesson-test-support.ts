/**
 * Test support for the Candle Dojo lesson and drill screens: a fake chart (one button per candle so tests can
 * tap by index), an in-memory stand-in for `/api/v2/candle-dojo/**` behind the mocked `api()` transport, and
 * helpers that play a whole lesson from the real exercise bank.
 */
import { createElement, type ReactElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type userEvent from "@testing-library/user-event"

import { ApiError } from "@/lib/api"
import { cdCard, cdCardPrice } from "@/lib/candle-dojo/cards"
import { gradeHunt, gradeTwins, lessonStars, type CdLessonExercises } from "@/lib/candle-dojo/grading"
import { CD_CATALOG_VERSION, cdLesson } from "@/lib/candle-dojo/lessons"
import { loadLessonBank } from "./lesson-data"
import { PLACE_OPTIONS } from "./lesson-model"

export const chartsOnScreen = () => screen.getAllByTestId("chart")
export const bandsOf = (chart: HTMLElement) => JSON.parse(chart.dataset.bands ?? "[]") as { start: number; end: number; color?: string }[]
export const tagsOf = (chart: HTMLElement) => JSON.parse(chart.dataset.tags ?? "[]") as { start: number; end: number; text: string; color?: string }[]
export const tapBar = (index: number) => fireEvent.click(screen.getByRole("button", { name: `Nến ${index}` }))

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
}

export function renderWithProviders(ui: ReactElement, client: QueryClient = newQueryClient()) {
  const wrap = (children: ReactNode) => createElement(QueryClientProvider, { client }, children)
  return { ...render(wrap(ui)), client }
}

/** Người học muốn giảm chuyển động: hoạt cảnh bỏ qua, các bước hiện thẳng trạng thái cuối. */
export function stubReducedMotion(reduce: boolean) {
  const stub = (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: stub })
}

export type Call = { method: string; path: string; body?: Record<string, unknown> }

export interface DojoBackendOptions {
  balance?: number
  owned?: string[]
  /** Server báo đây là lần đầu hoàn thành bài (thưởng xu). */
  firstTime?: boolean
  /** Lỗi trả về cho lần gửi bài kế tiếp. */
  failLessonOnce?: ApiError
  /** Lỗi trả về cho mọi lần mua thẻ. */
  purchaseError?: ApiError
  /** Lỗi trả về cho lần gửi luyện công kế tiếp. */
  failDrillOnce?: ApiError
  drillReward?: number
  streakDays?: number
  /** Số lần đầu GET thẻ trả lỗi. */
  cardsFail?: boolean
}

/** Máy chủ Candle Dojo trong bộ nhớ: chấm lại bằng đúng `gradeHunt`/`gradeTwins` như backend. */
export function createDojoBackend(bank: Readonly<Record<string, CdLessonExercises>>, options: DojoBackendOptions = {}) {
  const calls: Call[] = []
  const state = {
    balance: options.balance ?? 1500,
    owned: new Set(options.owned ?? []),
    failLessonOnce: options.failLessonOnce,
    failDrillOnce: options.failDrillOnce,
  }

  const cardsResponse = () => ({
    catalog_version: CD_CATALOG_VERSION,
    wallet: { balance: state.balance },
    total_count: 47,
    owned_count: state.owned.size,
    items: ["doji", "bua", "treo_co"].flatMap((id) => {
      const card = cdCard(id)
      if (!card) return []
      return [
        {
          card_id: id,
          name: card.name,
          tier: card.tier,
          price_xu: cdCardPrice(card),
          lesson_id: card.lessonId,
          lesson_title: cdLesson(card.lessonId)?.title ?? card.lessonId,
          dojo: card.dojo,
          owned: state.owned.has(id),
          acquired_at: state.owned.has(id) ? "2026-11-09T00:00:00.000Z" : null,
          seen: false,
          unlocked: true,
        },
      ]
    }),
  })

  function handle(path: string, init?: RequestInit): Promise<unknown> {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    calls.push({ method, path, body })

    const lesson = /^\/candle-dojo\/lessons\/([^/]+)\/complete$/.exec(path)
    if (method === "POST" && lesson) {
      if (state.failLessonOnce) {
        const error = state.failLessonOnce
        state.failLessonOnce = undefined
        return Promise.reject(error)
      }
      const id = lesson[1]
      const exercises = bank[id]
      const taps = ((body?.hunt as { taps?: number[] } | undefined)?.taps ?? []) as number[]
      const picks = (body?.twins ?? []) as ("a" | "b")[]
      const hunt = gradeHunt(exercises.hunt, taps)
      const twins = gradeTwins(exercises.twins, picks)
      const stars = lessonStars(hunt.star, twins.star)
      const firstTime = options.firstTime ?? true
      if (firstTime) state.balance += 100
      return Promise.resolve({
        lesson_id: id,
        reward_xu: firstTime ? 100 : 0,
        first_time: firstTime,
        balance: state.balance,
        stars: stars.stars,
        best_stars: stars.stars,
        previous_stars: 0,
        hunt: { found: hunt.found, total: hunt.total, miss: hunt.miss, star: hunt.star },
        twins: { right: twins.right, total: twins.total, star: twins.star },
        card_ids: cdLesson(id)?.cards ?? [],
      })
    }
    if (method === "POST" && path === "/candle-dojo/drill/complete") {
      if (state.failDrillOnce) {
        const error = state.failDrillOnce
        state.failDrillOnce = undefined
        return Promise.reject(error)
      }
      const lessonId = String(body?.lesson_id)
      const hunt = gradeHunt(bank[lessonId].hunt, (body?.taps ?? []) as number[])
      const reward = options.drillReward ?? 20
      return Promise.resolve({
        lesson_id: lessonId,
        reward_xu: reward,
        first_time: reward > 0,
        balance: state.balance + reward,
        found: hunt.found,
        total: hunt.total,
        miss: hunt.miss,
        streak_days: options.streakDays ?? 5,
      })
    }
    if (method === "GET" && path === "/candle-dojo/cards") {
      return options.cardsFail ? Promise.reject(new ApiError("Lỗi máy chủ", 500)) : Promise.resolve(cardsResponse())
    }
    const purchase = /^\/candle-dojo\/cards\/([^/]+)\/purchase$/.exec(path)
    if (method === "POST" && purchase) {
      if (options.purchaseError) return Promise.reject(options.purchaseError)
      const card = cdCard(purchase[1])
      if (!card) return Promise.reject(new ApiError("Không tìm thấy thẻ nến", 404, { code: "CARD_NOT_FOUND" }))
      state.balance -= cdCardPrice(card)
      state.owned.add(card.id)
      return Promise.resolve({
        status: "purchased",
        card_id: card.id,
        name: card.name,
        price_xu: cdCardPrice(card),
        balance: state.balance,
        acquired_at: "2026-11-09T00:00:00.000Z",
      })
    }
    return Promise.reject(new Error(`Unexpected request: ${method} ${path}`))
  }

  return {
    handle,
    calls,
    callsTo: (method: string, pattern: RegExp) => calls.filter((call) => call.method === method && pattern.test(call.path)),
    state,
  }
}

export const apiError = (status: number, code: string, message: string, details?: unknown[]) =>
  new ApiError(message, status, { code, details })

export async function loadBank() {
  return loadLessonBank()
}

type User = ReturnType<typeof userEvent.setup>

export interface PlayOptions {
  /** Các lần chạm ở Săn nến (mặc định: tìm đủ mọi mẫu, mỗi mẫu một lần chạm). */
  huntTaps?: number[]
  /** Số câu Song sinh chọn đúng (mặc định cả 3). */
  twinsRight?: number
  /** Dừng ngay sau khi qua bước Săn nến, trước câu Song sinh đầu tiên. */
  stopBeforeTwins?: boolean
}

const next = (user: User, name = "Tiếp tục") => user.click(screen.getByRole("button", { name }))

/** Chơi một bài từ bước 1 đến hết bước 6 (hoạt cảnh đã tắt bằng `stubReducedMotion(true)`). */
export async function playLesson(user: User, exercises: CdLessonExercises, options: PlayOptions = {}) {
  const { twinsRight = 3 } = options
  const huntTaps = options.huntTaps ?? exercises.hunt.targets.map(([start]) => start)
  await next(user) // 1 · Giới thiệu
  await next(user) // 2 · Câu chuyện
  for (const item of exercises.place) {
    const label = PLACE_OPTIONS.find((option) => option.answer === item.ans)!.label
    await user.click(screen.getByRole("button", { name: label }))
    await next(user)
  }
  for (const tap of huntTaps) tapBar(tap)
  await next(user) // 4 · Săn nến (bấm sau khi kết thúc: hết giờ hoặc tìm đủ)
  if (options.stopBeforeTwins) return
  for (const [index, twin] of exercises.twins.entries()) {
    const right = index < twinsRight
    const side = right ? twin.goodSide : twin.goodSide === "a" ? "b" : "a"
    await user.click(screen.getByRole("button", { name: `Biểu đồ ${side.toUpperCase()}` }))
    await next(user, index + 1 < exercises.twins.length ? "Câu tiếp" : "Tiếp tục")
  }
  await user.click(screen.getByRole("button", { name: "Biểu đồ A" })) // 6 · Rồi sao?
  await next(user)
}
