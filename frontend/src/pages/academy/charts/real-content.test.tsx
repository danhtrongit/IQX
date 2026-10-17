import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import type { CatalogResponse, LessonContent } from "../content-types"

/**
 * Integration: renders every real v3.2 lesson of the backend content (`content/v3/lessons` and
 * `catalog.json` only, never the private question banks) at phone and desktop reader widths.
 */
type LessonFile = Pick<LessonContent, "id" | "intro_blocks" | "sections" | "charts">

const lessonFiles = import.meta.glob("../../../../../backend/src/modules/academy/content/v3/lessons/*.vi.json", {
  eager: true,
  import: "default",
}) as Record<string, LessonFile>
const catalog = Object.values(
  import.meta.glob("../../../../../backend/src/modules/academy/content/v3/catalog.json", { eager: true, import: "default" }) as Record<
    string,
    Pick<CatalogResponse, "chapters">
  >,
)[0]

const lessons = Object.values(lessonFiles).sort((a, b) => a.id.localeCompare(b.id))

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  cleanup()
})

function renderLesson(lesson: LessonFile, width: number) {
  restore = mockReaderWidth(width)
  return render(
    <article>
      <BlockRenderer blocks={lesson.intro_blocks} charts={lesson.charts} />
      {lesson.sections.map((section) => (
        <section key={section.id}>
          <BlockRenderer blocks={section.blocks} charts={lesson.charts} renderInteractive={(block, key) => <div key={key} data-interactive={block.type} />} />
        </section>
      ))}
    </article>,
  )
}

describe("real Học viện content", () => {
  it("has the 44 lesson files of the published catalog", () => {
    expect(lessons).toHaveLength(44)
    const published = catalog.chapters.flatMap((chapter) => ("items" in chapter ? chapter.items : []))
    const readable = published.filter((item) => item.kind !== "chapter_exam").map((item) => item.id)
    expect(lessons.map((lesson) => lesson.id)).toEqual([...readable].sort())
  })

  for (const width of [358, 760]) {
    it.each(lessons.map((lesson) => [lesson.id, lesson] as const))(`renders %s at ${width}px with every chart drawn inside the reader`, (_, lesson) => {
      const { container } = renderLesson(lesson, width)
      const staticCount = [...lesson.intro_blocks, ...lesson.sections.flatMap((section) => section.blocks)].filter(
        (block) => !["scenario", "checklist", "workpad", "income_calculator", "practice_case", "roleplay_score"].includes(block.type),
      ).length
      expect(container.querySelectorAll("[data-academy-block]")).toHaveLength(staticCount)
      for (const id of Object.keys(lesson.charts)) expect(container.querySelector(`[data-chart-id="${id}"]`), id).not.toBeNull()
      expect(container.textContent).not.toContain("Biểu đồ này chưa có dữ liệu.")
      expect(svgOverflows(container, width)).toEqual([])
    })
  }
})
