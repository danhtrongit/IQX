import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import {
  changeArrow,
  formatVolume,
  formatVndBillion,
  toneClass,
} from "../../format"
import { useForeignFlow, useMarketOverview } from "../../overview"

/** Fixed-decimal en-US number, e.g. 1,824.35. */
function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function PulseCell({
  label,
  hero,
  children,
}: {
  label: string
  hero?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 bg-card px-4 py-3.5",
        hero && "col-span-2 md:col-span-1 md:px-5 md:py-4"
      )}
    >
      <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * Live strip above the end-of-day brief: VN-Index, HOSE breadth, foreign net,
 * traded value and the (not yet available) MA20 health ratio. The two live
 * queries report `loading` / `isError`; while loading the cells show skeletons
 * and on failure they keep "—" plus an explicit error line — never zeros that
 * would read as real numbers.
 */
export function MarketPulseBar() {
  const {
    data: overview,
    loading: overviewLoading,
    isError: overviewError,
  } = useMarketOverview()
  const {
    data: flow,
    loading: flowLoading,
    isError: flowError,
  } = useForeignFlow()

  const loading = overviewLoading || flowLoading
  const errored = overviewError || flowError

  const vni = overview?.vnindex
  const breadth = overview?.marketBreadth
  const breadthKnown =
    breadth &&
    breadth.advance !== null &&
    breadth.decline !== null &&
    breadth.unchanged !== null &&
    breadth.ceiling !== null &&
    breadth.floor !== null
  const breadthTotal = breadthKnown
    ? breadth!.advance! + breadth!.decline! + breadth!.unchanged!
    : null
  const advancePct =
    breadthTotal && breadthTotal > 0
      ? (breadth!.advance! / breadthTotal) * 100
      : 0
  const unchangedPct =
    breadthTotal && breadthTotal > 0
      ? (breadth!.unchanged! / breadthTotal) * 100
      : 0
  const declinePct =
    breadthTotal && breadthTotal > 0
      ? (breadth!.decline! / breadthTotal) * 100
      : 0
  const ratioLabel =
    breadthKnown && breadth!.decline! > 0
      ? `tỷ lệ 1:${(breadth!.decline! / (breadth!.advance! || 1)).toFixed(1)}`
      : "tỷ lệ —"

  const liquidityBillions =
    vni?.valueTraded == null ? null : vni.valueTraded / 1e9
  const netValue = flow?.netValue

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <div
        role="group"
        aria-label="Thống kê nhanh thị trường"
        className="grid grid-cols-2 gap-px bg-border md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]"
      >
        <PulseCell label="VN-INDEX" hero>
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "text-[28px] font-semibold tracking-[-0.02em] tabular-nums",
                  vni?.changePercent == null
                    ? "text-muted-foreground"
                    : toneClass(vni.changePercent)
                )}
              >
                {vni?.value == null ? "—" : formatNumber(vni.value)}
              </span>
              {vni?.change != null && vni.changePercent != null && (
                <div className="flex flex-col leading-tight">
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      toneClass(vni.change)
                    )}
                  >
                    {vni.change >= 0 ? "+" : ""}
                    {formatNumber(vni.change)}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      toneClass(vni.changePercent)
                    )}
                  >
                    {changeArrow(vni.changePercent)}
                    {Math.abs(vni.changePercent).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </PulseCell>

        <PulseCell label="ĐỘ RỘNG">
          {loading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <>
              <div className="flex items-baseline gap-1 text-lg font-semibold tabular-nums">
                <span className="text-price-up">
                  {breadth?.advance == null
                    ? "—"
                    : breadth.advance.toLocaleString("en-US")}
                </span>
                <span className="text-sm text-muted-foreground">·</span>
                <span className="text-price-down">
                  {breadth?.decline == null
                    ? "—"
                    : breadth.decline.toLocaleString("en-US")}
                </span>
              </div>
              {breadth && breadthKnown && (
                <>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {ratioLabel}
                    {breadth!.unchanged! > 0 &&
                      ` · ${breadth!.unchanged!.toLocaleString("en-US")} đứng`}
                    {breadth!.ceiling! > 0 && (
                      <>
                        {" · "}
                        <span className="text-price-ceiling">
                          {breadth!.ceiling!.toLocaleString("en-US")} trần
                        </span>
                      </>
                    )}
                    {breadth!.floor! > 0 && (
                      <>
                        {" · "}
                        <span className="text-price-floor">
                          {breadth!.floor!.toLocaleString("en-US")} sàn
                        </span>
                      </>
                    )}
                  </span>
                  {breadthTotal != null && breadthTotal > 0 && (
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-price-up"
                        style={{ width: `${advancePct}%` }}
                      />
                      <div
                        className="h-full bg-price-ref"
                        style={{ width: `${unchangedPct}%` }}
                      />
                      <div
                        className="h-full bg-price-down"
                        style={{ width: `${declinePct}%` }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </PulseCell>

        <PulseCell label="KHỐI NGOẠI">
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <>
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  netValue == null
                    ? "text-muted-foreground"
                    : toneClass(netValue)
                )}
              >
                {netValue == null
                  ? "—"
                  : `${netValue > 0 ? "+" : ""}${formatVndBillion(netValue)}`}
              </span>
              {netValue != null && (
                <span className="mt-1 text-xs text-muted-foreground">
                  {netValue > 0
                    ? "Mua ròng"
                    : netValue < 0
                      ? "Bán ròng"
                      : "Cân bằng"}
                </span>
              )}
            </>
          )}
        </PulseCell>

        <PulseCell label="THANH KHOẢN">
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  {liquidityBillions === null
                    ? "—"
                    : formatNumber(liquidityBillions, 0)}
                </span>
                {liquidityBillions !== null && (
                  <span className="text-xs text-muted-foreground">tỷ</span>
                )}
              </div>
              {liquidityBillions !== null && (
                <span className="mt-1 text-xs text-muted-foreground">
                  GTGD VNIndex
                </span>
              )}
              {vni?.volume != null && vni.volume > 0 && (
                <span className="text-xs text-muted-foreground">
                  {formatVolume(vni.volume)}
                </span>
              )}
            </>
          )}
        </PulseCell>

        <PulseCell label="SỨC KHỎE TT">
          <span className="text-lg font-semibold text-muted-foreground tabular-nums">
            —
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            % mã trên MA20
          </span>
        </PulseCell>

        {errored && !loading && (
          <div className="col-span-full bg-card px-4 py-2 text-xs text-muted-foreground">
            Chưa tải được số liệu thị trường.
          </div>
        )}
      </div>
    </div>
  )
}
