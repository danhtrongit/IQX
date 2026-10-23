import { useEffect, useRef, useState } from "react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { ChartFigure } from "./figure"
import { figureLegend, figureTable, type HoverState, type LegendItem } from "./figure-data"
import type { FundamentalChartData } from "./types"
import { useElementWidth } from "./use-element-width"

function LegendSwatch({ item }: { item: LegendItem }) {
  if (item.shape === "line") {
    return (
      <svg width="20" height="8" aria-hidden="true" className="shrink-0">
        <line x1="0" y1="4" x2="20" y2="4" stroke={item.color} strokeWidth="2" />
      </svg>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-[1px]"
      style={{ background: item.color, opacity: item.shape === "band" ? 0.6 : 1 }}
    />
  )
}

/**
 * Bộ khuôn biểu đồ chỉ tiêu dùng chung cho Dashboard phân tích và biểu đồ đại
 * diện của Học viện (spec Dashboard §4.2, §9): hình theo khuôn A, B, C, D, E1,
 * E2, F, F2, hộp số liệu khi rê chuột hoặc chạm, chú giải và nút "Bảng số".
 * Hình vẽ lại theo độ rộng khung khi đổi kích thước cửa sổ.
 */
export function FundamentalChart({ chart }: { chart: FundamentalChartData }) {
  const [measure, width] = useElementWidth()
  const [hover, setHover] = useState<HoverState | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)
  const legend = figureLegend(chart)
  const table = tableOpen ? figureTable(chart) : null

  // Chạm vào biểu đồ giữ hộp số liệu; chạm ra ngoài thì đóng.
  useEffect(() => {
    if (hover === null) return
    const close = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setHover(null)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [hover])

  return (
    <div ref={root} data-fundamental-chart={chart.kind} className="flex min-w-0 flex-col gap-2">
      <div ref={measure} className="min-w-0">
        <ChartFigure chart={chart} width={width} hover={hover} onHover={setHover} />
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text-secondary">
        {legend.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <LegendSwatch item={item} />
            {item.label}
          </li>
        ))}
      </ul>

      {chart.legendNote && <p className="text-xs leading-5 text-text-secondary">{chart.legendNote}</p>}

      <button
        type="button"
        aria-expanded={tableOpen}
        onClick={() => setTableOpen((open) => !open)}
        className="w-fit rounded-sm text-[11px] font-semibold text-text-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {tableOpen ? "Ẩn bảng" : "Bảng số"}
      </button>

      {table && (
        <div className="max-h-60 overflow-auto rounded-sm border border-border">
          {table.caption && (
            <p className="border-b border-border px-2 py-1.5 text-[11px] font-semibold text-text-secondary">
              {table.caption}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => (
                  <TableHead
                    key={column}
                    className="sticky top-0 bg-card text-right text-xs text-text-secondary first:text-left"
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
    </div>
  )
}
