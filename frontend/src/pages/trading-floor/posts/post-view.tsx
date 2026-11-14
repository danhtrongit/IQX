/**
 * Phần trình bày dùng chung của SACO nhận định: khung nhận định, thân bài, thẻ SACO và dòng
 * miễn trừ. Dùng ở bảng trượt trong khu giao dịch và ở xem trước của trang quản trị, nên mọi
 * kiểu nằm dưới `.tf-post-theme` (tối + vàng như khu giao dịch) chứ không phụ thuộc `.tf-root`.
 */
import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react"
import { ChevronRight, Heart, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"

import { clampFigureWidth, formatVnTime } from "./format"
import "./post-theme.css"

const POST_DISCLAIMER =
  "Nội dung là góc nhìn cá nhân của SACO, mang tính tham khảo, không phải khuyến nghị mua bán chứng khoán."

/** Nút tim: tô hồng khi đã thả. */
export function HeartButton({
  hearted,
  hearts,
  onToggle,
  disabled,
  className,
}: {
  hearted: boolean
  hearts: number
  onToggle?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn("tf-post-heart", hearted && "tf-post-heart--on", className)}
      aria-pressed={hearted}
      aria-label={hearted ? `Bỏ tim, ${hearts} tim` : `Thả tim, ${hearts} tim`}
      disabled={disabled || !onToggle}
      onClick={(event) => {
        event.stopPropagation()
        onToggle?.()
      }}
    >
      <Heart aria-hidden="true" className="tf-post-heart-icon" />
      <span className="tf-post-heart-count">{hearts}</span>
    </button>
  )
}

/** Khung nhận định theo bảng "Khung nhận định" của spec. */
export function PostCardView({
  sacoName,
  headline,
  hearts,
  hearted,
  fresh,
  onOpen,
  onHeart,
  onMessage,
  className,
}: {
  sacoName: string
  headline: string
  hearts: number
  hearted: boolean
  fresh?: boolean
  onOpen?: () => void
  onHeart?: () => void
  onMessage?: () => void
  className?: string
}) {
  const interactive = !!onOpen
  return (
    <article
      className={cn(
        "tf-post-card",
        interactive && "tf-post-card--interactive",
        fresh && "tf-post-card--fresh",
        className
      )}
      onClick={onOpen}
    >
      <p className="tf-post-card-saco">{sacoName}</p>
      <h3 className="tf-post-card-headline">{headline}</h3>
      <div className="tf-post-card-foot">
        <HeartButton hearted={hearted} hearts={hearts} onToggle={onHeart} />
        <button
          type="button"
          className="tf-post-btn tf-post-btn--outline"
          disabled={!onMessage}
          onClick={(event) => {
            event.stopPropagation()
            onMessage?.()
          }}
        >
          Nhắn SACO
        </button>
        <button
          type="button"
          className="tf-post-read-more"
          disabled={!interactive}
          onClick={(event) => {
            event.stopPropagation()
            onOpen?.()
          }}
        >
          Đọc tiếp
          <ChevronRight aria-hidden="true" className="tf-post-chevron" />
        </button>
      </div>
    </article>
  )
}

/**
 * Thân bài HTML đã được máy chủ lọc (hoặc HTML của trình soạn, vốn bị giới hạn bởi schema).
 * Bề ngang ảnh đọc từ `data-width`; liên kết luôn mở tab mới.
 */
export function PostBody({
  html,
  className,
}: {
  html: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    for (const figure of root.querySelectorAll<HTMLElement>("figure")) {
      figure.style.width = `${clampFigureWidth(figure.getAttribute("data-width"))}%`
    }
    for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      link.target = "_blank"
      link.rel = "noopener noreferrer nofollow"
    }
  }, [html])

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a")
    if (!link) return
    // Chỉ mở liên kết https; mọi thứ khác (javascript:, http:, tương đối) bị chặn.
    if (!/^https:\/\//i.test(link.getAttribute("href") ?? ""))
      event.preventDefault()
  }

  return (
    <div
      ref={ref}
      className={cn("tf-post-body", className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Dòng tác giả, câu tiêu điểm và thân bài, đúng như trang đọc bài. */
export function PostArticle({
  sacoName,
  publishedAt,
  headline,
  bodyHtml,
}: {
  sacoName: string
  publishedAt: number | null
  headline: string
  bodyHtml: string
}) {
  return (
    <div className="tf-post-article">
      <p className="tf-post-author">
        <span className="tf-post-author-name">{sacoName}</span>
        <span className="tf-post-author-time">
          {publishedAt ? `Đăng ${formatVnTime(publishedAt)}` : "Chưa đăng"}
        </span>
      </p>
      <h2 className="tf-post-headline">
        {headline || "(chưa có câu tiêu điểm)"}
      </h2>
      <PostBody html={bodyHtml} />
    </div>
  )
}

/** Thẻ SACO cuối bài với trạng thái trực và nút Nhắn SACO. */
export function SacoCard({
  name,
  onDuty,
  onMessage,
}: {
  name: string
  onDuty: boolean
  onMessage?: () => void
}) {
  return (
    <section className="tf-post-saco-card" aria-label="SACO tác giả">
      <div className="tf-post-saco-card-text">
        <p className="tf-post-saco-card-name">{name}</p>
        <p
          className={cn(
            "tf-post-saco-card-status",
            onDuty && "tf-post-saco-card-status--on"
          )}
        >
          {onDuty ? (
            <>
              <span aria-hidden="true" className="tf-post-dot" />
              Đang trực
            </>
          ) : (
            "Vắng · sẽ trả lời khi quay lại"
          )}
        </p>
      </div>
      <button
        type="button"
        className="tf-post-btn tf-post-btn--gold"
        disabled={!onMessage}
        onClick={onMessage}
      >
        <MessageCircle aria-hidden="true" className="tf-post-btn-icon" />
        Nhắn SACO
      </button>
    </section>
  )
}

export function PostDisclaimer() {
  return <p className="tf-post-disclaimer">{POST_DISCLAIMER}</p>
}

/** Vỏ chủ đề tối + vàng cho phần xem trước bài ở ngoài khu giao dịch (trang quản trị). */
export function PostTheme({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("tf-post-theme", className)}>{children}</div>
}
