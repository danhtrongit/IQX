import { Copy, Link2 } from "lucide-react"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"

import { absoluteReferralUrl, fetchMyReferral, referralKeys, type ReferralInfo } from "./api"

function partnerLabel(kind: ReferralInfo["referralPartnerKind"]) {
  return kind === "ctv" ? "Cộng tác viên" : kind === "lead_sale" ? "Lead sale" : "Đối tác giới thiệu"
}

async function copyReferralUrl(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success("Đã sao chép đường dẫn giới thiệu")
  } catch {
    toast.error("Không sao chép được đường dẫn. Hãy chọn và sao chép thủ công.")
  }
}

export function ReferralPanel() {
  const { user, isAuthenticated } = useAuth()
  const referral = useQuery({
    queryKey: referralKeys.me(user?.id),
    queryFn: ({ signal }) => fetchMyReferral(signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })

  if (referral.isPending) {
    return <Skeleton className="h-40 w-full" />
  }
  if (referral.isError) {
    return (
      <PanelState
        title="Không tải được đường dẫn giới thiệu"
        description={errorMessage(referral.error)}
        action={{ label: "Thử lại", onClick: () => void referral.refetch() }}
      />
    )
  }
  if (!referral.data.referralCode || !referral.data.referralUrl) return null

  const url = absoluteReferralUrl(referral.data.referralUrl) ?? referral.data.referralUrl
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          Đường dẫn giới thiệu
        </CardTitle>
        <CardDescription>Chia sẻ đường dẫn này để người đăng ký được ghi nhận đúng mã giới thiệu của bạn.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{partnerLabel(referral.data.referralPartnerKind)}</Badge>
          <span className="text-muted-foreground">Mã:</span>
          <code className="rounded-sm bg-muted px-2 py-1 font-mono text-xs">{referral.data.referralCode}</code>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-muted/40 px-2.5 py-2 text-xs" title={url}>
            {url}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyReferralUrl(url)}>
            <Copy />
            Sao chép
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
