import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Khung một bước của màn soạn: số bước, tên, nhãn nguồn nội dung ("Tự động", "Quản trị viên viết"...). */
export function StepCard({
  step,
  title,
  tag,
  tourId,
  children,
  className,
}: {
  step: number
  title: string
  tag?: string
  tourId?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("border border-border bg-card", className)} data-tour-id={tourId} aria-labelledby={`bulletin-step-${step}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id={`bulletin-step-${step}`} className="text-sm font-semibold">
          Bước {step} · {title}
        </h2>
        {tag && (
          <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            {tag}
          </span>
        )}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  )
}
