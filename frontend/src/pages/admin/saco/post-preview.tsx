/**
 * Xem bài đúng như trang đọc bài trong khu giao dịch (chủ đề tối + vàng của khu giao dịch),
 * dùng cho Xem trước bài dài, Xem của SACO và Xem của quản trị.
 */
import type { ReactNode } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PostArticle, PostDisclaimer, PostTheme, SacoCard } from "@/pages/trading-floor/posts/post-view"

export function PostPreviewBody({ sacoName, publishedAt, headline, bodyHtml, children }: {
  sacoName: string
  publishedAt: number | null
  headline: string
  bodyHtml: string
  /** Phần thêm dưới thẻ SACO (bình luận, nhật ký…), vẫn trong chủ đề của bài. */
  children?: ReactNode
}) {
  return <PostTheme className="grid gap-[18px] rounded-lg bg-[var(--tfp-panel)] p-4 sm:p-5">
    <PostArticle sacoName={sacoName} publishedAt={publishedAt} headline={headline} bodyHtml={bodyHtml} />
    <SacoCard name={sacoName} onDuty={false} />
    {children}
    <PostDisclaimer />
  </PostTheme>
}

export function PostPreviewDialog({ open, onOpenChange, title, description, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? undefined : "sr-only"}>{description ?? "Bài hiện đúng như trang đọc bài trong khu giao dịch."}</DialogDescription>
      </DialogHeader>
      <div className="-mx-2 min-h-0 overflow-y-auto px-2">{children}</div>
    </DialogContent>
  </Dialog>
}
