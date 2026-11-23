import { formatNum, formatPct, signedTone } from "../../format"
import {
  MoEmptyData,
  MoFlashValue,
  toneToMoClass,
  type WidgetBodyProps,
} from "../shared"

export type WorldIndicesWidgetProps = WidgetBodyProps<"world_indices">

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function formatUpdatedLabel(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  // Date-only bar stamps ("YYYY-MM-DD") must render as dd/mm — NEVER shifted +7h to "07:00".
  const dateOnly = DATE_ONLY_RE.exec(trimmed)
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}`
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return ""
  const vnDate = new Date(parsed + 7 * 3_600_000)
  const hh = String(vnDate.getUTCHours()).padStart(2, "0")
  const mm = String(vnDate.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

export function WorldIndicesWidget({ data }: WorldIndicesWidgetProps) {
  if (!data || data.items.length === 0) {
    return <MoEmptyData />
  }

  return (
    <div className="w-full">
      {data.items.map((item) => {
        const pctTone = toneToMoClass(signedTone(item.changePct))
        const updatedLabel = formatUpdatedLabel(item.updatedAt || data.updatedAt)
        const subtitle = item.isClosed
          ? updatedLabel
            ? `${item.region} · Đóng cửa · ${updatedLabel}`
            : `${item.region} · Đóng cửa`
          : updatedLabel
            ? `${item.region} · ${updatedLabel}`
            : item.region
        const rowTitle = updatedLabel
          ? `${item.name} (${item.region}) · ${item.isClosed ? "Đóng cửa" : "Đang mở"} · ${updatedLabel}`
          : `${item.name} (${item.region})`

        return (
          <div key={item.code} className="mo-rowit" data-fit="" title={rowTitle}>
            <div className="min-w-0">
              <span className="mo-code block truncate">{item.name}</span>
              <span className="mo-sub truncate">{subtitle}</span>
            </div>
            <div className="r shrink-0">
              <MoFlashValue
                value={item.price}
                formatted={formatNum(item.price, 2)}
                resetKey={item.code}
                className="mo-b block"
              />
              <span className={`mo-note block font-semibold ${pctTone}`}>
                {formatPct(item.changePct, 2)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
