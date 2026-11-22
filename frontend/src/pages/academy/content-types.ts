/**
 * Học viện v4 content and wire types, all derived from the generated backend contracts
 * (`backend/src/modules/academy/content/v4/schema.ts` §6). The three named unions come from the
 * schema's `.meta({ id })`: AcademyBlock, AcademyChartModel, AcademyLeafChartModel.
 *
 * Renderers (blocks/, charts/) and the app (panel, reader, quiz, interactive) import types only
 * from here, so neither side depends on the other's files.
 */
import type { ApiResponseFor } from "@/lib/contract-types"
import type { AcademyBlock, AcademyChartModel, AcademyLeafChartModel } from "@/lib/generated"

export type CatalogResponse = ApiResponseFor<"GET /api/v2/academy/catalog">
export type CatalogChapter = CatalogResponse["chapters"][number]
export type CatalogItem = CatalogChapter["items"][number]
export type ItemKind = CatalogItem["kind"]

export type ProgressResponse = ApiResponseFor<"GET /api/v2/academy/progress">
export type ProgressItem = ProgressResponse["items"][number]
export type ItemState = ProgressItem["state"]
/** `free` (default, spec v4 §4.1: nothing is locked) or `sequential` (the v3.3 prefix rule, per account). */
export type AccessMode = ProgressResponse["access_mode"]

/**
 * `GET /academy/link?metric=&nganh=`: the lesson that teaches a metric (spec v4 §6, v5 §6: the industry
 * chapter first, then Chương 8, then any chapter); a miss answers the lesson being learned.
 */
export type LinkResponse = ApiResponseFor<"GET /api/v2/academy/link">

/** GET lessons/:id: a lesson or practice with content, or a chapter exam intro. */
export type ItemResponse = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}">
export type LessonContent = Extract<ItemResponse, { kind: "lesson" | "practice" }>
export type ExamContent = Extract<ItemResponse, { kind: "chapter_exam" }>
export type LessonSection = LessonContent["sections"][number]
export type ScenarioChoice = NonNullable<LessonContent["scenario_choice"]>
export type RewardResult = LessonContent["reward"]

/**
 * v5 static block `lesson_links` (plan Học viện v5 §5): the "Có bài riêng" line of Chương 8 and the
 * "Ở các ngành" line of Chương 9. Each link names a metric and an industry; the lesson is resolved at
 * runtime through `GET /academy/link?metric=&nganh=`. Declared here until the regenerated contracts
 * carry it; once `AcademyBlock` has a `lesson_links` member that one is used instead.
 */
type LocalLessonLinksBlock = {
  type: "lesson_links"
  /** Inline HTML before the links, e.g. "<b>Có bài riêng:</b>". */
  lead: string
  links: { label: string; metric_key: string; nganh?: string | null }[]
  /** Inline HTML after the links, e.g. "Các bài này nói cách đọc chỉ tiêu ở từng ngành." */
  tail?: string | null
}
type GeneratedLessonLinksBlock = Extract<AcademyBlock, { type: "lesson_links" }>
export type LessonLinksBlock = [GeneratedLessonLinksBlock] extends [never] ? LocalLessonLinksBlock : GeneratedLessonLinksBlock

export type LessonBlock = Exclude<AcademyBlock, { type: "lesson_links" }> | LessonLinksBlock
export type LessonBlockType = LessonBlock["type"]
export const INTERACTIVE_BLOCK_TYPES = [
  "scenario",
  "checklist",
  "workpad",
  "income_calculator",
  "practice_case",
  "roleplay_score",
] as const satisfies readonly LessonBlockType[]
export type InteractiveBlock = Extract<LessonBlock, { type: (typeof INTERACTIVE_BLOCK_TYPES)[number] }>
export type StaticBlock = Exclude<LessonBlock, InteractiveBlock>

export function isInteractiveBlock(block: LessonBlock): block is InteractiveBlock {
  return (INTERACTIVE_BLOCK_TYPES as readonly string[]).includes(block.type)
}

export type LeafChartModel = AcademyLeafChartModel
type SeriesPanelsModel = Extract<LeafChartModel, { kind: "series_panels" }>
export type ChartTone = NonNullable<NonNullable<SeriesPanelsModel["panels"][number]["band"]>["tone"]>

/**
 * v5 chart kind `figure` (plan Học viện v5 §5, spec v5 §2.5): the five `FIG` drawings of the mockup
 * (`formula`, `hbar`, `stack`, `wf`, `lines`). Optional fields may also arrive as `null`; unknown
 * fields are ignored. Declared here until the regenerated contracts carry it; once
 * `AcademyChartModel` has a `figure` member that one is used instead.
 */
type Maybe<T> = T | null | undefined
type FigureBase = { kind: "figure"; alt?: Maybe<string> }
type LocalFigureChartModel =
  | (FigureBase & {
      fig: "formula"
      /** `t` title, `v` value text, `notes` small lines under the value, `hl` outlined box, `size` value font size. */
      items: { t: string; v: string; tone?: Maybe<ChartTone>; notes?: Maybe<string[]>; hl?: Maybe<boolean>; size?: Maybe<number> }[]
      /** Operator between box i and i+1 ("÷", "=", "so với"...). */
      ops: string[]
      height?: Maybe<number>
    })
  | (FigureBase & {
      fig: "hbar"
      title?: Maybe<string>
      items: { label: string; value: number; tone?: Maybe<ChartTone> }[]
      decimals?: Maybe<number>
      unit?: Maybe<string>
      note?: Maybe<string>
      label_width?: Maybe<number>
      row_height?: Maybe<number>
      max?: Maybe<number>
    })
  | (FigureBase & {
      fig: "stack"
      title?: Maybe<string>
      parts: { label: string; value: number; tone?: Maybe<ChartTone> }[]
      decimals?: Maybe<number>
      unit?: Maybe<string>
      note?: Maybe<string>
    })
  | (FigureBase & {
      fig: "wf"
      title?: Maybe<string>
      items: { label: string; value: number; step: "base" | "plus" | "minus" | "total"; tone?: Maybe<ChartTone> }[]
      decimals?: Maybe<number>
      unit?: Maybe<string>
      height?: Maybe<number>
    })
  | (FigureBase & {
      fig: "lines"
      title?: Maybe<string>
      rows: { report: string; line: string; code?: Maybe<string>; tone?: Maybe<ChartTone> }[]
    })
type GeneratedFigureChartModel = Extract<AcademyChartModel, { kind: "figure" }>
export type FigureChartModel = [GeneratedFigureChartModel] extends [never] ? LocalFigureChartModel : GeneratedFigureChartModel
export type FigureKind = FigureChartModel["fig"]

export type ChartModel = Exclude<AcademyChartModel, { kind: "figure" }> | FigureChartModel
export type ChartKind = ChartModel["kind"]

export type ScenarioChoiceResponse = ApiResponseFor<"POST /api/v2/academy/lessons/{lessonId}/scenario">
export type NotesResponse = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}/notes">

export type AttemptResponse = ApiResponseFor<"POST /api/v2/academy/attempts">
export type AttemptQuestion = AttemptResponse["questions"][number]
export type ResumeResponse = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}/attempt">
export type ResumableAttempt = NonNullable<ResumeResponse["attempt"]>
export type DraftState = ResumableAttempt["draft"]
export type DraftSaveResponse = ApiResponseFor<"PUT /api/v2/academy/attempts/{attemptId}/answers">
export type SubmitResult = ApiResponseFor<"POST /api/v2/academy/attempts/{attemptId}/submit">
export type HistoryResponse = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}/attempts">
