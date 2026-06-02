import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Crown,
  FileText,
  Film,
  LogIn,
  Menu,
  UserPlus,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { lessonsApi, type CourseDetail, type EpisodeContent, type ProgressRow } from "@/lib/api/lessons"
import { useAuth } from "@/contexts/auth-context"
import { VideoPlayer } from "./video-player"
import { PdfViewer } from "./pdf-viewer"
import { TextViewer } from "./text-viewer"

const CONTENT_ICON = {
  pdf: FileText,
  video: Film,
  text: BookOpen,
}

type GateReason = "unauthenticated" | "premium_required"

export default function EpisodeViewerPage() {
  const { slug, episodeId } = useParams<{ slug: string; episodeId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [content, setContent] = useState<EpisodeContent | null>(null)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [gateReason, setGateReason] = useState<GateReason | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const saveProgressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load course + episode content + progress
  useEffect(() => {
    if (!slug || !episodeId) return
    setIsLoading(true)
    setGateReason(null)
    setContent(null)

    const loadAll = async () => {
      // Load course (public) + content (may 401/403)
      const [courseData, contentResult, progressData] = await Promise.allSettled([
        lessonsApi.getCourse(slug),
        lessonsApi.getEpisodeContent(episodeId),
        isAuthenticated
          ? lessonsApi.getMyProgress("").catch(() => [] as ProgressRow[])
          : Promise.resolve([] as ProgressRow[]),
      ])

      if (courseData.status === "fulfilled") {
        setCourse(courseData.value)
        // Reload progress with correct course id
        if (isAuthenticated) {
          try {
            const rows = await lessonsApi.getMyProgress(courseData.value.id)
            setProgress(rows)
            const myRow = rows.find((r) => r.episodeId === episodeId)
            setIsCompleted(!!myRow?.completedAt)
          } catch {
            // ignore
          }
        }
      }

      if (contentResult.status === "fulfilled") {
        setContent(contentResult.value)
        setGateReason(null)
      } else {
        // Detect 401 vs 403
        const err = contentResult.reason as any
        const status =
          err?.response?.status ??
          (String(err?.message).includes("401") ? 401 : String(err?.message).includes("403") ? 403 : 0)
        if (status === 401 || !isAuthenticated) {
          setGateReason("unauthenticated")
        } else if (status === 403) {
          setGateReason("premium_required")
        } else {
          // generic error — treat as unauthenticated if not logged in
          setGateReason(isAuthenticated ? "premium_required" : "unauthenticated")
        }
      }

      if (progressData.status === "fulfilled" && isAuthenticated) {
        // already handled above
      }
    }

    loadAll().finally(() => setIsLoading(false))
  }, [slug, episodeId, isAuthenticated])

  // Save video position (debounced)
  const handleVideoProgress = useCallback(
    (sec: number) => {
      if (!episodeId) return
      if (saveProgressTimeout.current) clearTimeout(saveProgressTimeout.current)
      saveProgressTimeout.current = setTimeout(() => {
        lessonsApi.saveProgress(episodeId, { lastPositionSeconds: sec }).catch(() => {})
      }, 500)
    },
    [episodeId]
  )

  const handleMarkComplete = async () => {
    if (!episodeId) return
    if (isCompleted) {
      // Toggle off — not supported by backend, just update local
      setIsCompleted(false)
      return
    }
    try {
      await lessonsApi.saveProgress(episodeId, { completed: true })
      setIsCompleted(true)
      toast.success("Đã đánh dấu hoàn thành!", {
        icon: "✅",
      })
    } catch {
      toast.error("Không thể lưu tiến độ. Thử lại sau.")
    }
  }

  const currentEpisodeIndex = course?.episodes.findIndex((ep) => ep.id === episodeId) ?? -1
  const prevEpisode = currentEpisodeIndex > 0 ? course?.episodes[currentEpisodeIndex - 1] : null
  const nextEpisode =
    currentEpisodeIndex >= 0 && course && currentEpisodeIndex < course.episodes.length - 1
      ? course.episodes[currentEpisodeIndex + 1]
      : null

  const resumePosition = progress.find((r) => r.episodeId === episodeId)?.lastPositionSeconds

  // ── Gate views ──

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  if (gateReason === "unauthenticated") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-xl border border-border bg-card/95 shadow-2xl p-6 flex flex-col items-center text-center gap-4">
            <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn className="size-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Đăng nhập để xem bài học
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Bạn cần đăng nhập để truy cập nội dung này
              </p>
            </div>
            <div className="w-full grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  setAuthModalTab("login")
                  setShowAuthModal(true)
                }}
              >
                <LogIn className="size-3.5" />
                Đăng nhập
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => {
                  setAuthModalTab("register")
                  setShowAuthModal(true)
                }}
              >
                <UserPlus className="size-3.5" />
                Đăng ký
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate(`/bai-hoc/${slug}`)}
            >
              <ArrowLeft className="size-3.5 mr-1.5" />
              Quay lại khoá học
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (gateReason === "premium_required") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-xl border border-border bg-card/95 shadow-2xl p-6 flex flex-col items-center text-center gap-4">
            <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="size-7 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Khoá học này yêu cầu Premium
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Nâng cấp tài khoản để truy cập toàn bộ nội dung
              </p>
            </div>
            <Button
              className="w-full gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-none"
              onClick={() => navigate("/nang-cap")}
            >
              <Crown className="size-4" />
              Nâng cấp ngay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate(`/bai-hoc/${slug}`)}
            >
              <ArrowLeft className="size-3.5 mr-1.5" />
              Quay lại khoá học
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Không tìm thấy bài học</p>
        </div>
      </div>
    )
  }

  const completedEpisodeIds = new Set(progress.filter((r) => r.completedAt).map((r) => r.episodeId))

  // ── Main viewer ──
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />

      {/* Breadcrumb + top nav */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate("/bai-hoc")}
          className="hover:text-foreground transition-colors"
        >
          Bài học
        </button>
        <ChevronRight className="size-3 shrink-0" />
        <button
          type="button"
          onClick={() => navigate(`/bai-hoc/${slug}`)}
          className="hover:text-foreground transition-colors max-w-[200px] truncate"
        >
          {course?.title ?? slug}
        </button>
        <ChevronRight className="size-3 shrink-0" />
        <span className="text-foreground font-medium max-w-[200px] truncate">
          {content.title}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 px-2"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? <X className="size-3" /> : <Menu className="size-3" />}
            <span className="hidden sm:inline">{sidebarOpen ? "Ẩn" : "Danh sách"}</span>
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {/* Viewer */}
          <div className="p-4 max-w-5xl mx-auto">
            <h1 className="text-lg font-semibold text-foreground mb-4">{content.title}</h1>

            {content.contentType === "video" && content.fileUrl && (
              <VideoPlayer
                src={content.fileUrl}
                initialPosition={resumePosition}
                onProgress={handleVideoProgress}
              />
            )}

            {content.contentType === "pdf" && content.fileUrl && (
              <PdfViewer src={content.fileUrl} />
            )}

            {content.contentType === "text" && content.markdownBody && (
              <TextViewer markdown={content.markdownBody} />
            )}

            {content.description && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                {content.description}
              </p>
            )}

            {/* Prev / Next navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <div>
                {prevEpisode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(`/bai-hoc/${slug}/${prevEpisode.id}`)}
                  >
                    <ChevronLeft className="size-3.5" />
                    Bài trước
                  </Button>
                )}
              </div>
              <div>
                {nextEpisode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(`/bai-hoc/${slug}/${nextEpisode.id}`)}
                  >
                    Bài tiếp theo
                    <ChevronRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: episode list */}
        {sidebarOpen && course && (
          <aside className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden shrink-0 hidden md:flex">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-foreground truncate">{course.title}</p>
              {course.episodes.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {completedEpisodeIds.size}/{course.episodes.length} bài hoàn thành
                </p>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-border">
              {course.episodes.map((ep) => {
                const isActive = ep.id === episodeId
                const done = completedEpisodeIds.has(ep.id)
                const Icon = CONTENT_ICON[ep.contentType] ?? BookOpen

                return (
                  <li key={ep.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/bai-hoc/${slug}/${ep.id}`)}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                        isActive && "bg-primary/10 border-l-2 border-primary"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {done ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-xs font-medium leading-snug line-clamp-2",
                            isActive ? "text-primary" : "text-foreground"
                          )}
                        >
                          {ep.sortOrder}. {ep.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Icon className="size-3 text-muted-foreground" />
                          {ep.durationSeconds && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.floor(ep.durationSeconds / 60)}m
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>

      {/* Bottom sticky bar: mark complete */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{content.title}</span>
        </div>

        <Button
          size="sm"
          variant={isCompleted ? "outline" : "default"}
          className={cn(
            "gap-1.5",
            isCompleted && "text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
          )}
          onClick={handleMarkComplete}
        >
          <CheckCircle2 className="size-3.5" />
          {isCompleted ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}
        </Button>
      </div>
    </div>
  )
}
