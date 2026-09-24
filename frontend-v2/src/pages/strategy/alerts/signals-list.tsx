/**
 * 10 tín hiệu dựng sẵn để theo dõi — port từ
 * `dashboard/src/features/alerts/components/SignalsList.tsx`.
 *
 * Theo dõi = tạo rule sao chép từ preset (`signal_key`); bỏ theo dõi = xoá đúng
 * rule đang gắn với preset đó (`base_signal_key`). Trạng thái theo dõi luôn đọc
 * từ danh sách rule thật của server, không lưu cục bộ.
 */
import { ArrowDown, ArrowUp, LoaderCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { toast } from "sonner"

import { useAlertRules, useAlertSignals, useCreateAlertRule, useDeleteAlertRule } from "../hooks"
import type { AlertSignal, UserAlertRule } from "../types"

function SideBadge({ side }: { side: AlertSignal["side"] }) {
  const isBuy = side === "buy"
  const Icon = isBuy ? ArrowUp : ArrowDown
  return (
    <Badge
      variant="outline"
      className={`h-4 shrink-0 gap-0.5 rounded-sm border-0 px-1.5 text-[10px] font-semibold ${
        isBuy ? "bg-price-up/15 text-price-up" : "bg-price-down/15 text-price-down"
      }`}
    >
      <Icon className="size-2.5" />
      {isBuy ? "MUA" : "BÁN"}
    </Badge>
  )
}

export function SignalsList() {
  const signalsQuery = useAlertSignals()
  const rulesQuery = useAlertRules()
  const createRule = useCreateAlertRule()
  const deleteRule = useDeleteAlertRule()

  if (signalsQuery.isLoading || rulesQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[62px] w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (signalsQuery.isError) {
    return (
      <PanelState
        title="Không tải được danh sách tín hiệu"
        description={errorMessage(signalsQuery.error)}
        action={{ label: "Thử lại", onClick: () => void signalsQuery.refetch() }}
      />
    )
  }

  const signals = signalsQuery.data ?? []
  const rules = rulesQuery.data ?? []
  const ruleFor = (key: string): UserAlertRule | undefined =>
    rules.find((rule) => rule.baseSignalKey === key)
  const pending = createRule.isPending || deleteRule.isPending

  if (signals.length === 0) {
    return <PanelState title="Chưa có tín hiệu nào" description="Hệ thống chưa cấu hình preset tín hiệu." />
  }

  const onToggle = (signal: AlertSignal) => {
    const existing = ruleFor(signal.key)
    if (existing) {
      deleteRule.mutate(existing.id, {
        onSuccess: () => toast.success(`Đã bỏ theo dõi ${signal.taName}`),
        onError: (error) => toast.error(errorMessage(error)),
      })
      return
    }
    createRule.mutate(
      { signalKey: signal.key },
      {
        onSuccess: () => toast.success(`Đang theo dõi ${signal.taName}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {signals.map((signal) => {
        const subscribed = !!ruleFor(signal.key)
        return (
          <div
            key={signal.key}
            className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SideBadge side={signal.side} />
                <span className="truncate text-sm font-semibold text-foreground">{signal.taName}</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground" title={signal.messageTitle}>
                {signal.messageTitle}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={subscribed ? "destructive" : "default"}
              disabled={pending}
              onClick={() => onToggle(signal)}
            >
              {pending && <LoaderCircle className="size-3.5 animate-spin" />}
              {subscribed ? "Bỏ theo dõi" : "Theo dõi"}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
