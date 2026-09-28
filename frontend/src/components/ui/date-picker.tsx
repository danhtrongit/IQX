import { CalendarIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { formatDateLabel, formatISODate, parseISODate } from "@/lib/date-only"

type DatePickerProps = {
  value?: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  "aria-label"?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  clearable?: boolean
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years"
}

/** ISO date input with shadcn Popover + Calendar semantics. */
export function DatePicker({ value, onChange, min, max, placeholder = "Chọn ngày", className, disabled, id, name, clearable = true, captionLayout = "label", ...props }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseISODate(value)
  const before = parseISODate(min)
  const after = parseISODate(max)
  const disabledDays = [
    ...(before ? [{ before }] : []),
    ...(after ? [{ after }] : []),
  ]

  return (
    <>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          id={id}
          name={name}
          aria-expanded={open}
          className={cn("h-8 w-full justify-between gap-2 px-2.5 text-left font-sans font-normal", !selected && "text-muted-foreground", className)}
          {...props}
        >
          <span className="truncate">{selected ? formatDateLabel(value) : placeholder}</span>
          <CalendarIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          autoFocus
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(formatISODate(date))
            setOpen(false)
          }}
          captionLayout={captionLayout}
          startMonth={captionLayout === "label" ? undefined : new Date(1900, 0, 1)}
          endMonth={captionLayout === "label" ? undefined : new Date()}
          disabled={disabledDays}
          defaultMonth={selected ?? parseISODate(max) ?? new Date()}
          aria-label={props["aria-label"] ?? "Chọn ngày"}
        />
        {clearable && selected && (
          <button
            type="button"
            className="mx-3 mb-3 h-8 rounded-sm border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => { onChange(""); setOpen(false) }}
          >
            Xóa ngày
          </button>
        )}
        </PopoverContent>
      </Popover>
    </>
  )
}
