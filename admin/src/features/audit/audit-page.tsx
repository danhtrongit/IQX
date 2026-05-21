import { useState } from "react"
import type { PaginationState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { auditApi, type AuditLogRow } from "@/lib/api/audit"
import { auditColumns } from "./columns"
import { AuditDetailDrawer } from "./audit-detail-drawer"

const TARGET_ENTITY_OPTIONS = [
  { value: "all", label: "Tất cả entity" },
  { value: "user", label: "user" },
  { value: "subscription", label: "subscription" },
  { value: "payment_order", label: "payment_order" },
  { value: "vt_account", label: "vt_account" },
  { value: "premium_plan", label: "premium_plan" },
  { value: "vt_config", label: "vt_config" },
]

const ACTION_PREFIX_SUGGESTIONS = [
  "user.",
  "premium.",
  "subscription.",
  "vt.",
  "system.",
  "payment.",
]

export default function AuditPage() {
  // Filters
  const [actionPrefix, setActionPrefix] = useState("")
  const [targetEntity, setTargetEntity] = useState("all")
  const [targetId, setTargetId] = useState("")
  const [adminUserId, setAdminUserId] = useState("")

  // Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null)

  const { data, isLoading, params, setParams } = usePaginatedQuery<AuditLogRow>({
    queryFn: (p) =>
      auditApi.list({
        page: p.page,
        pageSize: p.pageSize,
        actionPrefix: actionPrefix || undefined,
        targetEntity: targetEntity !== "all" ? targetEntity : undefined,
        targetId: targetId || undefined,
        adminUserId: adminUserId || undefined,
      }),
    defaults: { page: 1, pageSize: 50 },
  })

  const pagination: PaginationState = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 50,
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} bản ghi` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Action prefix — datalist for suggestions */}
        <div className="relative">
          <Input
            list="action-prefix-suggestions"
            placeholder="Tiền tố hành động (user., vt.,...)"
            value={actionPrefix}
            onChange={(e) => {
              setActionPrefix(e.target.value)
              setParams({ page: 1 })
            }}
            className="w-56"
          />
          <datalist id="action-prefix-suggestions">
            {ACTION_PREFIX_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* Target entity */}
        <Select
          value={targetEntity}
          onValueChange={(v) => {
            setTargetEntity(v ?? "all")
            setParams({ page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Loại đối tượng" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_ENTITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Target ID */}
        <Input
          placeholder="Target ID (UUID)"
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value)
            setParams({ page: 1 })
          }}
          className="w-60 font-mono text-sm"
        />

        {/* Admin user ID */}
        <Input
          placeholder="Admin User ID (UUID)"
          value={adminUserId}
          onChange={(e) => {
            setAdminUserId(e.target.value)
            setParams({ page: 1 })
          }}
          className="w-60 font-mono text-sm"
        />
      </div>

      <DataTable
        columns={auditColumns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 1}
        pagination={pagination}
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        onRowClick={setSelectedLog}
        loading={isLoading}
        emptyMessage="Không tìm thấy audit log nào"
      />

      <DataTablePagination
        pagination={pagination}
        pageCount={data?.totalPages ?? 1}
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        total={data?.total}
      />

      {/* Audit detail drawer */}
      <AuditDetailDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  )
}
