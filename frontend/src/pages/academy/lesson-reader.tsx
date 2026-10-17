import { ArrowLeft } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { isItemLocked, isNotFound } from "./api"
import { BlockRenderer } from "./blocks/block-renderer"
import { InlineText } from "./blocks/inline-text"
import { useAcademyNavigation } from "./navigation"
import { useAcademyItem } from "./queries"
import "./academy.css"

/**
 * The open item in the left area. F0 placeholder that compiles against the v3.2 contract: the
 * reader package (P4) replaces it with the topbar, lesson view, quiz gate, exam intro, quiz flow,
 * pager and locked state. Mount it with `key={lessonId}`.
 */
export function LessonReader({ lessonId }: { lessonId: string }) {
  const nav = useAcademyNavigation()
  const itemQuery = useAcademyItem(lessonId)
  const item = itemQuery.data

  return (
    <article aria-label={item?.name ?? "Bài học"} data-lesson-id={lessonId} className="mx-auto w-full min-w-0 max-w-[1000px]">
      <div className="mb-3">
        <Button type="button" variant="ghost" size="sm" onClick={nav.closeLesson}>
          <ArrowLeft aria-hidden="true" />
          Về linh thú
        </Button>
      </div>
      {item ? (
        item.kind === "chapter_exam" ? (
          <header>
            <h2 className="text-xl font-semibold">Bài thi Chương {item.chapter}</h2>
            <p className="mt-2 text-sm">{item.intro}</p>
          </header>
        ) : (
          <>
            <header>
              <h2 className="text-xl font-semibold">{item.title}</h2>
              <InlineText as="p" className="mt-2 text-sm" html={item.lead} />
            </header>
            <BlockRenderer blocks={item.intro_blocks} charts={item.charts} />
            {item.sections.map((section, index) => (
              <section key={section.id} id={`academy-section-${index + 1}`} className="mt-6">
                <h3 className="text-base font-semibold">{section.title}</h3>
                <BlockRenderer blocks={section.blocks} charts={item.charts} />
              </section>
            ))}
          </>
        )
      ) : itemQuery.isError ? (
        <PanelState
          title={isItemLocked(itemQuery.error) ? "Bài này chưa mở" : isNotFound(itemQuery.error) ? "Không tìm thấy bài học" : "Chưa tải được bài học"}
          description={errorMessage(itemQuery.error)}
          action={{ label: "Thử lại", onClick: () => void itemQuery.refetch() }}
        />
      ) : (
        <Skeleton className="h-64 w-full rounded-lg" />
      )}
    </article>
  )
}
