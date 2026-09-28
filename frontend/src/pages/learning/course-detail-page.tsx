import { useMemo } from "react"
import { BookOpen, CheckCircle2, Circle, Clock, Lock, Play, Trophy } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage, ApiError } from "@/lib/api"

import { EpisodeTypeIcon } from "./components/episode-type-icon"
import { CONTENT_TYPE_LABEL, LEVEL_LABEL } from "./constants"
import { formatDuration } from "./format"
import { useCourse, useMyProgress } from "./hooks"
import type { EpisodeBrief } from "./types"

/** Chi tiết khoá học `/bai-hoc/:slug` — công khai; mở bài học cần đăng nhập. */
export function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, openAuth } = useAuth()

  const { data: course, isPending, isError, error, refetch } = useCourse(slug)
  const { data: progressRows } = useMyProgress(course?.id)

  const completedIds = useMemo(
    () => new Set((progressRows ?? []).filter((row) => row.completedAt).map((row) => row.episodeId)),
    [progressRows],
  )

  const episodes = course?.episodes ?? []
  const completedCount = completedIds.size
  const totalCount = episodes.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  /** Bài chưa học đầu tiên, hoặc bài đầu tiên khi đã học hết. */
  const resumeEpisode = episodes.find((episode) => !completedIds.has(episode.id)) ?? episodes[0]

  const openEpisode = (episode: EpisodeBrief) => {
    if (!isAuthenticated) {
      toast.info("Đăng nhập để xem bài học")
      openAuth("login")
      return
    }
    navigate(`/bai-hoc/${slug}/${episode.id}`)
  }

  const startLabel =
    completedCount > 0 && completedCount < totalCount
      ? "Tiếp tục học"
      : completedCount === totalCount && totalCount > 0
        ? "Học lại"
        : "Bắt đầu học"

  return (
    <WorkspacePage
      title={course?.title ?? "Khoá học"}
      actions={
        course && (
          <Button disabled={totalCount === 0} onClick={() => resumeEpisode && openEpisode(resumeEpisode)}>
            <Play aria-hidden="true" />
            {startLabel}
          </Button>
        )
      }
    >
      {isError ? (
        <PanelState
          title="Không tìm thấy khoá học"
          description={errorMessage(error)}
          action={
            error instanceof ApiError && error.status === 404
              ? { label: "Về danh mục", onClick: () => navigate("/bai-hoc") }
              : { label: "Thử lại", onClick: () => void refetch() }
          }
        />
      ) : isPending || !course ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/bai-hoc">Bài học</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{course.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted lg:w-[420px]">
              {course.thumbnailUrl ? (
                <img src={course.thumbnailUrl} alt={course.title} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center" aria-hidden="true">
                  <BookOpen className="size-10 text-muted-foreground/50" />
                </div>
              )}
              {course.isPremium && (
                <Badge variant="gold" className="absolute top-2 right-2">
                  <Trophy aria-hidden="true" />
                  Premium
                </Badge>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
                {!course.isPremium && <Badge variant="secondary">Miễn phí</Badge>}
                <Badge variant="ghost">{course.category}</Badge>
              </div>

              {course.description && (
                <p className="text-sm leading-6 text-muted-foreground">{course.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <BookOpen aria-hidden="true" className="size-3.5" />
                  {course.totalEpisodes} bài học
                </span>
                {course.totalDurationSeconds > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Clock aria-hidden="true" className="size-3.5" />
                    {formatDuration(course.totalDurationSeconds)}
                  </span>
                )}
              </div>

              {isAuthenticated && totalCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tiến độ học</span>
                    <span className="font-semibold tabular-nums">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {completedCount} / {totalCount} bài đã hoàn thành
                  </p>
                </div>
              )}
            </div>
          </div>

          <section className="overflow-hidden rounded-lg bg-card">
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="font-heading text-sm font-semibold">
                Danh sách bài học ({totalCount})
              </h2>
              {isAuthenticated && totalCount > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {completedCount}/{totalCount} hoàn thành
                </span>
              )}
            </header>

            {totalCount === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                Khoá học chưa có bài học nào
              </p>
            ) : (
              <ul>
                {episodes.map((episode) => {
                  const isCompleted = completedIds.has(episode.id)
                  return (
                    <li key={episode.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => openEpisode(episode)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center">
                          {isAuthenticated ? (
                            isCompleted ? (
                              <CheckCircle2 aria-hidden="true" className="size-4 text-price-up" />
                            ) : (
                              <Circle aria-hidden="true" className="size-4 text-muted-foreground/60" />
                            )
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">
                              {episode.sortOrder}
                            </span>
                          )}
                        </span>

                        <EpisodeTypeIcon
                          contentType={episode.contentType}
                          className="size-4 shrink-0 text-muted-foreground"
                        />

                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-medium ${
                              isCompleted ? "text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {episode.title}
                          </span>
                          {episode.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {episode.description}
                            </span>
                          )}
                        </span>

                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                          {CONTENT_TYPE_LABEL[episode.contentType] ?? episode.contentType}
                        </span>
                        {episode.durationSeconds != null && (
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatDuration(episode.durationSeconds)}
                          </span>
                        )}
                        {!isAuthenticated && (
                          <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </WorkspacePage>
  )
}
