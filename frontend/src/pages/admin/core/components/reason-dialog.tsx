import { useId, useState, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export const REASON_MAX_LENGTH = 1000

/**
 * Xác nhận mức Vừa hoặc Cao (admin spec v1.0 §2.4): lý do là bắt buộc và được ghi vào
 * nhật ký kiểm toán. Nút xác nhận khoá cho tới khi có lý do và `canSubmit` (điều kiện
 * riêng của từng thao tác, ví dụ chính sách đã thay đổi). Lỗi máy chủ hiện ngay trong hộp
 * thoại; không có gì được áp dụng trước khi máy chủ chấp nhận.
 */
export function ReasonDialog({
  title,
  description,
  children,
  confirmLabel,
  tone = "default",
  pending,
  error,
  canSubmit = true,
  reasonLabel = "Lý do",
  reasonPlaceholder = "Bắt buộc, được ghi vào nhật ký kiểm toán",
  className,
  onClose,
  onSubmit,
}: {
  title: string
  description?: ReactNode
  /** Nội dung trước ô lý do: hệ quả, biểu mẫu hoặc thay đổi cũ → mới. */
  children?: ReactNode
  confirmLabel: string
  tone?: "default" | "destructive"
  pending: boolean
  error?: string | null
  canSubmit?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  className?: string
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  const reasonId = useId()
  const trimmed = reason.trim()
  const ready = canSubmit && trimmed.length > 0 && !pending

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className={cn("sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? "Thao tác này cần lý do và được ghi vào nhật ký kiểm toán."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) onSubmit(trimmed)
          }}
        >
          {children}
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{reasonLabel}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              placeholder={reasonPlaceholder}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant={tone === "destructive" ? "destructive" : "default"} disabled={!ready}>
              {pending && <LoaderCircle className="animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
