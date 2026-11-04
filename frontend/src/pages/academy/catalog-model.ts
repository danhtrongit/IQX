import type { CatalogChapter, CatalogItem, CatalogResponse, ItemState, ProgressResponse } from "./content-types"

/**
 * Chapter numbers: the server numbers the chapters of the learner's program from 1 (`display_no`, spec v4.1 §2) and
 * the client never computes them. `chapter_id` (`ch03`) is the fixed identity of a chapter and never changes with the
 * numbering; it is the key of every list, open/closed state and lookup here.
 */

/** Item id → catalog item, over the chapters of the learner's program. */
export function catalogItems(catalog: CatalogResponse | undefined): ReadonlyMap<string, CatalogItem> {
  return new Map(catalog?.chapters.flatMap((chapter) => chapter.items.map((item) => [item.id, item] as const)) ?? [])
}

/** The learning chain in catalog order: lessons, exam (and the optional practice) of every chapter of the program. */
export function flatItems(catalog: CatalogResponse | undefined): CatalogItem[] {
  return catalog?.chapters.flatMap((chapter) => chapter.items) ?? []
}

/**
 * `ch07-l01` / `ch03-exam` / `ch03-practice` → `ch07` / `ch03` / `ch03`: the fixed chapter id of an item id, known
 * before the catalog arrives. It is not the number the learner sees.
 */
export function chapterIdOfItem(itemId: string | null): string | null {
  const match = itemId ? /^(ch\d{2})-/.exec(itemId) : null
  return match ? match[1] : null
}

/** Server-computed states by item id; empty while progress is unknown (never computed on the client). */
export function itemStates(progress: ProgressResponse | undefined): ReadonlyMap<string, ItemState> {
  return new Map(progress?.items?.map((item) => [item.id, item.state] as const) ?? [])
}

export type ItemLocation = {
  item: CatalogItem
  chapter: CatalogChapter
  /** Previous and next item of the flat sequence (across chapters). */
  prev: CatalogItem | null
  next: CatalogItem | null
  /** First item of the chapter ("Xem lại Chương c"). */
  firstOfChapter: CatalogItem
}

export function locateItem(catalog: CatalogResponse | undefined, itemId: string): ItemLocation | null {
  if (!catalog) return null
  const items = flatItems(catalog)
  const at = items.findIndex((item) => item.id === itemId)
  if (at < 0) return null
  const item = items[at]
  const chapter = catalog.chapters.find((candidate) => candidate.chapter_id === item.chapter_id)
  if (!chapter) return null
  return { item, chapter, prev: items[at - 1] ?? null, next: items[at + 1] ?? null, firstOfChapter: chapter.items[0] }
}

/** The locator line of the reader (spec v4 §4.4) with the learner's own chapter number. */
export function locatorText(item: Pick<CatalogItem, "kind" | "chapter_display_no" | "position" | "name">, lessonCount: number | null): string {
  if (item.kind === "chapter_exam") return `Bài thi Chương ${item.chapter_display_no}`
  if (item.kind === "practice") return `Chương ${item.chapter_display_no} · ${item.name}`
  return item.position !== null && lessonCount !== null
    ? `Chương ${item.chapter_display_no} · Bài ${item.position} / ${lessonCount}`
    : `Chương ${item.chapter_display_no}`
}

/** Label of an item in lists and buttons: an exam is always "Bài thi Chương c". */
export function itemLabel(item: Pick<CatalogItem, "kind" | "chapter_display_no" | "name">): string {
  return item.kind === "chapter_exam" ? `Bài thi Chương ${item.chapter_display_no}` : item.name
}

/** The action of a row: passed → "Xem lại", open → "Học bài" (lesson, practice) or "Làm bài" (exam). */
export function rowAction(item: Pick<CatalogItem, "kind">, state: ItemState): string | null {
  if (state === "passed") return "Xem lại"
  if (state === "open") return item.kind === "chapter_exam" ? "Làm bài" : "Học bài"
  return null
}

/** "Học tiếp" (spec v4.1 §4): the nearest item the learner can open, from the server (`next_item_id`, else the current one). */
export function resumeItemId(progress: ProgressResponse | undefined): string | null {
  return progress?.next_item_id ?? progress?.current_item_id ?? null
}
