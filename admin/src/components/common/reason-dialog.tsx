import { useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  reasonLabel?: string
  reasonPlaceholder?: string
  required?: boolean
  destructive?: boolean
  onConfirm: (reason: string) => void | Promise<void>
}

export function ReasonDialog({
  open,
  onOpenChange,
  title = "Xác nhận với lý do",
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  reasonLabel = "Lý do",
  reasonPlaceholder = "Nhập lý do...",
  required = true,
  destructive = false,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = !required || reason.trim().length > 0

  const handleConfirm = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      await onConfirm(reason.trim())
      setReason("")
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) setReason("")
    onOpenChange(open)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-input">
            {reasonLabel}
            {required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Textarea
            id="reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            className="resize-none"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{cancelLabel}</AlertDialogCancel>
          <Button
            onClick={() => { void handleConfirm() }}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {isSubmitting ? "Đang xử lý..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
