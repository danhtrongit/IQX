/** Hàng bài học, hàng thi đai và tiêu đề Dojo của màn Candle Dojo (cổng từ `.li`, `.dh`, `.stars` của bản mẫu). */
import type { ReactNode } from "react"
import { Check, CircleAlert, Lock, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { COIN_TEXT, DOJO_COPY } from "./candle-dojo-model"

/** Nhãn "Học", "Thi", "Bắt đầu" ở cuối hàng. */
export function ActionPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold whitespace-nowrap text-primary-foreground", className)}>
      {children}
    </span>
  )
}

/** Ba sao của một bài: sao đã đạt tô màu xu, còn lại chỉ viền. */
export function StarMeter({ stars, className }: { stars: number; className?: string }) {
  return (
    <span role="img" aria-label={`${stars} trên 3 sao`} data-stars={stars} className={cn("flex gap-0.5", className)}>
      {[1, 2, 3].map((index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn("size-4", index <= stars ? cn("fill-current", COIN_TEXT) : "text-border")}
        />
      ))}
    </span>
  )
}

/** Dấu "đã xong" ở cuối hàng. */
export function DoneMark({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} className={cn("grid size-6 place-items-center rounded-full bg-chart-3/15 text-chart-3")}>
      <Check aria-hidden="true" className="size-4" />
    </span>
  )
}

export function DojoRowButton({ icon, title, subtitle, trailing, current = false, exam = false, locked = false, disabled = false, onClick, ...data }: {
  icon: ReactNode
  title: string
  subtitle: string
  trailing?: ReactNode
  /** Bài kế tiếp cần học (viền nhấn). */
  current?: boolean
  exam?: boolean
  /** Chưa mở: hiện ổ khoá và nút không bấm được. */
  locked?: boolean
  disabled?: boolean
  onClick?: () => void
  "data-lesson"?: string
  "data-exam"?: number
  "data-intro"?: string
}) {
  const inactive = locked || disabled
  return (
    <button
      type="button"
      disabled={inactive}
      onClick={onClick}
      data-current={current || undefined}
      data-locked={locked || undefined}
      {...data}
      className={cn(
        "grid min-h-14 w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        current ? "border-primary ring-1 ring-primary" : "border-border",
        exam && "border-chart-2/50 bg-chart-2/10",
        inactive ? "cursor-default opacity-70" : "hover:border-primary/50",
      )}
    >
      <span className="flex h-10 w-12 items-center justify-center" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <b className="block text-sm leading-tight font-bold text-foreground">{title}</b>
        <small className="block text-xs leading-snug font-medium text-foreground">{subtitle}</small>
      </span>
      <span className="flex items-center">
        {locked ? <Lock aria-hidden="true" className="size-4 text-foreground" /> : trailing}
      </span>
    </button>
  )
}

/** Lỗi tải hoặc lỗi thao tác của vùng Candle Dojo, kèm nút thử lại khi thử lại có ích. */
export function DojoError({ message, onRetry, retrying = false, retryLabel = DOJO_COPY.retry, className }: {
  message: string
  onRetry?: () => void
  retrying?: boolean
  retryLabel?: string
  className?: string
}) {
  return (
    <div role="alert" className={cn("space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)}>
      <p className="flex items-start gap-2 text-sm leading-relaxed font-medium text-foreground">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

/** Tiêu đề một bậc: dải màu đai, tên Dojo và ghi chú bên phải. */
export function DojoHeading({ id, color, title, aside }: { id: string; color: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span aria-hidden="true" className="h-3 w-[38px] shrink-0 rounded-full border border-black/15" style={{ background: color }} />
      <h3 id={id} className="min-w-0 flex-1 font-heading text-base font-bold text-foreground">{title}</h3>
      {aside && <span className="text-xs font-bold whitespace-nowrap text-foreground tabular-nums">{aside}</span>}
    </div>
  )
}
