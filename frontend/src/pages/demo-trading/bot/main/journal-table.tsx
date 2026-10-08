import { Fragment, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, NotebookText, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { messageOf } from "../api"
import { formatDate, formatDong, formatInt } from "../format"
import { useSessionDecisions } from "../queries"
import type { BotSession, BotSessionDecision } from "../types"
import { evidenceLines } from "./evidence"
import { LoadMore } from "./load-more"
import { ACTION_LABEL, reasonLabel, runStatusNote, sessionSource, sessionSummary } from "./session"

function Decision({ decision, names }: { decision: BotSessionDecision; names: Readonly<Record<string, string>> }) {
  const evidence = evidenceLines(decision, names)
  const execution = decision.execution
  return (
    <li className="py-1 text-[11px] leading-5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("min-w-10 font-semibold", decision.action === "buy" ? "text-price-up" : decision.action === "sell" ? "text-price-down" : "text-muted-foreground")}>
          {ACTION_LABEL[decision.action]}
        </span>
        {decision.symbol && <strong>{decision.symbol}</strong>}
        <span className="text-muted-foreground">{reasonLabel(decision, decision.reason)}</span>
        {execution && <span className="tabular-nums">{formatInt(execution.qty)} CP × {formatDong(execution.price_vnd)}</span>}
        {decision.decision_config_revision !== null && <span className="text-[10px] text-muted-foreground">Bản {decision.decision_config_revision}</span>}
      </div>
      {evidence.length > 0 && (
        <details className="mt-0.5">
          <summary className="w-fit cursor-pointer rounded-sm text-[10px] text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Điều kiện lúc quyết định<span className="sr-only"> {decision.symbol ?? "phiên"}</span>
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3 text-[10px] leading-4 text-muted-foreground">
            {evidence.map((line) => <li key={line.key}>{line.text}</li>)}
          </ul>
        </details>
      )}
    </li>
  )
}

/** The decisions of one session, fetched when its row is opened. */
function SessionDecisions({ session, names }: { session: BotSession; names: Readonly<Record<string, string>> }) {
  const query = useSessionDecisions(session.session, true)
  const decisions = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])

  if (query.isPending) {
    return <div className="space-y-1.5 py-1" aria-label="Đang tải quyết định của phiên"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/5" /></div>
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 py-1 text-xs text-destructive">
        <span>Không tải được quyết định của phiên: {messageOf(query.error)}</span>
        <Button type="button" variant="outline" size="xs" onClick={() => void query.refetch()}>Thử lại</Button>
      </div>
    )
  }
  if (decisions.length === 0) return <p className="py-1 text-xs text-muted-foreground">Phiên này không có quyết định nào được ghi.</p>
  return (
    <div>
      <div
        tabIndex={0}
        role="region"
        aria-label={`Quyết định của phiên ${formatDate(session.session)}`}
        className="max-h-72 overflow-y-auto rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ul className="divide-y divide-border/60">
          {decisions.map((decision) => <Decision key={decision.id} decision={decision} names={names} />)}
        </ul>
      </div>
      <LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} label="Tải thêm quyết định" />
    </div>
  )
}

function SessionFacts({ session }: { session: BotSession }) {
  const note = runStatusNote(session.run_status)
  const facts = [
    { label: "Giá trị danh mục cuối phiên", value: formatDong(session.nav_end_vnd) },
    { label: "Tiền mặt cuối phiên", value: formatDong(session.cash_end_vnd) },
    { label: "Chính sách", value: session.policy_version ?? "—" },
  ]
  return (
    <div className="space-y-1.5">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
        {facts.map((fact) => (
          <div key={fact.label} className="flex gap-1.5"><dt className="text-muted-foreground">{fact.label}:</dt><dd className="font-medium tabular-nums">{fact.value}</dd></div>
        ))}
      </dl>
      {note && <p className="text-[11px] font-medium text-price-ref">Trạng thái xử lý: {note}.</p>}
      {session.valuation_complete === false && (
        <p className="text-[11px] text-price-ref">Giá trị cuối phiên chưa định giá đầy đủ do thiếu giá đóng cửa của một hoặc nhiều vị thế.</p>
      )}
      {session.issues.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-price-ref" aria-label={`Ghi chú của phiên ${formatDate(session.session)}`}>
          {session.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>{issue.symbol ? `${issue.symbol}: ` : ""}{issue.detail ?? issue.code}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Nhật ký, one row per trading session as the server summarised it: the buy source, the
 * config revision the run used and the reason counts. A row opens to every decision of
 * that session (fetched on demand) with its server label.
 */
export function JournalTable({
  sessions,
  names,
  hasMore,
  loading,
  onLoadMore,
}: {
  sessions: BotSession[]
  names: Readonly<Record<string, string>>
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
    <div className="@container">
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
          {sessions.map((session) => {
            const open = expanded.has(session.session)
            const panelId = `journal-${session.session}`
            const note = runStatusNote(session.run_status) ?? (session.issues.length > 0 ? "Có ghi chú" : null)
            return (
              <Fragment key={session.session}>
                <TableRow>
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggle(session.session)}
                      className="inline-flex items-center gap-1 rounded-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {open ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
                      {formatDate(session.session)}
                      <span className="sr-only"> — {open ? "thu gọn" : "xem"} quyết định của phiên</span>
                    </button>
                    {note && (
                      <small className="mt-0.5 flex items-center gap-1 text-[10px] text-price-ref">
                        <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />{note}
                      </small>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">{sessionSource(session)}</TableCell>
                  <TableCell>{session.config_revision === null ? "—" : `Bản ${session.config_revision}`}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal">{sessionSummary(session)}</TableCell>
                </TableRow>
                {open && (
                  <TableRow id={panelId} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={4} className="whitespace-normal">
                      {/* Stays in view while the table scrolls sideways on a narrow screen. */}
                      <div className="sticky left-2 max-w-[calc(100cqw-1rem)] space-y-2">
                        <SessionFacts session={session} />
                        <SessionDecisions session={session} names={names} />
                      </div>
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
