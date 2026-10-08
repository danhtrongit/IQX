import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { ErrorLine, NativeSelect, SideBadge } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { EvidenceTable } from "../shared/evidence-table"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtDateTime, fmtNumber, shortHash } from "../shared/format"
import { EVENT_PAGE_SIZE, type AlertEvent, type AlertSide, type StrategyAlert } from "./api"
import { useAlertDetail, useAlertEvents } from "./hooks"
import { pinnedRevision } from "./labels"

const TH = "px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

function previousText(event: AlertEvent): string {
  if (event.previous_valid_result === null) return "Chưa có lần kiểm tra hợp lệ trước đó"
  const session = event.previous_valid_session ? ` (phiên ${fmtDate(event.previous_valid_session)})` : ""
  return `${event.previous_valid_result ? "Đã thỏa" : "Chưa thỏa"}${session}`
}

/** One recorded signal: the values, operators and params exactly as stored at that session. */
function EventDetail({ event, indicators, onClose }: { event: AlertEvent; indicators: readonly TechnicalIndicator[]; onClose: () => void }) {
  const detail = useAlertDetail(event.alert_id)
  const version = detail.data?.versions.find((item) => item.version === event.alert_version)
  const bar = event.evidence.bar
  return (
    <DialogShell
      title={`${event.symbol} · Thỏa điều kiện ${event.side_label}`}
      badge={<SideBadge side={event.side} />}
      description={`${event.alert_name} · phiên ${fmtDate(event.signal_session)}. Dữ liệu được ghi tại phiên này, không tính lại bằng giá hoặc cấu hình hôm nay.`}
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">
        <strong className="block text-foreground">{event.event_kind_label}</strong>
        <span className="text-muted-foreground">Đây là tín hiệu thỏa điều kiện, không phải lệnh và không phải giao dịch của Bot.</span>
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Phiên tín hiệu</dt><dd className="font-medium">{fmtDate(event.signal_session)}</dd></div>
        <div><dt className="text-muted-foreground">Ghi nhận lúc</dt><dd className="font-medium">{fmtDateTime(event.evaluated_at)}</dd></div>
        <div><dt className="text-muted-foreground">Trạng thái hợp lệ trước đó</dt><dd className="font-medium">{previousText(event)}</dd></div>
        <div>
          <dt className="text-muted-foreground">Bản cấu hình ghim</dt>
          <dd className="font-medium">
            {version ? `Bản ${pinnedRevision(version)}` : "—"} · Cảnh báo v{event.alert_version} · {shortHash(event.config_hash)}
          </dd>
        </div>
        <div><dt className="text-muted-foreground">Phiên bản luật và tính toán</dt><dd className="font-medium">{event.rule_version} · {event.calculation_version}</dd></div>
        <div><dt className="text-muted-foreground">Phiên bản dữ liệu</dt><dd className="font-medium break-all">{event.data_version}</dd></div>
        {bar && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Nến ngày {fmtDate(bar.date)}</dt>
            <dd className="font-medium tabular-nums">
              Mở {fmtNumber(bar.open)} · Cao {fmtNumber(bar.high)} · Thấp {fmtNumber(bar.low)} · Đóng {fmtNumber(bar.close)} · KL {fmtNumber(bar.volume, 0)}
            </dd>
          </div>
        )}
      </dl>
      {event.evidence.indicator_ids.length > 0 && (
        <div className="space-y-1 text-xs">
          <h3 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Tham số đã dùng</h3>
          <ul className="space-y-0.5">
            {event.evidence.indicator_ids.map((id) => {
              const name = indicators.find((item) => item.id === id)?.name ?? id.toUpperCase()
              const params = Object.entries(event.evidence.indicator_params[id] ?? {})
              return (
                <li key={id}><strong>{name}</strong>{params.length ? `: ${params.map(([key, value]) => `${key} ${fmtNumber(value)}`).join(" · ")}` : ""}</li>
              )
            })}
          </ul>
        </div>
      )}
      <EvidenceTable rules={event.evidence.rules} indicators={indicators} paramsFor={(rule) => event.evidence.indicator_params[rule.indicator]} label="Điều kiện tại phiên tín hiệu" />
    </DialogShell>
  )
}

/** Signal history ("Thỏa điều kiện Mua/Bán"), newest session first, every page reachable. */
export function SignalHistory({ alerts, indicators }: { alerts: StrategyAlert[]; indicators: readonly TechnicalIndicator[] }) {
  const [side, setSide] = useState<AlertSide | "all">("all")
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AlertEvent | null>(null)
  const events = useAlertEvents(side, page)
  const data = events.data
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / EVENT_PAGE_SIZE))
  const from = total === 0 ? 0 : page * EVENT_PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * EVENT_PAGE_SIZE)
  const byId = new Map(alerts.map((alert) => [alert.id, alert]))

  function versionText(event: AlertEvent): string {
    const alert = byId.get(event.alert_id)
    const known = alert && alert.current_version === event.alert_version
    return known ? `Bản ${pinnedRevision(alert.version)} · CB v${event.alert_version}` : `CB v${event.alert_version} · ${shortHash(event.config_hash, 6)}`
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Lịch sử tín hiệu">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-heading text-sm font-bold">Lịch sử tín hiệu</h2>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="history-meta">
            {events.isPending ? "Đang tải…" : `${total} tín hiệu`}
          </p>
        </div>
        <NativeSelect
          aria-label="Lọc loại tín hiệu"
          className="w-auto"
          value={side}
          onChange={(event) => { setSide(event.target.value as AlertSide | "all"); setPage(0) }}
        >
          <option value="all">Tất cả tín hiệu</option>
          <option value="buy">Mua</option>
          <option value="sell">Bán</option>
        </NativeSelect>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm" aria-label="Tín hiệu đã ghi nhận">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th scope="col" className={TH}>Phiên</th>
              <th scope="col" className={TH}>Mã</th>
              <th scope="col" className={TH}>Tín hiệu</th>
              <th scope="col" className={TH}>Cảnh báo</th>
              <th scope="col" className={TH}>Cấu hình</th>
              <th scope="col" className={`${TH} text-right`}>Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.isPending ? (
              [0, 1, 2].map((row) => <tr key={row}><td colSpan={6} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>)
            ) : events.isError ? (
              <tr><td colSpan={6} className="space-y-2 p-4">
                <ErrorLine>{errorMessage(events.error)}</ErrorLine>
                <Button type="button" variant="outline" size="sm" onClick={() => void events.refetch()}>Thử lại</Button>
              </td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">Chưa có tín hiệu theo bộ lọc đang chọn.</td></tr>
            ) : (
              data.items.map((event) => (
                <tr key={event.id}>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{fmtDate(event.signal_session)}</td>
                  <td className="px-3 py-2.5 font-bold text-primary">{event.symbol}</td>
                  <td className="px-3 py-2.5"><SideBadge side={event.side}>{event.message}</SideBadge></td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <span className="break-words">{event.alert_name}</span>
                    {event.event_kind === "first_observation" && <span className="block text-xs text-muted-foreground">{event.event_kind_label}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{versionText(event)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelected(event)}>
                      Xem điều kiện<span className="sr-only"> {event.symbol} {fmtDate(event.signal_session)}</span>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>Kiểm tra lại cùng phiên không tạo tín hiệu trùng. {total > 0 && `Hiển thị từ ${from} đến ${to} trên ${total}.`}</span>
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="px-1 tabular-nums">Trang {page + 1}/{pages}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>

      {selected && <EventDetail event={selected} indicators={indicators} onClose={() => setSelected(null)} />}
    </section>
  )
}
