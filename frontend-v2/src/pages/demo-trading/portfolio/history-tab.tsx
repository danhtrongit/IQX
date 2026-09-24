/**
 * Tab "Lịch sử" — toàn bộ lệnh của tài khoản Sân tập (port từ tab Lịch sử của
 * `features/watchlist`, dựng lại bằng shadcn).
 *
 * - Lọc trạng thái + phân trang chạy trên server: `GET /virtual-trading/orders`
 *   với `status` (lowercase: pending/filled/cancelled/expired/rejected) và
 *   `page`; `total`/`page_size` trong response quyết định số trang.
 * - Huỷ lệnh: chỉ lệnh đang chờ, và phải qua hộp thoại xác nhận nêu rõ mã +
 *   khối lượng + giá. Lỗi từ server (lệnh đã khớp, đã huỷ, hết hạn GFD…) hiện
 *   nguyên văn trong hộp thoại, không nuốt lỗi.
 */
import { useState } from "react"
import { Ban, ChevronLeft, ChevronRight, History } from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useTradingOrders } from "@/hooks/use-trading"
import { ApiError, errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import type { TradingOrder } from "@/pages/demo-trading/types"
import { useCancelOrder } from "./hooks"

type StatusFilter = "all" | "filled" | "pending" | "cancelled" | "expired" | "rejected"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Đang chờ" },
  { value: "filled", label: "Đã khớp" },
  { value: "cancelled", label: "Đã huỷ" },
  { value: "expired", label: "Hết hạn" },
  { value: "rejected", label: "Bị từ chối" },
]

/** Backend trả status lowercase; nhãn/hiển thị luôn ở dạng chuẩn hoá. */
const STATUS_LABEL: Record<string, string> = {
  filled: "Đã khớp",
  pending: "Đang chờ",
  cancelled: "Đã huỷ",
  expired: "Hết hạn",
  rejected: "Bị từ chối",
}

const STATUS_TONE: Record<string, string> = {
  filled: "border-price-up/40 text-price-up",
  pending: "border-accent/60 text-accent-foreground",
  cancelled: "border-border text-muted-foreground",
  expired: "border-border text-muted-foreground",
  rejected: "border-destructive/40 text-destructive",
}

/** Backend dùng `market`/`limit`; sổ lệnh VN gọi là MP/LO. */
const ORDER_TYPE_LABEL: Record<string, string> = { market: "MP", limit: "LO" }

/** Bộ lọc + trang của tab Lịch sử — panel giữ state cho toolbar và danh sách. */
export function useHistoryQuery() {
  const [status, setStatusValue] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)
  const setStatus = (next: StatusFilter) => {
    setStatusValue(next)
    setPage(1)
  }
  return { status, setStatus, page, setPage }
}

export function HistoryToolbar({
  status,
  setStatus,
  page,
  setPage,
}: {
  status: StatusFilter
  setStatus: (status: StatusFilter) => void
  page: number
  setPage: (page: number) => void
}) {
  const { data } = useTradingOrders({ status: status === "all" ? undefined : status, page })
  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 50
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex items-center gap-2">
      <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
        <SelectTrigger size="sm" aria-label="Lọc theo trạng thái lệnh" className="w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10px] text-muted-foreground tabular-nums">{total} lệnh</span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {page}/{pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Trang sau"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function HistoryTab({
  status,
  page,
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  status: StatusFilter
  page: number
  symbol: string
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { data, isLoading, isError, error, refetch } = useTradingOrders({
    status: status === "all" ? undefined : status,
    page,
  })
  const [cancelTarget, setCancelTarget] = useState<TradingOrder | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    // Chưa mở tài khoản Sân tập thì backend trả 404 cho danh sách lệnh — đó là
    // trạng thái bình thường của người mới, không phải lỗi tải dữ liệu.
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PanelState
          title="Chưa có tài khoản Sân tập"
          description="Tài khoản giao dịch mô phỏng được mở khi bạn bắt đầu ở panel Đặt lệnh."
          action={{ label: "Sang Đặt lệnh", onClick: () => onNavigate("trading") }}
        />
      )
    }
    return (
      <PanelState
        title="Không tải được lịch sử lệnh"
        description={errorMessage(error)}
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    )
  }

  const orders = data?.orders ?? []

  return (
    <div className="space-y-1">
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <History className="size-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-xs font-medium">
            {status === "all" ? "Chưa có lịch sử giao dịch" : "Không có lệnh ở trạng thái này"}
          </p>
          {status === "all" && (
            <Button type="button" variant="outline" size="xs" onClick={() => onNavigate("trading")}>
              Sang Đặt lệnh
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-1">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              active={order.symbol === symbol}
              onSelect={() => onSymbolChange(order.symbol)}
              onCancel={() => setCancelTarget(order)}
            />
          ))}
        </ul>
      )}

      <CancelOrderDialog order={cancelTarget} onClose={() => setCancelTarget(null)} />
    </div>
  )
}

function OrderRow({
  order,
  active,
  onSelect,
  onCancel,
}: {
  order: TradingOrder
  active: boolean
  onSelect: () => void
  onCancel: () => void
}) {
  const status = order.status.toLowerCase()
  const isBuy = order.side.toLowerCase() === "buy"
  const price = order.filled_price_vnd ?? order.limit_price_vnd
  const reason = order.rejection_reason ?? order.cancel_reason

  return (
    <li
      className={cn(
        "rounded-sm border border-border px-2 py-1.5 transition-colors hover:bg-muted/50",
        active && "bg-muted/60 ring-1 ring-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold",
            isBuy ? "bg-price-up/15 text-price-up" : "bg-price-down/15 text-price-down",
          )}
          title={isBuy ? "Lệnh mua" : "Lệnh bán"}
        >
          {isBuy ? "M" : "B"}
        </span>
        <button
          type="button"
          onClick={onSelect}
          className="text-xs font-bold focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {order.symbol}
        </button>
        <Badge
          variant="outline"
          className={cn("h-4 px-1 text-[10px] font-medium", STATUS_TONE[status])}
        >
          {STATUS_LABEL[status] ?? order.status}
        </Badge>
        <span className="ml-auto text-xs font-semibold tabular-nums">{formatMoney(price)}</span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
        <span>{formatDateTime(order.created_at)}</span>
        <span>
          {formatNumber(order.quantity)} cp ·{" "}
          {ORDER_TYPE_LABEL[order.order_type.toLowerCase()] ?? order.order_type}
        </span>
        {order.net_amount_vnd != null && (
          <span className="ml-auto">{formatMoney(order.net_amount_vnd)}</span>
        )}
      </div>

      {reason && <p className="mt-1 text-[10px] text-price-ref">{reason}</p>}

      {status === "pending" && (
        <div className="mt-1 flex justify-end">
          <Button type="button" variant="destructive" size="xs" onClick={onCancel}>
            <Ban />
            Huỷ lệnh
          </Button>
        </div>
      )}
    </li>
  )
}

/** Xác nhận huỷ lệnh — nêu rõ mã, khối lượng, giá; lỗi server hiện tại chỗ. */
function CancelOrderDialog({ order, onClose }: { order: TradingOrder | null; onClose: () => void }) {
  const cancel = useCancelOrder()
  const [failure, setFailure] = useState<string | null>(null)

  async function confirm() {
    if (!order) return
    setFailure(null)
    try {
      await cancel.mutateAsync(order.id)
      toast.success(`Đã huỷ lệnh ${order.symbol}`)
      onClose()
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFailure(null)
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Huỷ lệnh {order?.symbol}</DialogTitle>
          <DialogDescription>
            Lệnh {order?.side.toLowerCase() === "buy" ? "mua" : "bán"}{" "}
            {order ? formatNumber(order.quantity) : ""} cp {order?.symbol} giá{" "}
            {order ? formatMoney(order.limit_price_vnd) : ""} sẽ bị huỷ và tiền/cổ phiếu
            phong toả được trả lại. Thao tác này không hoàn tác được.
          </DialogDescription>
        </DialogHeader>

        {failure && <p className="text-xs text-destructive">{failure}</p>}

        <DialogFooter showCloseButton={false}>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFailure(null)
              onClose()
            }}
          >
            Giữ lệnh
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => void confirm()}
          >
            {cancel.isPending ? "Đang huỷ…" : "Huỷ lệnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
