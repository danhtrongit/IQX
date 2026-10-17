import { useEffect, useId, useState } from "react"
import { LoaderCircle, Search, TriangleAlert } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { errorMessage } from "@/lib/api"
import type { UserGroupInfo } from "@/pages/admin/core/api"
import { ReasonDialog } from "@/pages/admin/core/components/reason-dialog"

import { useTeamLeads } from "./hooks"
import { commissionLabel, offerLabel } from "./labels"

/**
 * Thêm hoặc chuyển nhóm từ trang chi tiết người dùng (admin spec v1.1 §3.4): chọn một trưởng
 * nhóm đang hoạt động. Nếu người dùng đang ở nhóm khác, hộp thoại báo nhóm hiện tại và
 * thao tác là chuyển nhóm.
 */
export function AssignGroupDialog({
  user,
  currentGroup,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  user: { username: string; fullName: string | null }
  currentGroup: UserGroupInfo | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: { leadId: string; reason: string }) => void
}) {
  const id = useId()
  const [input, setInput] = useState("")
  const [search, setSearch] = useState("")
  const [leadId, setLeadId] = useState<string>("")

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  const leads = useTeamLeads({ page: 1, pageSize: 20, status: "active", search: search || undefined })
  const options = (leads.data?.items ?? []).filter((lead) => lead.user.id !== currentGroup?.leadUserId)
  const selected = options.find((lead) => lead.user.id === leadId) ?? null
  const moving = !!currentGroup

  return (
    <ReasonDialog
      title={`${moving ? "Chuyển nhóm" : "Thêm vào nhóm"} · ${user.username}`}
      description={user.fullName ?? undefined}
      confirmLabel={moving ? "Chuyển nhóm" : "Thêm vào nhóm"}
      pending={pending}
      error={error}
      canSubmit={!!selected}
      onClose={onClose}
      onSubmit={(reason) => selected && onSubmit({ leadId: selected.user.id, reason })}
    >
      {currentGroup ? (
        <p className="flex gap-2 rounded-md bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Đang thuộc nhóm của {currentGroup.leadFullName ?? currentGroup.leadUsername}. Người dùng sẽ chuyển sang nhóm được chọn.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Người dùng chưa thuộc nhóm nào.</p>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${id}-search`}>Trưởng nhóm</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${id}-search`}
            value={input}
            disabled={pending}
            autoComplete="off"
            placeholder="Tìm theo tên đăng nhập, họ tên hoặc email"
            className="pl-8"
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        {leads.isLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Đang tải trưởng nhóm
          </p>
        ) : leads.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(leads.error)}
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có trưởng nhóm đang hoạt động phù hợp.</p>
        ) : (
          <RadioGroup
            value={leadId}
            onValueChange={setLeadId}
            aria-label="Chọn trưởng nhóm"
            className="max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-1"
          >
            {options.map((lead) => (
              <Label
                key={lead.user.id}
                htmlFor={`${id}-${lead.user.id}`}
                className="flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-1.5 font-normal hover:bg-muted"
              >
                <RadioGroupItem id={`${id}-${lead.user.id}`} value={lead.user.id} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {lead.user.fullName ?? lead.user.username} <span className="font-mono text-xs text-muted-foreground">{lead.code}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Hoa hồng {commissionLabel(lead.commissionPct)} · {offerLabel(lead.offerType, lead.offerDays)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}
        <p className="text-xs text-muted-foreground">Hoa hồng và ưu đãi của nhóm áp dụng từ lần thanh toán tiếp theo.</p>
      </div>
    </ReasonDialog>
  )
}
