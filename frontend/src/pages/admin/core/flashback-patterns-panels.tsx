import { Fragment, useId, useState, type FormEvent, type ReactNode } from "react"
import { LoaderCircle, Search, TriangleAlert } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import { DetailList } from "./components/detail-list"
import { StatusBadge } from "./components/status-badge"
import { formatDatasetDuration } from "./flashback-dataset-format"
import type {
  PatternCardCount,
  PatternLookupParams,
  PatternOverview,
  PatternRun,
  PatternStatus,
  PatternWarning,
} from "./flashback-patterns-api"
import {
  PATTERN_RUN_STATE,
  PATTERN_TRIGGER_LABEL,
  PATTERN_WARNING_TITLE,
  formatPatternDate,
  groupPatternCardsByTier,
  patternRunPercent,
  patternRunState,
  patternTierInfo,
  validatePatternLookup,
  type PatternLookupDraft,
} from "./flashback-patterns-format"
import { usePatternLookup } from "./flashback-patterns-hooks"

/** Một khối con của khối "Mẫu nến": tiêu đề, mô tả ngắn và thao tác bên phải. */
export function PatternBlock({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-heading text-sm font-bold">{title}</h4>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Cảnh báo của mẫu nến: tính lỗi, mã lỗi, thiếu giá gốc cho 4 thẻ Việt Nam. Không có thì không hiện gì. */
export function PatternWarnings({ warnings }: { warnings: PatternWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => {
        const high = warning.level === "high"
        return (
          <Alert
            key={`${warning.code}-${index}`}
            variant={high ? "destructive" : "default"}
            className={high ? undefined : "border-status-warning/45"}
          >
            <TriangleAlert aria-hidden="true" className={high ? undefined : "text-status-warning"} />
            <AlertTitle>{PATTERN_WARNING_TITLE[warning.code] ?? warning.code}</AlertTitle>
            <AlertDescription className={high ? undefined : "text-foreground"}>
              {warning.message}
              {warning.at && <span className="ml-2 text-xs tabular-nums">{`(${formatDateTime(warning.at)})`}</span>}
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}

function runLabel(run: PatternRun | null): string {
  if (!run) return "—"
  return `${PATTERN_TRIGGER_LABEL[run.trigger]}, ${formatDateTime(run.startedAt)}`
}

/**
 * Trạng thái tính mẫu (spec v1.3 §7): phiên bản kho, bộ nhận diện, trạng thái lần tính, thời gian,
 * tổng số mẫu và số mã lỗi. Tổng số mẫu và số mã lỗi là của lần tính mà ván chơi đang dùng.
 */
export function PatternStatusPanel({ status }: { status: PatternStatus }) {
  const state = patternRunState(status)
  const known = PATTERN_RUN_STATE[state]
  const run = status.running ?? status.latest
  const used = status.used
  const failedSymbols = used?.failedSymbols ?? []

  return (
    <div className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-border/60 ring-inset dark:ring-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-heading text-sm font-bold">
          {status.version === null ? "Chưa có kho dữ liệu đang dùng" : `Mẫu nến của kho phiên bản ${status.version}`}
        </h4>
        <StatusBadge status={state} label={known.label} tone={known.tone} />
        {status.version !== null && status.outdated && (
          <StatusBadge status="outdated" label="Cần tính lại" tone="warning" />
        )}
      </div>
      <DetailList
        columns={3}
        items={[
          {
            label: "Phiên bản kho",
            value: <span className="tabular-nums">{status.version === null ? "—" : status.version}</span>,
          },
          {
            label: "Bộ nhận diện của mã nguồn",
            value: <span className="tabular-nums">{status.detectorVersion}</span>,
          },
          {
            label: "Bộ nhận diện đang dùng",
            value: <span className="tabular-nums">{used ? used.detectorVersion : "Chưa có"}</span>,
          },
          { label: "Lần tính gần nhất", value: runLabel(run) },
          {
            label: "Thời gian tính",
            value: state === "running" ? "Đang tính" : formatDatasetDuration(run?.durationMs),
          },
          {
            label: "Tổng số mẫu",
            value: <span className="tabular-nums">{used ? formatNumber(used.patternsCount) : "—"}</span>,
          },
          {
            label: "Số mã tính lỗi",
            value: (
              <span className="tabular-nums">
                {used ? formatNumber(used.failedCount) : "—"}
                {failedSymbols.length > 0 && (
                  <span className="ml-2 text-xs">
                    {`(${failedSymbols.slice(0, 10).join(", ")}${failedSymbols.length > 10 ? ", ..." : ""})`}
                  </span>
                )}
              </span>
            ),
          },
          {
            label: "Giá gốc cho 4 thẻ Việt Nam",
            value: (
              <span className="tabular-nums">{`${formatNumber(status.raw.symbols)} mã, ${formatNumber(status.raw.sessions)} phiên`}</span>
            ),
          },
        ]}
      />
      {state === "failed" && (
        <p className="text-xs text-destructive">
          {`Lần tính gần nhất thất bại: ${run?.error ?? "máy chủ không ghi rõ lý do"}.`}
        </p>
      )}
      {state === "stale" && (
        <p className="text-xs text-status-warning">
          Lần tính gần nhất không còn báo tiến độ nên có thể đã dừng giữa chừng. Bạn có thể bấm Tính lại mẫu nến để chạy lại.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {used
          ? `Tổng số mẫu và số mã lỗi là của lần tính ván chơi đang dùng (lần ${used.id}, hoàn tất lúc ${formatDateTime(used.finishedAt)}).`
          : "Kho chưa có lần tính nào hoàn tất: ván vẫn chơi bình thường, chỉ chưa hiện thẻ."}
      </p>
    </div>
  )
}

/** Tiến độ lần tính đang chạy, do máy chủ báo qua trạng thái. */
export function PatternProgressPanel({ run, detectorVersion }: { run: PatternRun; detectorVersion: number }) {
  const percent = patternRunPercent(run)
  return (
    <div role="status" className="space-y-2 rounded-lg border border-primary/35 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
          {`Đang tính mẫu nến: kho phiên bản ${run.version}, bộ nhận diện ${run.detectorVersion}`}
        </p>
        <span className="text-xs tabular-nums text-foreground">
          {`${formatNumber(run.symbolsDone)}/${formatNumber(run.symbolsTotal)} mã`}
        </span>
      </div>
      <Progress value={percent} aria-valuenow={percent} aria-label="Tiến độ tính mẫu nến" />
      <p className="text-xs text-muted-foreground">
        {`Bắt đầu lúc ${formatDateTime(run.startedAt)}, ${PATTERN_TRIGGER_LABEL[run.trigger].toLowerCase()}. Đã có ${formatNumber(run.patternsCount)} mẫu, ${formatNumber(run.failedCount)} mã lỗi. `}
        {run.detectorVersion !== detectorVersion && `Mã nguồn hiện dùng bộ nhận diện ${detectorVersion}.`}
      </p>
    </div>
  )
}

/** Đã gửi yêu cầu nhưng chưa thấy lần tính nào xuất hiện. */
export function PatternQueuedPanel() {
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/5 p-3 text-sm">
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
      Đã gửi yêu cầu tính lại mẫu nến. Đang chờ máy chủ bắt đầu.
    </div>
  )
}

type TierRow = PatternCardCount & { candles?: number; vn?: boolean }

/**
 * Bảng số lần theo từng thẻ, nhóm theo bậc (màu bậc lấy từ `CD_TIER_INFO`), có dòng tổng. Khi
 * `highlightZero` bật, thẻ 0 lần được tô để quản trị viên nhận ra.
 */
function PatternTierTable({
  cards,
  total,
  label,
  totalLabel,
  showCandles = false,
  highlightZero = false,
}: {
  cards: readonly TierRow[]
  total: number
  label: string
  totalLabel: string
  showCandles?: boolean
  highlightZero?: boolean
}) {
  const groups = groupPatternCardsByTier(cards)
  const columnCount = showCandles ? 3 : 2
  return (
    <div className="overflow-hidden rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Thẻ</TableHead>
            {showCandles && <TableHead scope="col">Số nến của mẫu</TableHead>}
            <TableHead scope="col" className="text-right">
              Số lần
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const tier = patternTierInfo(group.tier)
            return (
              <Fragment key={group.tier}>
                <TableRow className="bg-muted/40 hover:bg-muted/40" data-tier={group.tier}>
                  <TableCell colSpan={columnCount - 1} className="font-semibold text-foreground">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn("size-2.5 shrink-0 rounded-full", tier.color === null && "bg-muted-foreground")}
                        style={tier.color ? { backgroundColor: tier.color } : undefined}
                      />
                      {tier.label}
                      <span className="text-xs font-normal text-muted-foreground">{`${group.cards.length} thẻ`}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">{formatNumber(group.total)}</TableCell>
                </TableRow>
                {group.cards.map((card) => {
                  const zero = highlightZero && card.count === 0
                  return (
                    <TableRow key={card.cardId} className={zero ? "bg-status-warning/10 hover:bg-status-warning/15" : undefined}>
                      <TableCell className="pl-6">
                        <span className="flex items-center gap-2">
                          <span className={zero ? "font-medium text-foreground" : undefined}>{card.name}</span>
                          {card.vn && <StatusBadge status="vn" label="Thẻ Việt Nam" tone="neutral" />}
                          {zero && <StatusBadge status="zero" label="Chưa gặp" tone="warning" />}
                        </span>
                      </TableCell>
                      {showCandles && <TableCell>{card.candles}</TableCell>}
                      <TableCell className={cn("text-right", zero && "font-semibold text-status-warning")}>
                        {formatNumber(card.count)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </Fragment>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columnCount - 1} className="text-foreground">
              {totalLabel}
            </TableCell>
            <TableCell className="text-right text-foreground">{formatNumber(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function describeLookupScope(params: PatternLookupParams): string {
  const who = params.symbol ?? "Tất cả mã"
  return `${who}, ${formatPatternDate(params.from)} đến ${formatPatternDate(params.to)}`
}

/**
 * Tra cứu (spec v1.3 §7): chọn mã hoặc "Tất cả mã" và khoảng ngày, ra số lần theo từng thẻ nhóm theo
 * bậc, có dòng tổng. Ô nhập được kiểm tra trước khi gọi máy chủ.
 */
export function PatternLookupPanel({
  usedRunId,
  symbolOptions,
}: {
  /** Mã lần tính đang dùng: đổi thì kết quả tự tải lại. */
  usedRunId: number | null
  /** Mã trong kho đang dùng, để gợi ý khi gõ. */
  symbolOptions?: readonly string[]
}) {
  const ids = useId()
  const [draft, setDraft] = useState<PatternLookupDraft>({ scope: "one", symbol: "", from: "", to: "" })
  const [submitted, setSubmitted] = useState<PatternLookupParams | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lookup = usePatternLookup(submitted, usedRunId)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = validatePatternLookup(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setSubmitted(result.params)
  }

  const data = lookup.data
  const searching = submitted !== null && lookup.isFetching && !data
  const empty = data !== undefined && data.cards.length === 0

  return (
    <PatternBlock
      title="Tra cứu"
      description="Số lần gặp của từng thẻ ở một mã hoặc mọi mã trong một khoảng ngày (gồm cả hai đầu), nhóm theo bậc. Thẻ không có trong bảng là 0 lần."
    >
      <form className="flex flex-wrap items-end gap-3" noValidate onSubmit={submit}>
        <div className="space-y-1">
          <span className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Phạm vi</span>
          <div role="group" aria-label="Phạm vi tra cứu" className="flex items-center gap-1.5">
            {(["one", "all"] as const).map((scope) => (
              <Button
                key={scope}
                type="button"
                size="sm"
                variant={draft.scope === scope ? "secondary" : "outline"}
                aria-pressed={draft.scope === scope}
                onClick={() => setDraft((current) => ({ ...current, scope }))}
              >
                {scope === "one" ? "Một mã" : "Tất cả mã"}
              </Button>
            ))}
          </div>
        </div>
        {draft.scope === "one" && (
          <div className="space-y-1">
            <Label htmlFor={`${ids}-symbol`} className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Mã
            </Label>
            <Input
              id={`${ids}-symbol`}
              className="w-32 uppercase"
              placeholder="VD: HPG"
              maxLength={16}
              autoComplete="off"
              list={symbolOptions && symbolOptions.length > 0 ? `${ids}-symbols` : undefined}
              value={draft.symbol}
              aria-invalid={error !== null && draft.symbol.trim() === ""}
              onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))}
            />
            {symbolOptions && symbolOptions.length > 0 && (
              <datalist id={`${ids}-symbols`}>
                {symbolOptions.map((symbol) => (
                  <option key={symbol} value={symbol} />
                ))}
              </datalist>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${ids}-from`} className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Từ ngày
          </Label>
          <Input
            id={`${ids}-from`}
            type="date"
            className="w-40"
            value={draft.from}
            onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${ids}-to`} className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Đến ngày
          </Label>
          <Input
            id={`${ids}-to`}
            type="date"
            className="w-40"
            value={draft.to}
            onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <Button type="submit" disabled={searching}>
          <Search aria-hidden="true" />
          Tra cứu
        </Button>
      </form>
      <p className="min-h-4 text-xs text-destructive" aria-live="polite">
        {error}
      </p>

      {submitted === null ? (
        <p className="text-xs text-muted-foreground">
          Chọn mã và khoảng ngày rồi bấm Tra cứu. Ví dụ: HPG, từ 01/03/2025 đến 30/06/2025.
        </p>
      ) : lookup.isError && !data ? (
        <PanelState
          title="Không tra cứu được"
          description={errorMessage(lookup.error)}
          action={{ label: "Thử lại", onClick: () => void lookup.refetch() }}
        />
      ) : !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tra cứu">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.detectorVersion === null ? (
        <PanelState
          title="Kho chưa có mẫu nến tính sẵn"
          description="Phiên bản kho này chưa có lần tính nào hoàn tất nên chưa có số lần để tra. Bấm Tính lại mẫu nến."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {`${describeLookupScope(submitted)}: ${formatNumber(data.total)} mẫu`}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {`Kho phiên bản ${data.version}, bộ nhận diện ${data.detectorVersion}`}
            </span>
          </p>
          {empty ? (
            <p className="rounded-lg bg-card p-4 text-sm ring-1 ring-border/60 ring-inset dark:ring-0">
              Không có mẫu nến nào trong khoảng ngày này. Thử mở rộng khoảng ngày hoặc chọn Tất cả mã.
            </p>
          ) : (
            <PatternTierTable
              cards={data.cards}
              total={data.total}
              label="Số lần theo từng thẻ"
              totalLabel="Tổng cộng"
            />
          )}
        </div>
      )}
    </PatternBlock>
  )
}

type OverviewFilter = "all" | "zero"

/** Tổng quan kho (spec v1.3 §7): số lần gặp của từng thẻ trên cả kho; thẻ 0 lần được tô. */
export function PatternOverviewPanel({
  data,
  isPending,
  error,
  onRetry,
}: {
  data: PatternOverview | undefined
  isPending: boolean
  error: string | null
  onRetry: () => void
}) {
  const [filter, setFilter] = useState<OverviewFilter>("all")
  const cards = data ? (filter === "zero" ? data.cards.filter((card) => card.zero) : data.cards) : []

  return (
    <PatternBlock
      title="Tổng quan kho"
      description="Số lần gặp của từng thẻ trên cả kho. Thẻ 0 lần được tô để quản trị viên biết thẻ nào chưa từng xuất hiện."
      actions={
        data && data.detectorVersion !== null ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { value: "all", label: "Tất cả thẻ" },
                { value: "zero", label: "Chỉ thẻ 0 lần" },
              ] as const
            ).map((item) => (
              <Button
                key={item.value}
                type="button"
                size="xs"
                variant={filter === item.value ? "secondary" : "outline"}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {error && !data ? (
        <PanelState
          title="Không tải được tổng quan kho"
          description={error}
          action={{ label: "Thử lại", onClick: onRetry }}
        />
      ) : isPending || !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải tổng quan kho">
          <Skeleton className="h-48 w-full" />
        </div>
      ) : data.detectorVersion === null ? (
        <PanelState
          title="Kho chưa có mẫu nến tính sẵn"
          description="Chưa có lần tính nào hoàn tất nên chưa có số liệu theo thẻ. Bấm Tính lại mẫu nến."
        />
      ) : (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground">
            {`${formatNumber(data.total)} mẫu trên ${formatNumber(data.cards.length)} thẻ`}
            {data.zeroCount > 0 ? (
              <span className="flex items-center gap-1 text-status-warning">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {`${formatNumber(data.zeroCount)} thẻ chưa gặp lần nào`}
              </span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">Thẻ nào cũng đã xuất hiện ít nhất một lần.</span>
            )}
          </p>
          {cards.length === 0 ? (
            <p className="rounded-lg bg-card p-4 text-sm ring-1 ring-border/60 ring-inset dark:ring-0">
              Không có thẻ nào ở 0 lần.
            </p>
          ) : (
            <PatternTierTable
              cards={cards}
              total={cards.reduce((sum, card) => sum + card.count, 0)}
              label="Số lần gặp của từng thẻ trên cả kho"
              totalLabel={filter === "zero" ? "Tổng của các thẻ đang hiện" : "Tổng cộng"}
              showCandles
              highlightZero
            />
          )}
        </div>
      )}
    </PatternBlock>
  )
}
