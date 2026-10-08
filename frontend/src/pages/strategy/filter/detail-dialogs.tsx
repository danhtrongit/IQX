import { Button } from "@/components/ui/button"

import { DialogShell } from "../shared/dialog-shell"
import { fmtDate, fmtDateTime } from "../shared/format"
import { periodLabel } from "./definition"
import type { ResultHeader, ResultRow, ScreenerMetric } from "./types"
import { reasonLabel } from "./reasons"
import { cellView, STATUS_EXPLANATION, STATUS_LABEL } from "./units"

const TH = "px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/**
 * One figure of the table with the evidence behind it: the real period of this company, the period it
 * is compared with, when the reports were published and received, the cutoff of the whole result,
 * the source revision and every report used. Nothing is taken from another period.
 */
export function MetricDetailDialog({
  header,
  row,
  metric,
  onClose,
}: {
  header: ResultHeader
  row: ResultRow
  metric: ScreenerMetric
  onClose: () => void
}) {
  const cell = row.metrics[metric.id]
  const view = cellView(cell, metric.api_unit)
  const period = cell ? periodLabel(metric, cell.period_mode) : "—"
  const status = cell && cell.status !== "ok" ? cell.status : null
  return (
    <DialogShell
      title={`${row.symbol} · ${metric.name}`}
      description={`${row.name ?? row.symbol}${row.sector ? ` · ${row.sector}` : ""}`}
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
        <div className="min-w-0 text-xs">
          <div className="font-semibold">{period}</div>
          <div className="mt-1 text-muted-foreground">{cell?.actual_period_label ?? "Chưa có nhãn kỳ"}</div>
        </div>
        <strong className="text-xl tabular-nums" aria-label="Giá trị">{view.text}{view.ok && metric.unit ? ` ${metric.unit}` : ""}</strong>
      </div>
      {status && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">
          <strong className="block text-foreground">{STATUS_LABEL[status]}</strong>
          <span className="text-muted-foreground">{cell?.reason ?? STATUS_EXPLANATION[status]}</span>
        </p>
      )}
      {view.lowerBound && <p className="text-xs text-muted-foreground">{view.title}</p>}
      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Kỳ đang tính</dt><dd className="font-medium">{cell?.actual_period_label ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Kỳ so sánh</dt><dd className="font-medium">{cell?.comparison_period_label ?? "Không dùng so sánh YoY"}</dd></div>
        <div><dt className="text-muted-foreground">Công bố gần nhất của dữ liệu đã dùng</dt><dd className="font-medium">{fmtDate(cell?.published_at)}</dd></div>
        <div><dt className="text-muted-foreground">Hệ thống nhận dữ liệu gần nhất</dt><dd className="font-medium">{fmtDate(cell?.available_at)}</dd></div>
        <div><dt className="text-muted-foreground">Mốc dữ liệu của kết quả (cutoff)</dt><dd className="font-medium">{fmtDateTime(header.as_of)}</dd></div>
        <div><dt className="text-muted-foreground">Bản nguồn</dt><dd className="font-medium break-all">{cell?.source_revision ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Nguồn dữ liệu · phiên bản tính</dt><dd className="font-medium">{header.data_source} · {header.calculation_version}</dd></div>
        <div>
          <dt className="text-muted-foreground">Ngày bắt đầu/kết thúc kỳ và phạm vi báo cáo</dt>
          <dd className="font-medium">{header.provenance_notes.period_dates === "not_provided_by_source" ? "Nguồn không cung cấp" : "—"}</dd>
        </div>
      </dl>
      {cell && cell.components.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Các kỳ báo cáo đã sử dụng</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[420px] border-collapse text-xs" aria-label="Các kỳ báo cáo đã sử dụng">
              <thead className="bg-muted/30">
                <tr><th scope="col" className={TH}>Kỳ / thành phần</th><th scope="col" className={TH}>Công bố</th><th scope="col" className={TH}>Cập nhật</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cell.components.map((component, index) => (
                  <tr key={`${component.label}-${index}`}>
                    <td className="px-3 py-2 font-medium">{component.label}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(component.published_at)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(component.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11px] leading-4 text-muted-foreground">{header.provenance_notes.availability_rule}</p>
    </DialogShell>
  )
}

/** Why companies are missing from the result: counted per condition and per cause, never as "0 results". */
export function DataQualityDialog({
  header,
  metrics,
  onClose,
}: {
  header: ResultHeader
  metrics: readonly ScreenerMetric[]
  onClose: () => void
}) {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const { counts } = header
  return (
    <DialogShell
      title="Dữ liệu của các điều kiện lọc"
      description={`${counts.with_required_exceptions} trên ${counts.universe} doanh nghiệp có điều kiện bắt buộc thiếu dữ liệu, không áp dụng hoặc không tính được. Không thay bằng 0 và không đổi kỳ âm thầm.`}
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Trong phạm vi</dt><dd className="text-base font-semibold tabular-nums">{counts.universe}</dd></div>
        <div><dt className="text-muted-foreground">Đạt mọi điều kiện</dt><dd className="text-base font-semibold tabular-nums">{counts.passed}</dd></div>
        <div><dt className="text-muted-foreground">Không đạt ngưỡng</dt><dd className="text-base font-semibold tabular-nums">{counts.failed_threshold}</dd></div>
        <div><dt className="text-muted-foreground">Điều kiện không tính được</dt><dd className="text-base font-semibold tabular-nums">{counts.with_required_exceptions}</dd></div>
      </dl>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[520px] border-collapse text-xs" aria-label="Thống kê dữ liệu theo chỉ tiêu">
          <thead className="bg-muted/30">
            <tr>
              <th scope="col" className={TH}>Chỉ tiêu · kỳ tính</th>
              <th scope="col" className={TH}>Vai trò</th>
              <th scope="col" className={TH}>Tình trạng</th>
              <th scope="col" className={TH}>Lý do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {header.data_quality.metrics.map((entry) => {
              const metric = byId.get(entry.metric_id)
              const problems = Object.entries(entry.by_status).filter(([status]) => status !== "ok")
              return (
                <tr key={`${entry.metric_id}-${entry.role}`} className="align-top">
                  <td className="px-3 py-2 font-medium">
                    {metric?.name ?? entry.metric_id}
                    <span className="block text-muted-foreground">{metric ? periodLabel(metric, entry.period_mode) : entry.period_mode}</span>
                  </td>
                  <td className="px-3 py-2">{entry.role === "condition" ? "Điều kiện" : "Cột tham khảo"}</td>
                  <td className="px-3 py-2">
                    {problems.length === 0 ? "Đủ dữ liệu" : problems.map(([status, count]) => <span key={status} className="block">{STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}: {count}</span>)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {Object.entries(entry.by_reason).length === 0 ? "—" : Object.entries(entry.by_reason).map(([code, count]) => <span key={code} className="block">{reasonLabel(code)}: {count}</span>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Một số liệu thiếu ở cột tham khảo không loại doanh nghiệp. Một điều kiện bắt buộc thiếu hoặc không áp dụng thì doanh nghiệp không được coi là đạt.
      </p>
    </DialogShell>
  )
}
