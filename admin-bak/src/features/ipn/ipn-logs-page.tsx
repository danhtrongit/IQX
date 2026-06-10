import { useState } from "react"
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
import { ipnApi, type IPNLogRow } from "@/lib/api/ipn"
import { buildColumns } from "./columns"
import { IPNDetailDrawer } from "./ipn-detail-drawer"

const RESULT_STATUS_OPTIONS = [
  { value: "processed", label: "Đã xử lý" },
  { value: "ignored", label: "Bỏ qua" },
  { value: "already_processed", label: "Đã xử lý trước" },
  { value: "order_not_found", label: "Không tìm thấy đơn" },
  { value: "amount_mismatch", label: "Sai số tiền" },
  { value: "secret_invalid", label: "Secret không hợp lệ" },
]

type SecretFilter = "all" | "valid" | "invalid"

export default function IPNLogsPage() {
  const [secretFilter, setSecretFilter] = useState<SecretFilter>("all")
  const [resultStatusFilter, setResultStatusFilter] = useState("")
  const [searchFilter, setSearchFilter] = useState("")

  const [selectedLog, setSelectedLog] = useState<IPNLogRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<IPNLogRow>({
    queryFn: (p) =>
      ipnApi.list({
        page: p.page,
        pageSize: p.pageSize,
        secretKeyValid:
          secretFilter === "valid" ? true : secretFilter === "invalid" ? false : undefined,
        resultStatus: resultStatusFilter || undefined,
        search: searchFilter || undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  const columns = buildColumns({
    onDetail: (log) => {
      setSelectedLog(log)
      setDrawerOpen(true)
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">IPN Logs</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} bản ghi` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={secretFilter}
          onValueChange={(v) => {
            setSecretFilter(v as SecretFilter)
            setParams({ secret_key_valid: v === "all" ? "" : v === "valid" ? "true" : "false", page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tất cả Secret" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="valid">Secret hợp lệ</SelectItem>
            <SelectItem value="invalid">Secret không hợp lệ</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={resultStatusFilter || "all"}
          onValueChange={(v) => {
            const val = (v ?? "") === "all" ? "" : (v ?? "")
            setResultStatusFilter(val)
            setParams({ result_status: val, page: 1 })
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tất cả kết quả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả kết quả</SelectItem>
            {RESULT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="TXN ID / kết quả..."
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value)
            setParams({ search: e.target.value, page: 1 })
          }}
          className="w-60"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 1}
        pagination={pagination}
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        loading={isLoading}
        emptyMessage="Không có IPN log"
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

      <IPNDetailDrawer
        log={selectedLog}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setSelectedLog(null)
        }}
        onRetried={refetch}
      />
    </div>
  )
}
