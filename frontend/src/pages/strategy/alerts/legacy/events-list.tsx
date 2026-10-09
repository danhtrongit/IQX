import { Skeleton } from "@/components/ui/skeleton"

import { errorMessage } from "../../shared/errors"
import { fmtDateTime, fmtNumber } from "../../shared/format"
import { useLegacyEvents } from "./hooks"

const TH = "px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/** The 50 most recent legacy signals; "Gửi" is the real Telegram delivery state of each. */
export function LegacyEventsList() {
  const events = useLegacyEvents(true)
  if (events.isPending) return <Skeleton className="h-24 w-full" />
  if (events.isError) return <p role="alert" className="text-xs text-destructive">{errorMessage(events.error)}</p>
  if (events.data.length === 0) return <p className="text-xs text-muted-foreground">Chưa có tín hiệu cũ nào.</p>
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] border-collapse text-xs" aria-label="Tín hiệu của cảnh báo cũ">
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className={TH}>Thời gian</th>
            <th scope="col" className={TH}>Mã</th>
            <th scope="col" className={TH}>Tín hiệu</th>
            <th scope="col" className={`${TH} text-right`}>Giá</th>
            <th scope="col" className={TH}>Gửi Telegram</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {events.data.map((event) => (
            <tr key={event.id}>
              <td className="px-3 py-2">{fmtDateTime(event.firedAt)}</td>
              <td className="px-3 py-2 font-semibold">{event.symbol}</td>
              <td className="px-3 py-2 text-muted-foreground">{event.signalKey ?? "—"}</td>
              <td className="px-3 py-2 text-right">{fmtNumber(event.price, 0)}</td>
              <td className="px-3 py-2">{event.delivered ? "Đã gửi" : "Chưa gửi"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
