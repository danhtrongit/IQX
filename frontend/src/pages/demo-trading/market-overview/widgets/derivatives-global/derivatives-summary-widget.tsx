import {
  MISSING_VALUE,
  formatBillion,
  formatDayMonth,
  formatFuturesPrice,
  formatIndexPrice,
  formatInt,
  formatPct,
  formatSessionLabel,
  formatSigned,
  priceTone,
  signedTone,
} from "../../format"
import {
  MoEmptyData,
  MoFlashValue,
  toneToMoClass,
  type WidgetBodyProps,
} from "../shared"

export type DerivativesSummaryWidgetProps = WidgetBodyProps<"derivatives_summary">

export function DerivativesSummaryWidget({
  data,
  meta,
}: DerivativesSummaryWidgetProps) {
  if (!data) {
    return <MoEmptyData />
  }

  const vn30fTone = toneToMoClass(priceTone(data.vn30fPrice, data.vn30fRefPrice))
  const vn30Tone = toneToMoClass(priceTone(data.vn30Price, data.vn30RefPrice))
  const basisTone = toneToMoClass(signedTone(data.basis))
  const foreignTone = toneToMoClass(signedTone(data.foreignNetContracts))

  const expiryDm = formatDayMonth(data.expiryDate)
  const isExpiringToday = data.remainingSessions <= 0
  const expiryLabel = isExpiringToday
    ? `${expiryDm} · hôm nay`
    : `${expiryDm} · còn ${Math.round(data.remainingSessions)} phiên`

  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="w-full">
      {showOffHours && sessionLabel !== MISSING_VALUE && (
        <div className="flex items-center justify-end border-b border-[var(--mo-line)] px-3 py-1">
          <span className="mo-note">{sessionLabel}</span>
        </div>
      )}

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate" title={data.contractCode}>
          VN30F1M
        </span>
        <div className="r flex shrink-0 items-baseline justify-end gap-1.5 whitespace-nowrap">
          <MoFlashValue
            value={data.vn30fPrice}
            formatted={formatFuturesPrice(data.vn30fPrice)}
            resetKey={data.contractCode}
            className={`mo-b ${vn30fTone}`}
          />
          <span className={`mo-note font-semibold ${vn30fTone}`}>
            {formatPct(data.vn30fChangePct, 2)}
          </span>
        </div>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">VN30</span>
        <div className="r flex shrink-0 items-baseline justify-end gap-1.5 whitespace-nowrap">
          <MoFlashValue
            value={data.vn30Price}
            formatted={formatIndexPrice(data.vn30Price)}
            className={`mo-b ${vn30Tone}`}
          />
          <span className={`mo-note font-semibold ${vn30Tone}`}>
            {formatPct(data.vn30ChangePct, 2)}
          </span>
        </div>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">Basis</span>
        <span className={`r mo-b shrink-0 whitespace-nowrap ${basisTone}`}>
          {formatSigned(data.basis, 2)}
        </span>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">Khối lượng</span>
        <span className="r mo-b shrink-0 whitespace-nowrap">
          {`${formatInt(data.volumeContracts)} HĐ`}
        </span>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">Giá trị</span>
        <span className="r mo-b shrink-0 whitespace-nowrap">
          {formatBillion(data.valueBillion, 1)}
        </span>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">Khối ngoại ròng</span>
        <span className={`r mo-b shrink-0 whitespace-nowrap ${foreignTone}`}>
          {`${formatSigned(data.foreignNetContracts, 0)} HĐ`}
        </span>
      </div>

      <div className="mo-rowit" data-fit="">
        <span className="mo-lbl min-w-0 truncate">Đáo hạn</span>
        <span className={`r mo-b shrink-0 whitespace-nowrap ${isExpiringToday ? "mo-rf" : ""}`}>
          {expiryLabel}
        </span>
      </div>
    </div>
  )
}
