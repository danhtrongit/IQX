import { useCallback, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { HTTPError } from "ky"
import {
  Breadcrumb,
  Button,
  Message,
  Space,
  Spin,
  Typography,
} from "@arco-design/web-react"
import {
  IconArrowLeft,
  IconBook,
  IconCheckCircleFill,
  IconClose,
  IconLeft,
  IconMenu,
  IconRecordStop,
  IconRight,
  IconTrophy,
  IconUser,
  IconUserAdd,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { VideoPlayer } from "./components/VideoPlayer"
import { PdfViewer } from "./components/PdfViewer"
import { TextViewer } from "./components/TextViewer"
import { useCourse, useEpisodeContent, useMyProgress, useTrackProgress } from "./hooks"
import { CONTENT_TYPE_ICON } from "./constants"

type GateReason = "unauthenticated" | "premium_required"

/** Detect the gate reason from the episode-content query error. */
function resolveGate(error: unknown, isAuthenticated: boolean): GateReason {
  let status = 0
  if (error instanceof HTTPError) {
    status = error.response.status
  } else if (error instanceof Error) {
    if (error.message.includes("401")) status = 401
    else if (error.message.includes("403")) status = 403
  }
  if (status === 401 || !isAuthenticated) return "unauthenticated"
  if (status === 403) return "premium_required"
  // Generic error — treat as premium when logged in, else login gate.
  return isAuthenticated ? "premium_required" : "unauthenticated"
}

export default function EpisodeViewerPage() {
  const { slug, episodeId } = useParams<{ slug: string; episodeId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [localCompleted, setLocalCompleted] = useState<boolean | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: course } = useCourse(slug)
  const {
    data: content,
    isLoading: contentLoading,
    isError: contentError,
    error: contentErr,
  } = useEpisodeContent(episodeId)
  const { data: progressRows } = useMyProgress(course?.id)
  const trackProgress = useTrackProgress(course?.id)

  const completedSet = useMemo(
    () =>
      new Set((progressRows ?? []).filter((r) => r.completedAt).map((r) => r.episodeId)),
    [progressRows],
  )

  const serverCompleted = episodeId ? completedSet.has(episodeId) : false
  const isCompleted = localCompleted ?? serverCompleted

  const resumePosition = useMemo(
    () => (progressRows ?? []).find((r) => r.episodeId === episodeId)?.lastPositionSeconds,
    [progressRows, episodeId],
  )

  // Save video position (debounced).
  const handleVideoProgress = useCallback(
    (sec: number) => {
      if (!episodeId) return
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        trackProgress.mutate({ id: episodeId, payload: { lastPositionSeconds: sec } })
      }, 500)
    },
    [episodeId, trackProgress],
  )

  const handleMarkComplete = () => {
    if (!episodeId) return
    if (isCompleted) {
      // Toggle off — not supported by backend, update locally only.
      setLocalCompleted(false)
      return
    }
    trackProgress.mutate(
      { id: episodeId, payload: { completed: true } },
      {
        onSuccess: () => {
          setLocalCompleted(true)
          Message.success("Đã đánh dấu hoàn thành!")
        },
        onError: () => Message.error("Không thể lưu tiến độ. Thử lại sau."),
      },
    )
  }

  const currentIndex = course?.episodes.findIndex((ep) => ep.id === episodeId) ?? -1
  const prevEpisode = currentIndex > 0 ? course?.episodes[currentIndex - 1] : null
  const nextEpisode =
    currentIndex >= 0 && course && currentIndex < course.episodes.length - 1
      ? course.episodes[currentIndex + 1]
      : null

  // ── Loading ──
  if (contentLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spin />
      </div>
    )
  }

  // ── Gate views ──
  if (contentError) {
    const reason = resolveGate(contentErr, isAuthenticated)

    if (reason === "unauthenticated") {
      return (
        <GateCard
          icon={<IconUser style={{ fontSize: 28, color: "rgb(var(--primary-6))" }} />}
          iconBg="rgb(var(--primary-1))"
          title="Đăng nhập để xem bài học"
          subtitle="Bạn cần đăng nhập để truy cập nội dung này"
          onBack={() => navigate(`/bai-hoc/${slug}`)}
        >
          <Space>
            <Button
              type="primary"
              icon={<IconUser />}
              onClick={() => {
                setAuthModalTab("login")
                setShowAuthModal(true)
              }}
            >
              Đăng nhập
            </Button>
            <Button
              icon={<IconUserAdd />}
              onClick={() => {
                setAuthModalTab("register")
                setShowAuthModal(true)
              }}
            >
              Đăng ký
            </Button>
          </Space>
        </GateCard>
      )
    }

    return (
      <GateCard
        icon={<IconTrophy style={{ fontSize: 28, color: "rgb(245,158,11)" }} />}
        iconBg="rgba(245,158,11,0.12)"
        title="Khoá học này yêu cầu Premium"
        subtitle="Nâng cấp tài khoản để truy cập toàn bộ nội dung"
        onBack={() => navigate(`/bai-hoc/${slug}`)}
      >
        <Button long type="primary" icon={<IconTrophy />} onClick={() => navigate("/nang-cap")}>
          Nâng cấp ngay
        </Button>
      </GateCard>
    )
  }

  if (!content) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Typography.Text type="secondary">Không tìm thấy bài học</Typography.Text>
      </div>
    )
  }

  // ── Main viewer ──
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Breadcrumb + top nav */}
      <div
        className="border-b px-4 py-2 flex items-center gap-2"
        style={{ borderColor: "var(--color-border-2)", background: "var(--color-bg-2)" }}
      >
        <Breadcrumb style={{ fontSize: 12 }}>
          <Breadcrumb.Item onClick={() => navigate("/bai-hoc")} style={{ cursor: "pointer" }}>
            Bài học
          </Breadcrumb.Item>
          <Breadcrumb.Item
            onClick={() => navigate(`/bai-hoc/${slug}`)}
            style={{ cursor: "pointer", maxWidth: 200 }}
          >
            {course?.title ?? slug}
          </Breadcrumb.Item>
          <Breadcrumb.Item>{content.title}</Breadcrumb.Item>
        </Breadcrumb>

        <div className="ml-auto">
          <Button
            size="mini"
            type="text"
            icon={sidebarOpen ? <IconClose /> : <IconMenu />}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? "Ẩn" : "Danh sách"}
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 max-w-5xl mx-auto">
            <Typography.Title heading={5} style={{ marginTop: 0, marginBottom: 16 }}>
              {content.title}
            </Typography.Title>

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
              <Typography.Paragraph
                type="secondary"
                style={{ marginTop: 16, fontSize: 13, lineHeight: 1.7 }}
              >
                {content.description}
              </Typography.Paragraph>
            )}

            {/* Prev / Next navigation */}
            <div
              className="flex items-center justify-between mt-6 pt-4 border-t"
              style={{ borderColor: "var(--color-border-2)" }}
            >
              <div>
                {prevEpisode && (
                  <Button
                    icon={<IconLeft />}
                    onClick={() => navigate(`/bai-hoc/${slug}/${prevEpisode.id}`)}
                  >
                    Bài trước
                  </Button>
                )}
              </div>
              <div>
                {nextEpisode && (
                  <Button
                    onClick={() => navigate(`/bai-hoc/${slug}/${nextEpisode.id}`)}
                  >
                    Bài tiếp theo
                    <IconRight />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: episode list */}
        {sidebarOpen && course && (
          <aside
            className="w-72 border-l flex-col overflow-hidden shrink-0 hidden md:flex"
            style={{ borderColor: "var(--color-border-2)", background: "var(--color-bg-2)" }}
          >
            <div className="px-3 py-2.5 border-b" style={{ borderColor: "var(--color-border-2)" }}>
              <Typography.Text
                style={{ display: "block", fontSize: 12, fontWeight: 600 }}
                ellipsis={{ showTooltip: false }}
              >
                {course.title}
              </Typography.Text>
              {course.episodes.length > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  {completedSet.size}/{course.episodes.length} bài hoàn thành
                </Typography.Text>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--color-border-2)" }}>
              {course.episodes.map((ep) => {
                const isActive = ep.id === episodeId
                const done = completedSet.has(ep.id)
                const Icon = CONTENT_TYPE_ICON[ep.contentType] ?? IconBook

                return (
                  <li key={ep.id} style={{ borderColor: "var(--color-border-2)" }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/bai-hoc/${slug}/${ep.id}`)}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-fill-1)]"
                      style={
                        isActive
                          ? {
                              background: "rgb(var(--primary-1))",
                              borderLeft: "2px solid rgb(var(--primary-6))",
                            }
                          : undefined
                      }
                    >
                      <div className="mt-0.5 shrink-0">
                        {done ? (
                          <IconCheckCircleFill style={{ fontSize: 16, color: "rgb(var(--green-6))" }} />
                        ) : (
                          <IconRecordStop style={{ fontSize: 16, color: "var(--color-text-4)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Typography.Text
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 500,
                            lineHeight: 1.4,
                            color: isActive ? "rgb(var(--primary-6))" : "var(--color-text-1)",
                          }}
                        >
                          {ep.sortOrder}. {ep.title}
                        </Typography.Text>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Icon style={{ fontSize: 12, color: "var(--color-text-3)" }} />
                          {ep.durationSeconds ? (
                            <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                              {Math.floor(ep.durationSeconds / 60)}m
                            </Typography.Text>
                          ) : null}
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
      <div
        className="sticky bottom-0 z-30 border-t px-4 py-2.5 flex items-center justify-between gap-4 backdrop-blur-sm"
        style={{ borderColor: "var(--color-border-2)", background: "var(--color-bg-2)" }}
      >
        <Typography.Text style={{ fontSize: 12, fontWeight: 500 }} ellipsis={{ showTooltip: false }}>
          {content.title}
        </Typography.Text>

        <Button
          size="small"
          type={isCompleted ? "outline" : "primary"}
          status={isCompleted ? "success" : undefined}
          icon={isCompleted ? <IconCheckCircleFill /> : <IconRecordStop />}
          loading={trackProgress.isPending}
          onClick={handleMarkComplete}
        >
          {isCompleted ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}
        </Button>
      </div>
    </div>
  )
}

/* ── Shared gate card ─────────────────────────────────────── */

interface GateCardProps {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  onBack: () => void
  children: React.ReactNode
}

function GateCard({ icon, iconBg, title, subtitle, onBack, children }: GateCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-4 py-24">
      <div
        className="max-w-sm w-full rounded-xl border shadow-2xl p-6 flex flex-col items-center text-center gap-4"
        style={{ borderColor: "var(--color-border-2)", background: "var(--color-bg-2)" }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 56, height: 56, background: iconBg }}
        >
          {icon}
        </div>
        <div>
          <Typography.Text style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
            {title}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
            {subtitle}
          </Typography.Text>
        </div>
        <div className="w-full flex justify-center">{children}</div>
        <Button type="text" size="small" icon={<IconArrowLeft />} onClick={onBack}>
          Quay lại khoá học
        </Button>
      </div>
    </div>
  )
}
