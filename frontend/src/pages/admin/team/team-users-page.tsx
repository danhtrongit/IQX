import type { FormEvent } from "react"
import { Link, useSearchParams } from "react-router"
import { Search, X } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { StatusBadge } from "@/pages/admin/core/components/status-badge"
import { labelForRole } from "@/pages/admin/core/labels"

import { TEAM_PAGE_SIZES, TEAM_USER_ROLES, type TeamUserListParams, type TeamUserRow, type TeamUserSort } from "./api"
import { useTeamUsers } from "./hooks"
import { SEGMENT_COPY } from "./labels"
import { AcademyProgressCell, PnlCell } from "./team-cells"
import { parseTeamUserParams, toTeamUserSearch } from "./users-url"

const ALL = "all"

/**
 * Người dùng trong nhóm (admin spec v1.1 §5.1.3): tìm kiếm, lọc vai trò, lối tắt từ Tổng
 * quan, phân trang 20/50/100 và sắp xếp theo cả 5 cột. Không có chọn nhiều, thao tác hàng
 * loạt hay xuất CSV. Lợi nhuận chỉ có %.
 */
export function TeamUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseTeamUserParams(searchParams)
  const users = useTeamUsers(params)
  const state = users.data

  function update(next: Partial<TeamUserListParams>, resetPage = true) {
    setSearchParams(toTeamUserSearch({ ...params, ...(resetPage ? { page: 1 } : {}), ...next }))
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get("search") ?? "").trim()
    update({ search: value || undefined })
  }

  function changeSort(field: string) {
    const sortBy = field as TeamUserSort
    update(
      params.sortBy === sortBy
        ? { sortOrder: params.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy, sortOrder: "asc" },
    )
  }

  const filtered = !!(params.search || params.role || params.segment)

  const columns: AdminColumn<TeamUserRow>[] = [
    {
      id: "username",
      header: "Tên đăng nhập",
      sortKey: "username",
      cell: (user) => (
        <span className="block min-w-0">
          <Link
            to={`/admin/users/${user.id}`}
            className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {user.username}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">{user.fullName ?? "Chưa có tên"}</span>
        </span>
      ),
    },
    {
      id: "role",
      header: "Vai trò",
      sortKey: "role",
      cell: (user) => <StatusBadge status={user.role} label={labelForRole(user.role)} tone="info" />,
    },
    {
      id: "demo",
      header: "Lợi nhuận Demo Trading",
      sortKey: "demo_pnl_pct",
      align: "right",
      cell: (user) => <PnlCell value={user.demoTrading} />,
    },
    {
      id: "bot",
      header: "Lợi nhuận Bot",
      sortKey: "bot_pnl_pct",
      align: "right",
      cell: (user) => <PnlCell value={user.bot} />,
    },
    {
      id: "academy",
      header: "Học viện",
      sortKey: "academy_progress",
      cell: (user) => <AcademyProgressCell academy={user.academy} />,
    },
  ]

  return (
    <WorkspacePage
      title="Người dùng"
      description={
        state
          ? `${formatNumber(state.total)} người dùng trong nhóm${filtered ? " khớp bộ lọc" : ""}`
          : "Người dùng trong nhóm của bạn"
      }
    >
      <form
        key={params.search ?? ""}
        onSubmit={submitSearch}
        className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60 ring-inset dark:ring-0"
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="search"
            defaultValue={params.search ?? ""}
            placeholder="Tìm theo tên đăng nhập, họ tên hoặc email"
            aria-label="Tìm theo tên đăng nhập, họ tên hoặc email"
            className="pl-8"
          />
        </div>
        <Select
          value={params.role ?? ALL}
          onValueChange={(value) => update({ role: value === ALL ? undefined : (value as TeamUserListParams["role"]) })}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Lọc theo vai trò">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi vai trò</SelectItem>
            {TEAM_USER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {labelForRole(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm">
          <Search />
          Lọc
        </Button>
        {params.segment && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={`Bỏ lối tắt ${SEGMENT_COPY[params.segment].label}`}
            onClick={() => update({ segment: undefined })}
          >
            {SEGMENT_COPY[params.segment].label}
            <X />
          </Button>
        )}
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update({ search: undefined, role: undefined, segment: undefined })}
          >
            Xóa bộ lọc
          </Button>
        )}
      </form>

      <AdminDataTable
        columns={columns}
        rows={state?.items ?? []}
        rowKey={(user) => user.id}
        loading={users.isLoading || users.isFetching}
        error={users.error ? errorMessage(users.error) : null}
        onRetry={() => void users.refetch()}
        emptyLabel={filtered ? "Không có người dùng khớp bộ lọc." : "Nhóm chưa có người dùng nào. Chia sẻ mã giới thiệu để người dùng mới vào nhóm."}
        sort={{ field: params.sortBy, dir: params.sortOrder }}
        onSortChange={changeSort}
        pagination={{
          page: params.page,
          pageSize: params.pageSize,
          total: state?.total ?? 0,
          totalPages: state?.totalPages ?? 1,
          pageSizeOptions: [...TEAM_PAGE_SIZES],
          onPageChange: (page) => update({ page }, false),
          onPageSizeChange: (pageSize) => update({ pageSize }),
        }}
      />
    </WorkspacePage>
  )
}
