/**
 * Demo-trading order surface.
 *
 * Mount points:
 * - `<OrderPanel symbol={…} onSymbolChange={…} />` — the "Đặt lệnh" panel
 *   (`?view=trading`). Must be inside `JourneyProvider`.
 * - `<TradingRuntime />` — mount ONCE, globally, next to the panels: it owns the
 *   Kết sổ (live + reload recovery, including Cấp 0's debrief gate) and the
 *   durable Cấp 2 stop-loss inbox. No props; also needs `JourneyProvider`.
 */
export { OrderPanel } from "./order-panel"
export type { OrderPanelProps } from "./order-panel"

export { SellCloseoutDialog, TradingRuntime } from "./closeout"
export type { CloseoutData } from "./closeout"

export { onOrderFilled, notifyOrderFilled } from "./fill-events"
export type { FilledOrderEvent } from "./fill-events"

export { useStockInsight, useValuation } from "./use-stock-insight"

export { useEngineRefresh } from "./use-engine-refresh"
export type { EngineRefreshResult, EngineRefreshState } from "./use-engine-refresh"

export { usePlaceOrder, useActivateAccount } from "./use-trading-orders"
export type { PlaceOrderInput } from "./use-trading-orders"

export {
  useActiveCap2Alerts,
  useCap0Kehoach,
  useCap1Progress,
  useCap1Trades,
  useCap2AlertAction,
  useCap2PreBuyAlert,
  useCap3Progress,
  useCap6Kehoach,
  useCap6MauThuan,
  useCap6Skip,
  useRecoveredPlan,
  useSetKhauVi,
} from "./use-plan-data"
export type { Cap2Alert, RecoveredPlan } from "./use-plan-data"

export {
  buildJourneyPlan,
  effectiveLyDo,
  emptyPlanDraft,
  planGate,
} from "./journey-plan"
export type { JourneyPlanInput, PlanContext, PlanDraft, PlanGate } from "./journey-plan"
