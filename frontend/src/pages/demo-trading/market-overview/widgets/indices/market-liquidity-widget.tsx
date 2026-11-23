import { useCallback, useMemo } from "react"
import { buildIntradaySeriesData } from "../../charts/intraday-axis"
import {
  LwcMultiLineChart,
  type LwcMultiLineSeriesInput,
} from "../../charts/lwc-host"
import {
  MISSING_VALUE,
  formatBillion,
  formatNum,
  formatSessionLabel,
} from "../../format"
import {
  MoEmptyData,
  flashClass,
  useValueFlash,
  type WidgetBodyProps,
} from "../shared"

function ratioToneClass(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return ""
  if (pct > 100 + 1e-6) return "mo-up"
  if (pct < 100 - 1e-6) return "mo-dn"
  return "mo-rf"
}

export function MarketLiquidityWidget({
  data,
  meta,
}: WidgetBodyProps<"market_liquidity">) {
  const valueFlash = useValueFlash(data?.currentValueBillion)

  const formatTooltipBillion = useCallback(
    (value: number) => formatBillion(value, 0),
    [],
  )

  const chartSeries = useMemo<LwcMultiLineSeriesInput[]>(() => {
    const points = data?.series ?? []
    if (points.length === 0) return []

    return [
      {
        id: "today",
        name: "Hôm nay",
        colorToken: "acc2",
        lineWidth: 2,
        data: buildIntradaySeriesData(
          points.map((pt) => ({ time: pt.time, value: pt.todayBillion })),
          { padToSessionEnd: true },
        ),
      },
      {
        id: "prev",
        name: "Phiên trước",
        colorToken: "tx2",
        lineWidth: 1,
        data: buildIntradaySeriesData(
          points.map((pt) => ({ time: pt.time, value: pt.prevSessionBillion })),
          { padToSessionEnd: true },
        ),
      },
      {
        id: "avg20",
        name: "TB20",
        colorToken: "ref",
        lineWidth: 1,
        dashed: true,
        data: buildIntradaySeriesData(
          points.map((pt) => ({ time: pt.time, value: pt.avg20Billion })),
          { padToSessionEnd: true },
        ),
      },
    ]
  }, [data?.series])

  if (!data) {
    return <MoEmptyData />
  }

  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")
  const prevPctText =
    data.pctVsPrevSameTime != null && Number.isFinite(data.pctVsPrevSameTime)
      ? `${formatNum(data.pctVsPrevSameTime, 0)}%`
      : MISSING_VALUE
  const avg20PctText =
    data.pctVsAvg20SameTime != null && Number.isFinite(data.pctVsAvg20SameTime)
      ? `${formatNum(data.pctVsAvg20SameTime, 0)}%`
      : MISSING_VALUE

  return (
    <div className="mo-pad flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className={`mo-big ${flashClass(valueFlash)} rounded-sm`}>
            {formatBillion(data.currentValueBillion, 0)}
          </span>
          <span className="mo-note">
            HOSE{sessionLabel !== MISSING_VALUE ? ` · ${sessionLabel}` : ""}
          </span>
        </div>

        <div className="mo-note mt-1">
          <b className={ratioToneClass(data.pctVsPrevSameTime)}>{prevPctText}</b>{" "}
          cùng giờ phiên trước{" · "}
          <b className={ratioToneClass(data.pctVsAvg20SameTime)}>{avg20PctText}</b>{" "}
          TB20
        </div>

        <div className="mo-lgd">
          <span>
            <i style={{ backgroundColor: "var(--mo-acc2)" }} />
            Hôm nay
          </span>
          <span>
            <i style={{ backgroundColor: "var(--mo-tx2)" }} />
            Phiên trước
          </span>
          <span>
            <i className="ds" />
            TB20
          </span>
        </div>
      </div>

      <div className="mt-1.5 min-h-0 flex-1">
        {chartSeries.length > 0 ? (
          <LwcMultiLineChart
            series={chartSeries}
            timeMode="intraday"
            valueFormatter={formatTooltipBillion}
            showPriceScale
            showTimeScale
            ariaLabel="Biểu đồ thanh khoản thị trường HOSE"
          />
        ) : (
          <MoEmptyData />
        )}
      </div>
    </div>
  )
}
