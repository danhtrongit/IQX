import type { ReactNode } from "react"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

import { useNarrowScreen } from "./library-utils"

/**
 * Left library of Backtest and Bộ lọc. On wide screens it is a fixed column next to the content;
 * on narrow screens the same content opens in a drawer (focus trapped, Escape closes) so the page
 * never grows a horizontal scroll.
 */
export function LibraryShell({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const narrow = useNarrowScreen()
  if (!narrow) {
    return (
      <aside aria-label={label} className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card p-3 xl:w-[280px]">
        {children}
      </aside>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={false} className="w-[min(320px,90vw)] gap-3 overflow-y-auto bg-card p-3">
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng thư viện" className="absolute top-3 right-3">
            <X aria-hidden="true" />
          </Button>
        </SheetClose>
        <SheetTitle className="sr-only">{label}</SheetTitle>
        <SheetDescription className="sr-only">{label}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  )
}

/** Head of a library: title, how many tools are open, and the search box. */
export function LibraryHead({
  title,
  count,
  searchLabel,
  placeholder,
  query,
  onQuery,
}: {
  title: string
  count: number
  searchLabel: string
  placeholder: string
  query: string
  onQuery: (value: string) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 pr-8 lg:pr-0">
        <h2 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        <span aria-label={`${count} đã mở`} className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
          {count}
        </span>
      </div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} aria-label={searchLabel} className="pl-8" autoComplete="off" />
      </div>
    </>
  )
}
