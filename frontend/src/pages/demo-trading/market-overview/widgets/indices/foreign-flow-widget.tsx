import { useCallback, useMemo } from "react"
import type { HistogramData, Time } from "lightweight-charts"
import { LwcHistogramChart } from "../../charts/lwc-host"
import {
  MISSING_VALUE,
  formatBillion,
  formatDayMonth,
  formatNum,
  formatSessionLabel,
  signedTone,
} from "../../format"
import type { ExchangeCode, ForeignFlowType } from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  MoSubTabs,
  MoTickerLink,
  flashClass,
  toneToMoClass,
  useValueFlash,
  type MoSegmentOption,
  type MoSubTabOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

const EXCHANGE_OPTIONS: readonly MoSegmentOption<ExchangeCode>[] = [
  { value: "HOSE", label: "HOSE" },
  { value: "HNX", label: "HNX" },
  { value: "UPCOM", label: "UPCoM" },
]

const FLOW_TABS: readonly MoSubTabOption<ForeignFlowType>[] = [
  { value: "foreign", label: "Khối ngoại" },
  { value: "prop", label: "Tự doanh" },
]

export function ForeignFlowHeaderControls({
  state,
  onStateChange,
}: WidgetControlsProps<"foreign_flow">) {
  return (
    <MoSegmentedControl
      options={EXCHANGE_OPTIONS}
      value={state.exchange}
      onChange={(exchange) => onStateChange({ exchange })}
      ariaLabel="Chọn sàn khối ngoại và tự doanh"
    />
  )
}

export function ForeignFlowWidget({
  state,
  data,
  meta,
  onStateChange,
}: WidgetBodyProps<"foreign_flow">) {
  const netFlash = useValueFlash(
    data?.netValueBillion,
    `${state.exchange}-${state.type}`,
  )

  const formatTooltipValue = useCallback(
    (value: number) => formatBillion(value, 1, { signed: true }),
    [],
  )

  const { histogramData, timeLabelMap, sessionCount } = useMemo(() => {
    const recent = (data?.sessions ?? []).slice(-20)
    const labelMap = new Map<number, string>()
    const bars: HistogramData<Time>[] = []

    recent.forEach((session, idx) => {
      labelMap.set(idx, formatDayMonth(session.date))
      bars.push({
        time: idx as Time,
        value: session.netValueBillion,
      })
    })

    return {
      histogramData: bars,
      timeLabelMap: labelMap,
      sessionCount: recent.length,
    }
  }, [data?.sessions])

  const tabsBar = (
    <MoSubTabs
      options={FLOW_TABS}
      value={state.type}
      onChange={(type) => onStateChange({ type })}
      ariaLabel="Loại dòng tiền"
    />
  )

  if (!data) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {tabsBar}
        <div className="min-h-0 flex-1">
          <MoEmptyData />
        </div>
      </div>
    )
  }

  if (state.type === "prop" && !data.supported) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {tabsBar}
        <MoEmptyData message="Tự doanh hiện chỉ hỗ trợ sàn HOSE">
          <button
            type="button"
            className="mo-btn"
            data-no-drag="true"
            onClick={() => onStateChange({ exchange: "HOSE" })}
          >
            Chuyển sang HOSE
          </button>
        </MoEmptyData>
      </div>
    )
  }

  const netToneClass = toneToMoClass(signedTone(data.netValueBillion))
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")
  const showSessionBadge =
    sessionLabel !== MISSING_VALUE &&
    (state.type === "prop" || data.isEodOnly || !meta?.isMarketOpen)

  const topBuy = data.topBuy.slice(0, 3)
  const topSell = data.topSell.slice(0, 3)
  const seriesName = state.type === "prop" ? "Tự doanh ròng" : "Khối ngoại ròng"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {tabsBar}

      <div className="shrink-0 px-3 pb-1 pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`mo-big ${netToneClass} ${flashClass(netFlash)} rounded-sm`}>
            {formatBillion(data.netValueBillion, 1, { signed: true })}
          </span>
          {showSessionBadge && (
            <span className="mo-pill mo-p-ac">{sessionLabel}</span>
          )}
        </div>
        <div className="mo-note mt-0.5">
          Mua {formatNum(data.buyValueBillion, 1)} · Bán{" "}
          {formatNum(data.sellValueBillion, 1)} tỷ · {sessionCount || 20} phiên
        </div>
      </div>

      <div className="min-h-0 flex-1 px-1">
        {histogramData.length > 0 ? (
          <LwcHistogramChart
            data={histogramData}
            seriesName={seriesName}
            colorBySign
            showZeroLine
            timeMode="index"
            timeLabelMap={timeLabelMap}
            valueFormatter={formatTooltipValue}
            showPriceScale
            showTimeScale
            ariaLabel={`Biểu đồ ${seriesName} ${sessionCount || 20} phiên`}
          />
        ) : (
          <MoEmptyData />
        )}
      </div>

      <div className="mo-ftop shrink-0">
        <div>
          <span className="mo-lbl">Mua ròng</span>
          {topBuy.length > 0 ? (
            topBuy.map((ticker) => (
              <MoTickerLink
                key={ticker.symbol}
                symbol={ticker.symbol}
                className="mo-fch"
              >
                <b className="mo-up">{ticker.symbol}</b>
                <span className="mo-note">
                  {formatBillion(ticker.netValueBillion, 1, {
                    signed: true,
                    includeUnit: false,
                  })}
                </span>
              </MoTickerLink>
            ))
          ) : (
            <span className="mo-note">{MISSING_VALUE}</span>
          )}
        </div>

        <div>
          <span className="mo-lbl">Bán ròng</span>
          {topSell.length > 0 ? (
            topSell.map((ticker) => (
              <MoTickerLink
                key={ticker.symbol}
                symbol={ticker.symbol}
                className="mo-fch"
              >
                <b className="mo-dn">{ticker.symbol}</b>
                <span className="mo-note">
                  {formatBillion(ticker.netValueBillion, 1, {
                    signed: true,
                    includeUnit: false,
                  })}
                </span>
              </MoTickerLink>
            ))
          ) : (
            <span className="mo-note">{MISSING_VALUE}</span>
          )}
        </div>
      </div>
    </div>
  )
}
