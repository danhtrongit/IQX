import { useState } from "react"
import { GripVertical, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useChartWidth } from "@/pages/academy/charts/use-chart-width"

import { ChartFigure } from "./charts/figure"
import { figureLegend, figureTable, type HoverState } from "./charts/figure-data"
import { FIXED_YEAR_KINDS, type ChartView } from "./model"

export type ChartCardProps = {
  view: ChartView
  /** Số kỳ hiển thị của biểu đồ; null cho khuôn cố định theo năm (spec §4.1). */
  period: { count: number; options: readonly number[]; unit: string } | null
  onPeriodChange: (count: number) => void
  onRemove: () => void
  /** Chỉ tiêu không áp dụng cho mã ngân hàng (spec §7). */
  notApplicable?: boolean
  /** Số liệu đang tải: thẻ hiện khung chờ, chưa vẽ gì. */
  pending?: boolean
  /** Lý do biểu đồ trống do máy chủ báo. */
  note?: string
  /** Kéo thả đổi thứ tự (pattern HTML5 của trang quản trị). */
  drag: {
    dragging: boolean
    over: boolean
    onDragStart: () => void
    onDragEnd: () => void
    onDragOver: () => void
    onDragLeave: () => void
    onDrop: () => void
  }
}

const BANK_NOTE = "Không áp dụng cho ngân hàng. Báo cáo tài chính ngân hàng không có chỉ tiêu này theo cách tính của doanh nghiệp thông thường."

/**
 * Một thẻ biểu đồ của dashboard (spec §4): tay kéo, tên chỉ tiêu, ô số kỳ,
 * thân biểu đồ, chú giải và bảng số. Đầu thẻ không có con số lớn của kỳ
 * gần nhất.
 */
export function ChartCard({
  view,
  period,
  onPeriodChange,
  onRemove,
  notApplicable = false,
  pending = false,
  note,
  drag,
}: ChartCardProps) {
  const [measure, width] = useChartWidth()
  const [hover, setHover] = useState<HoverState | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const legend = figureLegend(view)
  const table = figureTable(view)
  const hasData = view.labels.length > 0 && (view.main[0]?.v ?? []).some((value) => value !== null)

  return (
    <article
      data-chart={view.name}
      draggable
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", view.name)
        drag.onDragStart()
      }}
      onDragEnd={drag.onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        drag.onDragOver()
      }}
      onDragLeave={drag.onDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        drag.onDrop()
      }}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3",
        drag.dragging && "opacity-50",
        drag.over && "outline-2 outline-dashed outline-primary",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <GripVertical
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 cursor-grab text-academy-subtle"
          />
          <h3 className="min-w-0 text-sm leading-snug font-semibold break-words">{view.name}</h3>
          {!notApplicable && !period && !pending && FIXED_YEAR_KINDS[view.kind] && (
            <span className="mt-px shrink-0 rounded-full border border-status-warning/45 px-2 py-px text-[10px] font-semibold whitespace-nowrap text-status-warning">
              Theo năm, cố định
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          draggable={false}
          aria-label={`Bỏ ${view.name} khỏi dashboard`}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      {period && !pending && (
        <select
          aria-label={`Số kỳ hiển thị của ${view.name}`}
          value={period.count}
          draggable={false}
          onChange={(event) => onPeriodChange(Number(event.target.value))}
          className="h-7 w-fit rounded-sm border border-border bg-input px-2 text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {period.options.map((option) => (
            <option key={option} value={option}>
              {option} {period.unit}
            </option>
          ))}
        </select>
      )}

      {pending ? (
        <Skeleton className="h-40 w-full rounded-sm" />
      ) : notApplicable ? (
        <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs leading-5 font-semibold text-academy-subtle">
          {BANK_NOTE}
        </p>
      ) : !hasData ? (
        <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs leading-5 font-semibold text-academy-subtle">
          {note ?? "Chưa có dữ liệu cho chỉ tiêu này."}
        </p>
      ) : (
        <div ref={measure} className="min-w-0">
          <ChartFigure view={view} width={width} hover={hover} onHover={setHover} />
        </div>
      )}

      {!notApplicable && hasData && (
        <>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-academy-subtle">
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                {item.shape === "line" ? (
                  <svg width="20" height="8" aria-hidden="true" className="shrink-0">
                    <line x1="0" y1="4" x2="20" y2="4" stroke={item.color} strokeWidth="2" />
                  </svg>
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-[1px]"
                    style={{ background: item.color, opacity: item.shape === "band" ? 0.25 : 1 }}
                  />
                )}
                {item.label}
              </li>
            ))}
          </ul>

          <button
            type="button"
            aria-expanded={tableOpen}
            onClick={() => setTableOpen((open) => !open)}
            className="w-fit text-[11px] font-semibold text-academy-subtle hover:text-foreground"
          >
            {tableOpen ? "Ẩn bảng" : "Bảng số"}
          </button>

          {tableOpen && (
            <div className="max-h-60 overflow-y-auto rounded-sm border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.columns.map((column) => (
                      <TableHead
                        key={column}
                        className="sticky top-0 bg-card text-right text-xs text-academy-subtle first:text-left"
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, index) => (
                    <TableRow key={index}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex} className="text-right text-xs tabular-nums first:text-left">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </article>
  )
}
