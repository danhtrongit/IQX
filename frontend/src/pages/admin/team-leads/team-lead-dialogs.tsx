import { useId, useState, type ReactNode } from "react"
import { CircleAlert, Info, LoaderCircle, TriangleAlert } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { ReasonDialog } from "@/pages/admin/core/components/reason-dialog"

import { samePolicy, type TeamLeadDetail, type TeamLeadLookup, type TeamLeadPolicyValue } from "./api"
import { ADD_MEMBER_REASON_MESSAGES, APPOINT_REASON_MESSAGES, commissionLabel, offerLabel } from "./labels"
import { draftFromPolicy, policyFromDraft, type PolicyDraft } from "./policy-draft"
import { PolicyFields } from "./policy-fields"
import { useUserLookup } from "./use-user-lookup"

const APPLY_NOTE = "Người dùng mới: từ lúc lưu. Người đã trong nhóm: từ lần thanh toán tiếp theo."

type NoteTone = "muted" | "danger" | "warning"

function Note({ tone = "muted", children }: { tone?: NoteTone; children: ReactNode }) {
  const Icon = tone === "danger" ? CircleAlert : tone === "warning" ? TriangleAlert : Info
  return (
    <p
      className={
        tone === "danger"
          ? "flex gap-2 text-sm text-destructive"
          : tone === "warning"
            ? "flex gap-2 rounded-md bg-status-warning/10 px-3 py-2 text-sm text-status-warning"
            : "flex gap-2 text-sm text-muted-foreground"
      }
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function leadName(group: NonNullable<TeamLeadLookup["group"]>): string {
  return group.leadFullName ? `${group.leadFullName} (${group.leadUsername})` : group.leadUsername
}

/** Ô "Người dùng" có tra cứu trực tiếp; phần thông báo do từng hộp thoại quyết định. */
function LookupInput({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Người dùng</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder="Nhập tên đăng nhập hoặc email"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function LookupPending() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      Đang tìm người dùng
    </p>
  )
}

/* ── Bổ nhiệm ───────────────────────────────────────────────────────────── */

export function AppointDialog({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: TeamLeadPolicyValue & { userId: string; reason: string }) => void
}) {
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(null))
  const lookup = useUserLookup(query)
  const found = lookup.status === "done" ? lookup.result : null
  const policy = policyFromDraft(draft)
  const canSubmit = !!found && found.appoint.eligible && policy !== null

  let note: ReactNode = null
  if (lookup.status === "checking") note = <LookupPending />
  else if (lookup.status === "error") note = <Note tone="danger">Chưa tra cứu được: {errorMessage(lookup.error)}</Note>
  else if (lookup.status === "done" && !found) note = <Note tone="danger">Không tìm thấy người dùng.</Note>
  else if (found && !found.appoint.eligible)
    note = <Note tone="danger">{APPOINT_REASON_MESSAGES[found.appoint.reason ?? "USER_NOT_ELIGIBLE"]}</Note>
  else if (found)
    note = (
      <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <p>
          <span className="font-medium">{found.user.fullName ?? found.user.username}</span>
          <span className="text-muted-foreground"> · {found.user.email}</span>
        </p>
        <p className="text-muted-foreground">
          Mã giới thiệu: <span className="font-mono font-medium text-foreground">{found.user.username}</span>
        </p>
        {found.group && (
          <Note tone="warning">
            Đang thuộc nhóm của {leadName(found.group)}. Khi bổ nhiệm, người dùng sẽ rời nhóm đó.
          </Note>
        )}
      </div>
    )

  return (
    <ReasonDialog
      title="Bổ nhiệm trưởng nhóm"
      description="Mã giới thiệu là tên đăng nhập của trưởng nhóm và có hiệu lực ngay khi lưu."
      confirmLabel="Bổ nhiệm"
      pending={pending}
      error={error}
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={(reason) => {
        if (!found || !policy) return
        onSubmit({ ...policy, userId: found.user.id, reason })
      }}
    >
      <div className="space-y-2">
        <LookupInput value={query} disabled={pending} onChange={setQuery} />
        {note}
      </div>
      <PolicyFields value={draft} disabled={pending} onChange={setDraft} />
    </ReasonDialog>
  )
}

/* ── Sửa chính sách ─────────────────────────────────────────────────────── */

export function PolicyDialog({
  lead,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  lead: TeamLeadDetail
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: TeamLeadPolicyValue & { reason: string }) => void
}) {
  const current = lead.policy
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(current))
  const next = policyFromDraft(draft)
  const changed = !!next && (!current || !samePolicy(current, next))
  const changes: { label: string; before: string; after: string }[] = []
  if (next && current && current.commissionPct !== next.commissionPct)
    changes.push({ label: "Hoa hồng", before: commissionLabel(current.commissionPct), after: commissionLabel(next.commissionPct) })
  if (next && current) {
    const before = offerLabel(current.offerType, current.offerDays)
    const after = offerLabel(next.offerType, next.offerDays)
    if (before !== after) changes.push({ label: "Ưu đãi", before, after })
  }

  return (
    <ReasonDialog
      title={`Sửa chính sách · ${lead.user.fullName ?? lead.user.username}`}
      description={<>Mã <span className="font-mono">{lead.code}</span></>}
      confirmLabel="Lưu thay đổi"
      pending={pending}
      error={error}
      canSubmit={changed}
      onClose={onClose}
      onSubmit={(reason) => next && onSubmit({ ...next, reason })}
    >
      <PolicyFields value={draft} disabled={pending} onChange={setDraft} />
      {changes.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm" aria-label="Thay đổi">
          {changes.map((change) => (
            <p key={change.label}>
              {change.label}: <s className="text-muted-foreground">{change.before}</s> →{" "}
              <span className="font-medium">{change.after}</span>
            </p>
          ))}
          <p className="text-muted-foreground">{APPLY_NOTE}</p>
        </div>
      ) : (
        next && current && <Note>Chưa có thay đổi so với chính sách hiện hành.</Note>
      )}
    </ReasonDialog>
  )
}

/* ── Thôi bổ nhiệm ──────────────────────────────────────────────────────── */

export function RevokeDialog({
  lead,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  lead: TeamLeadDetail
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  return (
    <ReasonDialog
      title={`Thôi bổ nhiệm · ${lead.user.fullName ?? lead.user.username}`}
      description="Trưởng nhóm mất quyền vào trang quản trị. Có thể bổ nhiệm lại sau."
      confirmLabel="Thôi bổ nhiệm"
      tone="destructive"
      reasonPlaceholder="Bắt buộc"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <ul className="list-disc space-y-1 rounded-md border border-border bg-muted/40 py-2 pr-3 pl-7 text-sm">
        <li>
          Mã <span className="font-mono">{lead.code}</span> ngừng nhận người dùng mới.
        </li>
        <li>Người dùng đã thuộc nhóm giữ nguyên nhóm và các ưu đãi đã cấp.</li>
        <li>Thanh toán phát sinh sau thời điểm này không tính hoa hồng.</li>
        <li>Vai trò trở về Người dùng hoặc Premium; mọi phiên đăng nhập của trưởng nhóm kết thúc ngay.</li>
      </ul>
    </ReasonDialog>
  )
}

/* ── Thêm hoặc chuyển người dùng vào nhóm ───────────────────────────────── */

export function AddMemberDialog({
  lead,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  lead: TeamLeadDetail
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: { userId: string; reason: string; action: "add" | "move" }) => void
}) {
  const [query, setQuery] = useState("")
  const lookup = useUserLookup(query, lead.user.id)
  const found = lookup.status === "done" ? lookup.result : null
  const canSubmit = !!found && found.addMember.eligible

  let note: ReactNode = null
  if (lookup.status === "checking") note = <LookupPending />
  else if (lookup.status === "error") note = <Note tone="danger">Chưa tra cứu được: {errorMessage(lookup.error)}</Note>
  else if (lookup.status === "done" && !found) note = <Note tone="danger">Không tìm thấy người dùng.</Note>
  else if (found && !found.addMember.eligible)
    note = <Note tone="danger">{ADD_MEMBER_REASON_MESSAGES[found.addMember.reason ?? "USER_NOT_ELIGIBLE"]}</Note>
  else if (found)
    note = (
      <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <p>
          <span className="font-medium">{found.user.fullName ?? found.user.username}</span>
          <span className="text-muted-foreground"> · {found.user.email}</span>
        </p>
        {found.group ? (
          <Note tone="warning">
            Đang thuộc nhóm của {leadName(found.group)} từ {formatDateTime(found.group.joinedAt)}. Người dùng sẽ chuyển
            sang nhóm này.
          </Note>
        ) : (
          <p>Chưa thuộc nhóm nào.</p>
        )}
        <p className="text-muted-foreground">Hoa hồng và ưu đãi của nhóm áp dụng từ lần thanh toán tiếp theo.</p>
      </div>
    )

  const policy = lead.policy
  return (
    <ReasonDialog
      title={`Thêm người dùng vào nhóm · ${lead.user.fullName ?? lead.user.username}`}
      description={
        <>
          Mã <span className="font-mono">{lead.code}</span> · {offerLabel(policy?.offerType, policy?.offerDays)} · hoa hồng{" "}
          {commissionLabel(policy?.commissionPct)}
        </>
      }
      confirmLabel={found?.addMember.action === "move" ? "Chuyển vào nhóm" : "Thêm vào nhóm"}
      pending={pending}
      error={error}
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={(reason) =>
        found && onSubmit({ userId: found.user.id, reason, action: found.addMember.action ?? "add" })
      }
    >
      <div className="space-y-2">
        <LookupInput value={query} disabled={pending} onChange={setQuery} />
        {note}
      </div>
    </ReasonDialog>
  )
}

/* ── Loại khỏi nhóm ─────────────────────────────────────────────────────── */

export function RemoveMemberDialog({
  member,
  leadName: leadDisplayName,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  member: { username: string; fullName: string | null }
  leadName: string
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  return (
    <ReasonDialog
      title={`Loại khỏi nhóm · ${member.username}`}
      description={`${member.fullName ?? member.username} sẽ rời nhóm của ${leadDisplayName}.`}
      confirmLabel="Loại khỏi nhóm"
      tone="destructive"
      reasonPlaceholder="Bắt buộc"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <ul className="list-disc space-y-1 rounded-md border border-border bg-muted/40 py-2 pr-3 pl-7 text-sm">
        <li>Không còn hiện trong trang của trưởng nhóm và không tính vào số liệu của nhóm.</li>
        <li>Các thanh toán sau không tính hoa hồng cho trưởng nhóm.</li>
        <li>Premium miễn phí đã cấp giữ đến hết thời hạn hiện tại.</li>
      </ul>
    </ReasonDialog>
  )
}
