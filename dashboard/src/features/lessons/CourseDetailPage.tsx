import { useMemo } from "react"
import { useNavigate, useParams } from "react-router"
import {
  Breadcrumb,
  Button,
  Message,
  Progress,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react"
import {
  IconArrowLeft,
  IconBook,
  IconCheckCircleFill,
  IconClockCircle,
  IconLock,
  IconPlayCircle,
  IconRecordStop,
  IconTrophy,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { fmtDuration } from "@/shared/lib/format"
import { cn } from "@/shared/lib/cn"
import { useCourse, useMyProgress } from "./hooks"
import {
  CONTENT_TYPE_ICON,
  LEVEL_LABEL,
  LEVEL_TAG_COLOR,
  getGradient,
} from "./constants"
import type { EpisodeBrief } from "./types"

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()

  const { data: course, isLoading, isError } = useCourse(slug)
  const { data: progressRows } = useMyProgress(course?.id)

  const completedSet = useMemo(
    () =>
      new Set((progressRows ?? []).filter((r) => r.completedAt).map((r) => r.episodeId)),
    [progressRows],
  )

  const completedCount = completedSet.size
  const totalCount = course?.episodes.length ?? 0
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  /** First unwatched, or first episode. */
  const firstEpisode =
    course?.episodes.find((ep) => !completedSet.has(ep.id)) ?? course?.episodes[0]

  const handleEpisodeClick = (ep: EpisodeBrief) => {
    if (!isAuthenticated) {
      Message.info({
        content: "Đăng nhập để xem bài học",
      })
      setAuthModalTab("login")
      setShowAuthModal(true)
      return
    }
    navigate(`/bai-hoc/${slug}/${ep.id}`)
  }

  const handleStartLearning = () => {
    if (firstEpisode) handleEpisodeClick(firstEpisode)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spin />
      </div>
    )
  }

  if (isError || !course) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
        <Typography.Text type="secondary">Không tìm thấy khoá học</Typography.Text>
        <Button size="small" icon={<IconArrowLeft />} onClick={() => navigate("/bai-hoc")}>
          Quay lại danh sách
        </Button>
      </div>
    )
  }

  const startLabel =
    completedCount > 0 && completedCount < totalCount
      ? "Tiếp tục học"
      : completedCount === totalCount && totalCount > 0
        ? "Học lại"
        : "Bắt đầu học"

  return (
    <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb style={{ marginBottom: 24 }}>
        <Breadcrumb.Item
          onClick={() => navigate("/bai-hoc")}
          style={{ cursor: "pointer" }}
        >
          Bài học
        </Breadcrumb.Item>
        <Breadcrumb.Item>{course.title}</Breadcrumb.Item>
      </Breadcrumb>

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
                  getGradient(course.slug),
                )}
              >
                <IconBook style={{ fontSize: 56, color: "rgba(255,255,255,0.4)" }} />
              </div>
            )}
            {course.isPremium && (
              <span
                className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-md text-white text-xs font-bold px-2 py-1 backdrop-blur-sm"
                style={{ background: "rgba(245, 158, 11, 0.92)" }}
              >
                <IconTrophy style={{ fontSize: 12 }} />
                Premium
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color={LEVEL_TAG_COLOR[course.level]}>
              {LEVEL_LABEL[course.level] ?? course.level}
            </Tag>
            {!course.isPremium && (
              <Tag color="green" bordered>
                Miễn phí
              </Tag>
            )}
          </div>

          <Typography.Title heading={4} style={{ margin: 0 }}>
            {course.title}
          </Typography.Title>

          {course.description && (
            <Typography.Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}
            >
              {course.description}
            </Typography.Paragraph>
          )}

          {/* Stats */}
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: "var(--color-text-3)" }}
          >
            <span className="flex items-center gap-1.5">
              <IconBook />
              {course.totalEpisodes} bài học
            </span>
            {course.totalDurationSeconds > 0 && (
              <span className="flex items-center gap-1.5">
                <IconClockCircle />
                {fmtDuration(course.totalDurationSeconds)}
              </span>
            )}
          </div>

          {/* Progress (authenticated) */}
          {isAuthenticated && totalCount > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Typography.Text type="secondary">Tiến độ học</Typography.Text>
                <Typography.Text style={{ fontWeight: 600 }}>{progressPercent}%</Typography.Text>
              </div>
              <Progress percent={progressPercent} showText={false} size="small" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {completedCount} / {totalCount} bài đã hoàn thành
              </Typography.Text>
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto pt-2">
            <Button
              type="primary"
              icon={<IconPlayCircle />}
              onClick={handleStartLearning}
              disabled={!course.episodes.length}
            >
              {startLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Episode list */}
      <div
        className="rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--color-border-2)" }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--color-border-2)", background: "var(--color-fill-1)" }}
        >
          <Typography.Text style={{ fontWeight: 600, fontSize: 14 }}>
            Danh sách bài học ({course.episodes.length})
          </Typography.Text>
          {isAuthenticated && totalCount > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {completedCount}/{totalCount} hoàn thành
            </Typography.Text>
          )}
        </div>

        {course.episodes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Typography.Text type="secondary">Khoá học chưa có bài học nào</Typography.Text>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border-2)" }}>
            {course.episodes.map((ep) => {
              const isCompleted = completedSet.has(ep.id)
              const Icon = CONTENT_TYPE_ICON[ep.contentType] ?? IconBook

              return (
                <li
                  key={ep.id}
                  className="divide-border"
                  style={{ borderColor: "var(--color-border-2)" }}
                >
                  <button
                    type="button"
                    onClick={() => handleEpisodeClick(ep)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-fill-1)]"
                  >
                    <div className="shrink-0 size-7 flex items-center justify-center">
                      {isAuthenticated ? (
                        isCompleted ? (
                          <IconCheckCircleFill
                            style={{ fontSize: 18, color: "rgb(var(--green-6))" }}
                          />
                        ) : (
                          <IconRecordStop
                            style={{ fontSize: 18, color: "var(--color-text-4)" }}
                          />
                        )
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                          {ep.sortOrder}
                        </Typography.Text>
                      )}
                    </div>

                    <Icon style={{ color: "var(--color-text-3)", flexShrink: 0 }} />

                    <div className="flex-1 min-w-0">
                      <Typography.Text
                        style={{
                          display: "block",
                          fontWeight: 500,
                          fontSize: 14,
                          color: isCompleted ? "var(--color-text-3)" : "var(--color-text-1)",
                        }}
                      >
                        {ep.title}
                      </Typography.Text>
                      {ep.description && (
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                          ellipsis={{ showTooltip: false }}
                        >
                          {ep.description}
                        </Typography.Text>
                      )}
                    </div>

                    {ep.durationSeconds ? (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12, flexShrink: 0 }}
                      >
                        {fmtDuration(ep.durationSeconds)}
                      </Typography.Text>
                    ) : null}

                    {!isAuthenticated && (
                      <IconLock style={{ color: "var(--color-text-4)", flexShrink: 0 }} />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
