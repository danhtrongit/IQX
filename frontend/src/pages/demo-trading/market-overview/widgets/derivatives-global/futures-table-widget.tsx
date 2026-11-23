import { Fragment, useMemo } from "react"
import {
  MISSING_VALUE,
  formatBillion,
  formatDayMonth,
  formatExpiryRemaining,
  formatFuturesPrice,
  formatIndexPrice,
  formatInt,
  formatPct,
  formatSessionLabel,
  formatSigned,
  priceTone,
  signedTone,
} from "../../format"
import { sortFuturesGroups } from "../../grid/engine"
import type { FuturesContractGroup } from "../../types"
import {
  MoEmptyData,
  MoFlashValue,
  toneToMoClass,
  type WidgetBodyProps,
} from "../shared"

export type FuturesTableWidgetProps = WidgetBodyProps<"futures_table">

function formatExpiryShort(isoDate: string): string {
  const trimmed = isoDate.trim()
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(-2)}`
  }
  return formatDayMonth(trimmed)
}

export function FuturesTableWidget({ data, meta }: FuturesTableWidgetProps) {
  const orderedGroups = useMemo<FuturesContractGroup[]>(() => {
    if (!data?.groups || data.groups.length === 0) return []
    return sortFuturesGroups(data.groups)
  }, [data])

  if (!data || orderedGroups.length === 0) {
    return <MoEmptyData />
  }

  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="w-full">
      <table className="mo-t">
        <thead>
          <tr>
            <th className="l">Hợp đồng</th>
            <th className="o2">Đáo hạn</th>
            <th className="o4">Còn (phiên)</th>
            <th>Giá</th>
            <th>%</th>
            <th>Basis</th>
            <th className="o1">KL (HĐ)</th>
            <th className="o1">GT (tỷ)</th>
            <th className="o4">NN ròng (tỷ)</th>
          </tr>
        </thead>
        <tbody>
          {orderedGroups.map((group, groupIndex) => (
            <Fragment key={group.underlying}>
              <tr className="grp" data-fit="">
                <td colSpan={9}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{`${group.underlying} · ${formatIndexPrice(group.spotPrice)}`}</span>
                    {groupIndex === 0 && showOffHours && sessionLabel !== MISSING_VALUE && (
                      <span className="mo-note font-medium">{sessionLabel}</span>
                    )}
                  </div>
                </td>
              </tr>
              {group.contracts.map((row) => {
                const pTone = toneToMoClass(priceTone(row.price, row.refPrice))
                const bTone = toneToMoClass(signedTone(row.basis))
                const fTone = toneToMoClass(signedTone(row.foreignNetBillion))
                const isExpiringSoon = row.remainingSessions <= 10
                const isExpiryToday = row.remainingSessions <= 0

                return (
                  <tr
                    key={row.code}
                    className={isExpiringSoon ? "gold mo-gold" : undefined}
                    data-fit=""
                  >
                    <td className="l" title={row.code}>
                      <span className="mo-code">{row.displayCode}</span>
                    </td>
                    <td className="o2">{formatExpiryShort(row.expiryDate)}</td>
                    <td className={`o4 ${isExpiryToday ? "mo-rf mo-b" : ""}`}>
                      {formatExpiryRemaining(row.remainingSessions)}
                    </td>
                    <td>
                      <MoFlashValue
                        value={row.price}
                        formatted={formatFuturesPrice(row.price)}
                        resetKey={row.code}
                        className={`mo-b ${pTone}`}
                      />
                    </td>
                    <td className={`mo-b ${pTone}`}>{formatPct(row.changePct, 2)}</td>
                    <td className={bTone}>{formatSigned(row.basis, 2)}</td>
                    <td className="o1">{formatInt(row.volumeContracts)}</td>
                    <td className="o1">
                      {formatBillion(row.valueBillion, 1, { includeUnit: false })}
                    </td>
                    <td className={`o4 ${fTone}`}>
                      {formatBillion(row.foreignNetBillion, 1, {
                        signed: true,
                        includeUnit: false,
                      })}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
