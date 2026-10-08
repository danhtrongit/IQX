import type { ComponentProps, ReactNode } from "react"
import { CircleAlert, LoaderCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}

/** A tool that is off on the server or that this account may not open: an explained state, never a blank tab. */
export function FeatureState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="mx-auto w-full max-w-[960px] p-4 sm:p-6">
      <Alert className="border-border bg-card">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {action && (
          <div className="col-start-2 mt-3">
            <Button type="button" variant="outline" onClick={action.onClick}>{action.label}</Button>
          </div>
        )}
      </Alert>
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6" role="status" aria-label={label}>
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-xs leading-5 text-destructive">{children}</p>
}

/** `Mua` / `Bán` badge: colour plus the word, never colour alone. */
export function SideBadge({ side, children }: { side: "buy" | "sell"; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-semibold whitespace-nowrap",
        side === "buy" ? "bg-price-up/15 text-price-up" : "bg-price-down/15 text-price-down",
      )}
    >
      {children ?? (side === "buy" ? "Mua" : "Bán")}
    </span>
  )
}
