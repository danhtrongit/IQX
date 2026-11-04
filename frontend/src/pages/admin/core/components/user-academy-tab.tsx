import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime, formatNumber } from "@/lib/format"

import type { AcademyConfigInfo, AcademyLessonStatus, AcademyProgress } from "../api"
import type { StatusTone } from "../labels"
import { StatusBadge } from "./status-badge"

const LESSON_STATUS: Record<AcademyLessonStatus, { label: string; tone: StatusTone }> = {
  completed: { label: "Hoàn thành", tone: "success" },
  in_progress: { label: "Đang học", tone: "info" },
  failed: { label: "Chưa đạt", tone: "warning" },
  not_started: { label: "Chưa học", tone: "neutral" },
  locked: { label: "Chưa mở", tone: "neutral" },
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

const CONFIG_SOURCE: Record<AcademyConfigInfo["source"], string> = {
  default: "Cấu hình mặc định",
  leader: "Cấu hình của nhóm",
  admin: "Quản trị viên: đủ chương, học tự do",
}

/** "Cấu hình mặc định · Học tự do · 11/12 chương": the config that applies to this user (v4.1 §1.1). */
function configLine(config: AcademyConfigInfo): string {
  const mode = config.mode === "sequential" ? "Học lần lượt" : "Học tự do"
  const parts = config.source === "admin" ? [CONFIG_SOURCE.admin] : [CONFIG_SOURCE[config.source], mode, `${config.chapterCount}/${config.chapterTotal} chương`]
  return parts.join(" · ")
}

/**
 * Tab Học viện (admin spec v1.1 §5.1.4, Học viện v4.1 §8.4), dùng chung cho quản trị viên và trưởng nhóm. Hiện các
 * chương trong cấu hình Học viện của chính người dùng đó, theo số chương đã đánh lại của họ ("Chương 2 · Thương hiệu
 * cá nhân"), kèm tên chương. Chương đã bị bỏ khỏi cấu hình nhưng người dùng từng học nằm riêng ở cuối, ghi rõ là
 * không tính vào tiến độ. Mỗi chương có một dòng "Bài thi Chương c" (n/20 hoặc n/30) và một dòng Phòng tập thực chiến
 * tự chọn, không tính vào tổng bài học.
 */
export function UserAcademyTab({ academy }: { academy: AcademyProgress | null }) {
  if (!academy) {
    return <p className="rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/60 ring-inset dark:ring-0">Chưa có dữ liệu Học viện cho người dùng này.</p>
  }

  const hasExams = academy.chapterExams.total > 0
  const current = academy.currentLesson
  const currentLabel = !academy.started ? "Chưa bắt đầu" : academy.allDone ? "Đã hoàn thành các chương hiện có" : (current?.label ?? "—")
  const openChapter =
    current?.chapterId ??
    academy.chapters.find((chapter) => chapter.inProgram && chapter.completed < chapter.total)?.chapterId ??
    academy.chapters[0]?.chapterId

  return (
    <div className="space-y-4">
      <p data-academy-config className="text-sm text-muted-foreground">
        {configLine(academy.config)}
      </p>
      <div className={hasExams ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-3 sm:grid-cols-3"}>
        <SummaryTile
          label="Bài đã hoàn thành"
          value={`${formatNumber(academy.completed)} / ${formatNumber(academy.total)}`}
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
        <p className="text-sm text-muted-foreground">Cấu hình Học viện của người dùng này chưa có chương nào.</p>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={openChapter !== undefined ? [openChapter] : []}
          className="rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0"
        >
          {academy.chapters.map((chapter) => (
            <AccordionItem key={chapter.chapterId} value={chapter.chapterId} data-in-program={chapter.inProgram}>
              <AccordionTrigger className="px-3">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className={chapter.inProgram ? "font-medium" : "font-medium text-muted-foreground"}>
                    {chapter.displayNo !== null ? `Chương ${chapter.displayNo} · ${chapter.title}` : chapter.title}
                  </span>
                  {!chapter.inProgram && <Badge variant="outline">Đã bỏ khỏi cấu hình</Badge>}
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <Progress value={percent(chapter.completed, chapter.total)} className="w-24" aria-hidden="true" />
                    <span className="tabular-nums">
                      {chapter.completed}/{chapter.total} bài
                    </span>
                    {!chapter.inProgram && <span>Không tính vào tiến độ</span>}
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
                          {lesson.kind === "lesson" && <span className="text-muted-foreground tabular-nums">Bài {lesson.order}:</span>}{" "}
                          {lesson.name}
                          {lesson.optional && (
                            <Badge variant="outline" className="ml-2">
                              Tự chọn
                            </Badge>
                          )}
                          {lesson.isCurrent && <span className="ml-2 text-xs font-medium text-primary">Bài đang học</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={lesson.status} label={LESSON_STATUS[lesson.status].label} tone={LESSON_STATUS[lesson.status].tone} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(lesson.attempts)}
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
