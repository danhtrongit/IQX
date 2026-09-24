import type { ReactNode } from "react"
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

export type ConfirmRequest = {
  title: string
  description?: ReactNode
  /** What exactly will change — shown above the buttons. */
  body?: ReactNode
  confirmLabel?: string
  tone?: "default" | "destructive"
  run: () => Promise<void> | void
}

/** Confirmation gate for destructive or privilege-changing admin actions. */
export function ConfirmDialog({
  request,
  pending,
  onOpenChange,
  onConfirm,
}: {
  request: ConfirmRequest | null
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription className={request?.description ? undefined : "sr-only"}>
            {request?.description ?? "Thao tác này cần được xác nhận."}
          </DialogDescription>
        </DialogHeader>
        {request?.body && <div className="text-sm">{request.body}</div>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            variant={request?.tone === "destructive" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <LoaderCircle className="animate-spin" />}
            {request?.confirmLabel ?? "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
