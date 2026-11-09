/**
 * Candle Dojo home: pure derivations from the server's `GET /candle-dojo/state` (spec v1.2 §2, §5, §13).
 * Locks, stars, belts and exam readiness always come from the server; only the client-side "preview"
 * (chế độ xem trước) widens what the screen lets the learner open, and it never writes anything.
 */
import { CD_DOJOS, CD_EXAM, CD_LESSONS, type CdLessonDef } from "@/lib/candle-dojo/lessons"
import type { CandleDojoState } from "./candle-dojo-api"

/** Coin colour, as in the Shop: amber, darker in light mode so text stays readable. */
export const COIN_TEXT = "text-amber-700 dark:text-chart-2"

export const DOJO_COPY = {
  title: "Candle Dojo",
  loadFailed: "Chưa tải được tiến độ Candle Dojo. Kiểm tra kết nối rồi thử lại.",
  retry: "Thử lại",
  signInTitle: "Đăng nhập để vào Candle Dojo",
  signInDescription: "Đai, sao và thẻ nến gắn với tài khoản của bạn.",
  signIn: "Đăng nhập",
  noBelt: "Chưa có đai",
  introTitle: "Giải phẫu cây nến",
  introSubtitle: "Thân, bóng, giá mở, giá đóng",
  previewTitle: "Chế độ xem trước",
  previewHint: "Mở toàn bộ bài để duyệt nội dung. Không lưu tiến độ, không nhận xu.",
  previewBanner: "Đang xem trước: tiến độ, xu và thẻ nến của bạn không thay đổi. Thi đai tạm khoá.",
  previewExam: "Thi đai tính vào tài khoản thật: tắt chế độ xem trước để thi.",
  examLocked: "Học xong mọi bài của Dojo này để mở bài thi đai.",
  drillTitle: "Luyện công mỗi ngày",
  drillLocked: "Mở khi bạn có đai vàng.",
  cardsTitle: "Thẻ nến của bạn",
  openShop: "Mở Shop › Thẻ nến",
} as const

/** Mô tả bài thi đai của mọi Dojo: số câu và điểm qua lấy từ danh mục dùng chung. */
export const EXAM_RULE = `${CD_EXAM.questions} câu · đúng ${CD_EXAM.passMark} để nhận đai`

/** Colour of belt `belt` (0 = trắng ... 5 = đen); null while the learner has no belt (-1). */
export function beltColor(belt: number): string | null {
  return belt >= 0 && belt < CD_DOJOS.length ? CD_DOJOS[belt].color : null
}

/** "trắng", "vàng"... for belt `belt`; empty when out of range. */
export function beltAdjective(belt: number): string {
  return belt >= 0 && belt < CD_DOJOS.length ? CD_DOJOS[belt].belt.toLowerCase() : ""
}

export type LessonRowModel = {
  lesson: CdLessonDef
  stars: number
  open: boolean
  /** The next lesson to learn in this Dojo (highlighted). */
  current: boolean
}

export type DojoRowModel = {
  n: number
  name: string
  belt: string
  color: string
  unlocked: boolean
  lessons: LessonRowModel[]
  lessonsDone: number
  lessonsTotal: number
  examReady: boolean
  passed: boolean
}

export type HomeModel = {
  belt: number
  beltLabel: string
  introDone: boolean
  balance: number
  streakDays: number
  dojos: DojoRowModel[]
  cardsOwned: number
  cardsTotal: number
  drill: {
    unlocked: boolean
    doneToday: boolean
    rewardXu: number
    /** Lessons the drill may pick from (stars >= 1; every lesson in preview). */
    poolSize: number
  }
}

function starsByLesson(state: CandleDojoState): Map<string, number> {
  return new Map(state.lessons.map((lesson) => [lesson.lesson_id, lesson.stars]))
}

/** The home screen's rows. `preview` opens every Dojo, lesson and exam row for looking around. */
export function buildHomeModel(state: CandleDojoState, preview: boolean): HomeModel {
  const stars = starsByLesson(state)
  const open = new Set(state.open_lessons)
  const belt = state.progress.belt
  const dojos: DojoRowModel[] = CD_DOJOS.filter((dojo) => dojo.n >= 1).map((dojo) => {
    const server = state.dojos.find((item) => item.n === dojo.n)
    const lessons = CD_LESSONS.filter((lesson) => lesson.dojo === dojo.n)
    const rows: LessonRowModel[] = lessons.map((lesson) => ({
      lesson,
      stars: stars.get(lesson.id) ?? 0,
      open: preview || open.has(lesson.id),
      current: false,
    }))
    const next = rows.find((row) => row.open && row.stars === 0)
    if (next) next.current = true
    return {
      n: dojo.n,
      name: dojo.name,
      belt: dojo.belt,
      color: dojo.color,
      unlocked: preview || (server?.unlocked ?? belt >= dojo.n - 1),
      lessons: rows,
      lessonsDone: rows.filter((row) => row.stars >= 1).length,
      lessonsTotal: rows.length,
      examReady: server?.exam_ready ?? false,
      passed: server?.passed ?? belt >= dojo.n,
    }
  })
  return {
    belt,
    beltLabel: state.progress.belt_name ?? DOJO_COPY.noBelt,
    introDone: state.progress.intro_completed,
    balance: state.wallet.balance,
    streakDays: state.progress.streak_days,
    dojos,
    cardsOwned: state.cards.owned_count,
    cardsTotal: state.cards.total,
    drill: {
      unlocked: preview || state.progress.drill_unlocked,
      doneToday: state.progress.drill_done_today,
      rewardXu: state.rewards.drill_xu,
      poolSize: drillPool(state, preview).length,
    },
  }
}

function drillPool(state: CandleDojoState, preview: boolean): CdLessonDef[] {
  if (preview) return [...CD_LESSONS]
  const stars = starsByLesson(state)
  return CD_LESSONS.filter((lesson) => (stars.get(lesson.id) ?? 0) >= 1)
}

/** First letter of the learner's name for the avatar ("B" when there is none). */
export function avatarInitial(user: { full_name?: string | null; username?: string | null } | null | undefined): string {
  const name = (user?.full_name ?? user?.username ?? "").trim()
  return name ? (Array.from(name)[0] ?? "B").toUpperCase() : "B"
}

/** A random lesson the learner has already studied (any lesson in preview), or null when there is none. */
export function pickDrillLesson(state: CandleDojoState, preview: boolean, random: () => number = Math.random): string | null {
  const pool = drillPool(state, preview)
  if (pool.length === 0) return null
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id
}
