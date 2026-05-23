import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router"
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Crown,
  FileText,
  Film,
  Lock,
  PlayCircle,
} from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { fmtDuration } from "@/lib/format"
import { lessonsApi, type CourseDetail, type EpisodeBrief, type ProgressRow } from "@/lib/api/lessons"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"

const CONTENT_ICON = {
  pdf: FileText,
  video: Film,
  text: BookOpen,
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

const LEVEL_COLOR: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  advanced: "bg-purple-500/15 text-purple-400 border-purple-500/20",
}

const GRADIENTS = [
  "from-blue-600 to-indigo-700",
  "from-emerald-600 to-teal-700",
  "from-violet-600 to-purple-700",
  "from-rose-600 to-pink-700",
  "from-amber-600 to-orange-700",
]

function getGradient(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return GRADIENTS[hash % GRADIENTS.length]
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setIsLoading(true)
    setError(null)

    lessonsApi
      .getCourse(slug)
      .then(async (data) => {
        setCourse(data)
        // Fetch progress for authenticated users
        if (isAuthenticated) {
          try {
            const rows = await lessonsApi.getMyProgress(data.id)
            setProgress(rows)
          } catch {
            // ignore progress errors
          }
        }
      })
      .catch(() => setError("Không tìm thấy khoá học"))
      .finally(() => setIsLoading(false))
  }, [slug, isAuthenticated])

  const completedSet = new Set(
    progress.filter((r) => r.completedAt).map((r) => r.episodeId)
  )

  const completedCount = completedSet.size
  const totalCount = course?.episodes.length ?? 0
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  /** First unwatched or first episode */
  const firstEpisode =
    course?.episodes.find((ep) => !completedSet.has(ep.id)) ?? course?.episodes[0]

  const handleEpisodeClick = (ep: EpisodeBrief) => {
    if (!isAuthenticated) {
      toast.info("Đăng nhập để xem bài học", {
        action: {
          label: "Đăng nhập",
          onClick: () => {
            setAuthModalTab("login")
            setShowAuthModal(true)
          },
        },
      })
      return
    }
    navigate(`/bai-hoc/${slug}/${ep.id}`)
  }

  const handleStartLearning = () => {
    if (!firstEpisode) return
    handleEpisodeClick(firstEpisode)
  }

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

  if (error || !course) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">{error ?? "Không tìm thấy khoá học"}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/bai-hoc")}>
            <ArrowLeft className="size-3.5 mr-1.5" />
            Quay lại danh sách
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate("/bai-hoc")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Danh sách khoá học
        </button>

        {/* Hero section */}
        <div className="flex flex-col lg:flex-row gap-8 mb-10">
          {/* Thumbnail */}
          <div className="w-full lg:w-[400px] xl:w-[480px] shrink-0">
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg">
              {course.thumbnailUrl ? (
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className={cn(
                    "w-full h-full bg-gradient-to-br flex items-center justify-center",
                    getGradient(course.slug)
                  )}
                >
                  <BookOpen className="size-16 text-white/40" />
                </div>
              )}
              {course.isPremium && (
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 text-white text-xs font-bold px-2 py-1 backdrop-blur-sm">
                    <Crown className="size-3" />
                    Premium
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border",
                  LEVEL_COLOR[course.level] ?? "bg-muted text-muted-foreground border-border"
                )}
              >
                {LEVEL_LABEL[course.level] ?? course.level}
              </span>
              {!course.isPremium && (
                <Badge
                  variant="outline"
                  className="text-xs text-emerald-400 border-emerald-500/30"
                >
                  Miễn phí
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-bold text-foreground leading-snug">
              {course.title}
            </h1>

            {course.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {course.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" />
                {course.totalEpisodes} bài học
              </span>
              {course.totalDurationSeconds > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {fmtDuration(course.totalDurationSeconds)}
                </span>
              )}
            </div>

            {/* Progress (authenticated) */}
            {isAuthenticated && totalCount > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tiến độ học</span>
                  <span className="font-semibold text-foreground">{progressPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedCount} / {totalCount} bài đã hoàn thành
                </p>
              </div>
            )}

            {/* CTA */}
            <div className="mt-auto pt-2">
              <Button
                onClick={handleStartLearning}
                className="gap-2"
                disabled={!course.episodes.length}
              >
                <PlayCircle className="size-4" />
                {completedCount > 0 && completedCount < totalCount
                  ? "Tiếp tục học"
                  : completedCount === totalCount && totalCount > 0
                  ? "Học lại"
                  : "Bắt đầu học"}
              </Button>
            </div>
          </div>
        </div>

        {/* Episode list */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Danh sách bài học ({course.episodes.length})
            </h2>
            {isAuthenticated && totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {completedCount}/{totalCount} hoàn thành
              </span>
            )}
          </div>

          {course.episodes.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Khoá học chưa có bài học nào
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {course.episodes.map((ep) => {
                const isCompleted = completedSet.has(ep.id)
                const Icon = CONTENT_ICON[ep.contentType] ?? BookOpen

                return (
                  <li key={ep.id}>
                    <button
                      type="button"
                      onClick={() => handleEpisodeClick(ep)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors group"
                    >
                      {/* Episode number / check */}
                      <div className="shrink-0 size-7 flex items-center justify-center">
                        {isAuthenticated ? (
                          isCompleted ? (
                            <CheckCircle2 className="size-5 text-emerald-500" />
                          ) : (
                            <Circle className="size-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground font-medium">
                            {ep.sortOrder}
                          </span>
                        )}
                      </div>

                      {/* Icon */}
                      <Icon className="size-4 text-muted-foreground shrink-0" />

                      {/* Title + description */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium transition-colors group-hover:text-foreground",
                            isCompleted ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {ep.title}
                        </p>
                        {ep.description && (
                          <p className="text-xs text-muted-foreground truncate">{ep.description}</p>
                        )}
                      </div>

                      {/* Duration */}
                      {ep.durationSeconds && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {fmtDuration(ep.durationSeconds)}
                        </span>
                      )}

                      {/* Lock for anonymous */}
                      {!isAuthenticated && (
                        <Lock className="size-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
