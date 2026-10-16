import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime, formatNumber } from "@/lib/format"

import type { AcademyLessonStatus, AcademyProgress } from "../api"
import type { StatusTone } from "../labels"
import { StatusBadge } from "./status-badge"

const LESSON_STATUS: Record<AcademyLessonStatus, { label: string; tone: StatusTone }> = {
  completed: { label: "Hoàn thành", tone: "success" },
  in_progress: { label: "Đang học", tone: "info" },
  failed: { label: "Chưa đạt", tone: "warning" },
  not_started: { label: "Chưa học", tone: "neutral" },
}

function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

function SummaryTile({ label, value, hint, progress }: { label: string; value: string; hint?: string; progress?: number }) {
  return (
    <Card size="sm" className="gap-0 py-3 ring-1 ring-border/60 ring-inset dark:ring-0">
      <CardContent className="min-w-0 space-y-1">
        <p className="text-[11px] leading-4 font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="font-heading text-base leading-6 font-semibold break-words tabular-nums">{value}</p>
        {progress !== undefined && <Progress value={progress} aria-label={`${label}: ${progress}%`} />}
        {hint && <p className="text-xs leading-4 text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * Tab Học viện (admin spec v1.1 §5.1.4), dùng chung cho quản trị viên và trưởng nhóm. Chỉ
 * hiện các chương đã phát hành mà máy chủ trả về. Catalog hiện tại không có bài thi cuối
 * chương nên ô và dòng bài thi chỉ hiện khi `chapterExams.total > 0`.
 */
export function UserAcademyTab({ academy }: { academy: AcademyProgress | null }) {
  if (!academy) {
    return <p className="rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/60 ring-inset dark:ring-0">Chưa có dữ liệu Học viện cho người dùng này.</p>
  }

  const hasExams = academy.chapterExams.total > 0
  const current = academy.currentLesson
  const currentLabel = !academy.started ? "Chưa bắt đầu" : academy.allDone ? "Đã hoàn thành các chương hiện có" : (current?.label ?? "—")
  const openChapter = current?.chapter ?? academy.chapters.find((chapter) => chapter.completed < chapter.total)?.no ?? academy.chapters[0]?.no

  return (
    <div className="space-y-4">
      <div className={hasExams ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-3 sm:grid-cols-3"}>
        <SummaryTile
          label="Bài đã hoàn thành"
          value={`${formatNumber(academy.completed)}/${formatNumber(academy.total)}`}
          progress={percent(academy.completed, academy.total)}
        />
        {hasExams && (
          <SummaryTile
            label="Bài thi cuối chương đã đạt"
            value={`${formatNumber(academy.chapterExams.passed)}/${formatNumber(academy.chapterExams.total)}`}
          />
        )}
        <SummaryTile label="Bài đang học" value={currentLabel} />
        <SummaryTile
          label="Lần hoàn thành gần nhất"
          value={academy.lastCompletion ? formatDateTime(academy.lastCompletion.completedAt) : "—"}
          hint={`${academy.lastCompletion ? `${academy.lastCompletion.label} · ` : ""}Xu từ học tập: ${formatNumber(academy.learningCoins)}`}
        />
      </div>

      {academy.chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có chương nào được phát hành.</p>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={openChapter !== undefined ? [String(openChapter)] : []}
          className="rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0"
        >
          {academy.chapters.map((chapter) => (
            <AccordionItem key={chapter.no} value={String(chapter.no)}>
              <AccordionTrigger className="px-3">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-medium">
                    Chương {chapter.no} · {chapter.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <Progress value={percent(chapter.completed, chapter.total)} className="w-24" aria-hidden="true" />
                    <span className="tabular-nums">
                      {chapter.completed}/{chapter.total} bài
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">Bài</TableHead>
                      <TableHead scope="col">Trạng thái</TableHead>
                      <TableHead scope="col" className="text-right">Số lần làm bài</TableHead>
                      <TableHead scope="col" className="text-right">Kết quả gần nhất</TableHead>
                      <TableHead scope="col">Hoàn thành lúc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chapter.lessons.map((lesson) => (
                      <TableRow key={lesson.lessonId} aria-current={lesson.isCurrent ? "step" : undefined}>
                        <TableCell className="whitespace-normal">
                          <span className="text-muted-foreground tabular-nums">Bài {lesson.order}:</span> {lesson.name}
                          {lesson.isCurrent && <span className="ml-2 text-xs font-medium text-primary">Bài đang học</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={lesson.status} label={LESSON_STATUS[lesson.status].label} tone={LESSON_STATUS[lesson.status].tone} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lesson.completionMode === "quiz" ? formatNumber(lesson.attempts) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lesson.latestScore !== null && lesson.maxScore !== null ? `${lesson.latestScore}/${lesson.maxScore}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">{lesson.completedAt ? formatDateTime(lesson.completedAt) : <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}
