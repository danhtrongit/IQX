import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, UserMinus } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { UserAccountCards, UserDetailTabs } from "@/pages/admin/core/components/user-360-body"
import { UserReferralCard } from "@/pages/admin/core/components/user-referral-card"
import { RemoveMemberDialog } from "@/pages/admin/team-leads/team-lead-dialogs"

import { useTeamRemoveMember, useTeamUser360, useTeamUserLoginHistory } from "./hooks"

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/**
 * Chi tiết người dùng của trưởng nhóm (admin spec v1.1 §5.1.3): chỉ xem, thao tác duy nhất
 * là "Loại khỏi nhóm" kèm lý do. Không có liên kết sang trang quản trị (thanh toán, tài
 * khoản giao dịch, trưởng nhóm) và không có số tiền của Demo Trading hay Bot.
 */
export function TeamUserDetailPage() {
  const { userId = "" } = useParams()
  const navigate = useNavigate()
  const { user: lead } = useAuth()
  const user360 = useTeamUser360(userId)
  const removeMember = useTeamRemoveMember()
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(50)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const loginHistory = useTeamUserLoginHistory(userId, historyPage, historyPageSize)

  const profile = user360.data ?? null
  const leadName = lead?.full_name?.trim() || lead?.username || "bạn"

  return (
    <WorkspacePage
      title={profile?.user.username ?? "Chi tiết người dùng"}
      description={
        profile
          ? `${profile.user.fullName ?? "Chưa có tên"} · ${profile.user.email}`
          : "Hồ sơ, thuê bao, Demo Trading và Bot, Học viện của người dùng trong nhóm"
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
            className="text-destructive hover:text-destructive"
            disabled={!profile}
            onClick={() => {
              setRemoveError(null)
              setRemoveOpen(true)
            }}
          >
            <UserMinus />
            Loại khỏi nhóm
          </Button>
        </>
      }
    >
      {user360.isError &&
        (isNotFound(user360.error) ? (
          <PanelState
            title="Không tìm thấy người dùng trong nhóm"
            description="Người dùng không thuộc nhóm của bạn hoặc đã rời nhóm."
            action={{ label: "Về danh sách", onClick: () => void navigate("/admin/users") }}
          />
        ) : (
          <PanelState
            title="Không tải được hồ sơ người dùng"
            description={errorMessage(user360.error)}
            action={{ label: "Thử lại", onClick: () => void user360.refetch() }}
          />
        ))}

      {user360.isLoading ? (
        <div role="status" aria-label="Đang tải hồ sơ người dùng" className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : profile ? (
        <>
          <UserAccountCards profile={profile} scope="team" />
          <UserReferralCard group={profile.group} referralOffer={profile.referralOffer} />
          <UserDetailTabs
            profile={profile}
            scope="team"
            loginHistory={{
              rows: loginHistory.data?.items ?? [],
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
          />
        </>
      ) : null}

      {removeOpen && profile && (
        <RemoveMemberDialog
          member={{ username: profile.user.username, fullName: profile.user.fullName }}
          leadName={leadName}
          pending={removeMember.isPending}
          error={removeError}
          onClose={() => setRemoveOpen(false)}
          onSubmit={(reason) => {
            setRemoveError(null)
            removeMember.mutate(
              { userId: profile.user.id, reason },
              {
                onSuccess: () => {
                  toast.success(`Đã loại ${profile.user.username} khỏi nhóm`)
                  setRemoveOpen(false)
                  void navigate("/admin/users", { replace: true })
                },
                onError: (error) => setRemoveError(errorMessage(error)),
              },
            )
          }}
        />
      )}
    </WorkspacePage>
  )
}
