import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { vi } from "date-fns/locale"

import { cn } from "@/lib/utils"

/** IQX-styled shadcn calendar primitive. Values stay local Date objects. */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      locale={vi}
      showOutsideDays
      fixedWeeks
      className={cn("p-3", className)}
      classNames={{
        root: "font-sans",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-4",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-semibold",
        dropdowns: "flex items-center gap-1",
        dropdown: "h-8 rounded-sm border border-border bg-background px-1 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        nav: "absolute inset-x-0 flex items-center justify-between",
        button_previous: "inline-flex size-8 items-center justify-center rounded-sm border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        button_next: "inline-flex size-8 items-center justify-center rounded-sm border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-sm text-center text-[11px] font-medium text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button: "inline-flex size-9 items-center justify-center rounded-sm border border-transparent text-sm tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:ring-2 focus-visible:ring-ring",
        selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "border-primary text-primary",
        outside: "text-muted-foreground/50",
        disabled: "pointer-events-none text-muted-foreground/35",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left"
            ? <ChevronLeft className={cn("size-4", iconClassName)} {...iconProps} />
            : <ChevronRight className={cn("size-4", iconClassName)} {...iconProps} />,
      }}
      {...props}
    />
  )
}
