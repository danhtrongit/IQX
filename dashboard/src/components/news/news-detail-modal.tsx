import { Loader2, ExternalLink, Clock, Building2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useNewsArticle } from "@/hooks/use-news"

function getSentimentBadge(sentiment: string | null) {
  if (!sentiment) return null
  const s = sentiment.toLowerCase()
  if (s === "positive")
    return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 text-[10px]">Tích cực</Badge>
  if (s === "negative")
    return <Badge className="bg-red-500/15 text-red-500 border-red-500/20 text-[10px]">Tiêu cực</Badge>
  return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20 text-[10px]">Trung lập</Badge>
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ""
  const d = new Date(dateStr)
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
  const { article, isLoading } = useNewsArticle(open ? slug : null)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Chi tiết tin tức</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !article ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">Không tìm thấy nội dung bài viết</p>
          </div>
        ) : (
          <>
            {/* Hero Image */}
            {article.imageUrl && (
              <div className="relative w-full h-48 overflow-hidden shrink-0">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
              </div>
            )}

            {/* Content */}
            <ScrollArea className="flex-1 max-h-[calc(85vh-12rem)]">
              <div className="px-6 py-4 space-y-4">
                {/* Meta */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {article.ticker && (
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      {article.ticker}
                    </Badge>
                  )}
                  {getSentimentBadge(article.sentiment)}
                  {article.sourceName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3" />
                      {article.sourceName}
                    </span>
                  )}
                  {article.updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDate(article.updatedAt)}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2 className="text-lg font-bold text-foreground leading-tight">
                  {article.title}
                </h2>

                {/* Summary */}
                {article.summary && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground italic leading-relaxed border-l-2 border-primary/40">
                    {article.summary}
                  </div>
                )}

                <Separator />

                {/* Full Content */}
                {article.fullContent ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none 
                      [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_p]:mb-3
                      [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-2
                      [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2
                      [&_ul]:text-sm [&_ul]:space-y-1 [&_ol]:text-sm [&_ol]:space-y-1
                      [&_li]:text-foreground/90
                      [&_strong]:text-foreground [&_strong]:font-semibold
                      [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline
                      [&_img]:rounded-lg [&_img]:my-3
                      [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
                      [&_table]:text-xs [&_table]:w-full
                      [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
                      [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:font-semibold"
                    dangerouslySetInnerHTML={{ __html: article.fullContent }}
                  />
                ) : article.shortContent ? (
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {article.shortContent}
                  </p>
                ) : null}

                {/* Source Link */}
                {article.sourceLink && (
                  <>
                    <Separator />
                    <a
                      href={article.sourceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      Đọc bài viết gốc
                    </a>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
