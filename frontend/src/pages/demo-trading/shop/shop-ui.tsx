import type { ReactNode } from "react"
import { CircleAlert, Coins, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SHOP_COPY, formatXu } from "./shop-model"

/** Coin colour: the accent in dark mode, a darker amber in light mode so text stays readable. */
export const COIN_TEXT = "text-amber-700 dark:text-accent"

export function CoinAmount({ value, className, iconClassName }: { value: number; className?: string; iconClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", COIN_TEXT, className)}>
      <Coins className={cn("size-4 shrink-0", iconClassName)} aria-hidden="true" />
      {formatXu(value)} xu
    </span>
  )
}

export function RegionError({ message = SHOP_COPY.loadFailed, onRetry, retrying = false, className }: {
  message?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn("space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)}>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
          {SHOP_COPY.retry}
        </Button>
      )}
    </div>
  )
}

export function RegionLoading({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </p>
  )
}

export function SideTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <h3 id={id} className="mb-2.5 flex items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
      <span>{children}</span>
      {aside && <span className="tabular-nums">{aside}</span>}
    </h3>
  )
}
