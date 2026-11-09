import { cdCard, cdCardPrice, type CdCardDef } from "@/lib/candle-dojo/cards"
import type { CdBar } from "@/lib/candle-dojo/detector"
import {
  gradeHunt,
  gradeTwins,
  lessonStars,
  type CdChart,
  type CdHuntResult,
  type CdHuntSpec,
  type CdLessonExercises,
  type CdLessonStars,
  type CdPlaceItem,
  type CdSide,
  type CdTwin,
  type CdTwinsResult,
} from "@/lib/candle-dojo/grading"
import { CD_LESSONS, cdLesson, type CdLessonDef } from "@/lib/candle-dojo/lessons"
import { CD_CHART_COLORS } from "../candle-chart-model"

/** Mô hình thuần của màn học (spec v1.2 §5.1): chọn nến, hoạt cảnh, chấm tức thời, lời giải thích. */

export const LESSON_STEPS = ["Giới thiệu", "Câu chuyện", "Đúng chỗ", "Săn nến", "Song sinh", "Rồi sao?"] as const
export const LESSON_STEP_COUNT = LESSON_STEPS.length

/** Số nến bối cảnh (mờ) ở bước Giới thiệu. */
export const INTRO_CONTEXT_BARS = 6
/** Số nến bối cảnh trước mẫu ở mọi biểu đồ của bước Đúng chỗ. */
export const PLACE_CONTEXT_BARS = 14

/** Bên người học chọn ở một câu Song sinh. Không có nút bỏ qua nên mỗi câu đều có lựa chọn. */
export type TwinPick = CdSide
export type PlaceAnswer = "D" | "T" | "both"

export interface LessonContent {
  lesson: CdLessonDef
  /** Thứ tự bài trong danh mục (đổi bên đáp án ở bước Rồi sao?). */
  lessonIndex: number
  cards: CdCardDef[]
  mainCard: CdCardDef
  exercises: CdLessonExercises
}

export function resolveLessonContent(
  lessonId: string,
  bank: Readonly<Record<string, CdLessonExercises>>,
): LessonContent | null {
  const lesson = cdLesson(lessonId)
  const exercises = bank[lessonId]
  if (!lesson || !exercises) return null
  const cards = lesson.cards.flatMap((id) => cdCard(id) ?? [])
  const mainCard = cdCard(lesson.mainCard)
  if (!mainCard || cards.length === 0) return null
  return { lesson, lessonIndex: CD_LESSONS.indexOf(lesson), cards, mainCard, exercises }
}

export const formatXu = (value: number) => `${value.toLocaleString("vi-VN")} xu`

/** Giá thẻ theo bảng giá bậc (chỉ để hiển thị khi chưa có giá từ server, ví dụ chế độ xem trước). */
export const localCardPrice = (card: CdCardDef) => cdCardPrice(card)

/** Thẻ tăng viền xanh, thẻ giảm viền đỏ; thẻ trung tính theo màu tăng như bản mẫu. */
export function cardTagColor(card: CdCardDef) {
  return card.dir < 0 ? CD_CHART_COLORS.down : CD_CHART_COLORS.up
}

// ------------------------------------------------------------------ 1 · giới thiệu

/** 6 nến bối cảnh cuối của câu chuyện cộng các nến của mẫu. */
export function introView(story: readonly CdBar[], patternBars: number) {
  const bars = story.slice(-(INTRO_CONTEXT_BARS + patternBars))
  return { bars, contextCount: bars.length - patternBars }
}

export const rangeOf = (count: number, from = 0) => Array.from({ length: count }, (_, index) => from + index)

// ------------------------------------------------------------------ 2 · câu chuyện

export const GROW_FRAMES = 18
export const STORY_CONTEXT_DELAY_MS = 120
const STORY_AFTER_CONTEXT_MS = 400
const STORY_FRAME_MS = 55
const STORY_BETWEEN_BARS_MS = 300
const STORY_BEFORE_END_MS = 350

export type StoryState =
  | { stage: "context"; shown: number }
  | { stage: "grow"; index: number; frame: number }
  | { stage: "done" }

export const STORY_DONE: StoryState = { stage: "done" }
export const STORY_START: StoryState = { stage: "context", shown: 1 }

/** Một nến của mẫu hình thành theo bốn mốc giá: mở, cực trị đầu, cực trị kia, đóng; khối lượng lớn dần. */
export function growBar(target: CdBar, frame: number): CdBar {
  if (frame >= GROW_FRAMES) return target
  const up = target.c >= target.o
  const path = [target.o, up ? target.l : target.h, up ? target.h : target.l, target.c]
  const third = GROW_FRAMES / 3
  const segment = Math.min(2, Math.floor(frame / third))
  const t = (frame % third) / third
  const price = path[segment] + (path[segment + 1] - path[segment]) * t
  const reached = path.slice(0, segment + 1)
  return {
    o: target.o,
    h: Math.max(price, ...reached),
    l: Math.min(price, ...reached),
    c: price,
    v: Math.max(0.02, (target.v ?? 1) * Math.min(1, frame / GROW_FRAMES)),
  }
}

/** Bước kế tiếp của hoạt cảnh và thời gian chờ trước khi sang bước đó. */
export function advanceStory(
  state: StoryState,
  contextCount: number,
  patternBars: number,
): { next: StoryState; delay: number } | null {
  if (state.stage === "done") return null
  if (state.stage === "context") {
    if (state.shown < contextCount) return { next: { stage: "context", shown: state.shown + 1 }, delay: STORY_CONTEXT_DELAY_MS }
    return { next: { stage: "grow", index: 0, frame: 0 }, delay: STORY_AFTER_CONTEXT_MS }
  }
  if (state.frame < GROW_FRAMES) return { next: { ...state, frame: state.frame + 1 }, delay: STORY_FRAME_MS }
  if (state.index < patternBars - 1) {
    return { next: { stage: "grow", index: state.index + 1, frame: 0 }, delay: STORY_BETWEEN_BARS_MS }
  }
  return { next: STORY_DONE, delay: STORY_BEFORE_END_MS }
}

/** Các nến đang hiện và câu chú thích tương ứng ở một thời điểm của hoạt cảnh. */
export function storyFrame(all: readonly CdBar[], patternBars: number, state: StoryState) {
  const contextCount = all.length - patternBars
  if (state.stage === "context") return { bars: all.slice(0, state.shown), caption: 0 }
  if (state.stage === "grow") {
    const bars = [...all.slice(0, contextCount + state.index), growBar(all[contextCount + state.index], state.frame)]
    return { bars, caption: 1 + state.index }
  }
  return { bars: [...all], caption: Number.POSITIVE_INFINITY }
}

export const captionAt = (captions: readonly string[], index: number) =>
  captions[Math.min(index, captions.length - 1)] ?? ""

// ------------------------------------------------------------------ 3 · đúng chỗ

export const PLACE_OPTIONS: readonly { answer: PlaceAnswer; label: string }[] = [
  { answer: "D", label: "Sau nhịp giảm" },
  { answer: "T", label: "Sau nhịp tăng" },
  { answer: "both", label: "Ở đâu cũng được" },
]

/** Số nến của mẫu trong biểu đồ Đúng chỗ (nằm sau 14 nến bối cảnh). */
export const placePatternBars = (chart: CdChart) => chart.bars.length - PLACE_CONTEXT_BARS

/** Tên máy nhận ra ở nến cuối của biểu đồ; không có tên thì máy không thấy thẻ nào. */
export const recognisedName = (name: string | null | undefined) => name || "Không phải mẫu nào"

export function placeFeedback(item: CdPlaceItem, cardName: string) {
  if (item.ans === "both") return `${cardName} không phụ thuộc xu hướng trước đó.`
  const where = item.ans === "D" ? "sau nhịp giảm" : "sau nhịp tăng"
  return `Cùng hình nến, máy gọi tên theo nơi nó xuất hiện: chỉ ${where} mới là ${cardName}.`
}

// ------------------------------------------------------------------ 4 · săn nến

export type HuntTapKind = "found" | "wrong" | "repeat"

/** Một lần chạm: trúng mẫu mới, chạm nhầm, hoặc chạm lại mẫu đã tìm thấy. */
export function classifyHuntTap(hunt: Pick<CdHuntSpec, "bars" | "targets">, before: readonly number[], tap: number): HuntTapKind {
  const previous = gradeHunt(hunt, before)
  const current = gradeHunt(hunt, [...before, tap])
  if (current.found > previous.found) return "found"
  if (current.miss > previous.miss) return "wrong"
  return "repeat"
}

/** Nơi tô đỏ và tên máy gọi khi chạm nhầm: mồi nhử thì cả mồi, nến thường thì đúng nến đó. */
export function wrongTapInfo(hunt: CdHuntSpec, index: number) {
  const decoy = hunt.decoys.find(([start, end]) => index >= start && index <= end)
  return {
    start: decoy ? decoy[0] : index,
    end: decoy ? decoy[1] : index,
    name: (decoy ? decoy[2] : hunt.names[String(index)]) ?? null,
  }
}

export const huntMessage = (result: CdHuntResult) =>
  `${result.found}/${result.total} · ${result.miss} lần nhầm`

export const HUNT_INTRO_CAPTION = "Chạm vào mẫu nến. Cẩn thận mồi nhử."

// ------------------------------------------------------------------ 5 · song sinh

export interface TwinSideView {
  side: CdSide
  bars: readonly CdBar[]
  patternBars: number
  good: boolean
}

export function twinSides(twin: CdTwin): [TwinSideView, TwinSideView] {
  const good: Omit<TwinSideView, "side"> = { bars: twin.good, patternBars: twin.gn, good: true }
  const bad: Omit<TwinSideView, "side"> = { bars: twin.bad, patternBars: twin.bn, good: false }
  return twin.goodSide === "a"
    ? [{ side: "a", ...good }, { side: "b", ...bad }]
    : [{ side: "a", ...bad }, { side: "b", ...good }]
}

// ------------------------------------------------------------------ 6 · rồi sao?

export interface VolumeSideView {
  side: CdSide
  bars: readonly CdBar[]
  /** Lần khối lượng lớn (đáng tin). */
  trusted: boolean
}

/** Bài lẻ đặt lần khối lượng lớn ở bên B để đáp án không luôn nằm một bên. */
export function volumeView(content: LessonContent) {
  const { vol } = content.exercises
  const swap = content.lessonIndex % 2 === 1
  const sides: [VolumeSideView, VolumeSideView] = swap
    ? [
        { side: "a", bars: vol.B, trusted: false },
        { side: "b", bars: vol.A, trusted: true },
      ]
    : [
        { side: "a", bars: vol.A, trusted: true },
        { side: "b", bars: vol.B, trusted: false },
      ]
  const neutral = vol.dir === 0
  const name = content.mainCard.name
  return {
    sides,
    neutral,
    question: neutral ? `Sau ${name}, cú bứt phá nào đáng tin hơn?` : `Hai lần ${name}. Lần nào đáng tin hơn?`,
    /** Số nến hiện trước khi chọn: hết mẫu (và cú bứt phá với mẫu trung tính). */
    cut: vol.idx + 1 + (neutral ? 1 : 0),
    bandStart: vol.idx - content.lesson.patternBars + 1,
    bandEnd: neutral ? vol.idx + 1 : vol.idx,
    explanation: neutral
      ? "Bứt phá đi kèm khối lượng lớn thì có lực thật. Khối lượng thấp dễ là bứt phá giả."
      : `${name} đi kèm khối lượng lớn cho thấy tiền thật đã vào. Khối lượng thấp thì tín hiệu yếu, dễ thất bại.`,
  }
}

// ------------------------------------------------------------------ kết quả

export interface LocalLessonGrade {
  hunt: CdHuntResult
  twins: CdTwinsResult
  stars: CdLessonStars
}

/** Chấm tại máy cho chế độ xem trước (server mới là nơi quyết định ở chế độ thật). */
export function gradeLessonLocally(
  exercises: Pick<CdLessonExercises, "hunt" | "twins">,
  taps: readonly number[],
  picks: readonly TwinPick[],
): LocalLessonGrade {
  const hunt = gradeHunt(exercises.hunt, taps)
  const twins = gradeTwins(exercises.twins, picks)
  return { hunt, twins, stars: lessonStars(hunt.star, twins.star) }
}
