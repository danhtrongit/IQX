import { useMemo } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import type { AdminBulletinContent, CommentKey, PreviewVariant } from "./bulletin-admin-api"
import { COMMENT_FIELDS } from "./bulletin-admin-format"
import { useBulletinPreview } from "./bulletin-admin-hooks"
import { sanitizeSvg } from "./bulletin-svg"

const VARIANTS: { id: PreviewVariant; label: string; maxWidth: string }[] = [
  { id: "desktop", label: "Máy tính", maxWidth: "max-w-full" },
  { id: "mobile", label: "Điện thoại", maxWidth: "max-w-[360px]" },
]

/**
 * Xem trước đúng các trang sẽ lên web, do máy chủ dựng bằng cùng bộ vẽ với PDF. Thu theo bề rộng
 * khung và dựng lại ngay khi nội dung đổi (nội dung đã debounce ở nơi gọi). Ô chữ nào tràn khung
 * được báo ngay dưới nút chuyển bản.
 */
export function BulletinPreview({
  date,
  variant,
  onVariantChange,
  content,
}: {
  date: string
  variant: PreviewVariant
  onVariantChange: (variant: PreviewVariant) => void
  content: AdminBulletinContent | null
}) {
  const preview = useBulletinPreview(date, variant, content)
  const data = preview.data
  const pages = useMemo(() => (data ? data.pages.map((page) => ({ ...page, svg: sanitizeSvg(page.svg) })) : []), [data])
  const overflow: CommentKey[] = data?.overflow ?? []
  const frame = VARIANTS.find((item) => item.id === variant) ?? VARIANTS[0]

  return (
    <section aria-label="Xem trước" className="space-y-3" data-tour-id="tour-bantin-admin-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Xem trước</h2>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={variant}
          onValueChange={(next) => next && onVariantChange(next as PreviewVariant)}
          aria-label="Bản xem trước"
        >
          {VARIANTS.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id} aria-label={item.label}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {overflow.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          Chữ vượt khung ở: {overflow.map((key) => COMMENT_FIELDS.find((field) => field.key === key)?.label ?? key).join(", ")}. Hãy rút gọn.
        </p>
      )}

      {content === null ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">Sửa số điểm không hợp lệ để xem trước.</p>
      ) : preview.isPending ? (
        <Skeleton className="aspect-[1123/794] w-full" />
      ) : preview.isError ? (
        <p role="alert" className="border border-border bg-card p-4 text-sm text-destructive">Không thể dựng bản xem trước. Thử lại sau ít phút.</p>
      ) : data && !data.ready ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          Chưa có dữ liệu phiên để dựng bản xem trước. Hệ thống tự điền khi dữ liệu đã chốt.
        </p>
      ) : (
        <div className={cn("space-y-3", preview.isFetching && "opacity-70 transition-opacity")} aria-busy={preview.isFetching}>
          {pages.map((page, index) => (
            <div
              key={index}
              className={cn("mx-auto border border-border bg-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full", frame.maxWidth)}
              role="img"
              aria-label={`Trang ${index + 1} / ${pages.length} của bản xem trước`}
              dangerouslySetInnerHTML={{ __html: page.svg }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
