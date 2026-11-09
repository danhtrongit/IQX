import type { ComponentProps, ReactNode } from "react"
import { Eye, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Khung dùng chung của màn học và luyện công (spec v1.2 §13): khung giữa màn rộng tối đa 480 px trên điện
 * thoại và 980 px trên máy tính, nút ✕ góc trái, thanh tiến độ, nền biểu đồ trắng và thanh chấm bài dính đáy
 * (lời nhận xét bên trái, nút 260 px bên phải; điện thoại thì nút toàn chiều ngang).
 */

export function LessonFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex min-h-full w-full max-w-[480px] flex-col text-foreground min-[900px]:max-w-[980px]", className)}>
      {children}
    </div>
  )
}

export interface LessonHeaderProps {
  /** Bước đang làm (từ 0). */
  step: number
  total: number
  onExit: () => void
  preview?: boolean
}

export function LessonHeader({ step, total, onExit, preview }: LessonHeaderProps) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Thoát bài học" title="Thoát, không lưu tiến độ" onClick={onExit}>
          <X aria-hidden="true" />
        </Button>
        <div
          role="progressbar"
          aria-label={`Bước ${Math.min(step + 1, total)} trên ${total}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={step}
          className="grid flex-1 gap-1"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={cn("h-2.5 rounded-full", index < step ? "bg-(--status-success)" : index === step ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      </div>
      {preview ? <PreviewNote /> : null}
    </div>
  )
}

/** Dòng nhắc ở chế độ xem trước: bài vẫn chạy đủ nhưng không lưu gì. */
export function PreviewNote({ className }: { className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground", className)}>
      <Eye aria-hidden="true" className="size-3.5" />
      Xem trước: không lưu tiến độ
    </p>
  )
}

/** Nhãn bước (ví dụ "3 · Đúng chỗ") và tiêu đề của bước. */
export function StepHeading({ badge, title }: { badge: string; title: string }) {
  return (
    <div className="mb-3">
      <span className="mb-1.5 inline-block rounded-sm bg-foreground px-2 py-0.5 text-[11px] font-bold tracking-widest text-background uppercase">
        {badge}
      </span>
      <h2 className="font-heading text-xl leading-tight font-bold text-balance text-foreground min-[900px]:text-2xl">{title}</h2>
    </div>
  )
}

/** Nền trắng của biểu đồ: các màu nến, lưới và nhãn của biểu đồ Candle Dojo thiết kế cho nền sáng ở cả hai giao diện. */
export function ChartStage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative rounded-xl border border-border bg-white p-2", className)}>{children}</div>
}

export type GradingTone = "neutral" | "good" | "bad"

const TONE_CLASS: Record<GradingTone, string> = {
  neutral: "",
  good: "bg-(--status-success)/10",
  bad: "bg-destructive/10",
}
const TONE_BORDER: Record<GradingTone, string> = {
  neutral: "border-border",
  good: "border-(--status-success)/50",
  bad: "border-destructive/50",
}
const TONE_TITLE: Record<GradingTone, string> = {
  neutral: "text-foreground",
  good: "text-(--status-success)",
  bad: "text-destructive",
}

/** Thanh chấm bài ở đáy màn học: lời nhận xét bên trái, nút bên phải. */
export function GradingBar({
  tone = "neutral",
  title,
  children,
  actions,
}: {
  tone?: GradingTone
  title?: ReactNode
  children?: ReactNode
  actions: ReactNode
}) {
  return (
    <div className={cn("sticky bottom-0 z-10 mt-auto border-t bg-background", TONE_BORDER[tone])} data-tone={tone}>
      <div className={TONE_CLASS[tone]}>
        <div className="flex flex-col gap-2.5 py-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-6">
          <div role="status" aria-live="polite" className="min-w-0 text-sm font-medium text-foreground">
            {title ? <p className={cn("font-heading text-lg leading-snug font-bold", TONE_TITLE[tone])}>{title}</p> : null}
            {children}
          </div>
          <div className="flex shrink-0 flex-col gap-2 min-[900px]:flex-row">{actions}</div>
        </div>
      </div>
    </div>
  )
}

/** Nút chính của thanh chấm bài: toàn chiều ngang trên điện thoại, 260 px trên máy tính. */
export function GradingButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" className={cn("h-11 w-full font-heading text-base font-bold min-[900px]:w-[260px]", className)} {...props} />
}
