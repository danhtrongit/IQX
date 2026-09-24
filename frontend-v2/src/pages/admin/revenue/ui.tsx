/**
 * Mảnh UI dùng chung trong khu vực billing admin. Chỉ những thứ lặp lại thật sự
 * giữa 6 trang mới nằm đây (badge trạng thái, pager, khối JSON, lưới chi tiết,
 * vỏ hộp thoại hành động) — phần còn lại dùng thẳng `@/components/ui`.
 */
import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"

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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"
import { toneClass, type Tone } from "./display"

const PAGE_SIZES = [20, 50, 100] as const

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-medium", toneClass(tone))}>
      {label}
    </Badge>
  )
}

export function TableLoadingRows({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="py-1.5">
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function TableNoticeRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
        {children}
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
  onPageSizeChange: (pageSize: number) => void
  isFetching?: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {total.toLocaleString("vi-VN")} bản ghi · trang {page}/{pageCount}
      </span>
      {isFetching && <span className="text-[11px]">Đang tải…</span>}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px]">Mỗi trang</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger size="sm" aria-label="Số bản ghi mỗi trang" className="w-18">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

/** JSON thô (raw_body / raw_headers của IPN) — chỉ đọc, cuộn trong khung riêng. */
export function JsonBlock({ value }: { value: unknown }) {
  const text = value === null || value === undefined ? null : JSON.stringify(value, null, 2)
  if (!text) {
    return <p className="text-xs text-muted-foreground">Không có dữ liệu.</p>
  }
  return (
    <ScrollArea className="max-h-72 rounded-sm border border-border bg-muted/40">
      <pre className="p-2 text-[11px] leading-5 whitespace-pre-wrap break-all">{text}</pre>
    </ScrollArea>
  )
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>{children}</dl>
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
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
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  )
}

/**
 * Vỏ hộp thoại cho mọi thao tác ghi: tiêu đề, mô tả hệ quả, trường nhập tuỳ
 * biến, lỗi server hiện nguyên văn, và chặn đóng khi đang gửi.
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
  hideCancel = false,
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
  /** Hộp thoại chỉ đọc (không có thao tác ghi) — chỉ hiện một nút đóng. */
  hideCancel?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className={cn("sm:max-w-[560px]", className)}
        onInteractOutside={(event) => pending && event.preventDefault()}
      >
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
          {!hideCancel && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
          )}
          <Button
            type="button"
            variant={confirmVariant}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending ? "Đang xử lý…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
