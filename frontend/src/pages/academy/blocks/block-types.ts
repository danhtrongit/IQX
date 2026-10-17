import type { LessonBlock, LessonBlockType } from "../content-types"

/** The block of one `type` of the content schema. */
export type BlockOf<T extends LessonBlockType> = Extract<LessonBlock, { type: T }>
