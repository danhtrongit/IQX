import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { Paging } from "./use-paging"

export function PageControls({ paging, total, label }: { paging: Paging; total: number; label: string }) {
  if (paging.pages <= 1) return null
  return (
    <nav aria-label={`Phân trang ${label}`} className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span aria-live="polite">{paging.start + 1}–{paging.end} / {total} {label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={paging.page === 0} onClick={() => paging.setPage(paging.page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span className="min-w-12 text-center tabular-nums">{paging.page + 1} / {paging.pages}</span>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={paging.page >= paging.pages - 1} onClick={() => paging.setPage(paging.page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
