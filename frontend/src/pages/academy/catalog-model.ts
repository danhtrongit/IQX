import type { CatalogChapter, CatalogItem, CatalogResponse, ItemState, ProgressResponse } from "./content-types"

/** Required lessons of the published chapters (spec v3.2); shown while the catalog is still loading. */
export const REQUIRED_TOTAL_FALLBACK = 43

/** Item id → catalog item, over the published chapters. */
export function catalogItems(catalog: CatalogResponse | undefined): ReadonlyMap<string, CatalogItem> {
  return new Map(catalog?.chapters.flatMap((chapter) => chapter.items.map((item) => [item.id, item] as const)) ?? [])
}

/** The learning chain in catalog order: lessons, exam (and the ch3 practice) of every published chapter. */
export function flatItems(catalog: CatalogResponse | undefined): CatalogItem[] {
  return catalog?.chapters.flatMap((chapter) => chapter.items) ?? []
}

/** `ch07-l01` / `ch03-exam` / `ch03-practice` → 7 / 3 / 3: the chapter of an item id, known before the catalog arrives. */
export function chapterOfItem(itemId: string | null): number | null {
  const match = itemId ? /^ch(\d{2})-/.exec(itemId) : null
  return match ? Number(match[1]) : null
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
  const chapter = catalog.chapters.find((candidate) => candidate.no === item.chapter)
  if (!chapter) return null
  return { item, chapter, prev: items[at - 1] ?? null, next: items[at + 1] ?? null, firstOfChapter: chapter.items[0] }
}

/** The locator line of the reader (spec §4.4). */
export function locatorText(item: Pick<CatalogItem, "kind" | "chapter" | "position" | "name">, lessonCount: number | null): string {
  if (item.kind === "chapter_exam") return `Bài thi Chương ${item.chapter}`
  if (item.kind === "practice") return `Chương ${item.chapter} · ${item.name}`
  return item.position !== null && lessonCount !== null
    ? `Chương ${item.chapter} · Bài ${item.position} / ${lessonCount}`
    : `Chương ${item.chapter}`
}

/** Label of an item in lists and buttons: an exam is always "Bài thi Chương c". */
export function itemLabel(item: Pick<CatalogItem, "kind" | "chapter" | "name">): string {
  return item.kind === "chapter_exam" ? `Bài thi Chương ${item.chapter}` : item.name
}

/** The action of a row: passed → "Xem lại", open → "Học bài" (lesson, practice) or "Làm bài" (exam). */
export function rowAction(item: Pick<CatalogItem, "kind">, state: ItemState): string | null {
  if (state === "passed") return "Xem lại"
  if (state === "open") return item.kind === "chapter_exam" ? "Làm bài" : "Học bài"
  return null
}
