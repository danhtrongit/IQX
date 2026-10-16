import { useState, type FormEvent } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, BadgeDollarSign, Copy, Gift, PencilLine, Search, UserMinus, UserPlus, UserRound, Users, UserX, Wallet } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { DetailList } from "@/pages/admin/core/components/detail-list"
import { KpiTile } from "@/pages/admin/core/components/kpi-tile"
import { labelForActorRole } from "@/pages/admin/core/labels"

import type { TeamLeadHistoryEntry, TeamLeadMember } from "./api"
import {
  useAddTeamLeadMember,
  useRemoveTeamLeadMember,
  useRevokeTeamLead,
  useTeamLead,
  useTeamLeadMembers,
  useUpdateTeamLeadPolicy,
} from "./hooks"
import { commissionLabel, describeHistoryChange, JOIN_VIA_LABELS, labelForHistoryAction, offerLabel } from "./labels"
import { AddMemberDialog, PolicyDialog, RemoveMemberDialog, RevokeDialog } from "./team-lead-dialogs"
import { TeamLeadStatusBadge } from "./team-leads-page"

type DialogState =
  | { kind: "policy" }
  | { kind: "revoke" }
  | { kind: "add" }
  | { kind: "remove"; member: TeamLeadMember }
  | null

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    toast.success("Đã sao chép mã giới thiệu")
  } catch {
    toast.error("Không sao chép được. Hãy chọn và sao chép thủ công.")
  }
}

function actorLabel(entry: TeamLeadHistoryEntry) {
  if (!entry.actor) return <span className="text-muted-foreground">Hệ thống</span>
  return (
    <span>
      <span>{entry.actor.username ?? entry.actor.fullName ?? entry.actor.id}</span>
      <span className="block text-[11px] text-muted-foreground">{labelForActorRole(entry.actorRole)}</span>
    </span>
  )
}

/** Chi tiết trưởng nhóm (admin spec v1.1 §5.2). */
export function TeamLeadDetailPage() {
  const { leadId = "" } = useParams()
  const lead = useTeamLead(leadId)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const members = useTeamLeadMembers(leadId, { page, pageSize, search: search || undefined })
  const updatePolicy = useUpdateTeamLeadPolicy(leadId)
  const revoke = useRevokeTeamLead(leadId)
  const addMember = useAddTeamLeadMember()
  const removeMember = useRemoveTeamLeadMember()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const data = lead.data
  const active = data?.status === "active"
  const leadName = data ? (data.user.fullName ?? data.user.username) : ""

  function open(next: DialogState) {
    setDialogError(null)
    setDialog(next)
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  const memberColumns: AdminColumn<TeamLeadMember>[] = [
    {
      id: "user",
      header: "Người dùng",
      cell: (row) => (
        <span className="block min-w-0">
          <Link to={`/admin/users/${row.id}`} className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline">
            {row.username}
          </Link>
          <span className="block text-xs text-muted-foreground">
            {row.fullName ? `${row.fullName} · ` : ""}
            {row.email}
          </span>
        </span>
      ),
    },
    { id: "via", header: "Vào nhóm bằng", cell: (row) => JOIN_VIA_LABELS[row.groupJoinVia] },
    { id: "joined", header: "Ngày vào nhóm", cell: (row) => <span className="tabular-nums">{formatDateTime(row.groupJoinedAt)}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (row) => (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => open({ kind: "remove", member: row })}>
          <UserMinus />
          Loại khỏi nhóm
        </Button>
      ),
    },
  ]

  const historyColumns: AdminColumn<TeamLeadHistoryEntry>[] = [
    { id: "at", header: "Thời gian", cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span> },
    { id: "action", header: "Thao tác", cell: (row) => <span className="font-medium">{labelForHistoryAction(row.action)}</span> },
    {
      id: "change",
      header: "Thay đổi",
      cell: (row) => {
        const change = describeHistoryChange(row)
        return (
          <span className="block max-w-[28rem] whitespace-normal">
            {change.text}
            {change.memberUserId && (
              <Link to={`/admin/users/${change.memberUserId}`} className="ml-1 text-primary underline-offset-4 hover:underline">
                Xem người dùng
              </Link>
            )}
          </span>
        )
      },
    },
    {
      id: "reason",
      header: "Lý do",
      cell: (row) => (row.reason ? <span className="block max-w-[20rem] whitespace-normal">{row.reason}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: "actor", header: "Người thực hiện", cell: actorLabel },
  ]

  return (
    <WorkspacePage
      title={data ? leadName : "Chi tiết trưởng nhóm"}
      description={data ? `${data.user.email} · mã ${data.code}` : "Chính sách, mã giới thiệu, người dùng trong nhóm và lịch sử thay đổi"}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/team-leads">
              <ArrowLeft />
              Danh sách
            </Link>
          </Button>
          {data && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/admin/users/${data.user.id}`}>
                <UserRound />
                Hồ sơ người dùng
              </Link>
            </Button>
          )}
          {active && (
            <>
              <Button variant="outline" size="sm" onClick={() => open({ kind: "policy" })}>
                <PencilLine />
                Sửa chính sách
              </Button>
              <Button variant="destructive" size="sm" onClick={() => open({ kind: "revoke" })}>
                <UserX />
                Thôi bổ nhiệm
              </Button>
            </>
          )}
        </>
      }
    >
      {lead.isError && (
        <PanelState
          title="Không tải được trưởng nhóm"
          description={errorMessage(lead.error)}
          action={{ label: "Thử lại", onClick: () => void lead.refetch() }}
        />
      )}

      {lead.isLoading ? (
        <div className="space-y-4" role="status" aria-label="Đang tải trưởng nhóm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}
          </div>
          <Skeleton className="h-48" />
        </div>
      ) : data ? (
        <>
          {!active && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Đã thôi bổ nhiệm lúc {formatDateTime(data.revokedAt)}. Mã không còn nhận người dùng mới; người dùng đã
              thuộc nhóm giữ nguyên nhóm.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Người dùng trong nhóm" value={formatNumber(data.metrics.memberCount)} icon={Users} />
            <KpiTile label="Doanh thu 30 ngày" value={formatMoney(data.metrics.revenue30dVnd)} hint="Đã trừ hoàn tiền" icon={Wallet} />
            <KpiTile label="Hoa hồng 30 ngày" value={formatMoney(data.metrics.commission30dVnd)} icon={BadgeDollarSign} />
            <KpiTile label="Premium miễn phí đang hiệu lực" value={formatNumber(data.metrics.activeFreePremiumCount)} icon={Gift} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Chính sách mã giới thiệu</CardTitle>
                <CardDescription>
                  {data.policy ? `Hiệu lực từ ${formatDateTime(data.policy.effectiveFrom)}` : "Chưa có chính sách"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList
                  columns={1}
                  items={[
                    {
                      label: "Hoa hồng trực tiếp",
                      value: data.policy ? `${commissionLabel(data.policy.commissionPct)} doanh thu` : "—",
                    },
                    { label: "Ưu đãi cho người dùng nhập mã", value: offerLabel(data.policy?.offerType, data.policy?.offerDays) },
                    { label: "Áp dụng", value: "Người dùng mới: từ lúc lưu. Người đã trong nhóm: từ lần thanh toán tiếp theo" },
                    { label: "Lý do lần sửa gần nhất", value: data.policy?.reason ?? "—" },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mã giới thiệu</CardTitle>
                <CardDescription>Mã là tên đăng nhập của trưởng nhóm nên không đổi được.</CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList
                  columns={1}
                  items={[
                    {
                      label: "Mã (tên đăng nhập)",
                      value: (
                        <span className="flex flex-wrap items-center gap-2">
                          <code className="rounded-sm bg-muted px-2 py-0.5 font-mono text-sm font-medium">{data.code}</code>
                          <Button type="button" variant="outline" size="xs" onClick={() => void copyCode(data.code)}>
                            <Copy />
                            Sao chép mã
                          </Button>
                        </span>
                      ),
                    },
                    { label: "Ngày bổ nhiệm", value: <span className="tabular-nums">{formatDateTime(data.appointedAt)}</span> },
                    { label: "Nhận người dùng mới", value: data.acceptingNewUsers ? "Có" : "Không" },
                    { label: "Trạng thái", value: <TeamLeadStatusBadge status={data.status} /> },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Người dùng trong nhóm</CardTitle>
              <CardDescription>{formatNumber(members.data?.total ?? data.metrics.memberCount)} người dùng</CardDescription>
              {active && (
                <CardAction>
                  <Button size="sm" variant="outline" onClick={() => open({ kind: "add" })}>
                    <UserPlus />
                    Thêm người dùng vào nhóm
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[14rem] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Tìm theo tên đăng nhập, họ tên hoặc email"
                    aria-label="Tìm người dùng trong nhóm"
                    className="pl-8"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  <Search />
                  Tìm
                </Button>
              </form>
              <AdminDataTable
                columns={memberColumns}
                rows={members.data?.items ?? []}
                rowKey={(row) => row.id}
                loading={members.isLoading || members.isFetching}
                error={members.error ? errorMessage(members.error) : null}
                onRetry={() => void members.refetch()}
                emptyLabel={search ? "Không có người dùng phù hợp." : "Nhóm chưa có người dùng nào."}
                pagination={{
                  page,
                  pageSize,
                  total: members.data?.total ?? 0,
                  totalPages: members.data?.totalPages ?? 1,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size)
                    setPage(1)
                  },
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lịch sử thay đổi</CardTitle>
              <CardDescription>Bổ nhiệm, chính sách, thôi bổ nhiệm và thay đổi thành viên, mới nhất trước.</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminDataTable
                columns={historyColumns}
                rows={data.history}
                rowKey={(row) => row.id}
                emptyLabel="Chưa có thay đổi nào."
                footer={
                  data.history.length >= 100 ? (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Hiển thị 100 thay đổi gần nhất. Xem đầy đủ trong Nhật ký kiểm toán.
                    </p>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      {data && dialog?.kind === "policy" && (
        <PolicyDialog
          lead={data}
          pending={updatePolicy.isPending}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            setDialogError(null)
            updatePolicy.mutate(input, {
              onSuccess: () => {
                toast.success("Đã lưu chính sách mới")
                setDialog(null)
              },
              onError: (error) => setDialogError(errorMessage(error)),
            })
          }}
        />
      )}

      {data && dialog?.kind === "revoke" && (
        <RevokeDialog
          lead={data}
          pending={revoke.isPending}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => {
            setDialogError(null)
            revoke.mutate(reason, {
              onSuccess: () => {
                toast.success(`Đã thôi bổ nhiệm ${leadName}`)
                setDialog(null)
              },
              onError: (error) => setDialogError(errorMessage(error)),
            })
          }}
        />
      )}

      {data && dialog?.kind === "add" && (
        <AddMemberDialog
          lead={data}
          pending={addMember.isPending}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={({ userId, reason }) => {
            setDialogError(null)
            addMember.mutate(
              { leadId: data.user.id, userId, reason },
              {
                onSuccess: (result) => {
                  toast.success(
                    `${result.action === "move" ? "Đã chuyển" : "Đã thêm"} ${result.member.username} vào nhóm${
                      result.offerGrant ? ", kèm Premium miễn phí theo ưu đãi của nhóm" : ""
                    }`,
                  )
                  setDialog(null)
                },
                onError: (error) => setDialogError(errorMessage(error)),
              },
            )
          }}
        />
      )}

      {data && dialog?.kind === "remove" && (
        <RemoveMemberDialog
          member={dialog.member}
          leadName={leadName}
          pending={removeMember.isPending}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => {
            setDialogError(null)
            removeMember.mutate(
              { leadId: data.user.id, userId: dialog.member.id, reason },
              {
                onSuccess: () => {
                  toast.success(`Đã loại ${dialog.member.username} khỏi nhóm`)
                  setDialog(null)
                },
                onError: (error) => setDialogError(errorMessage(error)),
              },
            )
          }}
        />
      )}
    </WorkspacePage>
  )
}
