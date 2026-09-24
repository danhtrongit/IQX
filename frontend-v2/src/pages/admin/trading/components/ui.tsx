/**
 * Mảnh UI dùng chung trong khu quản trị giao dịch ảo: badge trạng thái, vỏ bảng
 * có phân trang phía server, lưới chi tiết, trường lọc/nhập và hộp thoại hành
 * động (mọi thao tác ghi đều đi qua đây để lỗi server hiện nguyên văn và nút
 * xác nhận bị chặn khi đang gửi).
 */
import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const PAGE_SIZES = [20, 50, 100] as const

export function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tone)}>
      {label}
    </Badge>
  )
}

export function TableLoadingRows({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={colSpan} className="py-1.5">
            <Skeleton className="h-4 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

/** Một dòng thông báo giữa bảng: rỗng, lỗi (kèm nút thử lại) hoặc ghi chú. */
export function TableNoticeRow({
  colSpan,
  children,
  onRetry,
  tone = "muted",
}: {
  colSpan: number
  children: ReactNode
  onRetry?: () => void
  tone?: "muted" | "danger"
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-6 text-center">
        <p className={cn("text-xs", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{children}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="xs" className="mt-2" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  isFetching,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  isFetching?: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} / {total}
      </span>
      {isFetching && (
        <span className="flex items-center gap-1 text-xs">
          <LoaderCircle className="size-3 animate-spin" />
          Đang tải…
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger size="sm" aria-label="Số dòng mỗi trang" className="w-[92px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} dòng
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          Trang {page}/{pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Trang sau"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</dl>
}

export function DetailRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words tabular-nums">{children}</dd>
    </div>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  )
}

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-xs leading-4 text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs leading-4 text-destructive">{error}</span>}
    </div>
  )
}

export function HintLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-5 text-muted-foreground", className)}>{children}</p>
}

export function ErrorLine({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {text}
        {onRetry && (
          <Button type="button" variant="outline" size="xs" className="ml-2" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Ô số liệu cho phần đầu trang chi tiết; `tone` tô màu theo dấu của giá trị. */
export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "up" | "down" | "neutral"
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 font-heading text-lg font-semibold tabular-nums",
          tone === "up" && "text-price-up",
          tone === "down" && "text-price-down",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Vỏ hộp thoại cho mọi thao tác ghi. `confirmDisabled` cho phép trang yêu cầu
 * gõ xác nhận trước khi bấm; `pending` khoá cả hộp thoại trong lúc gửi.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  pending = false,
  confirmDisabled = false,
  error,
  onConfirm,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel: string
  confirmVariant?: "default" | "destructive" | "gold"
  pending?: boolean
  confirmDisabled?: boolean
  error?: string | null
  onConfirm: () => void
  children?: ReactNode
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className={cn("sm:max-w-[560px]", className)} onInteractOutside={(event) => pending && event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" variant={confirmVariant} disabled={pending || confirmDisabled} onClick={onConfirm}>
            {pending ? "Đang xử lý…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
