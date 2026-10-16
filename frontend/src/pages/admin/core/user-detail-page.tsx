import { useState } from "react"
import { Link, useParams } from "react-router"
import {
  ArrowLeft,
  BadgeCheck,
  KeyRound,
  Mail,
  Network,
  PencilLine,
  ShieldCheck,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { AssignGroupDialog } from "@/pages/admin/team-leads/assign-group-dialog"
import { useAddTeamLeadMember, useRemoveTeamLeadMember } from "@/pages/admin/team-leads/hooks"
import { RemoveMemberDialog } from "@/pages/admin/team-leads/team-lead-dialogs"

import { type AdminUserPatch, type VTOrderBrief } from "./api"
import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { DetailList } from "./components/detail-list"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import { SoftDeleteUserDialog } from "./components/soft-delete-user-dialog"
import { StatusBadge } from "./components/status-badge"
import { UserAccessDialog, type AccessMode } from "./components/user-access-dialog"
import { UserProfileDialog } from "./components/user-profile-dialog"
import { UserReferralCard } from "./components/user-referral-card"
import { UserAccountCards, UserDetailTabs } from "./components/user-360-body"
import { useAuth } from "@/hooks/use-auth"
import {
  useAdminUser360,
  useAdminUserDetail,
  useResendUserVerification,
  useResetUserPassword,
  useSoftDeleteUser,
  useUpdateAdminUser,
  useUserLoginHistory,
} from "./hooks"
import { labelForRole, labelForStatus, labelForVtSide } from "./labels"

function dash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    value
  )
}

export function UserDetailPage() {
  const { userId = "" } = useParams()
  const { user: currentAdmin } = useAuth()
  const user360 = useAdminUser360(userId)
  const detail = useAdminUserDetail(userId)
  const updateUser = useUpdateAdminUser(userId)
  const resetPassword = useResetUserPassword()
  const resendVerification = useResendUserVerification()
  const softDelete = useSoftDeleteUser()
  const confirm = useConfirmDialog()

  const [accessMode, setAccessMode] = useState<AccessMode | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<{ password: string; warning: string } | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(50)
  const [groupDialog, setGroupDialog] = useState<"assign" | "remove" | null>(null)
  const [groupError, setGroupError] = useState<string | null>(null)
  const addToGroup = useAddTeamLeadMember()
  const removeFromGroup = useRemoveTeamLeadMember()

  const profile = user360.data ?? null
  const fullRecord = detail.data
  const loginHistory = useUserLoginHistory(userId, historyPage, historyPageSize)
  const historyRows = loginHistory.data?.items ?? []
  const isSelf = !!profile && profile.user.id === currentAdmin?.id
  // Trưởng nhóm chỉ đổi vai trò qua Bổ nhiệm/Thôi bổ nhiệm; trạng thái và xoá bị máy chủ chặn
  // (422 TEAM_LEAD_ACTIVE) cho tới khi thôi bổ nhiệm (admin spec v1.1 §1.1).
  const isTeamLead = profile?.user.role === "team_lead"
  // Quản trị viên và trưởng nhóm không thể là thành viên của nhóm (§3.1, §3.4).
  const canJoinGroup = !!profile && profile.user.role !== "admin" && !isTeamLead

  function openGroupDialog(kind: "assign" | "remove") {
    setGroupError(null)
    setGroupDialog(kind)
  }

  async function submitAccess(patch: AdminUserPatch) {
    setAccessError(null)
    try {
      const updated = await updateUser.mutateAsync(patch)
      toast.success(
        patch.role
          ? `Đã đặt vai trò ${labelForRole(updated.role)} cho ${updated.email}`
          : `Đã đặt trạng thái ${labelForStatus(updated.status)} cho ${updated.email}`,
      )
      setAccessMode(null)
    } catch (error) {
      const message = errorMessage(error)
      setAccessError(message)
      toast.error(message)
    }
  }

  async function submitProfile(patch: AdminUserPatch) {
    setProfileError(null)
    try {
      const updated = await updateUser.mutateAsync(patch)
      toast.success(`Đã cập nhật hồ sơ ${updated.email}`)
      setProfileOpen(false)
    } catch (error) {
      const message = errorMessage(error)
      setProfileError(message)
    }
  }

  function askResetPassword() {
    if (!profile) return
    confirm.ask({
      title: "Đặt lại mật khẩu?",
      description: `Mật khẩu hiện tại của ${profile.user.email} sẽ bị thay thế bằng mật khẩu tạm thời do hệ thống sinh ra.`,
      confirmLabel: "Đặt lại",
      run: async () => {
        try {
          const result = await resetPassword.mutateAsync(profile.user.id)
          setTemporaryPassword({ password: result.temporaryPassword, warning: result.warning })
          toast.success(`Đã đặt lại mật khẩu cho ${profile.user.email}`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askResendVerification() {
    if (!profile) return
    confirm.ask({
      title: "Gửi lại email xác thực?",
      description: `${profile.user.email} sẽ nhận một email xác thực mới.`,
      confirmLabel: "Gửi lại",
      run: async () => {
        try {
          toast.success(await resendVerification.mutateAsync(profile.user.id))
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  async function markVerified() {
    if (!profile) return
    try {
      await updateUser.mutateAsync({ is_email_verified: true })
      toast.success(`Đã đánh dấu xác thực email ${profile.user.email}`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function confirmSoftDelete() {
    if (!profile) return
    setDeleteError(null)
    try {
      await softDelete.mutateAsync(profile.user.id)
      toast.success(`Đã xóa mềm ${profile.user.email}`)
      setDeleteOpen(false)
    } catch (error) {
      setDeleteError(errorMessage(error))
    }
  }

  async function copyPassword() {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword.password)
      toast.success("Đã sao chép mật khẩu tạm thời")
    } catch {
      toast.error("Không sao chép được — hãy chọn và sao chép thủ công")
    }
  }

  const vtOrderColumns: AdminColumn<VTOrderBrief>[] = [
    { id: "symbol", header: "Mã", cell: (row) => <span className="font-medium">{row.symbol}</span> },
    { id: "side", header: "Chiều", cell: (row) => labelForVtSide(row.side) },
    { id: "quantity", header: "Khối lượng", align: "right", cell: (row) => formatNumber(row.quantity) },
    {
      id: "price",
      header: "Giá đặt",
      align: "right",
      cell: (row) => (row.priceVnd === null ? dash(null) : formatMoney(row.priceVnd)),
    },
    { id: "status", header: "Trạng thái", cell: (row) => <StatusBadge status={row.status} /> },
    {
      id: "createdAt",
      header: "Tạo lúc",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
  ]

  return (
    <WorkspacePage
      title={profile?.user.email ?? "Chi tiết người dùng"}
      description={
        profile
          ? `${profile.user.fullName ?? "Chưa có tên"} · ${profile.user.id}`
          : "Hồ sơ 360°, thuê bao, thanh toán và hoạt động giao dịch ảo"
      }
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/users">
              <ArrowLeft />
              Danh sách
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!fullRecord}
            onClick={() => {
              setProfileError(null)
              setProfileOpen(true)
            }}
          >
            <PencilLine />
            Sửa hồ sơ
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!profile}>
                <UserCog />
                Quyền & trạng thái
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isTeamLead && profile && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to={`/admin/team-leads/${profile.user.id}`}>
                      <Network />
                      Mở trang trưởng nhóm
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                disabled={isTeamLead}
                onSelect={() => {
                  setAccessError(null)
                  setAccessMode("role")
                }}
              >
                <ShieldCheck />
                Đổi vai trò
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isTeamLead}
                onSelect={() => {
                  setAccessError(null)
                  setAccessMode("status")
                }}
              >
                <UserCog />
                Đổi trạng thái
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={askResetPassword}>
                <KeyRound />
                Đặt lại mật khẩu
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={askResendVerification} disabled={profile?.user.isEmailVerified}>
                <Mail />
                Gửi lại email xác thực
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void markVerified()} disabled={profile?.user.isEmailVerified}>
                <BadgeCheck />
                Đánh dấu email đã xác thực
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isTeamLead}
                onSelect={() => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                }}
              >
                <Trash2 />
                Xóa mềm
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {user360.isError && (
        <PanelState
          title="Không tải được hồ sơ người dùng"
          description={errorMessage(user360.error)}
          action={{ label: "Thử lại", onClick: () => void user360.refetch() }}
        />
      )}
      {detail.isError && !user360.isError && (
        <PanelState
          title="Không tải được thông tin hồ sơ đầy đủ"
          description={`${errorMessage(detail.error)} — các thao tác sửa hồ sơ tạm thời bị khóa.`}
          action={{ label: "Thử lại", onClick: () => void detail.refetch() }}
        />
      )}

      {user360.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : profile ? (
        <>
          {isSelf && (
            <p className="rounded-lg bg-status-warning/15 px-3 py-2 text-sm text-status-warning">
              Đây là tài khoản quản trị đang đăng nhập. Đổi vai trò, đổi trạng thái hoặc xóa mềm chính mình sẽ
              ảnh hưởng ngay tới phiên làm việc hiện tại.
            </p>
          )}

          {isTeamLead && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Người dùng đang là trưởng nhóm. Vai trò, trạng thái và xoá mềm chỉ đổi được sau khi thôi bổ nhiệm ở{" "}
              <Link to={`/admin/team-leads/${profile.user.id}`} className="text-primary underline-offset-4 hover:underline">
                trang trưởng nhóm
              </Link>
              .
            </p>
          )}

          <UserAccountCards profile={profile} fullRecord={fullRecord} scope="admin" />

          <UserReferralCard
            group={profile.group}
            referralOffer={profile.referralOffer}
            leadHref={(leadUserId) => `/admin/team-leads/${leadUserId}`}
            actions={
              canJoinGroup ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => openGroupDialog("assign")}>
                    <UserPlus />
                    {profile.group ? "Chuyển nhóm" : "Thêm vào nhóm"}
                  </Button>
                  {profile.group && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openGroupDialog("remove")}
                    >
                      <UserMinus />
                      Loại khỏi nhóm
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />

          {fullRecord && (
            <Card>
              <CardHeader>
                <CardTitle>Hồ sơ cá nhân</CardTitle>
                <CardDescription>Các trường người dùng tự khai báo trong hồ sơ</CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList
                  columns={3}
                  items={[
                    { label: "Ngày sinh", value: dash(fullRecord.dateOfBirth) },
                    { label: "Giới tính", value: dash(fullRecord.gender) },
                    {
                      label: "Xác thực điện thoại",
                      value: fullRecord.phoneVerifiedAt ? (
                        <span className="tabular-nums">{formatDateTime(fullRecord.phoneVerifiedAt)}</span>
                      ) : (
                        "Chưa xác thực"
                      ),
                    },
                    { label: "Quốc gia", value: dash(fullRecord.country) },
                    { label: "Tỉnh / Bang", value: dash(fullRecord.provinceState) },
                    { label: "Thành phố", value: dash(fullRecord.city) },
                    { label: "Quận / Huyện", value: dash(fullRecord.district) },
                    { label: "Phường / Xã", value: dash(fullRecord.ward) },
                    { label: "Mã bưu chính", value: dash(fullRecord.postalCode) },
                    { label: "Địa chỉ", value: dash(fullRecord.streetAddress), },
                    {
                      label: "Ảnh đại diện",
                      value: fullRecord.avatarUrl ? (
                        <a
                          href={fullRecord.avatarUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Mở liên kết
                        </a>
                      ) : (
                        dash(null)
                      ),
                    },
                    { label: "Mã quốc gia", value: dash(fullRecord.phoneCountryCode) },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          <UserDetailTabs
            profile={profile}
            scope="admin"
            paymentHref={(paymentId) => `/admin/payments/${paymentId}`}
            loginHistory={{
              rows: historyRows,
              loading: loginHistory.isLoading || loginHistory.isFetching,
              error: loginHistory.error ? errorMessage(loginHistory.error) : null,
              onRetry: () => void loginHistory.refetch(),
              pagination: {
                page: historyPage,
                pageSize: historyPageSize,
                total: loginHistory.data?.total ?? 0,
                totalPages: loginHistory.data?.totalPages ?? 1,
                onPageChange: setHistoryPage,
                pageSizeOptions: [20, 50, 100, 200],
                onPageSizeChange: (size) => {
                  setHistoryPageSize(size)
                  setHistoryPage(1)
                },
              },
            }}
            vtExtra={
              <>
                {profile.vtAccount ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Tài khoản Demo Trading</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{profile.vtAccount.id}</span>
                        <Link
                          to={`/admin/vt/accounts/${profile.vtAccount.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Mở trang quản trị tài khoản
                        </Link>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DetailList
                        columns={3}
                        items={[
                          { label: "Trạng thái", value: <StatusBadge status={profile.vtAccount.status} /> },
                          { label: "Tiền ban đầu", value: formatMoney(profile.vtAccount.initialCashVnd) },
                          { label: "Khả dụng", value: formatMoney(profile.vtAccount.cashAvailableVnd) },
                          { label: "Đang giữ", value: formatMoney(profile.vtAccount.cashReservedVnd) },
                          { label: "Chờ khớp", value: formatMoney(profile.vtAccount.cashPendingVnd) },
                          {
                            label: "Kích hoạt lúc",
                            value: profile.vtAccount.activatedAt ? (
                              <span className="tabular-nums">{formatDateTime(profile.vtAccount.activatedAt)}</span>
                            ) : (
                              dash(null)
                            ),
                          },
                          {
                            label: "Khóa lúc",
                            value: profile.vtAccount.frozenAt ? (
                              <span className="tabular-nums">{formatDateTime(profile.vtAccount.frozenAt)}</span>
                            ) : (
                              dash(null)
                            ),
                          },
                          { label: "Lý do khóa", value: dash(profile.vtAccount.freezeReason) },
                        ]}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <p className="rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/60 ring-inset dark:ring-0">
                    Người dùng chưa có tài khoản Demo Trading.
                  </p>
                )}

                <AdminDataTable
                  columns={vtOrderColumns}
                  rows={profile.vtRecentOrders}
                  rowKey={(row) => row.id}
                  emptyLabel="Chưa có lệnh Demo Trading nào."
                  footer={
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Hiển thị 10 lệnh gần nhất theo máy chủ. Giá là giá đặt của lệnh giới hạn.
                    </p>
                  }
                />
              </>
            }
          />
        </>
      ) : null}

      {accessMode && profile && (
        <UserAccessDialog
          mode={accessMode}
          current={accessMode === "role" ? profile.user.role : profile.user.status}
          pending={updateUser.isPending}
          error={accessError}
          onClose={() => setAccessMode(null)}
          onSubmit={(patch) => void submitAccess(patch)}
        />
      )}

      {profileOpen && fullRecord && (
        <UserProfileDialog
          detail={fullRecord}
          pending={updateUser.isPending}
          error={profileError}
          onClose={() => setProfileOpen(false)}
          onSubmit={(patch) => void submitProfile(patch)}
        />
      )}

      {deleteOpen && profile && (
        <SoftDeleteUserDialog
          email={profile.user.email}
          pending={softDelete.isPending}
          error={deleteError}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void confirmSoftDelete()}
        />
      )}

      {groupDialog === "assign" && profile && (
        <AssignGroupDialog
          user={{ username: profile.user.username, fullName: profile.user.fullName }}
          currentGroup={profile.group}
          pending={addToGroup.isPending}
          error={groupError}
          onClose={() => setGroupDialog(null)}
          onSubmit={({ leadId, reason }) => {
            setGroupError(null)
            addToGroup.mutate(
              { leadId, userId: profile.user.id, reason },
              {
                onSuccess: (result) => {
                  toast.success(
                    `${result.action === "move" ? "Đã chuyển" : "Đã thêm"} ${result.member.username} vào nhóm${
                      result.offerGrant ? ", kèm Premium miễn phí theo ưu đãi của nhóm" : ""
                    }`,
                  )
                  setGroupDialog(null)
                },
                onError: (error) => setGroupError(errorMessage(error)),
              },
            )
          }}
        />
      )}

      {groupDialog === "remove" && profile?.group && (
        <RemoveMemberDialog
          member={{ username: profile.user.username, fullName: profile.user.fullName }}
          leadName={profile.group.leadFullName ?? profile.group.leadUsername}
          pending={removeFromGroup.isPending}
          error={groupError}
          onClose={() => setGroupDialog(null)}
          onSubmit={(reason) => {
            const group = profile.group
            if (!group) return
            setGroupError(null)
            removeFromGroup.mutate(
              { leadId: group.leadUserId, userId: profile.user.id, reason },
              {
                onSuccess: () => {
                  toast.success(`Đã loại ${profile.user.username} khỏi nhóm`)
                  setGroupDialog(null)
                },
                onError: (error) => setGroupError(errorMessage(error)),
              },
            )
          }}
        />
      )}

      {confirm.element}

      <Dialog open={temporaryPassword !== null} onOpenChange={(open) => !open && setTemporaryPassword(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mật khẩu tạm thời</DialogTitle>
            <DialogDescription>
              Chỉ hiển thị một lần. Hãy chia sẻ qua kênh an toàn và yêu cầu người dùng đổi ngay sau khi đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {temporaryPassword?.password}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copyPassword()}>
              Sao chép
            </Button>
          </div>
          {temporaryPassword?.warning && (
            <p className="text-xs leading-5 text-muted-foreground">{temporaryPassword.warning}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemporaryPassword(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  )
}
