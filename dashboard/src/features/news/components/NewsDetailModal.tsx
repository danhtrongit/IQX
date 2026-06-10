import { Divider, Modal, Spin, Tag } from "@arco-design/web-react"
import { IconClockCircle, IconLaunch, IconStorage } from "@arco-design/web-react/icon"
import type { ReactNode } from "react"
import { useNewsArticle } from "../hooks"

/** Sentiment → colored Arco Tag. */
function SentimentTag({ sentiment }: { sentiment: string | null }): ReactNode {
  if (!sentiment) return null
  const s = sentiment.toLowerCase()
  if (s === "positive") return <Tag color="green" size="small">Tích cực</Tag>
  if (s === "negative") return <Tag color="red" size="small">Tiêu cực</Tag>
  return <Tag color="gold" size="small">Trung lập</Tag>
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function NewsDetailModal({
  slug,
  open,
  onClose,
}: {
  slug: string | null
  open: boolean
  onClose: () => void
}) {
  // Only fetch while the modal is open.
  const { article, isLoading } = useNewsArticle(open ? slug : null)

  return (
    <Modal
      visible={open}
      onCancel={onClose}
      footer={null}
      title="Chi tiết tin tức"
      style={{ width: 720, maxWidth: "92vw" }}
      autoFocus={false}
      focusLock
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spin />
        </div>
      ) : !article ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-3)]">
          <p className="text-sm">Không tìm thấy nội dung bài viết</p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Hero image */}
          {article.imageUrl && (
            <div className="relative mb-4 h-48 w-full overflow-hidden rounded-lg">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = "none"
                }}
              />
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-3)]">
            {article.ticker && (
              <Tag color="arcoblue" size="small" className="font-bold">
                {article.ticker}
              </Tag>
            )}
            <SentimentTag sentiment={article.sentiment} />
            {article.sourceName && (
              <span className="flex items-center gap-1">
                <IconStorage />
                {article.sourceName}
              </span>
            )}
            {article.updatedAt && (
              <span className="flex items-center gap-1">
                <IconClockCircle />
                {formatDate(article.updatedAt)}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="mt-3 text-lg font-bold leading-tight text-[var(--color-text-1)]">
            {article.title}
          </h2>

          {/* Summary */}
          {article.summary && (
            <div className="mt-3 rounded-lg border-l-2 border-l-[rgb(var(--primary-6))] bg-[var(--color-fill-1)] p-3 text-sm italic leading-relaxed text-[var(--color-text-2)]">
              {article.summary}
            </div>
          )}

          <Divider className="!my-4" />

          {/* Full content (backend returns HTML) or short content fallback */}
          {article.fullContent ? (
            <article
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: article.fullContent }}
            />
          ) : article.shortContent ? (
            <p className="text-sm leading-relaxed text-[var(--color-text-1)]">
              {article.shortContent}
            </p>
          ) : null}

          {/* Source link */}
          {article.sourceLink && (
            <>
              <Divider className="!my-4" />
              <a
                href={article.sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--primary-6))] hover:underline"
              >
                <IconLaunch />
                Đọc bài viết gốc
              </a>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
