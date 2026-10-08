/**
 * Tab "Cảnh báo": the alerts being watched, the signal history and the legacy alerts.
 *
 * An alert watches a scope with a condition snapshot pinned from one saved config revision or one
 * backtest run, checked after each completed session. It never places an order and never edits the
 * Bot or the shared config. History is web only.
 */
import { useState } from "react"
import { Info, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useBotConfig } from "@/pages/demo-trading/bot/config/use-bot-config"

import { FeatureState } from "../shared/controls"
import { FEATURE_DISABLED_COPY } from "../shared/ui-text"
import { errorMessage, isFeatureDisabled } from "../shared/errors"
import { fmtDate } from "../shared/format"
import { AlertForm } from "./alert-form"
import { AlertsTable } from "./alerts-table"
import { type StrategyAlert } from "./api"
import { useAlerts } from "./hooks"
import { LegacyAlertsSection } from "./legacy/legacy-section"
import { SignalHistory } from "./signal-history"

type FormState = { alert?: StrategyAlert } | null

function summary(alerts: StrategyAlert[]): string {
  if (alerts.length === 0) return "Chưa có cảnh báo nào"
  const watching = alerts.filter((alert) => alert.status === "watching").length
  const sessions = alerts.flatMap((alert) => (alert.last_check.session ? [alert.last_check.session] : []))
  const latest = sessions.sort().at(-1)
  return `${alerts.length} cảnh báo · ${watching} đang theo dõi · ${latest ? `kiểm tra gần nhất phiên ${fmtDate(latest)}` : "chưa có lần kiểm tra"}`
}

export function AlertsView() {
  const alerts = useAlerts()
  const config = useBotConfig()
  const [form, setForm] = useState<FormState>(null)

  if (isFeatureDisabled(alerts.error)) return <FeatureState {...FEATURE_DISABLED_COPY} />

  const items = alerts.data?.items ?? []

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold">Cảnh báo đang theo dõi</h2>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="alerts-summary">
              {alerts.isPending ? "Đang tải…" : summary(items)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={alerts.isFetching} onClick={() => void alerts.refetch()}>
              <RefreshCw aria-hidden="true" className={alerts.isFetching ? "animate-spin" : undefined} />
              Làm mới
            </Button>
            <Button type="button" onClick={() => setForm({})}>
              <Plus aria-hidden="true" />
              Tạo cảnh báo
            </Button>
          </div>
        </div>

        {alerts.isError ? (
          <FeatureState
            title="Không tải được cảnh báo"
            description={errorMessage(alerts.error)}
            action={{ label: "Thử lại", onClick: () => void alerts.refetch() }}
          />
        ) : (
          <AlertsTable alerts={items} loading={alerts.isPending} onEdit={(alert) => setForm({ alert })} onCreate={() => setForm({})} />
        )}

        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Tín hiệu kỹ thuật, không phải giao dịch Bot. Cảnh báo giữ phiên bản cấu hình đã chọn.
        </p>

        <SignalHistory alerts={items} indicators={config.indicators} />

        <LegacyAlertsSection />
      </div>

      {form && (
        <AlertForm
          alert={form.alert}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null)
            toast.success(
              form.alert
                ? `Đã lưu cảnh báo “${saved.name}” (cảnh báo v${saved.current_version}).`
                : `Đã tạo cảnh báo “${saved.name}”. Cấu hình Bot và danh mục mua mới không đổi.`,
            )
          }}
        />
      )}
    </ScrollArea>
  )
}
