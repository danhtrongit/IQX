/**
 * Cảnh báo của tôi — port từ
 * `dashboard/src/features/alerts/components/RulesList.tsx`.
 *
 * Mỗi dòng: bật/tắt (`is_enabled`), tên, phía MUA/BÁN và nguồn gốc (preset nào
 * hay tùy chỉnh, số điều kiện + logic). Xoá có bước xác nhận và xoá đúng rule
 * của mình — server trả 404 nếu rule không thuộc user.
 */
import { useState } from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { errorMessage } from "@/lib/api"
import { toast } from "sonner"

import { ConfirmDialog } from "../confirm-dialog"
import { useAlertRules, useDeleteAlertRule, useUpdateAlertRule } from "../hooks"
import type { UserAlertRule } from "../types"

function SideBadge({ side }: { side: UserAlertRule["side"] }) {
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

export function RulesList() {
  const rulesQuery = useAlertRules()
  const updateRule = useUpdateAlertRule()
  const deleteRule = useDeleteAlertRule()
  const [deleteTarget, setDeleteTarget] = useState<UserAlertRule | null>(null)

  if (rulesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-[58px] w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (rulesQuery.isError) {
    return (
      <PanelState
        title="Không tải được cảnh báo"
        description={errorMessage(rulesQuery.error)}
        action={{ label: "Thử lại", onClick: () => void rulesQuery.refetch() }}
      />
    )
  }

  const rules = rulesQuery.data ?? []

  if (rules.length === 0) {
    return (
      <PanelState
        title="Chưa có cảnh báo nào"
        description="Theo dõi một tín hiệu ở trên, hoặc tạo cảnh báo tùy chỉnh từ tab Backtest."
      />
    )
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteRule.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Đã xóa cảnh báo")
        setDeleteTarget(null)
      },
      onError: (error) => {
        toast.error(errorMessage(error))
        setDeleteTarget(null)
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Switch
              checked={rule.isEnabled}
              disabled={updateRule.isPending}
              aria-label={`Bật cảnh báo ${rule.name}`}
              onCheckedChange={(checked) =>
                updateRule.mutate(
                  { id: rule.id, isEnabled: checked },
                  {
                    onError: (error) => toast.error(errorMessage(error)),
                  },
                )
              }
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SideBadge side={rule.side} />
                <span className="truncate text-sm text-foreground">{rule.name}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {rule.baseSignalKey ? `Mẫu: ${rule.baseSignalKey}` : "Tùy chỉnh"} ·{" "}
                {rule.combination
                  ? `${rule.combination.conditions.length} điều kiện (${rule.combination.logic})`
                  : "Chưa có điều kiện"}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Xóa cảnh báo ${rule.name}`}
            className="text-muted-foreground hover:text-price-down"
            onClick={() => setDeleteTarget(rule)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa cảnh báo"
        description={
          <>
            Cảnh báo "{deleteTarget?.name}" sẽ bị xóa khỏi tài khoản của bạn. Bạn có thể theo dõi lại
            tín hiệu tương ứng ở danh sách phía trên.
          </>
        }
        confirmLabel="Xóa"
        pending={deleteRule.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
