import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { Search, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api"
import { formatMoney, formatNumber } from "@/lib/format"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { StatusBadge } from "@/pages/admin/core/components/status-badge"

import type { TeamLeadListItem, TeamLeadStatus } from "./api"
import { useAppointTeamLead, useTeamLeads } from "./hooks"
import { commissionLabel, offerLabel, TEAM_LEAD_STATUS_LABELS } from "./labels"
import { AppointDialog } from "./team-lead-dialogs"

const ALL = "all"
const STATUSES: TeamLeadStatus[] = ["active", "revoked"]

export function TeamLeadStatusBadge({ status }: { status: TeamLeadStatus }) {
  return (
    <StatusBadge
      status={status}
      label={TEAM_LEAD_STATUS_LABELS[status]}
      tone={status === "active" ? "success" : "neutral"}
    />
  )
}

/** Danh sách trưởng nhóm (admin spec v1.1 §5.2). */
export function TeamLeadsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<TeamLeadStatus | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [appointOpen, setAppointOpen] = useState(false)
  const [appointError, setAppointError] = useState<string | null>(null)

  const leads = useTeamLeads({ page, pageSize, search: search || undefined, status: status === ALL ? undefined : status })
  const appoint = useAppointTeamLead()

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  const columns: AdminColumn<TeamLeadListItem>[] = [
    {
      id: "lead",
      header: "Trưởng nhóm",
      cell: (row) => (
        <span className="block min-w-0">
          <Link
            to={`/admin/team-leads/${row.user.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.user.fullName ?? row.user.username}
          </Link>
          <span className="block text-xs text-muted-foreground">{row.user.email}</span>
        </span>
      ),
    },
    { id: "code", header: "Mã giới thiệu", cell: (row) => <span className="font-mono text-xs">{row.code}</span> },
    { id: "members", header: "Người dùng", align: "right", cell: (row) => <span className="tabular-nums">{formatNumber(row.memberCount)}</span> },
    { id: "commission", header: "Hoa hồng", align: "right", cell: (row) => <span className="tabular-nums">{commissionLabel(row.commissionPct)}</span> },
    { id: "offer", header: "Ưu đãi người dùng mới", cell: (row) => offerLabel(row.offerType, row.offerDays) },
    { id: "revenue", header: "Doanh thu 30 ngày", align: "right", cell: (row) => <span className="tabular-nums">{formatMoney(row.revenue30dVnd)}</span> },
    { id: "commission30d", header: "Hoa hồng 30 ngày", align: "right", cell: (row) => <span className="tabular-nums">{formatMoney(row.commission30dVnd)}</span> },
    { id: "status", header: "Trạng thái", cell: (row) => <TeamLeadStatusBadge status={row.status} /> },
  ]

  return (
    <WorkspacePage
      title="Trưởng nhóm"
      description="Người dùng nhập mã giới thiệu của trưởng nhóm khi đăng ký sẽ thuộc nhóm đó."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setAppointError(null)
            setAppointOpen(true)
          }}
        >
          <UserPlus />
          Bổ nhiệm trưởng nhóm
        </Button>
      }
    >
      <form
        onSubmit={submitSearch}
        className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60 ring-inset dark:ring-0"
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm theo tên đăng nhập, họ tên hoặc email"
            aria-label="Tìm trưởng nhóm"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as TeamLeadStatus | typeof ALL)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[10rem]" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TEAM_LEAD_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm">
          <Search />
          Lọc
        </Button>
      </form>

      <AdminDataTable
        columns={columns}
        rows={leads.data?.items ?? []}
        rowKey={(row) => row.user.id}
        loading={leads.isLoading || leads.isFetching}
        error={leads.error ? errorMessage(leads.error) : null}
        onRetry={() => void leads.refetch()}
        emptyLabel={search || status !== ALL ? "Không có trưởng nhóm khớp bộ lọc." : "Chưa có trưởng nhóm nào. Bấm Bổ nhiệm trưởng nhóm để bắt đầu."}
        onRowClick={(row) => navigate(`/admin/team-leads/${row.user.id}`)}
        pagination={{
          page,
          pageSize,
          total: leads.data?.total ?? 0,
          totalPages: leads.data?.totalPages ?? 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />

      {appointOpen && (
        <AppointDialog
          pending={appoint.isPending}
          error={appointError}
          onClose={() => setAppointOpen(false)}
          onSubmit={(input) => {
            setAppointError(null)
            appoint.mutate(input, {
              onSuccess: (lead) => {
                toast.success(`Đã bổ nhiệm ${lead.user.fullName ?? lead.user.username}, mã ${lead.code}`)
                setAppointOpen(false)
                navigate(`/admin/team-leads/${lead.user.id}`)
              },
              onError: (error) => setAppointError(errorMessage(error)),
            })
          }}
        />
      )}
    </WorkspacePage>
  )
}
