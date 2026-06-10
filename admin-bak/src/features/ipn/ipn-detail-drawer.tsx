import { useCallback, useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/status-badge"
import { JsonViewer } from "@/components/common/json-viewer"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { fmtDateTime } from "@/lib/format"
import { ipnApi, type IPNLogRow, type IPNLogDetail } from "@/lib/api/ipn"

interface IPNDetailDrawerProps {
  log: IPNLogRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRetried?: () => void
}

function LabeledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

export function IPNDetailDrawer({ log, open, onOpenChange, onRetried }: IPNDetailDrawerProps) {
  const [detail, setDetail] = useState<IPNLogDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryOpen, setRetryOpen] = useState(false)
  const [retryLoading, setRetryLoading] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!log) return
    setLoading(true)
    try {
      const data = await ipnApi.get(log.id)
      setDetail(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể tải chi tiết")
    } finally {
      setLoading(false)
    }
  }, [log])

  useEffect(() => {
    if (open && log) {
      setDetail(null)
      void loadDetail()
    }
  }, [open, log, loadDetail])

  const handleRetry = async () => {
    if (!log) return
    setRetryLoading(true)
    try {
      const result = await ipnApi.retry(log.id)
      toast.success(`Retry hoàn thành: ${result.status}`)
      setRetryOpen(false)
      onRetried?.()
      // Reload detail
      void loadDetail()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry thất bại")
    } finally {
      setRetryLoading(false)
    }
  }

  const canRetry =
    log?.secretKeyValid === true && log?.resultStatus !== "processed"

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Chi tiết IPN Log</SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3">
                <LabeledValue label="Nhận lúc">
                  {fmtDateTime(detail.receivedAt)}
                </LabeledValue>
                <LabeledValue label="Secret Key">
                  <StatusBadge
                    status={detail.secretKeyValid ? "active" : "failed"}
                    label={detail.secretKeyValid ? "Hợp lệ" : "Không hợp lệ"}
                  />
                </LabeledValue>
                <LabeledValue label="Kết quả xử lý">
                  {detail.resultStatus ? (
                    <StatusBadge status={detail.resultStatus} />
                  ) : (
                    "—"
                  )}
                </LabeledValue>
                {detail.sepayTransactionId && (
                  <LabeledValue label="SePay TXN ID">
                    <span className="font-mono text-xs">{detail.sepayTransactionId}</span>
                  </LabeledValue>
                )}
                {detail.matchedOrderId && (
                  <LabeledValue label="Đơn hàng liên kết">
                    <span className="font-mono text-xs">{detail.matchedOrderId}</span>
                  </LabeledValue>
                )}
                {detail.errorMessage && (
                  <div className="col-span-2">
                    <LabeledValue label="Lỗi">
                      <span className="text-red-600">{detail.errorMessage}</span>
                    </LabeledValue>
                  </div>
                )}
              </div>

              {/* Retry button */}
              {canRetry && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRetryOpen(true)}
                    disabled={retryLoading}
                  >
                    <RotateCcw className="size-3.5 mr-1.5" />
                    Retry IPN
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Thử xử lý lại IPN này
                  </p>
                </div>
              )}

              {/* Raw headers */}
              {detail.rawHeaders && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Raw Headers</p>
                  <JsonViewer data={detail.rawHeaders} maxHeight="200px" />
                </div>
              )}

              {/* Raw body */}
              {detail.rawBody && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Raw Body</p>
                  <JsonViewer data={detail.rawBody} maxHeight="400px" />
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={retryOpen}
        onOpenChange={setRetryOpen}
        title="Retry IPN"
        description="Thử xử lý lại IPN log này? Một log mới sẽ được tạo để lưu kết quả."
        confirmLabel={retryLoading ? "Đang xử lý..." : "Retry"}
        onConfirm={handleRetry}
      />
    </>
  )
}
