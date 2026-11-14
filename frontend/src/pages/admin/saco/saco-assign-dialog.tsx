/** Hộp thoại "Gán SACO": tìm tài khoản, chọn nhóm (quản trị viên), tên hiển thị tuỳ chọn. */
import { useState } from "react"
import { Check, Search } from "lucide-react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useDebouncedValue } from "@/pages/admin/academy/use-debounced-value"
import { ActionDialog, FormField } from "@/pages/admin/revenue/ui"

import type { SacoCandidate, SacoLead } from "./api"
import { useAssignSaco, useSacoCandidates } from "./hooks"

export function SacoAssignDialog({ open, onOpenChange, isAdmin, leads }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  leads: SacoLead[]
}) {
  // Mỗi lần mở là một biểu mẫu mới.
  return open ? <AssignForm onOpenChange={onOpenChange} isAdmin={isAdmin} leads={leads} /> : null
}

function AssignForm({ onOpenChange, isAdmin, leads }: { onOpenChange: (open: boolean) => void; isAdmin: boolean; leads: SacoLead[] }) {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<SacoCandidate | null>(null)
  const [leadUserId, setLeadUserId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(query.trim(), 300)
  const candidates = useSacoCandidates(debounced, true)
  const assign = useAssignSaco()

  const pick = (candidate: SacoCandidate) => {
    setPicked(candidate)
    setLeadUserId(candidate.leadUserId ?? "")
    setError(null)
  }

  const needsLead = isAdmin && !leadUserId
  const submit = () => {
    if (!picked || needsLead) return
    setError(null)
    assign.mutate(
      {
        userId: picked.userId,
        ...(isAdmin && leadUserId ? { leadUserId } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      },
      {
        onSuccess: (saco) => {
          toast.success(`Đã gán ${saco.name} làm SACO`)
          onOpenChange(false)
        },
        onError: (cause) => setError(errorMessage(cause)),
      },
    )
  }

  const items = candidates.data?.items ?? []

  return <ActionDialog
    open
    onOpenChange={onOpenChange}
    title="Gán SACO"
    description={isAdmin
      ? "Chọn một tài khoản người dùng và nhóm của SACO. SACO mới vào cuối danh sách, trạng thái Vắng."
      : "Chọn một tài khoản trong nhóm của bạn. SACO mới vào cuối danh sách, trạng thái Vắng."}
    confirmLabel="Gán SACO"
    pending={assign.isPending}
    confirmDisabled={!picked || needsLead}
    error={error}
    onConfirm={submit}
  >
    <div className="flex flex-col gap-3">
      <FormField label="Tài khoản">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên, tên đăng nhập hoặc email"
            aria-label="Tìm tài khoản"
            className="pl-8"
            autoFocus
          />
        </div>
      </FormField>
      <ScrollArea className="h-56 rounded-sm border border-border">
        {candidates.isPending ? <div className="space-y-2 p-2" role="status" aria-label="Đang tìm tài khoản">
          <Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" />
        </div>
          : candidates.isError ? <p className="p-3 text-xs text-destructive">{errorMessage(candidates.error)}</p>
          : items.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Không có tài khoản phù hợp. Chỉ tài khoản người dùng hoặc Premium chưa là SACO mới gán được.</p>
          : <ul className="p-1" role="listbox" aria-label="Tài khoản có thể gán">
            {items.map((candidate) => {
              const selected = picked?.userId === candidate.userId
              return <li key={candidate.userId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(candidate)}
                  className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", selected && "bg-primary/10")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{candidate.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{candidate.email}{candidate.leadName ? ` · Nhóm ${candidate.leadName}` : ""}</span>
                  </span>
                  {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            })}
          </ul>}
      </ScrollArea>
      {isAdmin && <FormField label="Nhóm" error={picked && needsLead ? "Chọn nhóm cho SACO" : null}>
        <Select value={leadUserId} onValueChange={setLeadUserId} disabled={!picked}>
          <SelectTrigger aria-label="Nhóm của SACO"><SelectValue placeholder="Chọn trưởng nhóm" /></SelectTrigger>
          <SelectContent>
            {leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>}
      <FormField label="Tên hiển thị" hint="Bỏ trống để dùng mặc định.">
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={picked ? `SACO ${picked.name}` : "SACO <tên>"}
          maxLength={40}
          aria-label="Tên hiển thị"
        />
      </FormField>
    </div>
  </ActionDialog>
}
