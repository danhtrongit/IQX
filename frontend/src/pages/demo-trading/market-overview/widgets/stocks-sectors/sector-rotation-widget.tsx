import { RrgSvg } from "../../charts/rrg-svg"
import { MISSING_VALUE, formatDayMonth } from "../../format"
import { MoEmptyData, type WidgetBodyProps } from "../shared"

export function SectorRotationWidget({
  data,
}: WidgetBodyProps<"sector_rotation">) {
  if (!data || data.sectors.length === 0) {
    return <MoEmptyData />
  }

  const weekEnding = formatDayMonth(data.asOfDate)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {weekEnding !== MISSING_VALUE && (
        <div className="flex shrink-0 items-center justify-between px-3 pt-1.5">
          <span className="mo-note">So với VN-Index · Chu kỳ tuần</span>
          <span className="mo-note">Tuần {weekEnding}</span>
        </div>
      )}
      <div className="relative min-h-0 flex-1 w-full">
        <RrgSvg sectors={data.sectors} domain={data.domain} />
      </div>
    </div>
  )
}
