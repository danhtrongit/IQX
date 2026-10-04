import { useId, useMemo, useState } from "react"
import { ArrowRight, ClipboardCheck, SlidersHorizontal } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { isFeatureDisabled } from "@/lib/shared-config"
import { useSavedLists } from "@/pages/strategy/filter/hooks"

import type { LessonDetail, LessonFixture, LessonKind } from "./api"
import { sanitizeLessonHtml } from "./sanitize"

const KIND_LABEL: Record<LessonKind, string> = {
  technical: "Chỉ báo kỹ thuật",
  fundamental: "Chỉ tiêu cơ bản",
  tool: "Công cụ",
  system: "Hệ thống",
}

/** Typography for trusted lesson HTML (classes kept by the sanitizer: formula, frac, math-eq, table-wrap…). */
const LESSON_PROSE = [
  "space-y-3 text-[15px] leading-7 text-foreground/85",
  "[&_strong]:font-semibold [&_strong]:text-foreground [&_h3]:mt-5 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
  "[&_.table-wrap]:overflow-x-auto [&_.table-scroll]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground",
  "[&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_.formula]:my-3 [&_.formula]:rounded-sm [&_.formula]:border [&_.formula]:border-border [&_.formula]:bg-muted/40 [&_.formula]:p-4 [&_.formula]:font-mono [&_.formula]:text-sm [&_.formula]:leading-7 [&_.formula]:whitespace-pre-wrap [&_.formula]:[overflow-wrap:anywhere]",
  "[&_.math-eq]:my-3 [&_.math-eq]:rounded-sm [&_.math-eq]:border [&_.math-eq]:border-border [&_.math-eq]:bg-muted/40 [&_.math-eq]:p-4 [&_.math-eq]:font-mono [&_.math-eq]:text-sm [&_.math-eq]:leading-7 [&_.math-eq]:whitespace-pre-wrap",
  "[&_.frac]:inline-flex [&_.frac]:flex-col [&_.frac]:px-1 [&_.frac]:text-center [&_.frac]:align-middle [&_.frac>span:first-child]:border-b [&_.frac>span:first-child]:border-current",
  "[&_.formula-group]:my-4 [&_.worked]:my-4 [&_.worked]:rounded-sm [&_.worked]:border [&_.worked]:border-border [&_.worked]:p-4",
].join(" ")

const decimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 })

function sectionTitle(title: string, index: number): string {
  return `${index + 1}. ${title.replace(/^\d+[.\s]+/, "")}`
}

function FixturePractice({ fixture }: { fixture: LessonFixture }) {
  const inputId = useId()
  const [value, setValue] = useState("")
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const checkable = typeof fixture.expected === "number" && Number.isFinite(fixture.expected)

  const check = () => {
    if (!checkable) return
    const number = Number(value.replace(",", "."))
    const tolerance = typeof fixture.tolerance === "number" ? fixture.tolerance : 0
    const ok = value.trim() !== "" && Number.isFinite(number) && Math.abs(number - (fixture.expected as number)) <= tolerance
    setFeedback(ok
      ? { ok: true, text: "Đúng." }
      : { ok: false, text: `Chưa đúng. Kết quả: ${decimal.format(fixture.expected as number)}${fixture.unit ? ` ${fixture.unit}` : ""}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Thực hành{fixture.label ? ` · ${fixture.label}` : ""}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fixture.synthetic && <Badge variant="outline">Dữ liệu giả lập</Badge>}
        {fixture.prompt && <p className="text-sm leading-6">{fixture.prompt}</p>}
        {fixture.formula && (
          <pre className="rounded-sm border border-border bg-muted/40 p-3 font-mono text-xs leading-6 whitespace-pre-wrap">{fixture.formula}</pre>
        )}
        {checkable && (
          <div className="space-y-2">
            <Label htmlFor={inputId}>Kết quả tính{fixture.unit ? ` (${fixture.unit})` : ""}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={inputId}
                inputMode="decimal"
                className="w-40"
                value={value}
                onChange={event => { setValue(event.target.value); setFeedback(null) }}
                onKeyDown={event => { if (event.key === "Enter") check() }}
              />
              <Button variant="outline" onClick={check}>Kiểm tra</Button>
            </div>
            <p role="status" className={feedback ? (feedback.ok ? "text-sm text-(--status-success)" : "text-sm text-destructive") : "sr-only"}>
              {feedback?.text ?? ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Lessons whose practice area offers saved lists: fundamental lessons and all of chapter 4. */
function usesSavedLists(lesson: LessonDetail): boolean {
  return lesson.kind === "fundamental" || lesson.chapter === 4
}

/** Chapter 2 lessons 14-16 (sensitivity / out-of-sample / walk-forward) are practised in the Backtest tab. */
const VALIDATION_LESSONS: ReadonlySet<string> = new Set(["ch02-l14", "ch02-l15", "ch02-l16"])

function SavedListPractice() {
  const selectId = useId()
  const [selectedId, setSelectedId] = useState("")
  const lists = useSavedLists(true)

  if (isFeatureDisabled(lists.error)) return null
  const denied = lists.error instanceof ApiError && (lists.error.status === 401 || lists.error.status === 403)
  const items = lists.data ?? []
  const selected = items.find(list => list.id === selectedId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Danh mục thực hành</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {denied ? (
          <p className="text-muted-foreground">Danh mục đã lưu cần tài khoản Premium.</p>
        ) : lists.isError ? (
          <p role="alert" className="text-destructive">Không tải được danh mục đã lưu.</p>
        ) : lists.isPending ? (
          <p className="text-muted-foreground">Đang tải danh mục…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">
            Chưa có danh mục nào. Lưu một danh mục trong{" "}
            <Link className="underline underline-offset-2" to="/chien-luoc?tab=bo-loc">Chiến lược → Bộ lọc</Link>.
          </p>
        ) : (
          <>
            <Label htmlFor={selectId}>Danh mục thực hành</Label>
            <select
              id={selectId}
              className="block h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
              value={selectedId}
              onChange={event => setSelectedId(event.target.value)}
            >
              <option value="">Chọn danh mục đã lưu</option>
              {items.map(list => <option key={list.id} value={list.id}>{`${list.name} · ${list.tickers.length} mã`}</option>)}
            </select>
            <p role="status" className="leading-6">
              {selected
                ? `${selected.tickers.join(" · ")} · Lưu ngày ${selected.as_of.slice(0, 10)}`
                : "Danh mục là danh sách thực hành, không phải vị thế tài khoản."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export type LessonViewProps = {
  lesson: LessonDetail
  chapterTitle: string | undefined
  chapterLessonCount: number
  lessonNames: ReadonlyMap<string, string>
  nextLessonId: string | null
  /** Config shortcut for technical lessons; `null` hides it (no config_id or feature disabled). */
  configAction: { label: string; enabled: boolean; onOpen: () => void } | null
  onStartQuiz: () => void
}

export function LessonView({ lesson, chapterTitle, chapterLessonCount, lessonNames, nextLessonId, configAction, onStartQuiz }: LessonViewProps) {
  const sections = useMemo(
    () => lesson.sections.map(section => ({ title: section.title, html: sanitizeLessonHtml(section.html) })),
    [lesson.sections],
  )

  return (
    <article className="mx-auto w-full max-w-[880px] space-y-5" aria-labelledby="academy-lesson-title">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Chương {lesson.chapter}{chapterTitle ? ` · ${chapterTitle}` : ""} · Bài {lesson.order} / {chapterLessonCount}
        </p>
        <h2 id="academy-lesson-title" className="font-heading text-2xl font-semibold tracking-tight">{lesson.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{KIND_LABEL[lesson.kind] ?? lesson.kind}</Badge>
          {lesson.passed && <Badge>Đã đạt 8/8</Badge>}
        </div>
      </header>

      {lesson.prerequisites.length > 0 && (
        <section aria-labelledby="academy-prerequisites" className="rounded-sm border border-border bg-card p-4 text-sm">
          <h3 id="academy-prerequisites" className="font-semibold">Bài nên học trước</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {lesson.prerequisites.map(id => (
              <li key={id}>
                <Button asChild variant="outline" size="xs"><Link to={`/hoc-vien/${id}`}>{lessonNames.get(id) ?? id}</Link></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sections.map((section, index) => (
        <Card key={`${index}-${section.title}`} className="gap-3">
          <CardHeader>
            <CardTitle className="font-heading text-lg">{sectionTitle(section.title, index)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={LESSON_PROSE} dangerouslySetInnerHTML={{ __html: section.html }} />
          </CardContent>
        </Card>
      ))}

      {lesson.fixture && <FixturePractice fixture={lesson.fixture} />}

      {usesSavedLists(lesson) && <SavedListPractice />}

      {lesson.sources.length > 0 && (
        <section aria-labelledby="academy-sources" className="text-xs text-muted-foreground">
          <h3 id="academy-sources" className="font-semibold text-foreground">Nguồn</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {lesson.sources.map(source => <li key={source}>{source}</li>)}
          </ul>
          <p className="mt-2">Nội dung phục vụ học tập, không phải khuyến nghị đầu tư. Đạt 8/8 không phải chứng nhận đầu tư.</p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={onStartQuiz}>
          <ClipboardCheck aria-hidden="true" />
          Làm bài kiểm tra · 8 câu
        </Button>
        {configAction && (
          <Button
            variant="outline"
            disabled={!configAction.enabled}
            title={configAction.enabled ? undefined : "Đạt 8/8 bài kiểm tra để mở"}
            onClick={configAction.onOpen}
          >
            <SlidersHorizontal aria-hidden="true" />
            {configAction.label}
          </Button>
        )}
        {lesson.kind === "technical" && (
          <Button asChild variant="ghost"><Link to="/chien-luoc?tab=backtest">Mở Backtest</Link></Button>
        )}
        {lesson.kind === "fundamental" && (
          <Button asChild variant="ghost"><Link to="/chien-luoc?tab=bo-loc">Mở Bộ lọc</Link></Button>
        )}
        {VALIDATION_LESSONS.has(lesson.id) && (
          <Button asChild variant="ghost"><Link to="/chien-luoc?tab=backtest">Thực hành kiểm định</Link></Button>
        )}
        {nextLessonId && (
          <Button asChild variant="ghost" className="ml-auto">
            <Link to={`/hoc-vien/${nextLessonId}`}>Bài tiếp theo <ArrowRight aria-hidden="true" /></Link>
          </Button>
        )}
      </div>
    </article>
  )
}
