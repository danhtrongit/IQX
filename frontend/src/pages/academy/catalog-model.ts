import type { AcademyCatalog, AcademyProgress, CatalogChapter, CatalogLesson } from "./api"

/** Fixed by the Học viện spec: shown while the catalog is still loading (never as a progress figure). */
export const CATALOG_CHAPTER_COUNT = 13
export const CATALOG_LESSON_COUNT = 71

export type LessonLocation = {
  lesson: CatalogLesson
  chapter: CatalogChapter
  /** 1-based position inside the chapter ("Bài x / n"). */
  position: number
  chapterSize: number
  prev: CatalogLesson | null
  next: CatalogLesson | null
}

/** Lesson id → where it sits in the 13-chapter catalog, with its neighbours inside the chapter. */
export function locateLessons(catalog: AcademyCatalog | undefined): ReadonlyMap<string, LessonLocation> {
  const locations = new Map<string, LessonLocation>()
  for (const chapter of catalog?.chapters ?? []) {
    chapter.lessons.forEach((lesson, index) => {
      locations.set(lesson.id, {
        lesson,
        chapter,
        position: index + 1,
        chapterSize: chapter.lessons.length,
        prev: chapter.lessons[index - 1] ?? null,
        next: chapter.lessons[index + 1] ?? null,
      })
    })
  }
  return locations
}

const NO_LESSONS: ReadonlySet<string> = new Set()

/** Distinct completed lessons of the current catalog, from the server's progress response. */
export function completedLessonIds(progress: AcademyProgress | undefined): ReadonlySet<string> {
  return progress ? new Set(progress.completed_lesson_ids) : NO_LESSONS
}

/** Completed lessons of one chapter; `null` while progress has not been confirmed (never a fake 0). */
export function chapterDone(progress: AcademyProgress | undefined, chapter: CatalogChapter): number | null {
  if (!progress) return null
  const completed = new Set(progress.completed_lesson_ids)
  return chapter.lessons.filter((lesson) => completed.has(lesson.id)).length
}

/** Quiz (8/8) lessons keep their score; guides are acknowledged with the "Hoàn thành bài học" button. */
export const isGuideLesson = (lesson: Pick<CatalogLesson, "completion">) => lesson.completion.mode === "guide"
