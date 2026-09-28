import { useState } from "react"
import { Check, Copy, Link2, LoaderCircle, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, errorMessage } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"

import {
  absoluteReferralUrl,
  enrollReferral,
  fetchAdminReferral,
  referralKeys,
  type ReferralInfo,
  type ReferralPartnerKind,
} from "./api"

function partnerLabel(kind: ReferralInfo["referralPartnerKind"]) {
  return kind === "ctv" ? "Cộng tác viên" : kind === "lead_sale" ? "Lead sale" : "Đối tác giới thiệu"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function copyReferralUrl(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success("Đã sao chép đường dẫn giới thiệu")
  } catch {
    toast.error("Không sao chép được đường dẫn. Hãy chọn và sao chép thủ công.")
  }
}

export function AdminReferralPanel({ userId }: { userId: string }) {
  const { user: currentAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ReferralPartnerKind>("lead_sale")
  const [leadUserId, setLeadUserId] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const referral = useQuery({
    queryKey: referralKeys.admin(currentAdmin?.id, userId),
    queryFn: ({ signal }) => fetchAdminReferral(userId, signal),
    enabled: userId.length > 0 && !!currentAdmin,
    staleTime: 60_000,
  })
  const enroll = useMutation({
    mutationFn: () => enrollReferral(userId, { kind, leadUserId: kind === "ctv" ? leadUserId.trim() : undefined }),
    onSuccess: async (data) => {
      queryClient.setQueryData(referralKeys.admin(currentAdmin?.id, userId), data)
      await queryClient.invalidateQueries({ queryKey: ["referral", "admin"] })
    },
  })

  function requestEnroll() {
    const lead = leadUserId.trim()
    if (kind === "ctv" && !UUID_RE.test(lead)) {
      setFormError("CTV cần mã UUID hợp lệ của Lead phụ trách.")
      return
    }
    setFormError(null)
    setConfirmOpen(true)
  }

  async function confirmEnroll() {
    setFormError(null)
    try {
      await enroll.mutateAsync()
      setConfirmOpen(false)
      toast.success("Đã ghi nhận vai trò giới thiệu và sinh mã ổn định.")
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  if (referral.isPending) return <Skeleton className="h-56 w-full" />
  if (referral.isError) {
    return (
      <PanelState
        title={referral.error instanceof ApiError && referral.error.status === 403 ? "Bạn không có quyền xem thông tin giới thiệu" : "Không tải được thông tin giới thiệu"}
        description={errorMessage(referral.error)}
        action={{ label: "Thử lại", onClick: () => void referral.refetch() }}
      />
    )
  }

  const data = referral.data
  const url = absoluteReferralUrl(data.referralUrl)
  if (data.referralCode && url) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="size-4 text-primary" /> Giới thiệu</CardTitle>
          <CardDescription>Vai trò đã được ghi nhận và không thể đổi sau khi kích hoạt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Vai trò:</span>
            <span className="font-medium">{partnerLabel(data.referralPartnerKind)}</span>
            <span className="text-muted-foreground">Mã:</span>
            <code className="rounded-sm bg-muted px-2 py-1 font-mono text-xs">{data.referralCode}</code>
          </div>
          {data.referralLeadUserId && <p className="text-xs text-muted-foreground">Lead phụ trách: <span className="font-mono">{data.referralLeadUserId}</span></p>}
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-muted/40 px-2.5 py-2 text-xs" title={url}>{url}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyReferralUrl(url)}><Copy /> Sao chép</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersRound className="size-4 text-primary" /> Ghi nhận đối tác giới thiệu</CardTitle>
          <CardDescription>Ghi nhận sẽ sinh mã giới thiệu ổn định. Sau khi xác nhận, vai trò không thể đổi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor={`referral-kind-${userId}`}>Vai trò</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as ReferralPartnerKind)}>
              <SelectTrigger id={`referral-kind-${userId}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_sale">Lead sale</SelectItem>
                <SelectItem value="ctv">Cộng tác viên</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "ctv" && (
            <div className="grid gap-1.5 sm:max-w-md">
              <Label htmlFor={`referral-lead-${userId}`}>UUID Lead phụ trách</Label>
              <Input id={`referral-lead-${userId}`} value={leadUserId} onChange={(event) => setLeadUserId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
          )}
          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          <Button type="button" onClick={requestEnroll} disabled={enroll.isPending}>
            {enroll.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
            Xác nhận ghi nhận
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(open) => !enroll.isPending && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận ghi nhận đối tác?</DialogTitle>
          <DialogDescription>
              Hệ thống sẽ sinh mã giới thiệu ổn định cho {kind === "ctv" ? "Cộng tác viên" : "Lead sale"}. Vai trò này không thể đổi sau khi lưu.
          </DialogDescription>
          </DialogHeader>
          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={enroll.isPending}>Hủy</Button>
            <Button type="button" onClick={() => void confirmEnroll()} disabled={enroll.isPending}>
              {enroll.isPending && <LoaderCircle className="animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
