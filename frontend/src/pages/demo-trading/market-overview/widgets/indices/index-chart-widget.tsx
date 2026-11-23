import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { HistogramData, LineData, Time, WhitespaceData } from "lightweight-charts"
import {
  buildIntradayHistogramData,
  buildIntradaySeriesData,
  getIntradayBoundsForSymbol,
} from "../../charts/intraday-axis"
import { LwcBaselineChart, LwcHistogramChart } from "../../charts/lwc-host"
import { SparklineSvg } from "../../charts/sparkline-svg"
import {
  MISSING_VALUE,
  formatBillion,
  formatFuturesPrice,
  formatIndexPrice,
  formatInt,
  formatNum,
  formatPct,
  formatSessionLabel,
  formatSigned,
  signedTone,
} from "../../format"
import type { IndexCardItem, IndexChartRange, IndexChartSymbol } from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  flashClass,
  toneToMoClass,
  useValueFlash,
  type MoSegmentOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

const RANGE_OPTIONS: readonly MoSegmentOption<IndexChartRange>[] = [
  { value: "intraday", label: "Trong phiên" },
  { value: "3m", label: "3 tháng" },
  { value: "1y", label: "1 năm" },
]

function formatCardVolume(card: IndexCardItem): string {
  const parts: string[] = []
  if (card.volume != null && Number.isFinite(card.volume)) {
    if (card.volumeUnit === "contracts" || card.code === "VN30F1M") {
      parts.push(`KL ${formatInt(card.volume)} HĐ`)
    } else if (card.volume >= 1_000_000) {
      parts.push(`KL ${formatNum(card.volume / 1_000_000, 1)} tr`)
    } else {
      parts.push(`KL ${formatInt(card.volume)}`)
    }
  }
  if (card.valueBillion != null && Number.isFinite(card.valueBillion)) {
    parts.push(`GT ${formatBillion(card.valueBillion, 0)}`)
  }
  return parts.length > 0 ? parts.join(" · ") : MISSING_VALUE
}

function formatVolumeAxis(val: number): string {
  if (!Number.isFinite(val)) return MISSING_VALUE
  if (Math.abs(val) >= 1_000_000) return `${formatNum(val / 1_000_000, 2)} tr`
  if (Math.abs(val) >= 1_000) return `${formatNum(val / 1_000, 1)} nghìn`
  return formatInt(val)
}

function hexToRgba(color: string, alpha: number): string {
  const trimmed = color.trim()
  const hex6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (hex6) {
    const num = parseInt(hex6[1], 16)
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
  }
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(trimmed)
  if (hex3) {
    const r = parseInt(hex3[1][0] + hex3[1][0], 16)
    const g = parseInt(hex3[1][1] + hex3[1][1], 16)
    const b = parseInt(hex3[1][2] + hex3[1][2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return trimmed
}

function readVolumeBarColors(el: HTMLElement | null): { up: string; dn: string } {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  const fallbackUp = isDark ? "#1FC16B" : "#0E9F57"
  const fallbackDn = isDark ? "#F0453A" : "#E0352B"

  if (typeof window === "undefined" || !el) {
    return {
      up: hexToRgba(fallbackUp, 0.55),
      dn: hexToRgba(fallbackDn, 0.55),
    }
  }
  const styles = window.getComputedStyle(el)
  const up = styles.getPropertyValue("--mo-up").trim() || fallbackUp
  const dn = styles.getPropertyValue("--mo-dn").trim() || fallbackDn
  return {
    up: hexToRgba(up, 0.55),
    dn: hexToRgba(dn, 0.55),
  }
}

interface IndexCardButtonProps {
  card: IndexCardItem
  active: boolean
  onSelect: (code: IndexChartSymbol) => void
}

function IndexCardButton({ card, active, onSelect }: IndexCardButtonProps) {
  const isFutures = card.code === "VN30F1M"
  const tone = signedTone(card.change)
  const toneClass = toneToMoClass(tone)
  const flash = useValueFlash(card.price, card.code)
  const flashCls = flashClass(flash)

  const priceText = isFutures
    ? formatFuturesPrice(card.price)
    : formatIndexPrice(card.price)
  const changeText = formatSigned(card.change, isFutures ? 1 : 2)
  const pctText = formatPct(card.changePct)
  const klGtText = formatCardVolume(card)

  return (
    <button
      type="button"
      className={active ? "mo-ixcard on" : "mo-ixcard"}
      aria-pressed={active}
      data-no-drag="true"
      onClick={() => onSelect(card.code)}
    >
      <span className="nm" title={card.name}>
        {card.name}
      </span>
      <span className={`vv ${toneClass} ${flashCls} rounded-sm`}>{priceText}</span>
      <SparklineSvg
        values={card.sparkline}
        refValue={card.refPrice}
        tone={tone}
        width={72}
        height={20}
        className="spc"
      />
      <span className={`chg ${toneClass}`}>
        <span className="ca">{changeText} </span>
        <span className="cp">{pctText}</span>
      </span>
      <span className="kg" title={klGtText}>
        {klGtText}
      </span>
    </button>
  )
}

export function IndexChartHeaderControls({
  state,
  onStateChange,
}: WidgetControlsProps<"index_chart">) {
  return (
    <MoSegmentedControl
      options={RANGE_OPTIONS}
      value={state.range}
      onChange={(range) => onStateChange({ range })}
      ariaLabel="Khung thời gian biểu đồ chỉ số"
    />
  )
}

const DAILY_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/
const DEFAULT_PRICE_AXIS_WIDTH_PX = 64

export function IndexChartWidget({
  state,
  data,
  meta,
  onStateChange,
}: WidgetBodyProps<"index_chart">) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [volColors, setVolColors] = useState<{ up: string; dn: string }>(() =>
    readVolumeBarColors(null),
  )
  const [priceAxisWidth, setPriceAxisWidth] = useState<number>(DEFAULT_PRICE_AXIS_WIDTH_PX)

  const handlePriceScaleWidth = useCallback((width: number) => {
    const clamped = Math.max(DEFAULT_PRICE_AXIS_WIDTH_PX, Math.round(width))
    setPriceAxisWidth((prev) => (prev === clamped ? prev : clamped))
  }, [])

  useEffect(() => {
    const syncColors = () => {
      setVolColors(readVolumeBarColors(rootRef.current))
    }
    const rafId = requestAnimationFrame(syncColors)
    if (typeof MutationObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }
    const observer = new MutationObserver(syncColors)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  const handleSelectCard = useCallback(
    (code: IndexChartSymbol) => {
      onStateChange({ index: code })
    },
    [onStateChange],
  )

  const cards = useMemo(() => data?.cards ?? [], [data?.cards])
  const activeCard = useMemo(() => {
    const targetCode = state.index ?? data?.selectedIndex
    return cards.find((c) => c.code === targetCode) ?? cards[0] ?? null
  }, [cards, state.index, data?.selectedIndex])

  const activeFlash = useValueFlash(activeCard?.price, activeCard?.code)
  const effectiveRange = data?.range ?? state.range
  const isIntraday = effectiveRange === "intraday"
  const activeSymbol: IndexChartSymbol = activeCard?.code ?? data?.selectedIndex ?? state.index
  const isFutures = activeSymbol === "VN30F1M"
  const validRefPrice =
    data?.refPrice != null && Number.isFinite(data.refPrice) && data.refPrice > 0
      ? data.refPrice
      : activeCard != null && Number.isFinite(activeCard.refPrice) && activeCard.refPrice > 0
        ? activeCard.refPrice
        : null

  const priceFormatter = useCallback(
    (value: number) =>
      isFutures ? formatFuturesPrice(value) : formatIndexPrice(value),
    [isFutures],
  )

  const { priceSeries, volumeSeries } = useMemo(() => {
    const points = data?.series ?? []
    if (points.length === 0) {
      return {
        priceSeries: [] as (LineData<Time> | WhitespaceData<Time>)[],
        volumeSeries: [] as (HistogramData<Time> | WhitespaceData<Time>)[],
      }
    }

    if (isIntraday) {
      const bounds = getIntradayBoundsForSymbol(activeSymbol)
      const builtPrice = buildIntradaySeriesData(
        points.map((pt) => ({ time: pt.time, value: pt.value })),
        { ...bounds, padToSessionEnd: true },
      )

      const rawVol: Array<{ time: string; value: number | null; color?: string }> = []
      let prevClose: number | null = validRefPrice
      for (const pt of points) {
        const isDown = prevClose !== null && pt.value < prevClose
        const color = isDown ? volColors.dn : volColors.up
        prevClose = pt.value
        rawVol.push({
          time: pt.time,
          value: pt.volume != null && Number.isFinite(pt.volume) ? pt.volume : null,
          color,
        })
      }

      const builtVol = buildIntradayHistogramData(rawVol, { ...bounds, padToSessionEnd: true })
      return {
        priceSeries: builtPrice as (LineData<Time> | WhitespaceData<Time>)[],
        volumeSeries: builtVol as (HistogramData<Time> | WhitespaceData<Time>)[],
      }
    }

    // Daily series (3m / 1y): strictly validate YYYY-MM-DD so placeholder intraday "HH:mm"
    // points can never be passed into Lightweight Charts daily BusinessDay parsing.
    const byDate = new Map<string, { value: number; volume: number | null }>()
    for (const pt of points) {
      if (!pt.time || !Number.isFinite(pt.value)) continue
      const match = DAILY_DATE_PREFIX_RE.exec(pt.time.trim())
      if (!match) continue
      const key = match[1]
      byDate.set(key, {
        value: pt.value,
        volume: pt.volume != null && Number.isFinite(pt.volume) ? pt.volume : null,
      })
    }

    const sortedDates = Array.from(byDate.keys()).sort()
    const dailyPrice: LineData<Time>[] = []
    const dailyVol: (HistogramData<Time> | WhitespaceData<Time>)[] = []
    let prevClose: number | null = null

    for (const dateKey of sortedDates) {
      const entry = byDate.get(dateKey)
      if (!entry) continue
      const time = dateKey as Time
      dailyPrice.push({ time, value: entry.value })
      const isDown = prevClose !== null && entry.value < prevClose
      prevClose = entry.value
      if (entry.volume !== null) {
        dailyVol.push({
          time,
          value: entry.volume,
          color: isDown ? volColors.dn : volColors.up,
        })
      } else {
        dailyVol.push({ time })
      }
    }

    return {
      priceSeries: dailyPrice,
      volumeSeries: dailyVol,
    }
  }, [data?.series, validRefPrice, activeSymbol, isIntraday, volColors.dn, volColors.up])

  if (!data || !activeCard) {
    return <MoEmptyData />
  }

  const tone = signedTone(activeCard.change)
  const toneClass = toneToMoClass(tone)
  const headlinePrice = isFutures
    ? formatFuturesPrice(activeCard.price)
    : formatIndexPrice(activeCard.price)
  const headlineDelta = `${formatSigned(activeCard.change, isFutures ? 1 : 2)} · ${formatPct(activeCard.changePct)}`
  const headlineKlGt = formatCardVolume(activeCard)
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")
  const effectiveRefPrice = isIntraday ? validRefPrice : null
  const hasVolume = volumeSeries.some((pt) => "value" in pt)

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mo-ixc">
        <div className="mo-ixc-grid">
          {cards.map((card) => (
            <IndexCardButton
              key={card.code}
              card={card}
              active={card.code === activeCard.code}
              onSelect={handleSelectCard}
            />
          ))}
        </div>
      </div>

      <div className="mo-ixhd">
        <span className={`mo-ixv ${toneClass} ${flashClass(activeFlash)} rounded-sm`}>
          {headlinePrice}
        </span>
        <span className={`mo-pillc ${toneClass}`}>{headlineDelta}</span>
        <span className="mo-ixkl">
          <b className="text-[var(--mo-tx)]">{activeCard.name}</b>
          {headlineKlGt !== MISSING_VALUE ? ` · ${headlineKlGt}` : ""}
        </span>
        {sessionLabel !== MISSING_VALUE && (
          <span className="mo-ixdate">{sessionLabel}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 px-1">
        {priceSeries.length > 0 ? (
          <LwcBaselineChart
            data={priceSeries}
            refPrice={effectiveRefPrice}
            seriesName={activeCard.name}
            singleTone={tone === "up" ? "up" : tone === "dn" ? "dn" : "acc"}
            timeMode={isIntraday ? "intraday" : "daily"}
            valueFormatter={priceFormatter}
            showPriceScale
            showTimeScale
            rightPriceScaleMinWidth={DEFAULT_PRICE_AXIS_WIDTH_PX}
            onPriceScaleWidth={handlePriceScaleWidth}
            ariaLabel={`Biểu đồ ${activeCard.name}`}
          />
        ) : (
          <MoEmptyData />
        )}
      </div>

      {hasVolume && (
        <div
          className="mo-ixvol h-[44px] w-full shrink-0 border-t border-[var(--mo-line)] pl-1"
          style={{ paddingRight: `${priceAxisWidth + 4}px` }}
        >
          <LwcHistogramChart
            data={volumeSeries}
            seriesName="Khối lượng"
            colorBySign={false}
            showZeroLine={false}
            showPriceScale={false}
            showTimeScale={false}
            timeMode={isIntraday ? "intraday" : "daily"}
            valueFormatter={formatVolumeAxis}
            ariaLabel={`Khối lượng ${activeCard.name}`}
          />
        </div>
      )}
    </div>
  )
}
