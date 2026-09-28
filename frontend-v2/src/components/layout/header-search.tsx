import { useEffect, useState } from "react"
import { Check, CircleAlert, LoaderCircle, Search } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { errorMessage } from "@/lib/api"
import { searchTradableSymbols, type SymbolSearchResult } from "@/pages/demo-trading/market/market-api"

const SEARCH_DEBOUNCE_MS = 250

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Global stock lookup shared by every route in the app shell. */
export function HeaderSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState("")
  const [retry, setRetry] = useState(0)
  const query = term.trim()
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const [results, setResults] = useState<SymbolSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    if (!open || !debounced) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setError(null)
      setLoading(true)
      void searchTradableSymbols(debounced, controller.signal)
        .then(setResults)
        .catch((reason: unknown) => { if (!controller.signal.aborted) { setResults([]); setError(reason) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    })
    return () => controller.abort()
  }, [debounced, open, retry])
  const isLoading = query.length > 0 && (query !== debounced || loading)

  function select(symbol: string) {
    setOpen(false)
    setTerm("")
    navigate(`/co-phieu/${encodeURIComponent(symbol)}`)
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTerm("") }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 px-2.5 text-xs" aria-label="Tìm mã cổ phiếu">
          <Search aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">Tìm mã</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput autoFocus value={term} onValueChange={setTerm} placeholder="Tìm mã hoặc tên công ty…" aria-label="Tìm mã hoặc tên công ty" />
          <CommandList className="max-h-72">
            {!query && <CommandEmpty>Nhập mã hoặc tên công ty để bắt đầu.</CommandEmpty>}
            {isLoading && query && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> Đang tìm mã…
              </div>
            )}
            {!isLoading && query && error !== null && (
              <div className="flex flex-col items-center gap-2 px-3 py-5 text-center text-xs text-muted-foreground" role="alert">
                <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
                <span>{errorMessage(error)}</span>
                <Button size="xs" variant="outline" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>
              </div>
            )}
            {!isLoading && query && !error && results.length === 0 && <CommandEmpty>Không tìm thấy mã phù hợp.</CommandEmpty>}
            {!isLoading && !error && results.length > 0 && (
              <CommandGroup heading={`Kết quả (${results.length})`}>
                {results.map((item) => (
                  <CommandItem key={item.symbol} value={item.symbol} onSelect={() => select(item.symbol)} className="gap-2">
                    <Check aria-hidden="true" className="size-3.5 text-primary opacity-0 group-aria-selected:opacity-100" />
                    <span className="font-heading text-xs font-bold">{item.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{item.name ?? ""}</span>
                    {item.exchange && <span className="text-[10px] text-muted-foreground">{item.exchange}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
