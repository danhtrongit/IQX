import { useState, type ReactNode } from "react"
import { CheckCircle2, Circle } from "lucide-react"
import { Link } from "react-router"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import type { Curriculum, CurriculumLesson } from "./api"

/** Config controls of one technical lesson row; `null` → the row has no controls. */
export type LessonRowControl = {
  indicatorName: string
  /** Lesson passed / `indicator:<id>` granted. */
  learned: boolean
  /** Shared config + registry loaded (Premium, flag on). */
  available: boolean
  /** Displayed master value (includes an unsaved draft after a 409). */
  master: boolean
  unsaved: boolean
  busy: boolean
}

export type AcademySidebarProps = {
  curriculum: Curriculum
  activeLessonId: string | undefined
  header?: ReactNode
  controlFor: (lesson: CurriculumLesson) => LessonRowControl | null
  onOpenConfig: (lesson: CurriculumLesson) => void
  onToggleMaster: (lesson: CurriculumLesson, next: boolean) => void
  onNavigate?: () => void
}

const chapterKey = (no: number) => `chapter-${no}`

function lockedHint(control: LessonRowControl): string | undefined {
  if (!control.learned) return "Đạt 8/8 bài kiểm tra để mở"
  if (!control.available) return "Cấu hình chưa sẵn sàng"
  return undefined
}

function LessonRow({ lesson, active, control, onOpenConfig, onToggleMaster, onNavigate }: {
  lesson: CurriculumLesson
  active: boolean
  control: LessonRowControl | null
  onOpenConfig: () => void
  onToggleMaster: (next: boolean) => void
  onNavigate?: () => void
}) {
  const usable = !!control && control.learned && control.available
  const hint = control ? lockedHint(control) : undefined
  return (
    <li
      className={cn("rounded-sm border border-transparent px-2 py-2", active && "border-primary/40 bg-primary/5")}
      aria-current={active ? "page" : undefined}
    >
      <div className="flex items-start gap-2">
        {lesson.passed
          ? <CheckCircle2 aria-label="Đã đạt" className="mt-0.5 size-4 shrink-0 text-(--status-success)" />
          : <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5 font-medium">{lesson.name}</p>
          <p className="text-xs text-muted-foreground">
            {lesson.best_score === null ? "Chưa làm bài" : `Cao nhất ${lesson.best_score}/8`}
            {lesson.attempts > 0 ? ` · ${lesson.attempts} lần` : ""}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        <Button asChild variant={active ? "secondary" : "outline"} size="xs">
          <Link to={`/hoc-vien/${lesson.id}`} onClick={onNavigate} aria-label={`Xem bài ${lesson.name}`}>Xem bài</Link>
        </Button>
        {control && (
          <>
            <Button
              variant="outline"
              size="xs"
              disabled={!usable}
              title={hint}
              aria-label={`Cấu hình ${control.indicatorName}`}
              onClick={onOpenConfig}
            >
              Cấu hình
            </Button>
            <span className="ml-auto flex items-center gap-1.5">
              {control.unsaved && <span className="text-[11px] text-destructive">Chưa lưu</span>}
              <Switch
                size="sm"
                checked={control.master}
                disabled={!usable || control.busy}
                title={hint}
                aria-label={`Bật/tắt ${control.indicatorName}`}
                onCheckedChange={onToggleMaster}
              />
            </span>
          </>
        )}
      </div>
    </li>
  )
}

/** Left navigation: 18 chapters → lessons with Xem bài / Cấu hình / master switch. */
export function AcademySidebar({ curriculum, activeLessonId, header, controlFor, onOpenConfig, onToggleMaster, onNavigate }: AcademySidebarProps) {
  const activeChapter = curriculum.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === activeLessonId))
  const [open, setOpen] = useState<string[]>(() => [chapterKey(activeChapter?.no ?? curriculum.chapters[0]?.no ?? 1)])
  const lessons = curriculum.chapters.flatMap(chapter => chapter.lessons)
  const passed = lessons.filter(lesson => lesson.passed).length

  return (
    <nav aria-label="Chương trình Học viện" className="flex min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">Học viện</h2>
          <span className="text-xs text-muted-foreground">{passed} / {lessons.length} bài đạt</span>
        </div>
        <Progress value={lessons.length ? (passed / lessons.length) * 100 : 0} aria-label="Tiến độ Học viện" />
        {header}
      </div>
      <Accordion type="multiple" value={open} onValueChange={setOpen} className="px-2 py-2">
        {curriculum.chapters.map(chapter => {
          const done = chapter.lessons.filter(lesson => lesson.passed).length
          return (
            <AccordionItem key={chapter.no} value={chapterKey(chapter.no)} className="border-border">
              <AccordionTrigger className="px-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Chương {chapter.no}</span>
                  <span className="block leading-5">{chapter.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{done}/{chapter.lessons.length}</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <ul className="space-y-1">
                  {chapter.lessons.map(lesson => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      active={lesson.id === activeLessonId}
                      control={controlFor(lesson)}
                      onOpenConfig={() => onOpenConfig(lesson)}
                      onToggleMaster={next => onToggleMaster(lesson, next)}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </nav>
  )
}
