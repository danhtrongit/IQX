import { useState } from "react"
import { Select, Spin, Tag } from "@arco-design/web-react"
import { IconSearch } from "@arco-design/web-react/icon"
import { usePrice, useSymbolSearch } from "@/features/market-data"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { StockLogo } from "@/features/navigation/StockLogo"
import { cn } from "@/shared/lib/cn"

const { Option } = Select

function fmtPrice(p: number): string {
  if (!p || p <= 0) return "—"
  return (p * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}
function fmtCompact(v: number): string {
  if (!v) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}
function priceColorClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

function SymbolPicker({ onPick }: { onPick: (s: string) => void }) {
  const [query, setQuery] = useState("")
  const { results, isFetching } = useSymbolSearch(query)
  return (
    <Select
      showSearch
      filterOption={false}
      allowClear
      value={undefined}
      inputValue={query}
      placeholder="Đổi mã — gõ để tìm…"
      loading={isFetching}
      prefix={<IconSearch />}
      arrowIcon={null}
      size="small"
      style={{ width: "100%" }}
      onSearch={setQuery}
      onChange={(v) => v && onPick(String(v).toUpperCase())}
      onInputValueChange={(v, reason) => reason === "manual" && setQuery(v)}
      notFoundContent={
        isFetching ? <div className="py-2 text-center"><Spin size={14} /></div> : null
      }
      dropdownMenuStyle={{ maxHeight: 320 }}
    >
      {results.map((s) => (
        <Option key={s.symbol} value={s.symbol}>
          <div className="flex items-center gap-2 py-0.5">
            <StockLogo symbol={s.symbol} size={22} />
            <span className="text-xs font-semibold">{s.symbol}</span>
            <span className="truncate text-[10px] text-[var(--color-text-3)]">{s.name || s.nameEn}</span>
          </div>
        </Option>
      ))}
    </Select>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-text-3)]">{label}</span>
      <span className={cn("font-medium tabular-nums text-[var(--color-text-1)]", className)}>{value}</span>
    </div>
  )
}

export function SymbolContextHeader() {
  const { symbol, setSymbol } = useSymbol()
  const { data, isLoading } = usePrice(symbol)
  const [picking, setPicking] = useState(false)

  const pick = (s: string) => {
    setSymbol(s)
    setPicking(false)
  }

  return (
    <div className="sticky top-0 z-10 border-b-2 border-[rgb(var(--primary-6))]/30 bg-gradient-to-b from-[var(--color-primary-light-1)] to-transparent px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[rgb(var(--primary-6))]">
        <span aria-hidden>🎯</span>
        <span>MÃ ĐANG XEM — DÙNG CHUNG CHO MỌI TAB</span>
      </div>

      {picking ? (
        <SymbolPicker onPick={pick} />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border-3)] bg-[var(--color-bg-1)] px-2.5 py-2 text-left transition-colors hover:border-[rgb(var(--primary-6))]"
        >
          {data?.exchange && <Tag size="small" bordered>{data.exchange}</Tag>}
          <span className="flex-1 text-base font-bold text-[var(--color-text-1)]">{symbol}</span>
          <span className="text-xs text-[var(--color-text-3)]">▾ Đổi mã</span>
        </button>
      )}

      {isLoading && !data ? (
        <div className="flex justify-center py-3"><Spin size={16} /></div>
      ) : data ? (
        <>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span
              className={cn(
                "text-[22px] font-black tabular-nums tracking-tight",
                priceColorClass(data.closePrice, data.referencePrice, data.ceilingPrice, data.floorPrice),
              )}
            >
              {fmtPrice(data.closePrice)}
            </span>
            <span className={cn("text-xs font-semibold", data.priceChange >= 0 ? "text-up" : "text-down")}>
              {data.priceChange >= 0 ? "▲ +" : "▼ "}
              {fmtPrice(data.priceChange)} ({data.percentChange >= 0 ? "+" : ""}
              {data.percentChange?.toFixed(2)}%)
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-0.5 border-t border-[var(--color-border-2)] pt-2.5 text-[11px]">
            <Stat label="Trần" value={fmtPrice(data.ceilingPrice)} className="text-ceiling" />
            <Stat label="TC" value={fmtPrice(data.referencePrice)} className="text-reference" />
            <Stat label="Sàn" value={fmtPrice(data.floorPrice)} className="text-floor" />
            <Stat label="KL" value={fmtCompact(data.totalVolume)} />
            <Stat
              label="NN"
              value={`${data.foreignBuy - data.foreignSell >= 0 ? "+" : ""}${fmtCompact(data.foreignBuy - data.foreignSell)}`}
              className={data.foreignBuy - data.foreignSell >= 0 ? "text-up" : "text-down"}
            />
            <Stat label="GTGD" value={fmtCompact(data.totalValue)} />
          </div>
        </>
      ) : null}
    </div>
  )
}
