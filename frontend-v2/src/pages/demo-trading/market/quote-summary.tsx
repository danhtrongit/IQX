/**
 * Compact quote strip for the demo shell's main toolbar.
 *
 * Container-responsive rows: symbol, last matched price and reference move,
 * then board levels (trần/sàn/cao/thấp/khối lượng) when space is constrained.
 * The panel and journey share the same real market quote and freshness state.
 *
 * Unknowns are shown as explicit copy ("Chưa có dữ liệu"), never as 0đ.
 */
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatNumber, formatPercent } from "@/lib/format"

import { SymbolPicker } from "./symbol-picker"
import { QUOTE_POLL_MS, quoteChange, useQuote } from "./use-quote"

const TONE_CLASS: Record<string, string> = {
  up: "text-price-up",
  down: "text-price-down",
  ref: "text-price-ref",
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string
  value: string
  tone?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col justify-center leading-tight", className)}>
      <span className="text-xs text-muted-foreground">
        {label}
      </span>
      <span
        className={cn("font-heading text-xs font-semibold tabular-nums", tone)}
      >
        {value}
      </span>
    </div>
  )
}

export type QuoteSummaryProps = {
  symbol: string
  onSymbolChange: (symbol: string) => void
  className?: string
}

export function QuoteSummary({ symbol, onSymbolChange, className }: QuoteSummaryProps) {
  const code = symbol.trim().toUpperCase()
  const quote = useQuote(code)
  const change = quoteChange(quote.data)
  const tone = change ? TONE_CLASS[change.tone] : undefined

  // `data === null` is a real answer from the upstream ("không có mã này"),
  // distinct from "chưa tải xong".
  const missing = !quote.isLoading && !quote.isError && quote.data === null

  return (
    <div
      className={cn(
        "@container/quote flex h-full min-w-0 flex-wrap items-center gap-x-3 gap-y-3 px-1",
        className,
      )}
    >
      <SymbolPicker symbol={code} onSymbolChange={onSymbolChange} />

      <Separator orientation="vertical" className="h-7!" />

      {quote.isError ? (
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          <span className="truncate">{errorMessage(quote.error)}</span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => void quote.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : missing ? (
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Chưa có dữ liệu cho <span className="font-semibold">{code}</span>, mã có thể
          không giao dịch hoặc bảng giá chưa trả về.
        </p>
      ) : (
        <>
          <div className="flex shrink-0 items-baseline gap-1.5">
            {quote.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <>
                <span
                  className={cn(
                    "font-heading text-lg leading-none font-bold tabular-nums",
                    tone,
                  )}
                >
                  {formatNumber(quote.data?.price)}
                </span>
                <span className="text-xs text-muted-foreground">đ</span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {quote.isLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : change ? (
              <>
                <span className={cn("text-xs font-semibold tabular-nums", tone)}>
                  {change.absolute > 0 ? "+" : ""}
                  {formatNumber(change.absolute)}đ
                </span>
                <span className={cn("text-xs font-semibold tabular-nums", tone)}>
                  ({formatPercent(change.percent)})
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Chưa có giá khớp</span>
            )}
          </div>

          <Separator orientation="vertical" className="hidden h-7! @min-[900px]/quote:block" />

          <div className="order-last flex w-full flex-wrap items-center gap-x-5 gap-y-2 @min-[900px]/quote:order-none @min-[900px]/quote:w-auto">
            <Stat label="TC" value={formatNumber(quote.data?.reference)} />
            <Stat
              label="Trần"
              value={formatNumber(quote.data?.ceiling)}
              tone="text-price-ceiling"
            />
            <Stat
              label="Sàn"
              value={formatNumber(quote.data?.floor)}
              tone="text-price-floor"
            />
            <Stat label="Cao" value={formatNumber(quote.data?.high)} />
            <Stat label="Thấp" value={formatNumber(quote.data?.low)} />
            <Stat
              label="KL"
              value={formatNumber(quote.data?.volume)}
            />
          </div>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span
          className="hidden text-xs text-muted-foreground @min-[1050px]/quote:inline"
          title={`Bảng giá tự làm mới mỗi ${Math.round(QUOTE_POLL_MS / 1000)}s`}
        >
          {quote.dataUpdatedAt
            ? `Cập nhật ${new Date(quote.dataUpdatedAt).toLocaleTimeString("vi-VN")}`
            : "Chưa cập nhật"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Làm mới giá"
          title={quote.dataUpdatedAt ? `Cập nhật ${new Date(quote.dataUpdatedAt).toLocaleTimeString("vi-VN")}` : "Chưa cập nhật"}
          disabled={quote.isFetching}
          onClick={() => void quote.refetch()}
        >
          {quote.isFetching ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  )
}
