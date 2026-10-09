/**
 * Demo-trading order surface.
 *
 * Mount points:
 * - `<OrderPanel symbol={…} onSymbolChange={…} />` — the "Đặt lệnh" panel
 *   (`?view=trading`): a plain manual order form.
 * - `<TradingRuntime />` — mount ONCE, globally, next to the panels: it owns the
 *   engine heartbeat that fills pending orders and settles T+. No props.
 */
export { OrderPanel } from "./order-panel"
export type { OrderPanelProps } from "./order-panel"

export { TradingRuntime } from "./trading-runtime"

export { useEngineRefresh } from "./use-engine-refresh"
export type { EngineRefreshResult, EngineRefreshState } from "./use-engine-refresh"

export { usePlaceOrder, useActivateAccount } from "./use-trading-orders"
export type { PlaceOrderInput } from "./use-trading-orders"
