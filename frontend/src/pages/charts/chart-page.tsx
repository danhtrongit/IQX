/**
 * `/bieu-do` — the market chart terminal.
 *
 * Owns the chart's own context: symbol + interval live in the URL (`?symbol=`,
 * `?interval=`, `?tool=`), so a reload or a shared link restores the exact view.
 * The widget is the source of truth for what it draws; when the user switches
 * symbol inside TradingView the URL follows, and when the URL changes the widget
 * is rebuilt for that symbol's drawings.
 */
import { useCallback, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { ExternalLink } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAuth } from "@/hooks/use-auth"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { SymbolPicker } from "@/pages/demo-trading/market/symbol-picker"

import { AiInsightSymbolDialog } from "./chart/ai-insight-symbol-dialog"
import { getDrawingPersistence } from "./chart/drawing-persistence"
import { INDEX_SYMBOLS } from "./chart/market-symbols"
import { NewsMarkPopover } from "./chart/news-mark-popover"
import { TVChart } from "./chart/tv-chart"
import { ChartShell } from "./chart-shell"

const DEFAULT_SYMBOL = "VNINDEX"
const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}$/

/** The two whole-market gauges the terminal opens on (mirrors the legacy market bar). */
const QUICK_INDICES = ["VNINDEX", "VN30"] as const

const INTERVALS = [
  { value: "1", label: "1 phút" },
  { value: "5", label: "5 phút" },
  { value: "15", label: "15 phút" },
  { value: "30", label: "30 phút" },
  { value: "60", label: "1 giờ" },
  { value: "D", label: "1 ngày" },
  { value: "W", label: "1 tuần" },
  { value: "M", label: "1 tháng" },
] as const

function readSymbol(value: string | null): string {
  const candidate = (value ?? "").toUpperCase()
  return SYMBOL_PATTERN.test(candidate) ? candidate : DEFAULT_SYMBOL
}

export function ChartPage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const theme = useResolvedTheme()
  const { user } = useAuth()

  const symbol = readSymbol(params.get("symbol"))
  const rawInterval = params.get("interval")
  const interval = INTERVALS.some((item) => item.value === rawInterval)
    ? (rawInterval as string)
    : "D"

  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)
  const [insightOpen, setInsightOpen] = useState(false)

  const selectSymbol = useCallback(
    (next: string) => {
      const clean = next.trim().toUpperCase()
      if (!SYMBOL_PATTERN.test(clean)) return
      const nextParams = new URLSearchParams(params)
      nextParams.set("symbol", clean)
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  const selectInterval = useCallback(
    (next: string) => {
      const nextParams = new URLSearchParams(params)
      nextParams.set("interval", next)
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  const isIndex = INDEX_SYMBOLS[symbol] === true

  const actions = (
    <>
      <ToggleGroup
        type="single"
        spacing={0}
        variant="outline"
        value={symbol}
        onValueChange={(next) => next && selectSymbol(next)}
        className="overflow-hidden"
        aria-label="Chỉ số nhanh"
      >
        {QUICK_INDICES.map((index) => (
          <ToggleGroupItem key={index} value={index} className="text-xs font-semibold">
            {index}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <SymbolPicker symbol={symbol} onSymbolChange={selectSymbol} className="w-44" />
      <Select value={interval} onValueChange={selectInterval}>
        <SelectTrigger size="sm" className="w-28" aria-label="Khung thời gian"><SelectValue /></SelectTrigger>
        <SelectContent>{INTERVALS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      {!isIndex && <Button type="button" variant="outline" onClick={() => navigate(`/co-phieu/${symbol}`)}><ExternalLink aria-hidden="true" />Xem chi tiết mã</Button>}
    </>
  )

  const chart = <TVChart key={user?.id ?? "guest"} symbol={symbol} interval={interval} theme={theme} onSymbolChanged={selectSymbol} onMarkClick={setActiveMarkId} persistence={getDrawingPersistence()} />
  const content = (
    <>
      {embedded ? <section aria-label="Khu vực biểu đồ" className="flex min-h-0 min-w-0 flex-1 flex-col">{chart}</section> : <ChartShell symbol={symbol} onSymbolChange={selectSymbol} onAiInsight={() => setInsightOpen(true)}>{chart}</ChartShell>}
      <NewsMarkPopover symbol={symbol} markId={activeMarkId} onClose={() => setActiveMarkId(null)} />
      <AiInsightSymbolDialog open={insightOpen} onOpenChange={setInsightOpen} onSelect={(next) => navigate(`/co-phieu/${next}`)} />
    </>
  )

  if (embedded) {
    return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">{actions}</header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{content}</div>
    </div>
  }

  return (
    <WorkspacePage
      title={`Biểu đồ ${symbol}`}
      description="Dữ liệu thật từ sàn · công cụ vẽ, chỉ báo và bản vẽ được lưu theo mã"
      scroll={false}
      contentClassName="p-0"
      actions={actions}
    >
      {content}
    </WorkspacePage>
  )
}
