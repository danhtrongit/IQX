/**
 * AI Insight v2 briefing — the 6-layer daily stock briefing (masthead, header
 * strip, briefing card, L1–L5 detail layers).
 *
 * The dialog shell, the premium gate and the "AI Phân tích" action belong to
 * the host page; this subtree owns the briefing body only. `analyze()` is a
 * premium-gated, 30–60s LLM request, so it fires once per symbol and only while
 * there is nothing to show yet. `injected` renders a pre-supplied analysis
 * (public teaser) without touching the API; `teaser` trims the detail to L1.
 */
import { useEffect, useRef, type JSX } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useStockAiInsight } from "../hooks"
import type { AIInsightResponse, LayerCard as LayerCardData } from "../types"

import { BriefingCard } from "./briefing-card"
import { HeaderStrip } from "./header-strip"
import { LayerCard } from "./layer-card"
import { LayerCharts } from "./layer-charts"
import { Masthead } from "./masthead"
import { NewsList } from "./news-list"

export type StockInsightBriefingProps = {
  symbol: string
  /** Pre-supplied analysis — skips the (premium-gated) API call. */
  injected?: AIInsightResponse
  /** Public teaser: render the briefing + L1 only, hide the detail layers. */
  teaser?: boolean
}

type LayerNumber = LayerCardData["layerNum"]

const LAYER_ORDER: readonly LayerNumber[] = ["L1", "L2", "L3", "L4", "L5"]
const TEASER_ORDER: readonly LayerNumber[] = ["L1"]

const BRIEFING_SKELETON_TARGETS = [
  "tour-phantich-trend",
  "tour-phantich-narrative",
  "tour-phantich-diff",
  "tour-phantich-observations",
  "tour-phantich-levels",
  "tour-phantich-verdict",
]

const SURFACE = "mx-auto w-full max-w-[920px]"

function LoadingState({ symbol }: { symbol: string }): JSX.Element {
  return (
    <div data-testid="ai-insight-skeleton" className={`${SURFACE} flex flex-col py-6`}>
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">AI đang phân tích {symbol}…</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Đang tổng hợp 6 lớp dữ liệu (xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức). Có thể
            mất khoảng 30–60 giây.
          </p>
        </div>
      </div>
      <Skeleton data-tour-id="tour-phantich-header" className="mt-4 h-[72px] w-full" />
      {BRIEFING_SKELETON_TARGETS.map((id) => (
        <Skeleton key={id} data-tour-id={id} className="mt-2.5 h-[72px] w-full" />
      ))}
      <Skeleton data-tour-id="tour-phantich-divider" className="mt-5 h-8 w-full" />
      {[1, 2, 3, 4, 5].map((n) => (
        <Skeleton key={n} data-tour-id={`tour-phantich-l${n}`} className="mt-3 h-[120px] w-full" />
      ))}
    </div>
  )
}

export function StockInsightBriefing({
  symbol,
  injected,
  teaser = false,
}: StockInsightBriefingProps): JSX.Element {
  const { insight: fetched, analyze, isPending, isError, error, reset } = useStockAiInsight(symbol)
  const insight = injected ?? fetched

  // Guards the one-shot analyze() per symbol (the hook's analyze is a no-op for
  // non-premium readers, so it must not be re-fired on every render).
  const requestedSymbol = useRef<string | null>(null)


  useEffect(() => {
    if (injected || insight || isPending || isError) return
    if (requestedSymbol.current === symbol) return
    requestedSymbol.current = symbol
    analyze()
  }, [injected, insight, isPending, isError, symbol, analyze])

  // Still loading, or the first render before analyze() fired (isPending is
  // false then) — keeps the briefing from flashing blank.
  if (!injected && (isPending || (!insight && !isError))) {
    return <LoadingState symbol={symbol} />
  }

  if (!injected && isError) {
    return (
      <div className={`${SURFACE} flex flex-col items-start gap-3 py-6`}>
        <p role="alert" className="text-xs leading-5 text-destructive">
          Không thể tải phân tích AI — vui lòng thử lại sau.
        </p>
        {error?.message ? (
          <p className="text-xs leading-5 text-muted-foreground">{error.message}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset()
            analyze()
          }}
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Thử lại
        </Button>
      </div>
    )
  }

  if (!insight) {
    return (
      <div className={`${SURFACE} py-6`}>
        <p className="text-xs leading-5 text-muted-foreground">
          Chưa có dữ liệu phân tích cho {symbol}. Bản tin sẽ hiển thị khi phân tích hoàn tất.
        </p>
      </div>
    )
  }

  const layerOrder = teaser ? TEASER_ORDER : LAYER_ORDER

  return (
    <div
      data-tour-id="tour-phantich-ready"
      className={`${SURFACE} flex flex-col gap-3 pb-10`}
    >
      <Masthead updatedAt={insight.updatedAt} />
      {insight.header ? <HeaderStrip header={insight.header} /> : null}
      {insight.briefing ? <BriefingCard data={insight.briefing} /> : null}

      <div data-tour-id="tour-phantich-divider" className="my-2 flex items-center gap-3 px-1">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Chi tiết phân tích
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      {layerOrder.map((layerNum) => {
        const layer = insight.layers?.[layerNum]
        // A missing layer keeps its slot (the tour and the reader both address
        // these blocks) but says so instead of rendering an empty card.
        if (!layer) {
          return (
            <section
              key={layerNum}
              data-tour-id={`tour-phantich-${layerNum.toLowerCase()}`}
              className="rounded-lg border-0 bg-card px-4 py-4"
            >
              <p className="text-xs leading-5 text-muted-foreground">
                Chưa có dữ liệu lớp {layerNum} cho {symbol}.
              </p>
            </section>
          )
        }
        return (
          <LayerCard
            key={layerNum}
            data={layer}
            chart={
              layerNum === "L5" ? (
                <NewsList material={layer.news?.material} filler={layer.news?.filler} />
              ) : (
                <LayerCharts layer={layerNum} rawInput={insight.rawInput} />
              )
            }
          />
        )
      })}
    </div>
  )
}
