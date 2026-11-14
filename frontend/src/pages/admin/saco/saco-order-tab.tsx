/** Thẻ "Thứ tự SACO": thứ tự khớp, nhóm, trạng thái, số liệu lời mời, sắp xếp, gỡ quyền và gán SACO. */
import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"
import { StatusBadge, TableLoadingRows, TableNoticeRow } from "@/pages/admin/revenue/ui"

import type { ManageSaco, SacoLead } from "./api"
import { useManageSacos, useMoveSaco, useRemoveSaco, useUpdateSaco } from "./hooks"
import { SacoAssignDialog } from "./saco-assign-dialog"

const COLS = 8

export function SacoOrderTab({ isAdmin }: { isAdmin: boolean }) {
  const sacos = useManageSacos()
  const move = useMoveSaco()
  const update = useUpdateSaco()
  const remove = useRemoveSaco()
  const confirm = useConfirmDialog()
  const [assignOpen, setAssignOpen] = useState(false)

  const { active, removed } = useMemo(() => {
    const items = sacos.data?.items ?? []
    return {
      active: items.filter((saco) => saco.active).sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
      removed: items.filter((saco) => !saco.active),
    }
  }, [sacos.data])

  const leads = sacos.data?.leads ?? []
  const busy = move.isPending || update.isPending

  const canMove = (index: number, dir: "up" | "down") => {
    const row = active[index]
    if (!row || (!isAdmin && !row.mine)) return false
    const others = dir === "up" ? active.slice(0, index) : active.slice(index + 1)
    // Trưởng nhóm đổi chỗ với SACO cùng nhóm gần nhất; quản trị viên với SACO liền kề.
    return isAdmin ? others.length > 0 : others.some((saco) => saco.mine)
  }

  const runMove = (saco: ManageSaco, dir: "up" | "down") =>
    move.mutate({ sacoId: saco.id, dir }, { onError: (error) => toast.error(errorMessage(error)) })

  const changeLead = (saco: ManageSaco, leadUserId: string) => {
    if (leadUserId === saco.leadUserId) return
    update.mutate({ sacoId: saco.id, leadUserId }, {
      onSuccess: () => toast.success(`Đã chuyển ${saco.name} sang nhóm mới`),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const askRemove = (saco: ManageSaco) => confirm.ask({
    title: "Gỡ quyền SACO",
    description: `${saco.name} rời khỏi danh sách khớp và bảng nhận định. Các cuộc chat cũ chuyển sang chỉ đọc với dòng "${saco.name} không còn hoạt động", lời mời đang chờ bị thu hồi.`,
    confirmLabel: "Gỡ quyền SACO",
    tone: "destructive",
    run: async () => {
      try {
        await remove.mutateAsync(saco.id)
        toast.success(`Đã gỡ quyền SACO của ${saco.name}`)
      } catch (error) {
        toast.error(errorMessage(error))
        throw error
      }
    },
  })

  if (sacos.isError) {
    return <PanelState title="Không tải được danh sách SACO" description={errorMessage(sacos.error)} action={{ label: "Thử lại", onClick: () => void sacos.refetch() }} />
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {isAdmin
          ? "Thứ tự áp dụng ngay cho lượt tìm kế tiếp; lượt tìm đang chạy giữ thứ tự cũ."
          : "Bạn chỉ sắp xếp SACO của nhóm mình; vị trí của nhóm khác giữ nguyên và được làm mờ."}
      </p>
      <Button type="button" onClick={() => setAssignOpen(true)}><UserPlus data-icon="inline-start" />Gán SACO</Button>
    </div>

    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-3">Thứ tự</TableHead>
            <TableHead>SACO</TableHead>
            <TableHead>Nhóm</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Đang chat</TableHead>
            <TableHead className="text-right">Nhận / Từ chối / Hết giờ</TableHead>
            <TableHead className="text-center">Sắp xếp</TableHead>
            <TableHead className="pr-3 text-right">Gỡ quyền SACO</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sacos.isLoading ? <TableLoadingRows colSpan={COLS} />
            : active.length === 0 ? <TableNoticeRow colSpan={COLS}>Chưa có SACO nào đang hoạt động. Bấm “Gán SACO” để thêm.</TableNoticeRow>
            : active.map((saco, index) => {
              const editable = isAdmin || saco.mine
              return <TableRow key={saco.id} className={cn(!editable && "opacity-50")} aria-disabled={!editable || undefined}>
                <TableCell className="pl-3 font-medium tabular-nums">#{index + 1}</TableCell>
                <TableCell className="max-w-[260px] whitespace-normal">
                  <span className="font-medium">{saco.name}</span>
                  {saco.email && <span className="block text-[11px] text-muted-foreground">{saco.email}</span>}
                </TableCell>
                <TableCell>
                  {isAdmin ? <LeadSelect saco={saco} leads={leads} disabled={busy} onChange={(leadUserId) => changeLead(saco, leadUserId)} /> : saco.leadName || "—"}
                </TableCell>
                <TableCell><DutyCell saco={saco} /></TableCell>
                <TableCell className="text-right tabular-nums">{saco.convs}</TableCell>
                <TableCell className="text-right tabular-nums">{saco.accepted} / {saco.declined} / {saco.timedOut}</TableCell>
                <TableCell className="text-center">
                  {editable && <div className="inline-flex gap-1">
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Đưa ${saco.name} lên`} title="Lên" disabled={busy || !canMove(index, "up")} onClick={() => runMove(saco, "up")}><ChevronUp /></Button>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Đưa ${saco.name} xuống`} title="Xuống" disabled={busy || !canMove(index, "down")} onClick={() => runMove(saco, "down")}><ChevronDown /></Button>
                  </div>}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {editable && <Button type="button" variant="destructive" size="xs" onClick={() => askRemove(saco)}>Gỡ quyền SACO</Button>}
                </TableCell>
              </TableRow>
            })}
        </TableBody>
      </Table>
    </Card>

    {removed.length > 0 && <section className="space-y-2" aria-labelledby="saco-removed-title">
      <h2 id="saco-removed-title" className="text-sm font-semibold text-muted-foreground">SACO đã gỡ quyền</h2>
      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">SACO</TableHead>
              <TableHead>Nhóm</TableHead>
              <TableHead className="text-right">Đã chat</TableHead>
              <TableHead className="pr-3 text-right">Nhận / Từ chối / Hết giờ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {removed.map((saco) => <TableRow key={saco.id} className="text-muted-foreground">
              <TableCell className="pl-3 whitespace-normal">
                <span>{saco.name}</span>
                {saco.email && <span className="block text-[11px]">{saco.email}</span>}
              </TableCell>
              <TableCell>{saco.leadName || "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{saco.convs}</TableCell>
              <TableCell className="pr-3 text-right tabular-nums">{saco.accepted} / {saco.declined} / {saco.timedOut}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">Gán lại một SACO đã gỡ bằng nút “Gán SACO”: tài khoản trở lại cuối danh sách, trạng thái Vắng.</p>
    </section>}

    <SacoAssignDialog open={assignOpen} onOpenChange={setAssignOpen} isAdmin={isAdmin} leads={leads} />
    {confirm.element}
  </div>
}

function DutyCell({ saco }: { saco: ManageSaco }) {
  return <span className="inline-flex items-center gap-2">
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", saco.online ? "bg-price-up" : "bg-muted-foreground/40")}
    />
    <StatusBadge label={saco.onDuty ? "Đang trực" : "Vắng"} tone={saco.onDuty ? "success" : "neutral"} />
    <span className="sr-only">{saco.online ? "Đang trực tuyến" : "Không trực tuyến"}</span>
  </span>
}

function LeadSelect({ saco, leads, disabled, onChange }: { saco: ManageSaco; leads: SacoLead[]; disabled: boolean; onChange: (leadUserId: string) => void }) {
  const options = leads.some((lead) => lead.id === saco.leadUserId) ? leads : [{ id: saco.leadUserId, name: saco.leadName || "—" }, ...leads]
  return <Select value={saco.leadUserId} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger size="sm" className="w-44" aria-label={`Nhóm của ${saco.name}`}><SelectValue /></SelectTrigger>
    <SelectContent>
      {options.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>)}
    </SelectContent>
  </Select>
}
