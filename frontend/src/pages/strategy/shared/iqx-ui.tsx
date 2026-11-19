/**
 * The few pieces the tab IQX adds to the existing Bộ lọc / Backtest screens: the `IQX` badge, a card of
 * the library tab IQX and the "Bắt đầu từ…" strip. Never a result, a win rate or a lesson link (§0.3, §0.4).
 */
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { ErrorLine } from "./controls"
import { errorMessage } from "./errors"
import { IQX_DISCLAIMER } from "./iqx"

export function IqxBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-sm bg-primary px-1 py-px text-[9.5px] leading-3 font-bold tracking-wide text-primary-foreground", className)}>
      IQX
    </span>
  )
}

/** One Bộ lọc IQX / Chiến lược IQX in the library tab IQX; the one in use has an accent border. */
export function IqxCard({
  name,
  idea,
  active,
  onUse,
  children,
  testId,
}: {
  name: string
  idea: string
  active: boolean
  onUse: () => void
  children: ReactNode
  testId?: string
}) {
  return (
    <li
      data-testid={testId}
      data-active={active || undefined}
      className={cn("space-y-1.5 rounded-md border bg-background/40 px-3 py-2.5", active ? "border-primary ring-1 ring-primary" : "border-border")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold break-words">
          <IqxBadge />
          <span className="min-w-0">{name}</span>
        </div>
        <Button type="button" size="xs" onClick={onUse} aria-label={`Dùng ${name}`}>
          Dùng
        </Button>
      </div>
      <p className="text-[11.5px] leading-4 text-muted-foreground">{idea}</p>
      <div className="flex flex-wrap gap-1 text-[11px] leading-4">{children}</div>
    </li>
  )
}

export function IqxMetaChip({ children }: { children: ReactNode }) {
  return <span className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 font-medium">{children}</span>
}

/** Cards of the tab IQX with loading and error states, then the footer line of the tab. */
export function IqxCardList({
  loading,
  error,
  onRetry,
  empty,
  footer,
  children,
}: {
  loading: boolean
  error: unknown
  onRetry: () => void
  empty: boolean
  footer: string
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      {error ? (
        <div className="space-y-2">
          <ErrorLine>{errorMessage(error)}</ErrorLine>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
        </div>
      ) : loading ? (
        <Skeleton className="h-28 w-full" aria-label="Đang tải tab IQX" />
      ) : empty ? (
        <p className="text-xs text-muted-foreground">Chưa có mục nào.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
      <p className="text-[11px] leading-4 text-muted-foreground" data-testid="iqx-footer">{footer}</p>
    </div>
  )
}

/**
 * "[IQX] Bắt đầu từ …" strip: one line, `Xem thêm` / `Thu gọn` opens Nguồn gốc, Khi nào dễ sai, any
 * extra line and the disclaimer. It only tells where the form started; edits never hide it.
 */
export function IqxStrip({
  lead,
  origin,
  whenWrong,
  extra,
  testId,
}: {
  lead: ReactNode
  origin: string
  whenWrong: string
  extra?: ReactNode
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section data-testid={testId} aria-label="Điểm xuất phát IQX" className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs leading-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1">
          <IqxBadge className="mr-1.5 align-[1px]" />
          {lead}
        </p>
        <Button type="button" variant="link" size="xs" className="h-auto p-0" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Thu gọn" : "Xem thêm"}
        </Button>
      </div>
      {open && (
        <>
          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">Nguồn gốc</dt>
            <dd className="text-muted-foreground">{origin}</dd>
            <dt className="font-semibold">Khi nào dễ sai</dt>
            <dd className="text-muted-foreground">{whenWrong}</dd>
            {extra}
          </dl>
          <p className="text-[11px] text-muted-foreground">{IQX_DISCLAIMER}</p>
        </>
      )}
    </section>
  )
}
