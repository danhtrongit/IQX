/**
 * Phần chung của các màn tập trung (nhập môn, thi đai): đầu trang có nút ✕ góc trái cùng thanh tiến độ, và thanh
 * chấm bài ở cuối (cổng từ `.lhead`, `.prog`, `.foot` của bản mẫu; spec v1.2 §1, §13).
 */
import { useEffect, useRef, type ReactNode } from "react"
import { CircleCheck, CircleX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FocusHeader({ exitLabel, onExit, total, current }: {
  exitLabel: string
  onExit: () => void
  total: number
  /** Chỉ số bước đang làm (0 là bước đầu); các bước trước đó tô màu đã xong. */
  current: number
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button
        type="button"
        aria-label={exitLabel}
        onClick={onExit}
        className="grid size-[34px] shrink-0 place-items-center rounded-full border border-border bg-card text-foreground outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      <div
        role="progressbar"
        aria-label="Tiến độ"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(current, total)}
        className="grid flex-1 gap-1"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, index) => (
          <i
            key={index}
            data-segment={index < current ? "done" : index === current ? "on" : "todo"}
            className={cn("h-2.5 rounded-full", index < current ? "bg-chart-3" : index === current ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
    </div>
  )
}

/** Nhãn nhỏ phía trên tiêu đề: "Thi đai vàng · câu 3/8". */
export function StepLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 inline-block rounded-md bg-foreground px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-background uppercase">{children}</span>
}

/** Khung trắng chứa biểu đồ: biểu đồ nến vẽ trên nền sáng ở cả hai chế độ giao diện. */
export function ChartStage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative rounded-xl border border-border bg-white p-2", className)}>{children}</div>
}

/**
 * Thanh chấm bài dính đáy: lời nhận xét bên trái và nút đi tiếp bên phải (nút 260 px trên máy tính, toàn chiều
 * ngang trên điện thoại). Nút nhận tiêu điểm khi thanh hiện ra để bàn phím đi tiếp được ngay.
 */
export function FeedbackBar({ good, title, detail, actionLabel, onAction }: {
  good: boolean
  title: string
  detail?: string
  actionLabel: string
  onAction: () => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.focus({ preventScroll: true })
  }, [])
  const Icon = good ? CircleCheck : CircleX
  return (
    <div
      role="status"
      data-feedback={good ? "good" : "bad"}
      className={cn("sticky bottom-0 z-10 mt-4 border-t-2 bg-card py-3", good ? "border-chart-3" : "border-destructive")}
    >
      <div className="flex flex-col gap-2.5 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
        <p className="min-w-0 text-sm font-semibold text-foreground">
          <b className="flex items-center gap-1.5 font-heading text-lg font-extrabold">
            <Icon aria-hidden="true" className={cn("size-5 shrink-0", good ? "text-chart-3" : "text-destructive")} />
            {title}
          </b>
          {detail}
        </p>
        <Button ref={button} type="button" size="lg" className="h-11 w-full text-base font-bold min-[900px]:w-[260px]" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}
