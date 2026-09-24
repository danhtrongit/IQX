/**
 * Symbol picker for the demo shell — a compact combobox that swaps the symbol
 * the whole terminal is looking at (journey, quote, order form, news, …)
 * WITHOUT leaving `/demo-trading`.
 *
 * Search is server-side (`/instruments?q=...`) and debounced;
 * results are restricted to tradable stocks (HOSE/HNX/UPCOM) so a guest cannot
 * pick an index or a fund the sandbox can never fill.
 */
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, CircleAlert, LoaderCircle } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { errorMessage } from "@/lib/api"

import { marketKeys, searchTradableSymbols } from "./market-api"

/** Typeahead idle time — matches the legacy market search (250ms). */
const SEARCH_DEBOUNCE_MS = 250

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export type SymbolPickerProps = {
  /** Symbol currently shown by the terminal. */
  symbol: string
  /** Called with the newly picked symbol (uppercase, tradable stock). */
  onSymbolChange: (symbol: string) => void
  className?: string
}

export function SymbolPicker({ symbol, onSymbolChange, className }: SymbolPickerProps) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState("")
  const current = symbol.trim().toUpperCase()

  const query = term.trim()
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  // While the debounce is still settling the rendered list would belong to the
  // previous term — hold the loading state instead of flashing stale rows.
  const settled = debounced === query

  const search = useQuery({
    queryKey: marketKeys.symbolSearch(debounced.toUpperCase()),
    enabled: open && debounced.length > 0,
    queryFn: ({ signal }) => searchTradableSymbols(debounced, signal),
    staleTime: 60_000,
    retry: 1,
  })

  const results = search.data ?? []
  const idle = query.length === 0
  const loading = !idle && (!settled || search.isPending)
  const failed = !idle && !loading && search.isError
  const empty = !idle && !loading && !failed && results.length === 0

  function select(next: string) {
    if (next !== current) onSymbolChange(next)
    setOpen(false)
    setTerm("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTerm("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Đổi mã đang xem"
          className={cn("gap-1.5 font-heading font-bold", className)}
        >
          <span className="truncate">{current || "Chọn mã"}</span>
          <ChevronsUpDown aria-hidden="true" className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false} className="rounded-lg">
          <CommandInput
            autoFocus
            value={term}
            onValueChange={setTerm}
            placeholder="Tìm mã hoặc tên công ty…"
          />
          <CommandList className="max-h-64">
            {idle && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nhập mã hoặc tên để tìm — ví dụ “VNM”, “sữa”.
              </p>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                Đang tìm mã…
              </div>
            )}
            {failed && (
              <div className="flex flex-col items-center gap-2 px-3 py-5 text-center">
                <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
                <p className="text-xs text-muted-foreground">{errorMessage(search.error)}</p>
                <Button size="xs" variant="outline" onClick={() => void search.refetch()}>
                  Thử lại
                </Button>
              </div>
            )}
            {empty && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Không tìm thấy cổ phiếu nào khớp “{query}”.
              </p>
            )}
            {results.length > 0 && !loading && !failed && (
              <CommandGroup heading={`Cổ phiếu (${results.length})`}>
                {results.map((item) => {
                  const active = item.symbol === current
                  return (
                    <CommandItem
                      key={item.symbol}
                      value={item.symbol}
                      onSelect={() => select(item.symbol)}
                      className="gap-2"
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0 text-primary",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="shrink-0 font-heading text-xs font-bold">
                        {item.symbol}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {item.name}
                      </span>
                      {item.exchange && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.exchange}
                        </Badge>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
          <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            Chỉ cổ phiếu niêm yết HOSE · HNX · UPCOM
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
