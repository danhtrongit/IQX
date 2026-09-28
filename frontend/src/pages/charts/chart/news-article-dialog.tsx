/**
 * Article reader for a chart's news mark. Reads the real article body from
 * `GET /market-data/news/ai/detail/{slug}` (shared fetcher + query key with the
 * demo market panel, so opening the same article twice costs one request).
 */
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Newspaper } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { fetchNewsArticle, marketKeys } from "@/pages/demo-trading/market/market-api"

export function NewsArticleDialog({
  slug,
  onOpenChange,
}: {
  slug: string | null
  onOpenChange: (open: boolean) => void
}) {
  const article = useQuery({
    queryKey: marketKeys.newsArticle(slug ?? ""),
    enabled: !!slug,
    queryFn: ({ signal }) => fetchNewsArticle(slug ?? "", signal),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const data = article.data ?? null

  return (
    <Dialog open={!!slug} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-base leading-6">
            {data?.title ?? "Bài viết"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>{data?.sourceName ?? "—"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(data?.updatedAt)}</span>
            {data?.ticker && <span className="text-price-ref">{data.ticker}</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] min-h-24">
          <div className="space-y-3 pr-3 text-sm leading-6 whitespace-pre-line">
            {article.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            )}
            {article.isError && (
              <p className="text-xs text-muted-foreground">
                {errorMessage(article.error)}
              </p>
            )}
            {!article.isLoading && !article.isError && !data && (
              <p className="text-xs text-muted-foreground">
                Không tìm thấy nội dung bài viết.
              </p>
            )}
            {data?.body && <p>{data.body}</p>}
          </div>
        </ScrollArea>

        {data?.sourceLink && (
          <a
            href={data.sourceLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Mở bài gốc
          </a>
        )}
        {!data?.sourceLink && !article.isLoading && data && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Newspaper className="size-3.5" aria-hidden="true" />
            Nguồn không cung cấp liên kết gốc
          </span>
        )}
      </DialogContent>
    </Dialog>
  )
}
