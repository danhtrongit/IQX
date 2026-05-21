import { useState } from "react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, X } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Chọn khoảng thời gian",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const displayText = value?.from
    ? value.to
      ? `${format(value.from, "dd/MM/yyyy", { locale: vi })} – ${format(value.to, "dd/MM/yyyy", { locale: vi })}`
      : format(value.from, "dd/MM/yyyy", { locale: vi })
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 justify-start gap-2 text-sm font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-3.5 shrink-0" />
        <span className="truncate">{displayText}</span>
        {value && (
          <X
            className="ml-auto size-3.5 shrink-0 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onChange(undefined)
            }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          locale={vi}
        />
      </PopoverContent>
    </Popover>
  )
}
