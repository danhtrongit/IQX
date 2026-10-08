import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type DetailRow = { label: string; value: ReactNode; tone?: string }

/** Read-only detail layer: label/value rows plus optional extra blocks. */
export function DetailDialog({
  title,
  description,
  rows,
  onClose,
  children,
}: {
  title: string
  description?: string
  rows: DetailRow[]
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 text-card-foreground sm:max-w-[560px]">
        <DialogHeader className="gap-1 border-b border-border p-4 pr-12">
          <DialogTitle className="font-heading text-base font-bold">{title}</DialogTitle>
          <DialogDescription className={cn("text-xs leading-5", !description && "sr-only")}>{description ?? title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <dl className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2 text-xs">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className={cn("min-w-0 text-right font-medium break-words tabular-nums", row.tone)}>{row.value}</dd>
              </div>
            ))}
          </dl>
          {children}
        </div>
        <DialogFooter className="m-0 flex-row justify-end rounded-b-sm border-t border-border bg-card p-3">
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
