import { useCallback, useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router"
import { ArrowLeft, XCircle, CalendarPlus } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/common/status-badge"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { ErrorState } from "@/components/common/error-state"
import { fmtDateTime, fmtDate } from "@/lib/format"
import { subscriptionsApi, type SubscriptionDetail } from "@/lib/api/subscriptions"

function LabeledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

export default function SubscriptionDetailPage() {
  const { subId } = useParams<{ subId: string }>()
  const navigate = useNavigate()
  const [sub, setSub] = useState<SubscriptionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Cancel
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  // Extend
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDays, setExtendDays] = useState("30")
  const [extendReason, setExtendReason] = useState("")
  const [extendLoading, setExtendLoading] = useState(false)

  const load = useCallback(async () => {
    if (!subId) return
    setLoading(true)
    setError(null)
    try {
      const data = await subscriptionsApi.get(subId)
      setSub(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Không thể tải dữ liệu"))
    } finally {
      setLoading(false)
    }
  }, [subId])

  useEffect(() => { void load() }, [load])

  const handleCancel = async (reason: string) => {
    if (!sub) return
    setCancelLoading(true)
    try {
      const updated = await subscriptionsApi.cancel(sub.id, reason)
      setSub(updated)
      toast.success("Đã hủy thuê bao thành công")
      setCancelOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hủy thất bại")
      throw e
    } finally {
      setCancelLoading(false)
    }
  }

  const handleExtend = async () => {
    if (!sub) return
    const days = Number(extendDays)
    if (!days || days < 1) {
      toast.error("Số ngày phải lớn hơn 0")
      return
    }
    setExtendLoading(true)
    try {
      const updated = await subscriptionsApi.extend(sub.id, days, extendReason || undefined)
      setSub(updated)
      toast.success(`Đã gia hạn ${days} ngày thành công`)
      setExtendOpen(false)
      setExtendDays("30")
      setExtendReason("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gia hạn thất bại")
    } finally {
      setExtendLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !sub) {
    return <ErrorState message={error?.message ?? "Không tìm thấy thuê bao"} onRetry={load} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            onClick={() => void navigate(-1)}
          >
            <ArrowLeft className="size-4 mr-1" />
            Quay lại
          </Button>
          <h1 className="text-2xl font-bold">Chi tiết thuê bao</h1>
          <p className="text-sm text-muted-foreground font-mono">{sub.id}</p>
        </div>
        {sub.status === "active" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setExtendOpen(true); setExtendDays("30"); setExtendReason("") }}
            >
              <CalendarPlus className="size-4 mr-1" />
              Gia hạn
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="size-4 mr-1" />
              Hủy thuê bao
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* User card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Người dùng</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Email">
              <Link
                to={`/users/${sub.userId}`}
                className="text-primary hover:underline"
              >
                {sub.userEmail ?? sub.userId}
              </Link>
            </LabeledValue>
            <LabeledValue label="User ID">
              <span className="font-mono text-xs">{sub.userId}</span>
            </LabeledValue>
          </CardContent>
        </Card>

        {/* Plan card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Gói dịch vụ</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Mã gói">{sub.planCode ?? "—"}</LabeledValue>
            <LabeledValue label="Tên gói">{sub.planName ?? "—"}</LabeledValue>
          </CardContent>
        </Card>

        {/* Period card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Thời hạn</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Bắt đầu">{fmtDate(sub.currentPeriodStart)}</LabeledValue>
            <LabeledValue label="Kết thúc">{fmtDate(sub.currentPeriodEnd)}</LabeledValue>
            <LabeledValue label="Ngày tạo">{fmtDateTime(sub.createdAt)}</LabeledValue>
          </CardContent>
        </Card>

        {/* Status card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Trạng thái</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Trạng thái">
              <StatusBadge status={sub.status} />
            </LabeledValue>
            {sub.updatedAt && (
              <LabeledValue label="Cập nhật lần cuối">{fmtDateTime(sub.updatedAt)}</LabeledValue>
            )}
          </CardContent>
        </Card>

        {/* Cancellation info */}
        {sub.cancelledAt && (
          <Card className="border-red-200 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-red-700">Thông tin hủy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <LabeledValue label="Hủy lúc">{fmtDateTime(sub.cancelledAt)}</LabeledValue>
              {sub.cancelledByUserId && (
                <LabeledValue label="Hủy bởi">
                  <Link
                    to={`/users/${sub.cancelledByUserId}`}
                    className="text-primary hover:underline font-mono text-xs"
                  >
                    {sub.cancelledByUserId}
                  </Link>
                </LabeledValue>
              )}
              {sub.cancelReason && (
                <LabeledValue label="Lý do">{sub.cancelReason}</LabeledValue>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cancel dialog */}
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Hủy thuê bao"
        description={`Hủy thuê bao của ${sub.userEmail ?? sub.userId}?`}
        confirmLabel={cancelLoading ? "Đang xử lý..." : "Hủy thuê bao"}
        destructive
        onConfirm={handleCancel}
      />

      {/* Extend dialog */}
      <Dialog
        open={extendOpen}
        onOpenChange={(open) => {
          if (!open) { setExtendOpen(false); setExtendDays("30"); setExtendReason("") }
          else setExtendOpen(true)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gia hạn thuê bao</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Số ngày gia hạn <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lý do</Label>
              <Textarea
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                placeholder="Nhập lý do..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Hủy</Button>
            <Button onClick={() => { void handleExtend() }} disabled={extendLoading}>
              {extendLoading ? "Đang xử lý..." : "Gia hạn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
