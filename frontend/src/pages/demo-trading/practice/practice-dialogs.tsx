import { useQuery } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { classifyPracticeError, fetchPracticeHistory, practiceKeys, type PracticeProfile } from "./practice-api"
import { PracticeFailureNotice } from "./practice-failure"
import { TONE_CLASS, configSummary, formatDec, formatRatioPercent, toneOf } from "./practice-model"

const pad2 = (value: number) => String(value).padStart(2, "0")

/** "Lượt đã luyện": every completed run of the indicator; opening one is read-only. */
export function PracticeHistoryDialog({
  open,
  onOpenChange,
  indicatorId,
  indicatorName,
  currentRunId,
  onView,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  indicatorId: string
  indicatorName: string
  currentRunId: string | null
  onView: (runId: string) => void
}) {
  const history = useQuery({
    queryKey: practiceKeys.history(indicatorId),
    queryFn: ({ signal }) => fetchPracticeHistory(indicatorId, signal),
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  const items = history.data?.items ?? []
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[88vh] gap-3 overflow-y-auto sm:max-w-xl" data-testid="practice-history">
        <DialogHeader>
          <DialogTitle>Lượt đã luyện · {indicatorName}</DialogTitle>
          <DialogDescription>Xem lại kết quả và cấu hình đã khóa của từng lượt. Lượt cũ chỉ đọc, không chạy lại.</DialogDescription>
        </DialogHeader>
        {history.isPending && (
          <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground" aria-live="polite">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Đang tải lịch sử…
          </p>
        )}
        {history.isError && <PracticeFailureNotice failure={classifyPracticeError(history.error)} indicatorId={indicatorId} onRetry={() => void history.refetch()} />}
        {history.data && items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Chưa có lượt hoàn thành.</p>}
        <ul className="space-y-2">
          {items.map((item) => {
            const ratio = item.kpis?.total_return ?? null
            return (
              <li key={item.run_id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2.5" data-history-ordinal={item.ordinal}>
                <div className="min-w-0 space-y-0.5">
                  <h3 className="text-sm font-semibold">Lượt {pad2(item.ordinal)}</h3>
                  <p className="text-[11px] leading-snug break-words text-muted-foreground">
                    {configSummary(item.config)}
                    <br />
                    Giữ tối đa {item.config.hold_max_sessions} phiên · {item.kpis ? `${item.kpis.buy_count} lần Mua` : "Chưa có kết quả"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <strong className={cn("text-sm tabular-nums", TONE_CLASS[toneOf(ratio)])}>{formatRatioPercent(ratio)}</strong>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Xem lượt ${pad2(item.ordinal)}`}
                    onClick={() => {
                      onView(item.run_id)
                      onOpenChange(false)
                    }}
                  >
                    {item.run_id === currentRunId ? "Mở" : "Xem"}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end border-t border-border pt-3">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Giả định": the execution profile of the practice, with fee/lot flagged as sample values. */
export function PracticeAssumptionsDialog({
  open,
  onOpenChange,
  profile,
  windowBars,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: PracticeProfile
  windowBars: number
}) {
  const rows: Array<[string, string]> = [
    ["Dữ liệu", "Mỗi lượt một tình huống ẩn danh, giữ nguyên giá nến"],
    ["Quan sát", `Khoảng 6 tháng (${windowBars} phiên trong khung nhìn)`],
    ["Khoảng chạy", "24 tháng cố định"],
    ["Vốn mỗi lượt", `${new Intl.NumberFormat("vi-VN").format(profile.capital)} đồng`],
    ["Mỗi lần mua", "100% tiền khả dụng, gồm phí"],
    ["Khớp lệnh", "Tín hiệu cuối phiên → mở cửa phiên sau"],
    ["Phí", `Mua ${formatDec(profile.buy_fee_rate * 100)}% · bán gộp ${formatDec(profile.sell_cost_rate * 100)}%`],
    ["Lô", `${profile.lot} cổ phiếu`],
    ["Bán", "Điều kiện chỉ báo hoặc hết thời gian giữ"],
    ["Cuối kỳ", "Không ép bán vị thế còn mở"],
    ["Số giao dịch", "Số lần Mua đã khớp"],
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[88vh] gap-3 overflow-y-auto sm:max-w-lg" data-testid="practice-assumptions">
        <DialogHeader>
          <DialogTitle>Giả định luyện tập</DialogTitle>
          <DialogDescription>Cấu hình và vốn luyện tập không tác động tài khoản Bot hay tài khoản tự giao dịch.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border rounded-md border border-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-3 py-2 text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {profile.verified ? "" : "Phí và lô là số minh họa, chưa đối chiếu với quy định của sàn hoặc công ty chứng khoán. "}
          Chưa mô phỏng thanh khoản, trượt giá hay thanh toán T+.
        </p>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
