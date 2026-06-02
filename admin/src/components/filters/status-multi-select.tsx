import { useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

interface StatusMultiSelectProps {
  options: SelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

export function StatusMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Lọc trạng thái",
  className,
}: StatusMultiSelectProps) {
  const [open, setOpen] = useState(false)

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label ?? v)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn("h-8 gap-1.5 text-sm font-normal", className)}
          />
        }
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : value.length <= 2 ? (
          <div className="flex gap-1">
            {selectedLabels.map((label) => (
              <Badge key={label} variant="secondary" className="h-5 px-1.5 text-xs">
                {label}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {value.length} đã chọn
          </Badge>
        )}
        <ChevronDown className="ml-auto size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm..." className="h-8 text-sm" />
          <CommandList>
            <CommandEmpty>Không tìm thấy</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => toggle(option.value)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value.includes(option.value) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {value.length > 0 && (
              <div className="border-t p-1">
                <button
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => onChange([])}
                >
                  <X className="size-3" />
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
