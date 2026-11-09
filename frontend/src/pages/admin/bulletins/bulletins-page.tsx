import { Info, RefreshCw } from "lucide-react"
import { Link } from "react-router"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { formatWeekdayDate } from "@/pages/market-workspace/market/bulletin-format"

import type { AdminBulletinRow } from "./bulletin-admin-api"
import { useAdminBulletins } from "./bulletin-admin-hooks"
import { BulletinStatusBadge } from "./bulletin-status-badge"

function statusHint(row: AdminBulletinRow): string | null {
  if (row.status !== "draft") return null
  if (!row.data_ready) return "Chờ dữ liệu phiên"
  if (row.error_count === null) return null
  return row.error_count > 0 ? `${row.error_count} lỗi cần sửa` : "Sẵn sàng Public"
}

const dash = <span className="text-muted-foreground">-</span>

/**
 * NỘI DUNG › Bản tin cuối phiên: danh sách bản nháp, đang trên web và đã gỡ trong 6 tháng gần nhất.
 * Không có nút tạo mới: bản nháp do hệ thống tự tạo khi dữ liệu phiên đã chốt.
 */
export function BulletinsPage() {
  const bulletins = useAdminBulletins()
  const items = bulletins.data?.items ?? []

  const columns: AdminColumn<AdminBulletinRow>[] = [
    {
      id: "date",
      header: "Ngày phiên",
      cell: (row) => <span className="font-medium tabular-nums">{formatWeekdayDate(row.trade_date)}</span>,
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => {
        const hint = statusHint(row)
        return (
          <span className="block space-y-1">
            <BulletinStatusBadge status={row.status} />
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
          </span>
        )
      },
    },
    {
      id: "published",
      header: "Public lúc",
      cell: (row) => (row.published_at ? <span className="tabular-nums">{formatDateTime(row.published_at)}</span> : dash),
    },
    {
      id: "updated",
      header: "Cập nhật lúc",
      cell: (row) => (row.updated_at ? <span className="tabular-nums">{formatDateTime(row.updated_at)}</span> : dash),
    },
    { id: "actor", header: "Người thực hiện", cell: (row) => row.actor_name ?? dash },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (row) => (
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/market-bulletins/${row.trade_date}`}>{row.status === "draft" ? "Viết nhận định" : "Mở"}</Link>
        </Button>
      ),
    },
  ]

  return (
    <WorkspacePage
      title="Bản tin cuối phiên"
      description="Mỗi phiên, khi dữ liệu đã chốt, hệ thống tự tạo bản nháp có sẵn số liệu VN-Index. Quản trị viên viết nhận định, lọc và đẩy mã từ Bộ lọc, rồi Public."
      actions={
        <Button type="button" variant="outline" size="sm" disabled={bulletins.isFetching} onClick={() => void bulletins.refetch()}>
          <RefreshCw className={bulletins.isFetching ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      }
    >
      <AdminDataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.trade_date}
        loading={bulletins.isLoading}
        error={bulletins.error ? errorMessage(bulletins.error) : null}
        onRetry={() => void bulletins.refetch()}
        emptyLabel="Chưa có bản nháp nào. Bản nháp được tạo tự động sau mỗi phiên khi dữ liệu đã chốt."
      />

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Lưu 6 tháng gần nhất. Bản cũ hơn tự xoá khỏi web và khỏi danh sách này.
      </p>
    </WorkspacePage>
  )
}
