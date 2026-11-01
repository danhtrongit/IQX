import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { securitiesKeys } from "@/pages/securities/keys"
import { fetchIndexIntraday, INDEX_NAME_TO_CODE } from "@/pages/securities/market/api"
import { DASH, fmtPercent, fmtPrice, signTone } from "@/pages/securities/market/format"
import { useBoardStatus, useIndices, usePrices } from "@/pages/securities/market/hooks"
import { MarketDataProvider } from "@/pages/securities/market/provider"
import type { MarketIndexQuote, PriceBoardRow } from "@/pages/securities/market/types"
import { IndexCard } from "@/pages/securities/price-board/components/index-strip"

import { OfficeSim } from "./engine/OfficeSim"
import type { Quality } from "./engine/render/World3D"
import type { BoardQuote, MarketSnapshot, PricePalette, SelectionInfo } from "./engine/types"
import "./virtual-office.css"

/** Mã trên bảng điện LED và màn hình bàn môi giới (8 dòng của bảng). */
const BOARD_SYMBOLS = ["VCB", "FPT", "HPG", "VNM", "MWG", "SSI", "VPB", "TCB"]
const INTRADAY_REFRESH_MS = 60_000

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Vừa" },
  { value: "high", label: "Cao" },
]

const positive = (value: number) => (value > 0 ? value : null)

/** Board row (x1000 prices) → the LED board's row; a missing number stays null. */
function toBoardQuote(symbol: string, row: PriceBoardRow | undefined): BoardQuote {
  if (!row) {
    return { symbol, ref: null, ceiling: null, floor: null, price: null, change: null, pct: null, volume: null, bid: [], ask: [] }
  }
  return {
    symbol,
    ref: positive(row.referencePrice),
    ceiling: positive(row.ceilingPrice),
    floor: positive(row.floorPrice),
    price: positive(row.closePrice),
    change: row.hasTraded ? row.priceChange : 0,
    pct: row.hasTraded ? row.percentChange : 0,
    volume: row.totalVolume >= 0 ? row.totalVolume : null,
    bid: row.bid.filter((level) => level.price > 0),
    ask: row.ask.filter((level) => level.price > 0),
  }
}

/** The LED board is always a dark panel, so it prints the dark-theme `--price-*` tokens. */
function readDarkPricePalette(host: HTMLElement): PricePalette | null {
  const probe = document.createElement("div")
  probe.className = "dark"
  probe.hidden = true
  host.appendChild(probe)
  const style = getComputedStyle(probe)
  const read = (name: string) => style.getPropertyValue(name).trim()
  const palette = {
    up: read("--price-up"),
    down: read("--price-down"),
    ref: read("--price-ref"),
    ceiling: read("--price-ceiling"),
    floor: read("--price-floor"),
  }
  probe.remove()
  return Object.values(palette).every(Boolean) ? palette : null
}

/** WebGL 2 is required by the renderer; checked once before mounting the scene. */
function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"))
  } catch {
    return false
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase()
}

function SelectedEmployee({ info, onClose }: { info: SelectionInfo; onClose: () => void }) {
  return (
    <Card size="sm" className="pointer-events-auto w-72 border border-border py-3">
      <CardContent className="flex items-start gap-3 px-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-bold text-foreground"
        >
          {initials(info.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-semibold text-foreground">{info.name}</p>
          <p className="truncate text-xs text-muted-foreground">{info.role}</p>
          <p className="mt-1 truncate text-xs text-foreground">{info.status}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Bỏ chọn nhân viên" onClick={onClose}>
          <X />
        </Button>
      </CardContent>
    </Card>
  )
}

/** Static strip of the board symbols (no auto-scrolling motion in a data surface). */
function QuoteStrip({ rows }: { rows: Record<string, PriceBoardRow> }) {
  return (
    <div className="pointer-events-auto no-scrollbar flex items-center gap-4 overflow-x-auto border-t border-border bg-card px-4 py-2 text-xs">
      {BOARD_SYMBOLS.map((symbol) => {
        const row = rows[symbol]
        return (
          <span key={symbol} className="flex shrink-0 items-center gap-1.5 tabular-nums">
            <span className="font-semibold text-foreground">{symbol}</span>
            <span className={row ? signTone(row.hasTraded ? row.priceChange : 0) : "text-muted-foreground"}>
              {row && row.closePrice > 0 ? fmtPrice(row.closePrice) : DASH}
            </span>
            <span className={row ? signTone(row.hasTraded ? row.priceChange : 0) : "text-muted-foreground"}>
              {row && row.hasTraded ? fmtPercent(row.percentChange) : DASH}
            </span>
          </span>
        )
      })}
      <span className="ml-auto hidden shrink-0 pl-4 text-muted-foreground lg:inline">
        Chuột trái: kéo · Chuột phải: xoay · Cuộn: thu phóng · Bấm nhân viên để xem · Phím Q: đổi chất lượng
      </span>
    </div>
  )
}

function OfficeView() {
  const stageRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<OfficeSim | null>(null)
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [quality, setQuality] = useState<Quality>("medium")
  const [clock, setClock] = useState<{ time: string; phase: string } | null>(null)
  const [failed] = useState(() => !canUseWebGL())

  const { priceMap } = usePrices(BOARD_SYMBOLS)
  const { indices } = useIndices()
  const { updatedAt } = useBoardStatus()
  const intraday = useQuery({
    queryKey: securitiesKeys.indexIntraday("VNINDEX"),
    queryFn: () => fetchIndexIntraday("VNINDEX"),
    refetchInterval: INTRADAY_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: INTRADAY_REFRESH_MS - 5_000,
  })

  const vnIndex: MarketIndexQuote | null = useMemo(
    () => indices.find((item) => INDEX_NAME_TO_CODE[item.name] === "VNINDEX") ?? null,
    [indices],
  )

  const snapshot: MarketSnapshot = useMemo(
    () => ({
      index: vnIndex && vnIndex.value > 0
        ? { value: vnIndex.value, change: vnIndex.change, pct: vnIndex.changePercent }
        : null,
      quotes: BOARD_SYMBOLS.map((symbol) => toBoardQuote(symbol, priceMap[symbol])),
      intraday: intraday.data?.closes ?? [],
      intradayRef: intraday.data?.refValue ?? null,
      updatedAt,
    }),
    [vnIndex, priceMap, intraday.data, updatedAt],
  )
  useEffect(() => {
    const stage = stageRef.current
    const labels = labelsRef.current
    if (!stage || !labels) return
    const sim = new OfficeSim(stage, labels, {
      onSelect: setSelection,
      onQuality: setQuality,
      onTick: (market) => setClock({ time: market.clock, phase: market.phase }),
    })
    const palette = readDarkPricePalette(stage)
    if (palette) sim.setPalette(palette)
    simRef.current = sim
    return () => {
      simRef.current = null
      sim.dispose()
    }
  }, [failed])

  // Declared after the mount effect so the first snapshot reaches the new sim.
  useEffect(() => {
    simRef.current?.setMarketData(snapshot)
  }, [snapshot])

  return (
    <WorkspacePage
      title="Văn phòng ảo"
      description="Sàn môi giới IQX mô phỏng 3D. Bảng điện, màn hình và chỉ số lấy từ dữ liệu thị trường thật; giờ văn phòng là giờ mô phỏng."
      scroll={false}
      actions={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={quality}
          aria-label="Chất lượng đồ hoạ"
          onValueChange={(value) => value && simRef.current?.setQuality(value as Quality)}
          disabled={failed}
        >
          {QUALITY_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {failed ? (
        <div className="p-4 sm:p-6">
          <PanelState
            title="Không thể hiển thị văn phòng ảo"
            description="Trình duyệt hoặc thiết bị này không hỗ trợ WebGL. Hãy thử trình duyệt khác hoặc bật tăng tốc phần cứng."
          />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          <div ref={stageRef} className="vo-stage absolute inset-0" aria-label="Mô hình 3D văn phòng IQX" role="img" />
          <div ref={labelsRef} className="pointer-events-none absolute inset-0" />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <div className="pointer-events-auto flex w-64 flex-col gap-2">
              <IndexCard name="VN-Index" quoteSymbol="VNINDEX" live={vnIndex} />
              {clock && (
                <Card size="sm" className="border border-border py-2">
                  <CardContent className="flex items-center justify-between gap-2 px-2.5 text-xs">
                    <span className="text-muted-foreground">Giờ mô phỏng</span>
                    <span className="flex items-center gap-2">
                      <span className="font-heading text-sm font-semibold tabular-nums text-foreground">{clock.time}</span>
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-foreground">{clock.phase}</span>
                    </span>
                  </CardContent>
                </Card>
              )}
            </div>
            {selection && (
              <SelectedEmployee info={selection} onClose={() => simRef.current?.clearSelection()} />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <QuoteStrip rows={priceMap} />
          </div>
        </div>
      )}
    </WorkspacePage>
  )
}

export function VirtualOfficePage() {
  return (
    <MarketDataProvider>
      <OfficeView />
    </MarketDataProvider>
  )
}
