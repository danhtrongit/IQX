import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtDateTime, fmtInt, fmtSignedPercent, toneClass } from "../shared/format"
import type { RunListItem, RunView, StrategySource } from "./api"
import { useOpenRun, useRuns } from "./hooks"
import { SUB_TEXT } from "./ui"

export type OpenStrategyRef = { source: StrategySource | "draft"; id: string | null }

const TH = `px-2 py-2 text-left text-[10.5px] font-semibold tracking-wide uppercase whitespace-nowrap ${SUB_TEXT}`

/**
 * Lần chạy đã lưu (§4.9): every successful run is stored and never changes. `Xem` loads a run of the strategy
 * on screen into Kết quả (the draft stays); `Mở chiến lược` opens another one; a run made before 22-11
 * (1 mã, cấu hình chung) only shows its numbers.
 */
export function RunsDialog({
  current,
  onView,
  onOpenStrategy,
  onClose,
}: {
  current: OpenStrategyRef
  onView: (run: RunView) => void
  onOpenStrategy: (item: RunListItem) => void
  onClose: () => void
}) {
  const [onlyCurrent, setOnlyCurrent] = useState(true)
  const runs = useRuns(onlyCurrent ? { source: current.source, id: current.id } : null)
  const open = useOpenRun()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [legacy, setLegacy] = useState<RunListItem | null>(null)

  const isCurrent = (item: RunListItem) => (item.strategy_source ?? null) === current.source && (item.strategy_id ?? null) === current.id
  const items = (runs.data?.items ?? []).filter((item) => !onlyCurrent || (!item.legacy && isCurrent(item)))

  function view(id: string) {
    setError(null)
    setPendingId(id)
    open.mutate(id, {
      onSuccess: (run) => onView(run),
      onError: (caught) => setError(errorMessage(caught)),
      onSettled: () => setPendingId(null),
    })
  }

  return (
    <>
      <DialogShell title="Lần chạy đã lưu" size="lg" busy={open.isPending} onClose={onClose} footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc lần chạy">
          <Button type="button" size="sm" variant={onlyCurrent ? "default" : "outline"} aria-pressed={onlyCurrent} onClick={() => setOnlyCurrent(true)}>Chiến lược đang mở</Button>
          <Button type="button" size="sm" variant={onlyCurrent ? "outline" : "default"} aria-pressed={!onlyCurrent} onClick={() => setOnlyCurrent(false)}>Tất cả</Button>
        </div>
        {runs.isPending ? (
          <div className="space-y-2" aria-label="Đang tải lần chạy"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : runs.isError ? (
          <div className="space-y-2">
            <ErrorLine>{errorMessage(runs.error)}</ErrorLine>
            <Button type="button" variant="outline" size="sm" onClick={() => void runs.refetch()}>Thử lại</Button>
          </div>
        ) : items.length === 0 ? (
          <p className={`rounded-md border border-dashed border-border p-6 text-center text-xs ${SUB_TEXT}`}>Chưa có lần chạy nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Lần chạy đã lưu">
              <thead className="border-b border-border">
                <tr>{["Thời điểm", "Chiến lược · bản", "Rổ · khoảng", "Tổng LN", "Sụt giảm", "Số GD", ""].map((head, index) => <th key={`${head}-${index}`} className={TH}>{head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.run_id} data-testid={`run-${item.run_id}`}>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmtDateTime(item.created_at)}</td>
                    <td className="min-w-[10rem] px-2 py-2">
                      {item.legacy && <span className="mr-1 rounded-sm border border-border px-1 py-px text-[10.5px] font-semibold">Cấu hình cũ</span>}
                      <span className="font-semibold">{item.strategy_label}</span>
                      {item.version_label ? ` · ${item.version_label}` : ""}
                    </td>
                    <td className="min-w-[8rem] px-2 py-2">
                      {item.universe_label}
                      <span className={`block ${SUB_TEXT}`}>{fmtDate(item.start)} – {fmtDate(item.end)}</span>
                    </td>
                    <td className={`px-2 py-2 tabular-nums ${toneClass(item.kpis.total_return)}`}>{fmtSignedPercent(item.kpis.total_return, 1)}</td>
                    <td className={`px-2 py-2 tabular-nums ${toneClass(item.kpis.max_drawdown)}`}>{fmtSignedPercent(item.kpis.max_drawdown, 1)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtInt(item.kpis.closed_trades)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {item.legacy ? (
                        <Button type="button" size="xs" variant="outline" onClick={() => setLegacy(item)}>Xem số liệu</Button>
                      ) : isCurrent(item) ? (
                        <Button type="button" size="xs" variant="outline" disabled={open.isPending} onClick={() => view(item.run_id)}>
                          {pendingId === item.run_id ? "Đang mở…" : "Xem"}
                        </Button>
                      ) : item.strategy_source === "iqx" || item.strategy_source === "user" ? (
                        <Button type="button" size="xs" variant="outline" onClick={() => onOpenStrategy(item)}>Mở chiến lược</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <ErrorLine>{error}</ErrorLine>}
        <p className={`text-xs leading-5 ${SUB_TEXT}`}>Mỗi lần bấm Chạy được lưu lại, không sửa được. Lần chạy theo cấu hình cũ (1 mã) chỉ xem số liệu, không chạy lại.</p>
      </DialogShell>
      {legacy && (
        <DialogShell title="Lần chạy theo cấu hình cũ" size="sm" onClose={() => setLegacy(null)} footer={<Button type="button" variant="outline" onClick={() => setLegacy(null)}>Đóng</Button>}>
          <p className="text-xs">{legacy.strategy_label} · {fmtDate(legacy.start)} – {fmtDate(legacy.end)}</p>
          <dl className="grid grid-cols-3 gap-2 text-xs" data-testid="legacy-kpis">
            <div className="rounded-md border border-border p-2"><dt className={SUB_TEXT}>Tổng lợi nhuận</dt><dd className={`font-bold ${toneClass(legacy.kpis.total_return)}`}>{fmtSignedPercent(legacy.kpis.total_return, 1)}</dd></div>
            <div className="rounded-md border border-border p-2"><dt className={SUB_TEXT}>Sụt giảm lớn nhất</dt><dd className={`font-bold ${toneClass(legacy.kpis.max_drawdown)}`}>{fmtSignedPercent(legacy.kpis.max_drawdown, 1)}</dd></div>
            <div className="rounded-md border border-border p-2"><dt className={SUB_TEXT}>Số giao dịch</dt><dd className="font-bold">{fmtInt(legacy.kpis.closed_trades)}</dd></div>
          </dl>
          <p className="text-xs">Chạy trên 1 mã theo cấu hình chung trước đây. Chỉ xem, không chạy lại.</p>
        </DialogShell>
      )}
    </>
  )
}
