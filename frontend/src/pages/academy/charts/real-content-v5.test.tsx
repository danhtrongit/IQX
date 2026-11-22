import { cleanup, render, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BlockRenderer } from "../blocks/block-renderer"
import { mockReaderWidth, svgOverflows } from "../blocks/test-blocks"
import type { ChartModel, LessonBlock, LessonContent } from "../content-types"

/**
 * Integration (spec Học viện v5 §2.4, §2.5, §1.3, §10 mục 5, 8, 11): renders the real v5 lessons of the backend
 * content (`content/v5/lessons`, never the private question banks) that carry a v5 feature: FIG figures,
 * representative charts and "Có bài riêng" / "Ở các ngành" links, at phone and desktop reader widths.
 */
type LessonFile = Pick<LessonContent, "id" | "title"> & {
  intro_blocks: LessonBlock[]
  sections: { id: string; blocks: LessonBlock[] }[]
  charts: Record<string, ChartModel>
}

const lessonFiles = import.meta.glob("../../../../../backend/src/modules/academy/content/v5/lessons/*.vi.json", {
  eager: true,
  import: "default",
}) as Record<string, LessonFile>

const lessons = Object.values(lessonFiles).sort((a, b) => a.id.localeCompare(b.id))
const blocksOf = (lesson: LessonFile) => [...lesson.intro_blocks, ...lesson.sections.flatMap((section) => section.blocks)]
const figureIds = (lesson: LessonFile) => Object.entries(lesson.charts).filter(([, model]) => model.kind === "figure").map(([id]) => id)
const hasLinks = (lesson: LessonFile) => blocksOf(lesson).some((block) => block.type === "lesson_links")

const withFigures = lessons.filter((lesson) => figureIds(lesson).length > 0).map((lesson) => lesson.id)
const withLinks = lessons.filter(hasLinks).map((lesson) => lesson.id)
const lessonById = (id: string) => lessons.find((lesson) => lesson.id === id) as LessonFile

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
          <BlockRenderer
            blocks={section.blocks}
            charts={lesson.charts}
            renderInteractive={(block, key) => <div key={key} data-interactive={block.type} />}
          />
        </section>
      ))}
    </article>,
  )
}

describe("real v5 content: FIG figures (spec v5 §2.5)", () => {
  it("covers the 190 figures of the new lessons and all five kinds", () => {
    const figures = lessons.flatMap((lesson) => figureIds(lesson).map((id) => lesson.charts[id]))
    expect(figures).toHaveLength(190)
    expect(new Set(figures.map((model) => (model.kind === "figure" ? model.fig : null)))).toEqual(
      new Set(["formula", "hbar", "stack", "wf", "lines"]),
    )
  })

  for (const width of [358, 760]) {
    it.each(withFigures)(`%s draws every figure and its representative chart inside ${width}px`, (lessonId) => {
      const lesson = lessonById(lessonId)
      const { container } = renderLesson(lesson, width)
      for (const id of figureIds(lesson)) {
        const figure = container.querySelector(`[data-chart-id="${id}"]`) as HTMLElement
        expect(figure, id).not.toBeNull()
        // Never a blank frame: a drawing with text in it.
        expect(figure.querySelector('[data-figure] svg[role="img"] text'), id).not.toBeNull()
        expect(svgOverflows(figure, width), id).toEqual([])
      }
      const rep = container.querySelector(`[data-chart-id$="-rep"]`) as HTMLElement | null
      if (rep) {
        expect(rep.querySelector("[data-fundamental-chart]")).not.toBeNull()
        // Spec v5 §2.4: lessons drop the "Bảng số" button of the shared renderer.
        expect(within(rep).queryByRole("button", { name: "Bảng số" })).toBeNull()
      }
    })
  }

  it("draws the `arrow` operator as a shape, never as text", () => {
    const lesson = lessons.find((entry) =>
      Object.values(entry.charts).some((model) => model.kind === "figure" && model.fig === "formula" && model.ops.includes("arrow")),
    ) as LessonFile
    const { container } = renderLesson(lesson, 760)
    expect(container.querySelector('[data-op="arrow"]')).not.toBeNull()
    expect([...container.querySelectorAll("text")].some((node) => node.textContent === "arrow")).toBe(false)
  })
})

describe("real v5 content: lesson links (spec v5 §1.3, §1.4, §6.3)", () => {
  it("8 lessons of Chương 8 and 9 of Chương 9 carry links", () => {
    expect(withLinks.filter((id) => id.startsWith("ch08-"))).toHaveLength(8)
    expect(withLinks.filter((id) => id.startsWith("ch09-"))).toHaveLength(9)
  })

  it.each(withLinks)("%s renders its links as deep links with metric and nganh", (lessonId) => {
    const lesson = lessonById(lessonId)
    const { container } = renderLesson(lesson, 358)
    const block = container.querySelector('[data-academy-block="lesson_links"]') as HTMLElement
    const links = within(block).getAllByRole("link")
    const expected = blocksOf(lesson).flatMap((entry) => (entry.type === "lesson_links" ? entry.links : []))
    expect(links.map((link) => link.textContent)).toEqual(expected.map((link) => link.label))
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      expected.map((link) => `?tool=hoc-vien&metric=${link.metric_key}&nganh=${link.nganh}`),
    )
    // One sentence: lead, links joined by ", ", tail starting with punctuation.
    expect(block.textContent).toMatch(/^\S.*: .+[.]/)
    expect(block.textContent).not.toMatch(/ [,.]/)
  })
})
