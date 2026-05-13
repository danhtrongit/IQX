import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { Search, Building2, Loader2 } from "lucide-react"
import { Header, MarketBar, Footer } from "@/components/layout"
import { StockLogo } from "@/components/stock/stock-logo"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useSEO } from "@/hooks/use-seo"
import {
  groupSymbolsByIndustry,
  type StockDirectorySymbol,
} from "./stock-directory-utils"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

async function fetchStockSymbols(): Promise<StockDirectorySymbol[]> {
  const pageSize = 100
  let page = 1
  let totalPages = 1
  const symbols: StockDirectorySymbol[] = []

  do {
    const resp = await fetch(
      `${API_BASE}/market-data/reference/symbols/search?page=${page}&page_size=${pageSize}&asset_type=stock&include_indices=false`,
    )
    if (!resp.ok) throw new Error("Không thể tải danh mục cổ phiếu")
    const json = await resp.json()
    symbols.push(...(json.items || json.data || []))
    totalPages = json.total_pages || page
    page += 1
  } while (page <= totalPages)

  return symbols
}

export default function StockDirectoryPage() {
  useSEO({
    title: "Cổ phiếu theo ngành | IQX",
    description: "Danh mục tất cả cổ phiếu theo ngành trên IQX",
    url: "https://beta.iqx.vn/co-phieu",
  })

  const navigate = useNavigate()
  const [symbols, setSymbols] = useState<StockDirectorySymbol[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchStockSymbols()
      .then((items) => {
        if (!cancelled) {
          setSymbols(items)
          setError("")
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredSymbols = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return symbols
    return symbols.filter((item) => {
      const haystack = [
        item.symbol,
        item.name,
        item.short_name,
        item.exchange,
        item.icb_lv1,
        item.icb_lv2,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(text)
    })
  }, [symbols, query])

  const groups = useMemo(() => groupSymbolsByIndustry(filteredSymbols), [filteredSymbols])

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <MarketBar />
      <main className="flex-1 bg-slate-950 text-slate-100">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-cyan-300" />
                <h1 className="text-lg font-bold">Danh mục cổ phiếu theo ngành</h1>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {symbols.length.toLocaleString("vi-VN")} mã cổ phiếu, {groups.length.toLocaleString("vi-VN")} ngành
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm mã, tên công ty hoặc ngành"
                className="h-8 border-slate-800 bg-slate-900 pl-8 text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" />
              Đang tải danh mục cổ phiếu...
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">Không có cổ phiếu phù hợp.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {groups.map((group) => (
                <section key={group.name} className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/70">
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                    <h2 className="truncate text-sm font-bold">{group.name}</h2>
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {group.items.length} mã
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-slate-800/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    {group.items.map((item) => (
                      <button
                        key={item.symbol}
                        onClick={() => navigate(`/co-phieu/${item.symbol}`)}
                        className="flex min-w-0 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-cyan-950/30"
                      >
                        <StockLogo symbol={item.symbol} size={28} className="rounded-md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-100">{item.symbol}</span>
                            {item.exchange && (
                              <span className="rounded border border-slate-700 px-1 text-[8px] text-slate-400">
                                {item.exchange}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[10px] text-slate-400">
                            {item.short_name || item.name || "—"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
