/**
 * Framed chart slot inside a layer card: title, canvas, optional legend.
 */
import type { ReactNode } from "react"

export function ChartBlock({
  title,
  legend,
  children,
}: {
  title: string
  legend?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-5 rounded-md bg-muted/50 px-3 py-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-price-ref uppercase">{title}</p>
      <div className="w-full">{children}</div>
      {legend ? (
        <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">{legend}</div>
      ) : null}
    </div>
  )
}
