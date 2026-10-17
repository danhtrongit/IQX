/**
 * Học viện v3.2 content and wire types, all derived from the generated backend contracts
 * (`backend/src/modules/academy/content/v3/schema.ts` §6). The three named unions come from the
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

/** GET lessons/:id: a lesson or practice with content, or a chapter exam intro. */
export type ItemResponse = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}">
export type LessonContent = Extract<ItemResponse, { kind: "lesson" | "practice" }>
export type ExamContent = Extract<ItemResponse, { kind: "chapter_exam" }>
export type LessonSection = LessonContent["sections"][number]
export type ScenarioChoice = NonNullable<LessonContent["scenario_choice"]>
export type RewardResult = LessonContent["reward"]

export type LessonBlock = AcademyBlock
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

export type ChartModel = AcademyChartModel
export type LeafChartModel = AcademyLeafChartModel
export type ChartKind = ChartModel["kind"]
type SeriesPanelsModel = Extract<LeafChartModel, { kind: "series_panels" }>
export type ChartTone = NonNullable<NonNullable<SeriesPanelsModel["panels"][number]["band"]>["tone"]>

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
