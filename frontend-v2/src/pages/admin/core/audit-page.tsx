import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import { Search } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import { type AuditLogParams, type AuditLogRow } from "./api"
import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { JsonView } from "./components/json-view"
import { useAuditLogs } from "./hooks"
import { labelForAction, labelForEntity } from "./labels"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE_SIZES = [25, 50, 100, 200]

type AuditDraft = {
  actionPrefix: string
  targetEntity: string
  targetId: string
  adminUserId: string
  dateFrom: string
  dateTo: string
}

const EMPTY_DRAFT: AuditDraft = {
  actionPrefix: "",
  targetEntity: "",
  targetId: "",
  adminUserId: "",
  dateFrom: "",
  dateTo: "",
}

/** `datetime-local` is a local wall-clock value; the API wants an instant. */
function toInstant(value: string): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export function AuditPage() {
  const [draft, setDraft] = useState<AuditDraft>(EMPTY_DRAFT)
  const [applied, setApplied] = useState<AuditDraft>(EMPTY_DRAFT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)

  const params: AuditLogParams = {
    page,
    pageSize,
    actionPrefix: applied.actionPrefix || undefined,
    targetEntity: applied.targetEntity || undefined,
    targetId: applied.targetId || undefined,
    adminUserId: applied.adminUserId || undefined,
    dateFrom: toInstant(applied.dateFrom),
    dateTo: toInstant(applied.dateTo),
  }
  const logs = useAuditLogs(params)
  const rows = logs.data?.items ?? []
  const hasFilters = Object.values(applied).some((value) => value !== "")

  function submit(event: FormEvent) {
    event.preventDefault()
    if (draft.adminUserId && !UUID_PATTERN.test(draft.adminUserId.trim())) {
      setFilterError("ID quản trị viên phải là UUID hợp lệ")
      return
    }
    setFilterError(null)
    setApplied({ ...draft, adminUserId: draft.adminUserId.trim(), targetId: draft.targetId.trim() })
    setPage(1)
    setExpanded(null)
  }

  function reset() {
    setDraft(EMPTY_DRAFT)
    setApplied(EMPTY_DRAFT)
    setFilterError(null)
    setPage(1)
    setExpanded(null)
  }

  const columns: AdminColumn<AuditLogRow>[] = [
    {
      id: "createdAt",
      header: "Thời gian",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: "admin",
      header: "Quản trị viên",
      cell: (row) =>
        row.adminEmail ? (
          <span title={row.adminUserId ?? undefined}>{row.adminEmail}</span>
        ) : (
          <span className="text-muted-foreground">Hệ thống</span>
        ),
    },
    {
      id: "action",
      header: "Hành động",
      cell: (row) => (
        <span title={row.action}>
          <span className="font-medium">{labelForAction(row.action)}</span>
          <span className="block font-mono text-[11px] text-muted-foreground">{row.action}</span>
        </span>
      ),
    },
    {
      id: "target",
      header: "Đối tượng",
      cell: (row) => (
        <span>
          <span>{labelForEntity(row.targetEntity)}</span>
          {row.targetId && (
            <span className="block font-mono text-[11px] text-muted-foreground">{row.targetId}</span>
          )}
        </span>
      ),
    },
    {
      id: "ip",
      header: "IP",
      cell: (row) =>
        row.ip ? (
          <span className="font-mono text-xs">{row.ip}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "changed",
      header: "Thay đổi",
      cell: (row) => {
        const parts = [
          row.payloadBefore ? "trước" : null,
          row.payloadAfter ? "sau" : null,
          row.note ? "ghi chú" : null,
        ].filter(Boolean)
        return parts.length > 0 ? (
          <span className="text-muted-foreground">{parts.join(" · ")}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
  ]

  return (
    <WorkspacePage
      title="Nhật ký kiểm toán"
      description={
        logs.data
          ? `${logs.data.total} bản ghi · mới nhất trước`
          : "Mọi thao tác quản trị, kèm dữ liệu trước và sau"
      }
    >
      <form
        onSubmit={submit}
        className="grid gap-3 rounded-lg bg-card p-3 ring-1 ring-border/60 ring-inset sm:grid-cols-2 lg:grid-cols-4 dark:ring-0"
      >
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Tiền tố hành động</Label>
          <Input
            id="audit-action"
            value={draft.actionPrefix}
            placeholder="vd: user."
            onChange={(event) => setDraft((previous) => ({ ...previous, actionPrefix: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-entity">Loại đối tượng</Label>
          <Input
            id="audit-entity"
            value={draft.targetEntity}
            placeholder="vd: user"
            onChange={(event) => setDraft((previous) => ({ ...previous, targetEntity: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-target">ID đối tượng</Label>
          <Input
            id="audit-target"
            value={draft.targetId}
            placeholder="ID bản ghi bị tác động"
            onChange={(event) => setDraft((previous) => ({ ...previous, targetId: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-admin">ID quản trị viên</Label>
          <Input
            id="audit-admin"
            value={draft.adminUserId}
            placeholder="UUID"
            aria-invalid={!!filterError}
            onChange={(event) => setDraft((previous) => ({ ...previous, adminUserId: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">Từ thời điểm</Label>
          <Input
            id="audit-from"
            type="datetime-local"
            value={draft.dateFrom}
            onChange={(event) => setDraft((previous) => ({ ...previous, dateFrom: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">Đến trước thời điểm</Label>
          <Input
            id="audit-to"
            type="datetime-local"
            value={draft.dateTo}
            onChange={(event) => setDraft((previous) => ({ ...previous, dateTo: event.target.value }))}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" size="sm">
            <Search />
            Lọc
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Xóa bộ lọc
            </Button>
          )}
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="ml-auto w-[6.5rem]" aria-label="Số dòng mỗi trang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} dòng
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filterError && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
            {filterError}
          </p>
        )}
      </form>

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={logs.isLoading || logs.isFetching}
        error={logs.error ? errorMessage(logs.error) : null}
        onRetry={() => void logs.refetch()}
        emptyLabel="Không có bản ghi kiểm toán khớp bộ lọc."
        expandedKey={expanded}
        onToggleExpand={(key) => setExpanded((previous) => (previous === key ? null : key))}
        renderExpanded={(row) => (
          <div className="space-y-3">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  ID quản trị viên
                </dt>
                <dd className="font-mono text-xs break-all">{row.adminUserId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Request ID
                </dt>
                <dd className="font-mono text-xs break-all">{row.requestId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Thiết bị
                </dt>
                <dd className="text-xs break-words">{row.userAgent ?? "—"}</dd>
              </div>
            </dl>
            {row.note && <p className="text-sm">{row.note}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Trước
                </p>
                {row.payloadBefore ? (
                  <JsonView data={row.payloadBefore} maxHeight="16rem" />
                ) : (
                  <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Sau
                </p>
                {row.payloadAfter ? (
                  <JsonView data={row.payloadAfter} maxHeight="16rem" />
                ) : (
                  <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
                )}
              </div>
            </div>
            {row.targetEntity === "user" && row.targetId && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/users/${row.targetId}`}>Mở hồ sơ người dùng</Link>
              </Button>
            )}
          </div>
        )}
        pagination={{
          page,
          pageSize,
          total: logs.data?.total ?? 0,
          totalPages: logs.data?.totalPages ?? 1,
          onPageChange: setPage,
        }}
      />
    </WorkspacePage>
  )
}
