import { useState, type ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const WIDTH = { sm: "sm:max-w-[460px]", md: "sm:max-w-[640px]", lg: "sm:max-w-[820px]" } as const

/**
 * Modal of the Chiến lược page. Radix traps focus, closes on Escape and returns focus to the
 * control that opened it. With `dirty`, every way out (Hủy, Escape, outside click, the close
 * button) first asks before a changed draft is thrown away; `busy` blocks leaving mid-request.
 */
export function DialogShell({
  title,
  description,
  badge,
  size = "md",
  dirty = false,
  busy = false,
  onClose,
  footer,
  children,
}: {
  title: string
  description?: ReactNode
  badge?: ReactNode
  size?: keyof typeof WIDTH
  dirty?: boolean
  busy?: boolean
  onClose: () => void
  /** The footer may be a function to reach `requestClose`, so Hủy asks before a changed draft is thrown away. */
  footer?: ReactNode | ((controls: { requestClose: () => void }) => ReactNode)
  children: ReactNode
}) {
  const [confirming, setConfirming] = useState(false)

  function requestClose() {
    if (busy) return
    if (dirty) setConfirming(true)
    else onClose()
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) requestClose() }}>
        <DialogContent
          showCloseButton={false}
          className={`max-h-[calc(100dvh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 text-card-foreground ${WIDTH[size]}`}
        >
          <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-base font-bold">
                <span className="min-w-0 break-words">{title}</span>
                {badge}
              </DialogTitle>
              {description ? (
                <DialogDescription className="text-xs leading-5">{description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">{title}</DialogDescription>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={busy} onClick={requestClose}>
              <X aria-hidden="true" />
            </Button>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto p-4">{children}</div>
          {footer && (
            <DialogFooter className="m-0 flex-row flex-wrap items-center justify-end gap-2 rounded-b-sm border-t border-border bg-card p-3">
              {typeof footer === "function" ? footer({ requestClose }) : footer}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={(open) => { if (!open) setConfirming(false) }}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-[420px]">
          <DialogHeader className="gap-2 p-4">
            <DialogTitle className="font-heading text-base font-bold">Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Những gì bạn vừa chỉnh trong cửa sổ này chưa được lưu. Nếu bỏ, các thay đổi sẽ mất.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="m-0 flex-row justify-end gap-2 rounded-b-sm border-t border-border p-3">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Tiếp tục chỉnh sửa</Button>
            <Button type="button" onClick={() => { setConfirming(false); onClose() }}>Bỏ thay đổi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
