import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Definition grid for record details — replaces a card-per-field layout. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode }[]
  columns?: 1 | 2 | 3
  className?: string
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
