import { useId, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { adminBulletinKeys } from "@/pages/admin/bulletins/bulletin-admin-hooks"
import { bulletinKeys } from "@/pages/market-workspace/market/bulletin-hooks"
import {
  formatBulletinDate,
  formatBulletinNumber,
  formatSignedPercent,
} from "@/pages/market-workspace/market/bulletin-format"

import { DialogShell } from "../shared/dialog-shell"
import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { FIELD_LABEL } from "../shared/ui-text"
import {
  getPushCandidates,
  getPushContext,
  pushToBulletin,
  type PushCandidate,
  type PushContext,
  type PushSlot,
} from "./bulletin-push-api"
import {
  bulletinBlockReason,
  conditionLines,
  defaultDisplayName,
  defaultSlot,
  DISPLAY_NAME_MAX,
  initialPicks,
  isPickable,
  MAX_BULLETIN_PICKS,
  PUSH_MESSAGES,
  pushedMessage,
  runSessionDate,
  savedFilterBlockReason,
  slotStatusText,
  togglePick,
} from "./bulletin-push"

const pushKeys = {
  context: ["strategy", "bulletin-push", "context"] as const,
  candidates: (resultId: string) => ["strategy", "bulletin-push", "candidates", resultId] as const,
}

const ADMIN_BADGE = (
  <span className="rounded-sm bg-primary/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
    Quản trị
  </span>
)

export type PushBulletinDialogProps = {
  resultId: string
  /** Ngày phiên của kết quả (`session_date` của lần chạy). */
  sessionDate: string
  runSignature: string
  loaded: { id: string; name: string; version: number; signature: string } | null
  /** Chữ ký tiêu chí đang soạn; null khi chưa dựng được. */
  draftSignature: string | null
  /** Mã đang chọn trong bảng kết quả; rỗng nghĩa là chưa chọn riêng mã nào. */
  tableSelection: ReadonlySet<string>
  /** Các phần của `criteriaSummary` của lần chạy, in thành dòng điều kiện trong bản tin. */
  criteriaParts: readonly string[]
  onClose: () => void
}

function BlockedMessage({ message }: { message: string }) {
  return <p role="alert" className="text-sm leading-6" data-testid="push-blocked">{message}</p>
}

function PushForm({
  props,
  context,
  candidates,
}: {
  props: PushBulletinDialogProps
  context: PushContext & { trade_date: string }
  candidates: readonly PushCandidate[]
}) {
  const { loaded, tableSelection, criteriaParts, resultId, onClose } = props
  const queryClient = useQueryClient()
  const baseId = useId()
  const filterName = loaded?.name ?? ""
  const [slot, setSlot] = useState<PushSlot>(() => defaultSlot(context))
  const [nameEdit, setNameEdit] = useState<{ slot: PushSlot; value: string } | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => initialPicks(candidates, tableSelection))
  const conditions = useMemo(() => conditionLines(criteriaParts), [criteriaParts])
  const slotState = context.slots.find((entry) => entry.slot === slot)
  // Đổi ô thì tên gợi ý đổi theo ô, trừ khi người dùng đã tự gõ tên cho ô đó.
  const name = nameEdit && nameEdit.slot === slot ? nameEdit.value : defaultDisplayName(slotState, filterName)

  const push = useMutation({
    mutationFn: () =>
      pushToBulletin(context.trade_date, slot, {
        resultId,
        filterId: loaded?.id ?? "",
        filterVersion: loaded?.version ?? 0,
        picks: candidates.filter((candidate) => picked.has(candidate.symbol)).map((candidate) => candidate.symbol),
        displayName: name.trim(),
        conditions,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: adminBulletinKeys.all })
      void queryClient.invalidateQueries({ queryKey: pushKeys.context })
      void queryClient.invalidateQueries({ queryKey: bulletinKeys.all })
      toast.success(pushedMessage(result.picks, result.slot as PushSlot, result.trade_date))
      onClose()
    },
  })

  const passedCount = candidates.length
  const full = picked.size >= MAX_BULLETIN_PICKS
  const noPassed = passedCount === 0
  const canSubmit = !push.isPending && name.trim() !== "" && loaded !== null && (noPassed || picked.size > 0)

  return (
    <DialogShell
      title="Đẩy vào bản tin"
      badge={ADMIN_BADGE}
      size="lg"
      busy={push.isPending}
      dirty={nameEdit !== null && !push.isPending}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" disabled={push.isPending} onClick={requestClose}>Hủy</Button>
          <Button type="button" disabled={!canSubmit} onClick={() => push.mutate()}>
            {push.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Đẩy {picked.size} mã vào Bộ lọc {slot}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-muted-foreground" data-testid="push-source">
        Bộ lọc <b className="text-foreground">{filterName}</b> · phiên bản {loaded?.version} · kết quả phiên {formatBulletinDate(runSessionDate(props.sessionDate))}
      </p>

      <fieldset className="space-y-2">
        <legend className={FIELD_LABEL}>Ô trong bản tin</legend>
        <RadioGroup
          value={String(slot)}
          onValueChange={(value) => setSlot(Number(value) as PushSlot)}
          className="grid-cols-1 gap-2 sm:grid-cols-3"
          aria-label="Chọn ô bộ lọc của bản tin"
        >
          {context.slots.map((entry) => {
            const id = `${baseId}-slot-${entry.slot}`
            return (
              <label
                key={entry.slot}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-sm border px-3 py-2 text-sm",
                  slot === entry.slot ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <RadioGroupItem id={id} value={String(entry.slot)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block font-medium">Bộ lọc {entry.slot}</span>
                  <span className="block text-xs text-muted-foreground">{slotStatusText(entry)}</span>
                </span>
              </label>
            )
          })}
        </RadioGroup>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`${baseId}-name`} className={FIELD_LABEL}>Tên hiển thị trong bản tin</Label>
        <Input
          id={`${baseId}-name`}
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="off"
          onChange={(event) => setNameEdit({ slot, value: event.target.value })}
        />
        <p className="text-xs text-muted-foreground tabular-nums">{name.length} / {DISPLAY_NAME_MAX}</p>
      </div>

      <div className="space-y-1.5">
        <h3 className={FIELD_LABEL}>Điều kiện in trong bản tin (lấy từ bộ lọc, không sửa ở đây)</h3>
        <ul className="list-disc space-y-0.5 rounded-sm border border-border bg-muted/40 py-2.5 pr-3 pl-7 text-xs leading-5 text-muted-foreground" data-testid="push-conditions">
          {conditions.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
        </ul>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span aria-live="polite" data-testid="push-count" className="text-muted-foreground">
            đã chọn {picked.size}/{MAX_BULLETIN_PICKS} · {passedCount} mã đạt, xếp theo GTGD hôm nay
          </span>
        </div>
        {noPassed ? (
          <p className="rounded-sm border border-border bg-muted/40 p-3 text-sm" data-testid="push-zero">
            Phiên này không có mã đạt. Bản tin sẽ in câu “Phiên này không có mã đạt.”
          </p>
        ) : (
          <>
            {full && <p className="text-xs text-status-warning" role="status">Đã đủ 10 mã. Bỏ chọn một mã để chọn mã khác.</p>}
            <div className="max-h-64 overflow-y-auto rounded-sm border border-border">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-9 px-3 py-2"><span className="sr-only">Chọn</span></th>
                    <th className="px-3 py-2 text-left font-semibold">Mã</th>
                    <th className="px-3 py-2 text-right font-semibold">Giá</th>
                    <th className="px-3 py-2 text-right font-semibold">+/− %</th>
                    <th className="px-3 py-2 text-right font-semibold">GTGD (tỷ)</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => {
                    const checked = picked.has(candidate.symbol)
                    const disabled = !isPickable(candidate) || (!checked && full)
                    const id = `${baseId}-pick-${candidate.symbol}`
                    const change = candidate.change_pct
                    return (
                      <tr key={candidate.symbol} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5">
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={disabled}
                            aria-label={`Chọn ${candidate.symbol}`}
                            onCheckedChange={(value) => setPicked((previous) => togglePick(previous, candidate.symbol, value === true))}
                          />
                        </td>
                        <td className="px-3 py-1.5 font-semibold"><label htmlFor={id}>{candidate.symbol}</label></td>
                        <td className="px-3 py-1.5 text-right">{candidate.close === null ? "-" : formatBulletinNumber(candidate.close)}</td>
                        <td className={cn("px-3 py-1.5 text-right", change === null || change === 0 ? "text-foreground" : change > 0 ? "text-price-up" : "text-price-down")}>
                          {change === null ? "-" : formatSignedPercent(change)}
                        </td>
                        <td className="px-3 py-1.5 text-right">{candidate.value_bn === null ? "Chưa có dữ liệu" : formatBulletinNumber(candidate.value_bn, 1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {push.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(push.error)}</AlertDescription>
        </Alert>
      )}

      <p className="rounded-sm border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        Bản tin in tối đa 10 mã mỗi bộ lọc, xếp theo GTGD hôm nay. Đẩy lại vào cùng ô sẽ thay danh sách cũ. Danh sách mã bị khoá khi bản tin được Public và chỉ mở lại sau khi gỡ bản tin khỏi web.
      </p>
    </DialogShell>
  )
}

function NoticeShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <DialogShell
      title="Đẩy vào bản tin"
      badge={ADMIN_BADGE}
      size="sm"
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      {children}
    </DialogShell>
  )
}

function LoadError({ error, onRetry, onClose }: { error: unknown; onRetry: () => void; onClose: () => void }) {
  return (
    <NoticeShell onClose={onClose}>
      <div className="space-y-2">
        <ErrorLine>{errorMessage(error)}</ErrorLine>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
      </div>
    </NoticeShell>
  )
}

/**
 * Hộp "Đẩy vào bản tin" của Bộ lọc (chỉ quản trị viên, spec §4). Năm điều kiện chặn kiểm theo thứ tự:
 * ba điều kiện về bộ lọc đã lưu kiểm ngay trên màn hình, hai điều kiện về phiên và khoá danh sách kiểm sau
 * khi lấy bản tin đang chờ từ máy chủ. Bị chặn thì hộp chỉ hiện câu báo và nút Đóng.
 */
export function PushBulletinDialog(props: PushBulletinDialogProps) {
  const early = savedFilterBlockReason({
    loaded: props.loaded,
    draftSignature: props.draftSignature,
    runSignature: props.runSignature,
  })
  const context = useQuery({
    queryKey: pushKeys.context,
    queryFn: ({ signal }) => getPushContext(signal),
    enabled: early === null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const late = context.data ? bulletinBlockReason(runSessionDate(props.sessionDate), context.data) : null
  const candidates = useQuery({
    queryKey: pushKeys.candidates(props.resultId),
    queryFn: ({ signal }) => getPushCandidates(props.resultId, signal),
    enabled: early === null && Boolean(context.data) && late === null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  if (early) return <NoticeShell onClose={props.onClose}><BlockedMessage message={early} /></NoticeShell>
  if (context.isError) return <LoadError error={context.error} onRetry={() => void context.refetch()} onClose={props.onClose} />
  if (!context.data) {
    return <NoticeShell onClose={props.onClose}><Skeleton className="h-24 w-full" aria-label="Đang tải bản tin đang chờ" /></NoticeShell>
  }
  if (late) return <NoticeShell onClose={props.onClose}><BlockedMessage message={late} /></NoticeShell>
  const tradeDate = context.data.trade_date
  if (!tradeDate) return <NoticeShell onClose={props.onClose}><BlockedMessage message={PUSH_MESSAGES.noDraft} /></NoticeShell>
  if (candidates.isError) return <LoadError error={candidates.error} onRetry={() => void candidates.refetch()} onClose={props.onClose} />
  if (!candidates.data) {
    return <NoticeShell onClose={props.onClose}><Skeleton className="h-24 w-full" aria-label="Đang tải danh sách mã đạt" /></NoticeShell>
  }
  return <PushForm props={props} context={{ ...context.data, trade_date: tradeDate }} candidates={candidates.data.items} />
}
