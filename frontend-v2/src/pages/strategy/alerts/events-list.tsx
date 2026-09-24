/**
 * Lịch sử tín hiệu đã bắn — port từ
 * `dashboard/src/features/alerts/components/EventsList.tsx`.
 *
 * Bảng 50 sự kiện gần nhất (server đã giới hạn). Cột "Gửi" là trạng thái gửi
 * Telegram thật của từng sự kiện, không suy diễn từ việc đã kết nối hay chưa.
 */
import { CheckCircle2, MinusCircle } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage } from "@/lib/api"

import { fmtDateTimeVN, fmtPrice } from "../format"
import { useAlertEvents } from "../hooks"

const HEADINGS = [
  { label: "Thời gian", align: "left" },
  { label: "Mã", align: "left" },
  { label: "Tín hiệu", align: "left" },
  { label: "Giá", align: "right" },
  { label: "Gửi", align: "left" },
] as const

export function EventsList() {
  const eventsQuery = useAlertEvents()

  if (eventsQuery.isLoading) {
    return <Skeleton className="h-[160px] w-full rounded-lg" />
  }

  if (eventsQuery.isError) {
    return (
      <PanelState
        title="Không tải được lịch sử tín hiệu"
        description={errorMessage(eventsQuery.error)}
        action={{ label: "Thử lại", onClick: () => void eventsQuery.refetch() }}
      />
    )
  }

  const events = eventsQuery.data ?? []

  if (events.length === 0) {
    return (
      <PanelState
        title="Chưa có tín hiệu nào được bắn"
        description="Khi tín hiệu trong watchlist của bạn xuất hiện, sự kiện sẽ hiện ở đây."
      />
    )
  }

  return (
    <div className="rounded-lg bg-card">
      <Table className="text-[12px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {HEADINGS.map((heading) => (
              <TableHead
                key={heading.label}
                className={`text-[10.5px] tracking-wide text-muted-foreground uppercase ${
                  heading.align === "right" ? "text-right" : ""
                }`}
              >
                {heading.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono tabular-nums">
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{fmtDateTimeVN(event.firedAt)}</TableCell>
              <TableCell className="font-semibold">{event.symbol}</TableCell>
              <TableCell className="text-muted-foreground">{event.signalKey ?? "—"}</TableCell>
              <TableCell className="text-right">{fmtPrice(event.price)}</TableCell>
              <TableCell>
                {event.delivered ? (
                  <span className="flex items-center gap-1.5 text-price-up">
                    <CheckCircle2 className="size-3.5" />
                    Đã gửi
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MinusCircle className="size-3.5" />
                    Chưa gửi
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
