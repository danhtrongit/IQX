import { useMemo } from "react"
import {
  MISSING_VALUE,
  formatInt,
  formatNum,
  formatPct,
  formatSessionLabel,
  signedTone,
} from "../../format"
import type { SectorPerfRange, SectorPerfTab } from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  MoSubTabs,
  toneToMoClass,
  type MoSegmentOption,
  type MoSubTabOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

const RANGE_OPTIONS: readonly MoSegmentOption<SectorPerfRange>[] = [
  { value: "1d", label: "Hôm nay" },
  { value: "1w", label: "1 tuần" },
  { value: "1m", label: "1 tháng" },
  { value: "ytd", label: "Từ đầu năm" },
]

const PERF_TABS: readonly MoSubTabOption<SectorPerfTab>[] = [
  { value: "price", label: "Biến động giá" },
  { value: "flow", label: "Dòng tiền" },
]

function flowRatioClass(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return ""
  if (ratio >= 1.2) return "mo-ce"
  if (ratio < 0.8) return "mo-dn"
  return ""
}

export function SectorPerformanceHeaderControls({
  state,
  onStateChange,
}: WidgetControlsProps<"sector_performance">) {
  return (
    <MoSegmentedControl
      options={RANGE_OPTIONS}
      value={state.range}
      onChange={(range) => onStateChange({ range })}
      ariaLabel="Khung thời gian hiệu suất ngành"
    />
  )
}

export function SectorPerformanceWidget({
  state,
  data,
  meta,
  onStateChange,
}: WidgetBodyProps<"sector_performance">) {
  const { sortedSectors, maxAbsPct, maxSharePct } = useMemo(() => {
    const raw = data?.sectors ?? []
    if (state.tab === "flow") {
      const sorted = [...raw].sort((a, b) => b.valueSharePct - a.valueSharePct)
      const peakShare = sorted.reduce(
        (acc, item) => Math.max(acc, Math.max(0, item.valueSharePct)),
        0,
      )
      return {
        sortedSectors: sorted,
        maxAbsPct: 1,
        maxSharePct: Math.max(0.01, peakShare),
      }
    }

    const sorted = [...raw].sort((a, b) => b.changePct - a.changePct)
    const peakPct = sorted.reduce(
      (acc, item) => Math.max(acc, Math.abs(item.changePct)),
      0,
    )
    return {
      sortedSectors: sorted,
      maxAbsPct: Math.max(0.01, peakPct),
      maxSharePct: 1,
    }
  }, [data?.sectors, state.tab])

  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data?.sessionDate || meta?.sessionDate || "")

  return (
    <div>
      <MoSubTabs
        options={PERF_TABS}
        value={state.tab}
        onChange={(tab) => onStateChange({ tab })}
        ariaLabel="Chế độ xem hiệu suất ngành"
        rightSlot={
          showOffHours && sessionLabel !== MISSING_VALUE ? (
            <span className="mo-note ml-auto self-center whitespace-nowrap">
              {sessionLabel}
            </span>
          ) : undefined
        }
      />

      {sortedSectors.length === 0 ? (
        <MoEmptyData className="py-8" />
      ) : state.tab === "price" ? (
        <div className="mo-pad">
          {sortedSectors.map((sector) => {
            const isPositive = sector.changePct >= 0
            const barWidthPct = Math.min(
              50,
              (Math.abs(sector.changePct) / maxAbsPct) * 50,
            )
            const toneClass = toneToMoClass(signedTone(sector.changePct))
            const adv = Math.max(0, Math.round(sector.advancing))
            const dec = Math.max(0, Math.round(sector.declining))
            const breadthTooltip = `${formatInt(adv)} mã tăng · ${formatInt(dec)} mã giảm`

            return (
              <div
                key={sector.icbCode}
                data-fit="true"
                className="mo-dv"
                style={{
                  gridTemplateColumns: "minmax(96px, 136px) 1fr 58px 44px",
                }}
              >
                <span className="n" title={sector.name}>
                  {sector.name}
                </span>
                <span className="tr" aria-hidden="true">
                  <i
                    style={{
                      left: isPositive ? "50%" : undefined,
                      right: isPositive ? undefined : "50%",
                      width: `${barWidthPct.toFixed(2)}%`,
                      backgroundColor: isPositive
                        ? "var(--mo-up)"
                        : "var(--mo-dn)",
                    }}
                  />
                </span>
                <span className={`v ${toneClass}`}>
                  {formatPct(sector.changePct)}
                </span>
                <span
                  className="mo-mb"
                  role="img"
                  aria-label={breadthTooltip}
                  title={breadthTooltip}
                >
                  {adv + dec > 0 ? (
                    <>
                      {adv > 0 && (
                        <span
                          style={{
                            flexGrow: adv,
                            flexBasis: 0,
                            backgroundColor: "var(--mo-up)",
                          }}
                        />
                      )}
                      {dec > 0 && (
                        <span
                          style={{
                            flexGrow: dec,
                            flexBasis: 0,
                            backgroundColor: "var(--mo-dn)",
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <span
                      style={{
                        flexGrow: 1,
                        backgroundColor: "var(--mo-line2)",
                      }}
                    />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mo-pad">
          <div
            className="mo-dv hdr mo-bar-one pb-1 pt-0"
            style={{
              gridTemplateColumns: "minmax(96px, 136px) 1fr 56px 56px",
            }}
          >
            <span className="n mo-note">Ngành</span>
            <span />
            <span className="v">% GTGD</span>
            <span className="v">so TB20</span>
          </div>

          {sortedSectors.map((sector) => {
            const shareWidthPct = Math.min(
              100,
              (Math.max(0, sector.valueSharePct) / maxSharePct) * 100,
            )
            const ratioText =
              sector.valueVsAvg20Ratio != null &&
              Number.isFinite(sector.valueVsAvg20Ratio)
                ? `×${formatNum(sector.valueVsAvg20Ratio, 2)}`
                : MISSING_VALUE
            const ratioCls = flowRatioClass(sector.valueVsAvg20Ratio)

            return (
              <div
                key={sector.icbCode}
                data-fit="true"
                className="mo-dv mo-bar-one"
                style={{
                  gridTemplateColumns: "minmax(96px, 136px) 1fr 56px 56px",
                }}
              >
                <span className="n" title={sector.name}>
                  {sector.name}
                </span>
                <span className="tr" aria-hidden="true">
                  <i
                    style={{
                      left: 0,
                      width: `${shareWidthPct.toFixed(2)}%`,
                      backgroundColor: "var(--mo-acc2)",
                    }}
                  />
                </span>
                <span className="v">{formatNum(sector.valueSharePct, 1)}%</span>
                <span className={`v ${ratioCls}`}>{ratioText}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
