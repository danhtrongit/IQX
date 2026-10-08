import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight, NotebookText } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate } from "../format"
import type { BotIssue } from "../types"
import { LoadMore } from "./history-table"
import { decisionLabel, sessionSummary, type SessionLog } from "./journal"

const ACTION_LABEL: Record<string, string> = { buy: "Mua", sell: "Bán", hold: "Giữ", skip: "Bỏ qua" }

/**
 * Journal, one row per trading session: the buy source, the config revision used and the
 * reasons of that session's decisions. A row opens to every decision with its server label.
 */
export function JournalTable({
  sessions,
  issues,
  hasMore,
  loading,
  onLoadMore,
}: {
  sessions: SessionLog[]
  issues: BotIssue[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  if (sessions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <NotebookText aria-hidden="true" className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">{loading ? "Đang tải nhật ký…" : "Chưa có phiên xử lý"}</p>
          {!loading && <p className="max-w-sm text-xs leading-5 text-muted-foreground">Sau mỗi phiên, lý do Bot mua, bán hoặc không hành động sẽ được ghi tại đây.</p>}
        </div>
        <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm nhật ký" />
      </div>
    )
  }

  function toggle(date: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <div>
      {issues.length > 0 && (
        <ul className="space-y-1 border-b border-border px-3 py-2 text-[11px] leading-4 text-price-ref" aria-label="Vấn đề của lần xử lý gần nhất">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>{issue.symbol ? `${issue.symbol}: ` : ""}{issue.detail ?? issue.code}</li>
          ))}
        </ul>
      )}
      <Table aria-label="Nhật ký Bot theo phiên" className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Phiên</TableHead>
            <TableHead>Danh mục mua mới</TableHead>
            <TableHead>Cấu hình</TableHead>
            <TableHead>Kết quả</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((log) => {
            const open = expanded.has(log.date)
            const panelId = `journal-${log.date}`
            return (
              <Fragment key={log.date}>
                <TableRow>
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggle(log.date)}
                      className="inline-flex items-center gap-1 rounded-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {open ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
                      {formatDate(log.date)}
                      <span className="sr-only"> — {open ? "thu gọn" : "xem"} quyết định của phiên</span>
                    </button>
                  </TableCell>
                  <TableCell>{log.source}</TableCell>
                  <TableCell>{log.revision === null ? "—" : `Bản ${log.revision}`}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal">{sessionSummary(log)}</TableCell>
                </TableRow>
                {open && (
                  <TableRow id={panelId} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={4} className="whitespace-normal">
                      <ul className="space-y-1 py-1">
                        {log.decisions.map((decision) => (
                          <li key={decision.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-5">
                            <span className={cn("min-w-10 font-semibold", decision.action === "buy" ? "text-price-up" : decision.action === "sell" ? "text-price-down" : "text-muted-foreground")}>
                              {ACTION_LABEL[decision.action] ?? decision.action}
                            </span>
                            {decision.symbol && <strong>{decision.symbol}</strong>}
                            <span className="text-muted-foreground">{decisionLabel(decision)}</span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
      <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm nhật ký" />
    </div>
  )
}
