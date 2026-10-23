import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Check, CircleAlert, LoaderCircle, Search } from "lucide-react"
import { useLocation, useNavigate } from "react-router"

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

/** The result whose symbol is exactly what was typed (case-insensitive). */
function exactMatch(items: readonly SymbolSearchResult[], query: string): SymbolSearchResult | undefined {
  const wanted = query.trim().toUpperCase()
  return items.find((item) => item.symbol === wanted)
}

/** Global stock lookup shared by every route in the app shell. */
export function HeaderSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState("")
  const [retry, setRetry] = useState(0)
  const query = term.trim()
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const [results, setResults] = useState<SymbolSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** Enter bấm khi kết quả chưa về: chọn ngay khi kết quả của đúng chuỗi đó về (DB-05b). */
  const pendingEnter = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !debounced) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setError(null)
      setLoading(true)
      void searchTradableSymbols(debounced, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return
          setResults(items)
          if (pendingEnter.current !== null && pendingEnter.current === debounced) {
            pendingEnter.current = null
            const pick = exactMatch(items, debounced) ?? items[0]
            if (pick) select(pick.symbol)
          }
        })
        .catch((reason: unknown) => { if (!controller.signal.aborted) { setResults([]); setError(reason) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    })
    return () => controller.abort()
    // `select` chỉ đọc router và state setter ổn định; thêm vào sẽ gọi lại tìm kiếm mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open, retry])
  const isLoading = query.length > 0 && (query !== debounced || loading)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !query) return
    // Gõ đúng một mã có trong danh sách: chọn mã đó, không phụ thuộc dòng đang được tô.
    const exact = !isLoading ? exactMatch(results, query) : undefined
    if (exact) {
      event.preventDefault()
      select(exact.symbol)
      return
    }
    if (isLoading) {
      event.preventDefault()
      pendingEnter.current = query
    }
  }

  function select(symbol: string) {
    pendingEnter.current = null
    setOpen(false)
    setTerm("")
    const normalized = symbol.trim().toUpperCase()
    if (location.pathname.startsWith("/demo-trading")) {
      const next = new URLSearchParams(location.search)
      next.set("symbol", normalized)
      navigate({ pathname: location.pathname, search: `?${next.toString()}` })
      return
    }
    navigate(`/co-phieu/${encodeURIComponent(normalized)}`)
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTerm("") }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 px-2.5 text-xs lg:w-[min(24rem,calc(100vw-2rem))] lg:justify-start lg:font-normal lg:text-muted-foreground"
          aria-label="Tìm mã cổ phiếu"
        >
          <Search aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline lg:hidden">Tìm mã</span>
          <span className="hidden truncate lg:inline">Tìm mã hoặc tên công ty…</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Command label="Tìm mã hoặc tên công ty" shouldFilter={false}>
          <CommandInput autoFocus value={term} onValueChange={(value) => { pendingEnter.current = null; setTerm(value) }} onKeyDown={handleKeyDown} placeholder="Tìm mã hoặc tên công ty…" aria-label="Tìm mã hoặc tên công ty" />
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
