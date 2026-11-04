import { useState, type ReactNode } from "react"
import { Eye, LoaderCircle, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatDateTime, formatNumber } from "@/lib/format"

import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { DetailList } from "./components/detail-list"
import { JsonView } from "./components/json-view"
import { StatusBadge } from "./components/status-badge"
import type {
  DatasetBuilding,
  DatasetConfig,
  DatasetSymbol,
  DatasetSymbols,
  DatasetVersion,
  DatasetVersionStatus,
  DatasetWarning,
} from "./flashback-dataset-api"
import {
  DATASET_NUMERIC_FIELDS,
  describePriceSources,
  formatDatasetNumeric,
} from "./flashback-dataset-fields"
import {
  DATASET_PHASE_LABEL,
  DATASET_TRIGGER_LABEL,
  DATASET_VALUE_BASIS_LABEL,
  DATASET_VERSION_STATUS,
  DATASET_WARNING_TITLE,
  formatDatasetDate,
  formatDatasetDuration,
} from "./flashback-dataset-format"

/** Một khối con của mục kho dữ liệu: tiêu đề, mô tả ngắn và thao tác bên phải. */
export function DatasetBlock({
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
          <h3 className="font-heading text-sm font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Cảnh báo của kho: làm mới thất bại, kho dưới ngưỡng số mã, ván không cắt được đề (spec §6). */
export function DatasetWarnings({ warnings }: { warnings: DatasetWarning[] }) {
  if (warnings.length === 0) {
    return <p className="text-xs text-muted-foreground">Không có cảnh báo nào về kho dữ liệu.</p>
  }
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <Alert
          key={`${warning.code}-${index}`}
          variant={warning.level === "high" ? "destructive" : "default"}
          className={warning.level === "high" ? undefined : "border-status-warning/45"}
        >
          <TriangleAlert aria-hidden="true" className={warning.level === "high" ? undefined : "text-status-warning"} />
          <AlertTitle>{DATASET_WARNING_TITLE[warning.code] ?? warning.code}</AlertTitle>
          <AlertDescription>
            {warning.message}
            {warning.at && <span className="ml-2 text-xs tabular-nums">{`(${formatDateTime(warning.at)})`}</span>}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/** Thông tin phiên bản đang dùng: số phiên bản, ngày tạo, số mã, khoảng dữ liệu (spec §6). */
export function DatasetVersionInfo({ version }: { version: DatasetVersion }) {
  return (
    <div className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-border/60 ring-inset dark:ring-0">
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-sm font-bold">{`Phiên bản đang dùng: ${version.version}`}</h3>
        <StatusBadge status="active" label="Đang dùng" tone="success" />
      </div>
      <DetailList
        columns={3}
        items={[
          { label: "Ngày tạo", value: <span className="tabular-nums">{formatDateTime(version.createdAt)}</span> },
          {
            label: "Kích hoạt lúc",
            value: <span className="tabular-nums">{formatDateTime(version.activatedAt)}</span>,
          },
          { label: "Số mã hợp lệ", value: <span className="tabular-nums">{formatNumber(version.symbolsCount)}</span> },
          { label: "Số mã bị loại", value: <span className="tabular-nums">{formatNumber(version.excludedCount)}</span> },
          {
            label: "Khoảng dữ liệu",
            value: (
              <span className="tabular-nums">
                {`${formatDatasetDate(version.firstDate)} đến ${formatDatasetDate(version.lastDate)}`}
              </span>
            ),
          },
          { label: "Nguồn giá", value: <span className="font-mono text-xs">{version.source || "—"}</span> },
          { label: "Cách tạo", value: DATASET_TRIGGER_LABEL[version.trigger] },
          { label: "Thời gian dựng", value: formatDatasetDuration(version.durationMs) },
        ]}
      />
    </div>
  )
}

/** Tiến độ lần làm mới đang chạy, do máy chủ báo qua tổng quan. */
export function DatasetProgressPanel({ building }: { building: DatasetBuilding }) {
  const { progress } = building
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
  return (
    <div role="status" className="space-y-2 rounded-lg border border-primary/35 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
          {`Đang làm mới kho: phiên bản ${building.version}`}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {`${formatNumber(progress.done)}/${formatNumber(progress.total)} mã`}
        </span>
      </div>
      <Progress value={percent} aria-valuenow={percent} aria-label="Tiến độ làm mới kho" />
      <p className="text-xs text-muted-foreground">
        {`${DATASET_PHASE_LABEL[progress.phase]}. Hợp lệ ${formatNumber(progress.ok)}, bị loại ${formatNumber(progress.excluded)}. `}
        {`Bắt đầu lúc ${formatDateTime(building.startedAt)}, ${DATASET_TRIGGER_LABEL[building.trigger].toLowerCase()}.`}
      </p>
      {building.stale && (
        <p className="text-xs text-status-warning">
          Tác vụ nền không còn báo tiến độ nên lần dựng này có thể đã dừng. Bạn có thể bấm Làm mới kho để dựng lại.
        </p>
      )}
    </div>
  )
}

/** Đã gửi yêu cầu nhưng chưa thấy lần dựng nào bắt đầu (tác vụ nền còn xếp hàng). */
export function DatasetQueuedPanel() {
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/5 p-3 text-sm">
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
      Đã gửi yêu cầu làm mới kho. Đang chờ tác vụ nền bắt đầu.
    </div>
  )
}

/** Kết quả lần làm mới gần nhất: thành công hay thất bại, lúc nào, bao lâu, vì sao lỗi. */
export function DatasetLastRun({ run }: { run: DatasetVersion }) {
  const failed = run.status === "failed"
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Lần làm mới gần nhất</span>
      <StatusBadge status={run.status} label={failed ? "Thất bại" : "Thành công"} tone={failed ? "danger" : "success"} />
      <span>{`Phiên bản ${run.version}`}</span>
      <span className="tabular-nums">{formatDateTime(run.finishedAt ?? run.createdAt)}</span>
      <span>{DATASET_TRIGGER_LABEL[run.trigger]}</span>
      <span>{`Thời gian dựng ${formatDatasetDuration(run.durationMs)}`}</span>
      {failed && run.log.error && <span className="text-destructive">{run.log.error}</span>}
    </p>
  )
}

const SYMBOL_PAGE_SIZE = 25
type SymbolFilter = "all" | "ok" | "excluded"
const SYMBOL_FILTERS: { value: SymbolFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "ok", label: "Hợp lệ" },
  { value: "excluded", label: "Bị loại" },
]

function symbolColumns(): AdminColumn<DatasetSymbol>[] {
  return [
    { id: "symbol", header: "Mã", cell: (row) => <span className="font-semibold">{row.symbol}</span> },
    { id: "barsCount", header: "Số phiên", align: "right", cell: (row) => formatNumber(row.barsCount) },
    {
      id: "firstDate",
      header: "Ngày đầu",
      cell: (row) => <span className="tabular-nums">{formatDatasetDate(row.firstDate)}</span>,
    },
    {
      id: "lastDate",
      header: "Ngày cuối",
      cell: (row) => <span className="tabular-nums">{formatDatasetDate(row.lastDate)}</span>,
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => (
        <StatusBadge
          status={row.status}
          label={row.status === "ok" ? "Hợp lệ" : "Bị loại"}
          tone={row.status === "ok" ? "success" : "warning"}
        />
      ),
    },
    {
      id: "reason",
      header: "Lý do bị loại",
      cell: (row) =>
        row.reason ? <span className={row.status === "ok" ? "text-muted-foreground" : undefined}>{row.reason}</span> : "—",
    },
    {
      id: "source",
      header: "Nguồn giá",
      cell: (row) =>
        row.priceSource ? (
          <span className="flex flex-col">
            <span className="font-mono text-xs">{row.priceSource}</span>
            {row.valueBasis && (
              <span className="text-[11px] text-muted-foreground">
                {DATASET_VALUE_BASIS_LABEL[row.valueBasis] ?? row.valueBasis}
              </span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "badCount",
      header: "Phiên lỗi",
      align: "right",
      cell: (row) => formatNumber(row.badCount),
    },
  ]
}

/** Danh sách mã của một phiên bản: mã, số phiên, ngày đầu, ngày cuối, trạng thái, lý do bị loại. */
export function DatasetSymbolsPanel({
  data,
  isPending,
  error,
  onRetry,
  onBackToActive,
}: {
  data: DatasetSymbols | undefined
  isPending: boolean
  /** Thông báo lỗi tải danh sách, hoặc `null`. */
  error: string | null
  onRetry: () => void
  /** Có khi đang xem một phiên bản không phải bản đang dùng. */
  onBackToActive?: () => void
}) {
  const [filter, setFilter] = useState<SymbolFilter>("all")
  const [page, setPage] = useState(1)

  const all = data?.symbols ?? []
  const okCount = all.filter((symbol) => symbol.status === "ok").length
  const rows = filter === "all" ? all : all.filter((symbol) => symbol.status === filter)
  const totalPages = Math.max(1, Math.ceil(rows.length / SYMBOL_PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const visible = rows.slice((current - 1) * SYMBOL_PAGE_SIZE, current * SYMBOL_PAGE_SIZE)
  const known =
    data?.status && data.status in DATASET_VERSION_STATUS
      ? DATASET_VERSION_STATUS[data.status as DatasetVersionStatus]
      : null

  return (
    <DatasetBlock
      title={data?.version ? `Danh sách mã của phiên bản ${data.version}` : "Danh sách mã"}
      description={
        data?.version
          ? `${known?.label ?? data.status ?? ""}: ${okCount} mã hợp lệ, ${all.length - okCount} mã bị loại.`
          : "Chưa có phiên bản kho nào."
      }
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {onBackToActive && (
            <Button type="button" size="xs" variant="ghost" onClick={onBackToActive}>
              Xem bản đang dùng
            </Button>
          )}
          {SYMBOL_FILTERS.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="xs"
              variant={filter === item.value ? "secondary" : "outline"}
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value)
                setPage(1)
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      }
    >
      <AdminDataTable
        columns={symbolColumns()}
        rows={visible}
        rowKey={(row) => `symbol-${row.symbol}`}
        loading={isPending}
        error={error}
        onRetry={onRetry}
        emptyLabel={
          all.length === 0 ? "Chưa có danh sách mã: kho chưa có phiên bản nào." : "Không có mã nào ở trạng thái này."
        }
        pagination={
          rows.length > SYMBOL_PAGE_SIZE
            ? {
                page: current,
                pageSize: SYMBOL_PAGE_SIZE,
                total: rows.length,
                totalPages,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </DatasetBlock>
  )
}

/** Nhật ký một lần tạo kho: kết quả, rổ mã, lịch phiên, nguồn, mã bị loại và JSON nguyên bản. */
export function DatasetLogView({ version }: { version: DatasetVersion }) {
  const { log } = version
  const items: { label: string; value: ReactNode }[] = [
    {
      label: "Kết quả",
      value:
        log.outcome === "failed" || version.status === "failed"
          ? `Thất bại${log.error ? `: ${log.error}` : ""}`
          : log.outcome === "active"
            ? "Đủ điều kiện, đã kích hoạt"
            : "Chưa có kết quả",
    },
  ]
  if (log.basket) {
    items.push({ label: "Rổ mã", value: `${log.basket.index}: ${log.basket.count} mã (${log.basket.source})` })
  }
  if (log.calendar) {
    items.push({
      label: "Lịch phiên của sàn",
      value: `${formatNumber(log.calendar.sessions)} phiên, ${formatDatasetDate(log.calendar.first)} đến ${formatDatasetDate(log.calendar.last)} (${log.calendar.source})`,
    })
  }
  items.push({
    label: "Mã hợp lệ và bị loại",
    value: `${formatNumber(version.symbolsCount)} hợp lệ, ${formatNumber(version.excludedCount)} bị loại`,
  })
  if (log.sources.length > 0) {
    items.push({ label: "Nguồn giá", value: log.sources.map((item) => `${item.source}: ${item.count} mã`).join(", ") })
  }
  if (log.valueBasis) {
    items.push({
      label: "Giá trị giao dịch",
      value: `${log.valueBasis.matched} khớp thật, ${log.valueBasis.mixed} một phần, ${log.valueBasis.approx} ước tính`,
    })
  }
  if (log.cuts) {
    items.push({
      label: `Điểm cắt phòng ${log.cuts.viewBars}/${log.cuts.playBars}`,
      value: `${formatNumber(log.cuts.totalCuts)} điểm cắt trên ${formatNumber(log.cuts.symbolsWithCut)} mã`,
    })
  }
  if (version.requestedBy) {
    items.push({ label: "Người yêu cầu", value: <span className="font-mono text-xs">{version.requestedBy}</span> })
  }

  return (
    <div className="space-y-3">
      <DetailList columns={3} items={items} />
      {log.excluded.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {`Mã bị loại (${log.excluded.length})`}
          </h4>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            {log.excluded.map((item) => (
              <li key={item.symbol}>
                <span className="font-semibold">{item.symbol}</span>
                {`: ${item.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Nhật ký đầy đủ
        </h4>
        <JsonView data={log.raw} maxHeight="12rem" />
      </div>
    </div>
  )
}

/** Lịch sử phiên bản: ngày tạo, trạng thái, số mã và nhật ký (mở rộng từng dòng). */
export function DatasetVersionsPanel({
  versions,
  isPending,
  error,
  onRetry,
  onViewSymbols,
}: {
  versions: DatasetVersion[] | undefined
  isPending: boolean
  error: string | null
  onRetry: () => void
  onViewSymbols: (version: number) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const columns: AdminColumn<DatasetVersion>[] = [
    { id: "version", header: "Phiên bản", cell: (row) => <span className="font-semibold">{`#${row.version}`}</span> },
    {
      id: "createdAt",
      header: "Ngày tạo",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => {
        const known = DATASET_VERSION_STATUS[row.status]
        return <StatusBadge status={row.status} label={known.label} tone={known.tone} />
      },
    },
    {
      id: "symbolsCount",
      header: "Số mã",
      align: "right",
      cell: (row) => (
        <span title={`${row.excludedCount} mã bị loại`}>
          {formatNumber(row.symbolsCount)}
        </span>
      ),
    },
    { id: "trigger", header: "Cách tạo", cell: (row) => DATASET_TRIGGER_LABEL[row.trigger] },
    {
      id: "duration",
      header: "Thời gian dựng",
      align: "right",
      cell: (row) => formatDatasetDuration(row.durationMs),
    },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      cell: (row) => (
        <div className="flex justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label={`Xem danh sách mã của phiên bản ${row.version}`}
            onClick={() => onViewSymbols(row.version)}
          >
            <Eye aria-hidden="true" />
            Xem mã
          </Button>
        </div>
      ),
    },
  ]

  return (
    <AdminDataTable
      columns={columns}
      rows={versions ?? []}
      rowKey={(row) => `version-${row.version}`}
      loading={isPending}
      error={error}
      onRetry={onRetry}
      emptyLabel="Chưa có phiên bản nào. Bấm Làm mới kho để tạo phiên bản đầu tiên."
      expandedKey={expanded}
      onToggleExpand={(key) => setExpanded((current) => (current === key ? null : key))}
      renderExpanded={(row) => <DatasetLogView version={row} />}
    />
  )
}

type ParamRow = { id: string; label: string; value: string; defaultValue: string }

function paramRows(config: DatasetConfig, defaults: DatasetConfig): ParamRow[] {
  const months = (value: readonly number[]) => value.map((month) => `tháng ${month}`).join(", ")
  const dates = (value: readonly string[]) =>
    value.length > 0 ? value.map(formatDatasetDate).join(", ") : "Thứ Hai đầu tiên của tháng cơ cấu"
  return [
    { id: "basket", label: "Rổ mã", value: config.basket, defaultValue: defaults.basket },
    ...DATASET_NUMERIC_FIELDS.map((field) => ({
      id: field.key,
      label: field.label,
      value: formatDatasetNumeric(field, config[field.key]),
      defaultValue: formatDatasetNumeric(field, defaults[field.key]),
    })),
    {
      id: "priceSources",
      label: "Nguồn nến ngày",
      value: describePriceSources(config.priceSources),
      defaultValue: describePriceSources(defaults.priceSources),
    },
    {
      id: "refreshMonths",
      label: "Tháng có kỳ cơ cấu VN100",
      value: months(config.refreshMonths),
      defaultValue: months(defaults.refreshMonths),
    },
    {
      id: "rebalanceDates",
      label: "Ngày hiệu lực kỳ cơ cấu",
      value: dates(config.rebalanceDates),
      defaultValue: dates(defaults.rebalanceDates),
    },
  ]
}

/** Bảng tham số hiện hành (spec §5) cạnh giá trị mặc định; tham số đã đổi được in đậm. */
export function DatasetParamsPanel({ config, defaults }: { config: DatasetConfig; defaults: DatasetConfig }) {
  const columns: AdminColumn<ParamRow>[] = [
    { id: "label", header: "Tham số", cell: (row) => row.label },
    {
      id: "value",
      header: "Giá trị",
      align: "right",
      cell: (row) => (
        <span className={row.value === row.defaultValue ? "tabular-nums" : "font-semibold tabular-nums"}>
          {row.value}
        </span>
      ),
    },
    {
      id: "defaultValue",
      header: "Mặc định",
      align: "right",
      cell: (row) => <span className="tabular-nums text-muted-foreground">{row.defaultValue}</span>,
    },
  ]
  return (
    <AdminDataTable
      columns={columns}
      rows={paramRows(config, defaults)}
      rowKey={(row) => `dataset-param-${row.id}`}
      emptyLabel="Chưa đọc được tham số."
    />
  )
}
