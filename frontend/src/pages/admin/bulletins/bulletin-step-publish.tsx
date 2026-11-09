import { useState } from "react"
import { Check, LoaderCircle, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  formatBulletinDate,
  formatBulletinDateTime,
  formatBulletinTime,
} from "@/pages/market-workspace/market/bulletin-format"
import { ConfirmDialog } from "@/pages/strategy/confirm-dialog"

import type { AdminBulletinCheck, AdminBulletinDetail } from "./bulletin-admin-api"
import { usePublishBulletin, useUnpublishBulletin } from "./bulletin-admin-hooks"
import { StepCard } from "./bulletin-step-card"

const PUBLISHED_NOTICE = "Đã Public: bản tin lên tab Bản tin. Máy tính thấy bản máy tính, điện thoại thấy bản điện thoại."

const HISTORY_LABEL = { publish: "Public", republish: "Public lại", unpublish: "Gỡ khỏi web" } as const

function CheckRow({ item }: { item: AdminBulletinCheck }) {
  const Icon = item.level === "error" ? X : item.level === "warn" ? TriangleAlert : Check
  const tone =
    item.level === "error" ? "text-destructive" : item.level === "warn" ? "text-status-warning" : "text-status-success"
  const label = item.level === "error" ? "Lỗi" : item.level === "warn" ? "Lưu ý" : "Thông tin"
  return (
    <li className="flex items-start gap-2 text-sm leading-5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      <span className={cn(item.level === "info" && "text-muted-foreground")}>{item.message}</span>
    </li>
  )
}

function statusText(detail: AdminBulletinDetail): string {
  if (detail.status === "public") {
    const parts = [`Đang trên web · Public ${detail.published_at ? formatBulletinDateTime(detail.published_at) : ""}`.trim()]
    if (detail.updated_at) parts.push(`Cập nhật lúc ${formatBulletinTime(detail.updated_at)}`)
    if (detail.published_by_name) parts.push(`Người thực hiện: ${detail.published_by_name}`)
    return parts.join(" · ")
  }
  if (detail.status === "unpublic") return "Đã gỡ khỏi web. Bản tin phiên này không còn hiện trên web."
  return "Nháp. Chưa lên web."
}

/**
 * Bước 4: kết quả kiểm tra của máy chủ, trạng thái, Public / Public lại / Gỡ khỏi web.
 * `unsavedReason` khác null khi nội dung đang gõ chưa lưu (hoặc gõ sai): chưa cho Public vì
 * máy chủ chỉ Public nội dung đã lưu.
 */
export function BulletinStepPublish({
  detail,
  unsavedReason,
}: {
  detail: AdminBulletinDetail
  unsavedReason: string | null
}) {
  const publish = usePublishBulletin(detail.trade_date)
  const unpublish = useUnpublishBulletin(detail.trade_date)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const isPublic = detail.status === "public"
  const hasErrors = detail.checks.errors > 0
  const canPublish = detail.can_publish && !unsavedReason && (!isPublic || detail.has_changes)

  function runPublish() {
    publish.mutate(undefined, {
      onSuccess: () => toast.success(PUBLISHED_NOTICE),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  function runUnpublish() {
    setConfirmError(null)
    unpublish.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.success(`Đã gỡ bản tin phiên ${formatBulletinDate(detail.trade_date)} khỏi web.`)
      },
      onError: (error) => setConfirmError(errorMessage(error)),
    })
  }

  const explanation = hasErrors
    ? "Sửa hết lỗi đỏ để Public."
    : unsavedReason
      ? unsavedReason
      : isPublic
        ? detail.has_changes
          ? "Có thay đổi chưa lên web. Bấm Public lại bản đã sửa để cập nhật cả bản máy tính và bản điện thoại."
          : PUBLISHED_NOTICE
        : "Public sẽ dựng bản máy tính và bản điện thoại rồi đưa lên tab Bản tin."

  return (
    <StepCard step={4} title="Kiểm tra và Public" tourId="tour-bantin-admin-publish">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold" aria-live="polite">
        <span className={cn(detail.checks.errors > 0 ? "text-destructive" : "text-foreground")}>{detail.checks.errors} lỗi</span>
        <span className={cn(detail.checks.warnings > 0 ? "text-status-warning" : "text-foreground")}>{detail.checks.warnings} lưu ý</span>
      </div>

      <ul className="space-y-2">
        {detail.checks.items.map((item, index) => (
          <CheckRow key={`${item.code}-${index}`} item={item} />
        ))}
      </ul>

      <div className="border border-border bg-muted/40 p-3 text-sm" role="status">
        {statusText(detail)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!canPublish || publish.isPending} onClick={runPublish}>
          {publish.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isPublic ? "Public lại bản đã sửa" : "Public"}
        </Button>
        {isPublic && (
          <Button type="button" variant="outline" disabled={unpublish.isPending} onClick={() => { setConfirmError(null); setConfirmOpen(true) }}>
            Gỡ khỏi web
          </Button>
        )}
      </div>
      <p className={cn("text-xs leading-5", hasErrors ? "text-destructive" : "text-muted-foreground")}>{explanation}</p>

      {detail.history.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">Lịch sử Public</summary>
          <ul className="mt-2 space-y-1">
            {detail.history.slice(-8).reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="tabular-nums">
                {formatBulletinDateTime(entry.at)} · {HISTORY_LABEL[entry.action]}
                {entry.by ? ` · ${entry.by}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Gỡ bản tin khỏi web"
        description={`Bản tin phiên ${formatBulletinDate(detail.trade_date)} sẽ không còn hiện trên web; web hiện bản Public gần nhất trước đó. Các mã đề xuất của bản này thôi được theo dõi.`}
        confirmLabel="Gỡ khỏi web"
        pending={unpublish.isPending}
        error={confirmError}
        onConfirm={runUnpublish}
      />
    </StepCard>
  )
}
