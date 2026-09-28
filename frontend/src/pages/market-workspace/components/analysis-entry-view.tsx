import { useId, useState, type FormEvent, type ReactNode } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface AnalysisEntryViewProps {
  icon: ReactNode
  title: string
  subtitle: string
  placeholder: string
  emptyIcon: ReactNode
  emptyTitle: string
  emptyDesc: string
  onSubmit: (symbol: string) => void
  result?: ReactNode
  /** `data-tour-id` for the search block (product tours spotlight it). */
  inputTourId?: string
  headerAction?: ReactNode
  value?: string
  onValueChange?: (value: string) => void
  /** Applies to the rendered result region, e.g. `data-tour-id` wrappers. */
  resultClassName?: string
}

/**
 * Symbol-entry shell shared by the stock and financial views: a view header,
 * a search block (Enter or the button submits), then either the result or the
 * explanatory empty state. The symbol is normalized to upper case before it is
 * handed to `onSubmit`.
 */
export function AnalysisEntryView({
  icon,
  title,
  subtitle,
  placeholder,
  emptyIcon,
  emptyTitle,
  emptyDesc,
  onSubmit,
  result,
  inputTourId,
  headerAction,
  value: controlledValue,
  onValueChange,
  resultClassName,
}: AnalysisEntryViewProps) {
  const [internalValue, setInternalValue] = useState("")
  const inputId = useId()
  const value = controlledValue ?? internalValue
  const setValue = onValueChange ?? setInternalValue

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const symbol = value.trim().toUpperCase()
    if (symbol) onSubmit(symbol)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3.5 border-b border-border pb-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-semibold leading-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {headerAction && <div className="w-full sm:ml-auto sm:w-auto sm:shrink-0">{headerAction}</div>}
      </div>

      <form
        data-tour-id={inputTourId}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg bg-card p-4 sm:flex-row sm:items-center"
      >
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-11 pl-9 text-[15px] font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
          />
        </div>
        <Button type="submit" disabled={!value.trim()} className="h-11 px-6">
          Phân tích
        </Button>
      </form>

      {result ? (
        <div className={cn(resultClassName)}>{result}</div>
      ) : (
        <div className="mx-auto max-w-[480px] px-6 pb-16 pt-16 text-center">
          <div className="mb-5 flex justify-center text-muted-foreground/30 [&_svg]:size-14">{emptyIcon}</div>
          <h3 className="font-heading text-lg font-semibold">{emptyTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{emptyDesc}</p>
        </div>
      )}
    </div>
  )
}
