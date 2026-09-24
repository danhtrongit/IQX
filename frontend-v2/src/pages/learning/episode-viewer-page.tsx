import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileQuestion,
  List,
  LoaderCircle,
  LogIn,
  Trophy,
  UserPlus,
  X,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { PREMIUM_UPGRADE_PATH } from "@/pages/market-workspace/components/premium-gate"

import { EpisodeTypeIcon } from "./components/episode-type-icon"
import { VideoPlayer } from "./components/video-player"
import { CONTENT_TYPE_LABEL } from "./constants"
import { formatDuration } from "./format"
import { useCourse, useEpisodeContent, useMyProgress, useTrackProgress } from "./hooks"

const MarkdownViewer = lazy(() => import("./components/markdown-viewer").then(module => ({ default: module.MarkdownViewer })))
const PdfViewer = lazy(() => import("./components/pdf-viewer").then(module => ({ default: module.PdfViewer })))

type GateReason = "unauthenticated" | "premium" | "missing" | "failed"

/** Đọc lý do cổng chặn từ lỗi của endpoint nội dung bài học. */
function gateReason(error: unknown): GateReason {
  if (error instanceof ApiError) {
    if (error.status === 401) return "unauthenticated"
    if (error.status === 403) return "premium"
    if (error.status === 404) return "missing"
  }
  return "failed"
}

/** Thẻ cổng chặn — một biểu tượng, một lý do, các nút hành động. */
function GateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-lg bg-card px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{children}</div>
    </div>
  )
}

/** Cổng đăng nhập — dùng cho khách vãng lai và cho phiên đã hết hạn (401). */
function LoginGateCard() {
  const { openAuth } = useAuth()
  return (
    <WorkspacePage
      title="Bài học"
      scroll={false}
      contentClassName="flex-1 items-center justify-center p-6"
    >
      <GateCard
        icon={<LogIn aria-hidden="true" className="size-5" />}
        title="Đăng nhập để xem bài học"
        description="Bạn cần đăng nhập để truy cập nội dung này."
      >
        <Button onClick={() => openAuth("login")}>
          <LogIn aria-hidden="true" />
          Đăng nhập
        </Button>
        <Button variant="outline" onClick={() => openAuth("register")}>
          <UserPlus aria-hidden="true" />
          Đăng ký
        </Button>
      </GateCard>
    </WorkspacePage>
  )
}

/** Trình xem bài học `/bai-hoc/:slug/:episodeId`. */
export function EpisodeViewerPage() {
  const { slug, episodeId } = useParams<{ slug: string; episodeId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileListOpen, setMobileListOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: course } = useCourse(slug)
  const {
    data: content,
    isPending,
    isError,
    error,
    refetch,
  } = useEpisodeContent(episodeId, isAuthenticated)
  const { data: progressRows } = useMyProgress(course?.id)
  const trackProgress = useTrackProgress(course?.id)

  const completedIds = useMemo(
    () => new Set((progressRows ?? []).filter((row) => row.completedAt).map((row) => row.episodeId)),
    [progressRows],
  )

  const episodes = course?.episodes ?? []
  const isCompleted = !!episodeId && completedIds.has(episodeId)
  const resumePosition = (progressRows ?? []).find((row) => row.episodeId === episodeId)
    ?.lastPositionSeconds

  const currentIndex = episodes.findIndex((episode) => episode.id === episodeId)
  const previousEpisode = currentIndex > 0 ? episodes[currentIndex - 1] : null
  const nextEpisode =
    currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null

  // Video báo vị trí mỗi 10 giây; gộp thêm 500ms để một lần tua nhanh không tạo
  // nhiều lệnh lưu liên tiếp.
  const handleVideoProgress = useCallback(
    (seconds: number) => {
      if (!episodeId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        trackProgress.mutate({ episodeId, payload: { lastPositionSeconds: seconds } })
      }, 500)
    },
    [episodeId, trackProgress],
  )

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const markComplete = () => {
    if (!episodeId) return
    trackProgress.mutate(
      { episodeId, payload: { completed: true } },
      {
        onSuccess: () => toast.success("Đã đánh dấu hoàn thành!"),
        onError: (mutationError) => toast.error(errorMessage(mutationError)),
      },
    )
  }

  const reason = isError ? gateReason(error) : null

  // Đang khôi phục phiên từ token đã lưu — chưa biết người dùng là ai.
  if (authLoading) {
    return (
      <WorkspacePage title="Bài học" scroll={false} contentClassName="space-y-3 p-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-[60vh] w-full rounded-lg" />
      </WorkspacePage>
    )
  }

  // Khách vãng lai dựng cổng đăng nhập ngay, không gọi API nội dung; phiên hết
  // hạn (401) rơi vào cùng cổng này. Máy chủ vẫn là nơi chặn thật.
  if (!isAuthenticated || reason === "unauthenticated") {
    return <LoginGateCard />
  }

  if (reason === "premium") {
    return (
      <WorkspacePage title="Bài học" scroll={false} contentClassName="flex-1 items-center justify-center p-6">
        <GateCard
          icon={<Trophy aria-hidden="true" className="size-5 text-accent" />}
          title="Khoá học này yêu cầu Premium"
          description="Nâng cấp tài khoản để truy cập toàn bộ nội dung của khoá học."
        >
          <Button onClick={() => navigate(PREMIUM_UPGRADE_PATH)}>
            <Trophy aria-hidden="true" />
            Nâng cấp ngay
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/bai-hoc/${slug}`}>Về khoá học</Link>
          </Button>
        </GateCard>
      </WorkspacePage>
    )
  }

  if (reason === "missing") {
    return (
      <WorkspacePage title="Bài học" scroll={false} contentClassName="flex-1 items-center justify-center p-6">
        <GateCard
          icon={<FileQuestion aria-hidden="true" className="size-5" />}
          title="Không tìm thấy bài học"
          description="Bài học này không tồn tại hoặc đã bị ẩn khỏi khoá học."
        >
          <Button variant="outline" asChild>
            <Link to={`/bai-hoc/${slug}`}>Về khoá học</Link>
          </Button>
        </GateCard>
      </WorkspacePage>
    )
  }

  if (reason === "failed") {
    return (
      <WorkspacePage title="Bài học" scroll={false} contentClassName="p-4">
        <PanelState
          title="Không tải được nội dung bài học"
          description={errorMessage(error)}
          action={{ label: "Thử lại", onClick: () => void refetch() }}
        />
      </WorkspacePage>
    )
  }

  if (isPending || !content) {
    return (
      <WorkspacePage title="Bài học" scroll={false} contentClassName="space-y-3 p-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-[60vh] w-full rounded-lg" />
      </WorkspacePage>
    )
  }

  const episodeList = (
    <ScrollArea className="min-h-0 flex-1">
      <ul>
        {episodes.map((episode) => {
          const isActive = episode.id === episodeId
          const isDone = completedIds.has(episode.id)
          return (
            <li key={episode.id} className="border-b border-border last:border-b-0">
              <Link
                to={`/bai-hoc/${slug}/${episode.id}`}
                onClick={() => setMobileListOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-start gap-2 px-3 py-2.5 transition-colors duration-150 ${isActive ? "bg-primary/10" : "hover:bg-muted/50"}`}
              >
                {isDone ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-price-up" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs font-medium leading-5 ${isActive ? "text-primary" : "text-foreground"}`}>
                    {episode.sortOrder}. {episode.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <EpisodeTypeIcon contentType={episode.contentType} className="size-3" />
                    {CONTENT_TYPE_LABEL[episode.contentType] ?? episode.contentType}
                    {episode.durationSeconds != null && <span className="tabular-nums">· {formatDuration(episode.durationSeconds)}</span>}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )

  return (
    <WorkspacePage
      title={content.title}
      scroll={false}
      contentClassName="gap-0 p-0"
      actions={
        <>
          <Button className="md:hidden" variant="ghost" size="sm" onClick={() => setMobileListOpen(true)}><List aria-hidden />Danh sách bài</Button>
          <Button className="hidden md:inline-flex" variant="ghost" size="sm" onClick={() => setSidebarOpen((open) => !open)}>
            {sidebarOpen ? <X aria-hidden /> : <List aria-hidden />}
            {sidebarOpen ? "Ẩn danh sách" : "Danh sách bài"}
          </Button>
        </>
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/bai-hoc">Bài học</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/bai-hoc/${slug}`}>{course?.title ?? slug}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{content.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {CONTENT_TYPE_LABEL[content.contentType] ?? content.contentType}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <ScrollArea className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:!block">
          <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
            {content.contentType === "video" &&
              (content.fileUrl ? (
                <VideoPlayer
                  src={content.fileUrl}
                  initialPosition={resumePosition}
                  onProgress={handleVideoProgress}
                />
              ) : (
                <PanelState title="Bài học chưa có video" description="Quản trị viên chưa tải tệp video lên bài học này." />
              ))}

            {content.contentType === "pdf" &&
              (content.fileUrl ? (
                <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-lg" />}><PdfViewer key={content.fileUrl} src={content.fileUrl} title={content.title} /></Suspense>
              ) : (
                <PanelState title="Bài học chưa có tài liệu" description="Quản trị viên chưa tải tệp PDF lên bài học này." />
              ))}

            {content.contentType === "text" &&
              (content.markdownBody ? (
                <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}><MarkdownViewer markdown={content.markdownBody} /></Suspense>
              ) : (
                <PanelState title="Bài học chưa có nội dung" description="Quản trị viên chưa soạn nội dung cho bài học này." />
              ))}

            {content.description && (
              <p className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
                {content.description}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              {previousEpisode ? (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/bai-hoc/${slug}/${previousEpisode.id}`)}
                >
                  <ChevronLeft aria-hidden="true" />
                  Bài trước
                </Button>
              ) : (
                <span />
              )}
              {nextEpisode && (
                <Button onClick={() => navigate(`/bai-hoc/${slug}/${nextEpisode.id}`)}>
                  Bài tiếp theo
                  <ChevronRight aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>

        {sidebarOpen && course && (
          <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-card md:flex">
            <div className="shrink-0 border-b border-border px-3 py-2">
              <p className="truncate text-xs font-semibold">{course.title}</p>
              {episodes.length > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {completedIds.size}/{episodes.length} bài hoàn thành
                </p>
              )}
            </div>

            {episodeList}
          </aside>
        )}
      </div>
      <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}>
        <SheetContent side="right" className="flex w-[min(90vw,360px)] flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{course?.title ?? "Danh sách bài"}</SheetTitle>
            <SheetDescription>{completedIds.size}/{episodes.length} bài hoàn thành</SheetDescription>
          </SheetHeader>
          {episodeList}
        </SheetContent>
      </Sheet>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-4 py-2.5">
        <p className="min-w-0 truncate text-xs font-medium">{content.title}</p>

        <Button
          size="sm"
          variant={isCompleted ? "outline" : "default"}
          disabled={isCompleted || trackProgress.isPending}
          title={isCompleted ? "Bài học đã hoàn thành — không thể bỏ đánh dấu" : undefined}
          onClick={markComplete}
        >
          {trackProgress.isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : isCompleted ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <Circle aria-hidden="true" />
          )}
          {isCompleted ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}
        </Button>
      </div>
    </WorkspacePage>
  )
}
