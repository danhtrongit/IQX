import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Small confirmation layer. Escape, the overlay and the cancel button all mean
 * "no": the caller keeps whatever it was holding (a draft, the current source).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-[420px]">
        <DialogHeader className="gap-2 p-4">
          <DialogTitle className="font-heading text-base font-bold">{title}</DialogTitle>
          {description && <DialogDescription className="text-sm leading-6">{description}</DialogDescription>}
          {children}
        </DialogHeader>
        <DialogFooter className="m-0 flex-row justify-end gap-2 rounded-b-sm border-t border-border p-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
