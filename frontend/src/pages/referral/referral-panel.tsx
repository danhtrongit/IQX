import { Copy, Link2 } from "lucide-react"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"

import { fetchTeamReferralCode, referralKeys, referralLink, referralOfferLabel } from "./api"

async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(success)
  } catch {
    toast.error("Không sao chép được. Hãy chọn và sao chép thủ công.")
  }
}

/**
 * Thẻ "Mã giới thiệu" ở `/cai-dat`: chỉ trưởng nhóm thấy (mã = tên đăng nhập, % hoa hồng,
 * ưu đãi cho người dùng mới). Vai trò khác không có thẻ này; mã LS_/CTV_ cũ đã bỏ (§3.6).
 */
export function ReferralPanel() {
  const { user } = useAuth()
  const isTeamLead = user?.role === "team_lead"
  const referral = useQuery({
    queryKey: referralKeys.teamCode(user?.id),
    queryFn: ({ signal }) => fetchTeamReferralCode(signal),
    enabled: isTeamLead,
    staleTime: 60_000,
  })

  if (!isTeamLead) return null
  if (referral.isPending) return <Skeleton className="h-40 w-full" />
  if (referral.isError) {
    return (
      <PanelState
        title="Không tải được mã giới thiệu"
        description={errorMessage(referral.error)}
        action={{ label: "Thử lại", onClick: () => void referral.refetch() }}
      />
    )
  }

  const data = referral.data
  const url = referralLink(data.code)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          Mã giới thiệu
        </CardTitle>
        <CardDescription>
          Người đăng ký bằng mã này sẽ vào nhóm của bạn. Mã chính là tên đăng nhập nên không thay đổi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-sm bg-muted px-2 py-1 font-mono text-sm font-medium">{data.code}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(data.code, "Đã sao chép mã giới thiệu")}>
            <Copy />
            Sao chép mã
          </Button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Hoa hồng trực tiếp</dt>
            <dd className="font-medium tabular-nums">{data.commissionPct == null ? "—" : `${data.commissionPct}%`}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ưu đãi cho người dùng mới</dt>
            <dd className="font-medium">{referralOfferLabel(data.offerType, data.offerDays)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Người dùng trong nhóm</dt>
            <dd className="font-medium tabular-nums">{data.memberCount}</dd>
          </div>
        </dl>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-muted/40 px-2.5 py-2 text-xs" title={url}>
            {url}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(url, "Đã sao chép đường dẫn giới thiệu")}>
            <Copy />
            Sao chép
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
