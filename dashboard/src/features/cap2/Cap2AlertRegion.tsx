import { useMemo, useState } from "react"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { ChamCatLoBanner } from "./AlertCap2"
import { useCap2Events } from "./Cap2Context"
import { useActOnCap2Alert, useCap2ActiveAlerts } from "./hooks"
import type { Cap2Alert, Cap2AlertEscalation } from "./types"
import type { AlertLevel } from "./alertRate"

function alertLevel(escalation: Cap2AlertEscalation | null): AlertLevel {
  if (escalation === "delay_5s") return "greyed5s"
  if (escalation === "type_phrase") return "typeToConfirm"
  return "thuong"
}

/**
 * Durable Cấp 2 stop-loss inbox mounted at the top of the real trading shell.
 *
 * GET `/cap2/alerts/active` is deliberately the only source: claiming an
 * impression, the two-alert budget, nhồi-lệnh priority, clean-10 auto-mute and
 * ignored-streak escalation are all serialized by the backend. This component
 * must not recreate those counters from localStorage or portfolio guesses.
 */
export function Cap2AlertRegion({ enabled = true }: { enabled?: boolean }) {
  const { data } = useCap2ActiveAlerts(undefined, enabled)
  const actOnAlert = useActOnCap2Alert()
  const { setSymbol } = useSymbol()
  const { setActivePanel, setIsOpen } = useSidebar()
  const { prepareSellIntent } = useCap2Events()
  const [locallyActedId, setLocallyActedId] = useState<string | null>(null)

  // The pre-buy nhồi-lệnh warning belongs in the order-entry preflight because
  // its cancel/proceed choice must happen before the BUY. Rendering it here
  // after a fill would be a false control. This region owns the page-level SL
  // banner only; the hooks/API exported from this feature provide that seam.
  const alert = useMemo<Cap2Alert | null>(() => {
    return (
      data?.alerts.find(
        (candidate) =>
          candidate.alert_type === "cham_cat_lo" &&
          candidate.status === "shown" &&
          candidate.id !== locallyActedId,
      ) ?? null
    )
  }, [data?.alerts, locallyActedId])

  if (!alert || alert.threshold_price_vnd == null) return null

  const finishAction = (nextStep: "none" | "confirm_ato_sell") => {
    setLocallyActedId(alert.id)
    if (nextStep !== "confirm_ato_sell") return
    prepareSellIntent(alert.symbol)
    setSymbol(alert.symbol)
    setActivePanel("trading")
    setIsOpen(true)
  }

  return (
    <section className="cap2-alert-region" aria-label="Cảnh báo kỷ luật Cấp 2">
      <ChamCatLoBanner
        symbol={alert.symbol}
        catLo={alert.threshold_price_vnd}
        giaHienTai={alert.observed_price_vnd}
        lossPct={alert.loss_pct}
        positionQuantity={alert.position_quantity}
        planStartedAt={alert.plan_started_at}
        phienGiuQuaNguong={alert.breach_session_no}
        variant="phien_ke"
        level={alertLevel(alert.escalation)}
        sellActionLabel="Mở form bán theo kế hoạch"
        onBan={() =>
          actOnAlert.mutate(
            { alertId: alert.id, action: "sell_ato" },
            { onSuccess: (result) => finishAction(result.next_step) },
          )
        }
        onGiuTiep={() =>
          actOnAlert.mutate(
            {
              alertId: alert.id,
              action: "hold",
              ...(alert.escalation === "type_phrase"
                ? { confirmationPhrase: "Tôi hiểu" }
                : {}),
            },
            { onSuccess: (result) => finishAction(result.next_step) },
          )
        }
      />
    </section>
  )
}
