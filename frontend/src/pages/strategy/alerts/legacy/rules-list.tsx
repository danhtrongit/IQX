import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

import { ConfirmDialog } from "../../confirm-dialog"
import { SideBadge } from "../../shared/controls"
import { errorMessage } from "../../shared/errors"
import type { LegacyRule } from "./api"
import { useDeleteLegacyRule, useLegacyRules, useSetLegacyRuleEnabled } from "./hooks"

/** Existing legacy rules: they can be paused, resumed or deleted, never edited into new ones. */
export function LegacyRulesList() {
  const rules = useLegacyRules(true)
  const setEnabled = useSetLegacyRuleEnabled()
  const remove = useDeleteLegacyRule()
  const [target, setTarget] = useState<LegacyRule | null>(null)

  if (rules.isPending) return <Skeleton className="h-16 w-full" />
  if (rules.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-xs text-destructive">{errorMessage(rules.error)}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void rules.refetch()}>Thử lại</Button>
      </div>
    )
  }
  if (rules.data.length === 0) return <p className="text-xs text-muted-foreground">Bạn chưa có cảnh báo cũ nào.</p>

  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rules.data.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <Switch
                checked={rule.isEnabled}
                disabled={setEnabled.isPending}
                aria-label={`Bật cảnh báo cũ ${rule.name}`}
                onCheckedChange={(checked) =>
                  setEnabled.mutate({ id: rule.id, enabled: checked }, { onError: (error) => toast.error(errorMessage(error)) })
                }
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SideBadge side={rule.side} />
                  <span className="truncate text-sm">{rule.name}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {rule.baseSignalKey ? `Mẫu: ${rule.baseSignalKey}` : "Tùy chỉnh"} ·{" "}
                  {rule.combination ? `${rule.combination.conditions.length} điều kiện (${rule.combination.logic})` : "Chưa có điều kiện"}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Xóa cảnh báo cũ ${rule.name}`}
              className="text-muted-foreground hover:text-price-down"
              onClick={() => setTarget(rule)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(open) => { if (!open) setTarget(null) }}
        title="Xóa cảnh báo cũ?"
        description={`Cảnh báo cũ “${target?.name ?? ""}” sẽ bị xóa khỏi tài khoản. Cảnh báo mới và lịch sử tín hiệu mới không bị ảnh hưởng.`}
        confirmLabel="Xóa"
        pending={remove.isPending}
        onConfirm={() => {
          if (!target) return
          remove.mutate(target.id, {
            onSuccess: () => { toast.success("Đã xóa cảnh báo cũ"); setTarget(null) },
            onError: (error) => { toast.error(errorMessage(error)); setTarget(null) },
          })
        }}
      />
    </>
  )
}
