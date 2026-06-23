import { Tabs } from "@arco-design/web-react"
import { useSearchParams } from "react-router"
import { AlertsInner } from "@/features/alerts"
import { BacktestLab } from "@/features/backtest"
import { PremiumGate } from "@/features/premium"

/**
 * /chien-luoc — unified Strategy page: Cảnh báo + Backtest tabs.
 *
 * URL sync: ?tab=canh-bao (default) | backtest
 *           ?symbol=XXX is forwarded to BacktestLab
 *
 * The entire page is wrapped in PremiumGate (both sub-pages are premium-only).
 * AppShell's <main> already provides flex-1 overflow-auto, so we use h-full
 * inside and let the shell constrain the viewport height.
 */
export function StrategyPage() {
  const [params, setSearchParams] = useSearchParams()
  const tab = params.get("tab") === "backtest" ? "backtest" : "canh-bao"

  function handleTabChange(key: string) {
    setSearchParams(
      (prev) => {
        prev.set("tab", key)
        return prev
      },
      { replace: true },
    )
  }

  return (
    <PremiumGate
      featureName="Chiến lược"
      description="Cảnh báo tín hiệu kỹ thuật và công cụ Backtest chiến lược giao dịch."
    >
      <div className="flex h-full min-h-0 flex-col">
        <Tabs
          activeTab={tab}
          onChange={handleTabChange}
          className="flex flex-col h-full min-h-0 [&_.arco-tabs-content-list]:flex-1 [&_.arco-tabs-content-list]:min-h-0 [&_.arco-tabs-content]:h-full [&_.arco-tabs-content]:overflow-auto"
        >
          <Tabs.TabPane key="canh-bao" title="Cảnh báo">
            {tab === "canh-bao" && <AlertsInner />}
          </Tabs.TabPane>
          <Tabs.TabPane key="backtest" title="Backtest">
            {tab === "backtest" && (
              <BacktestLab initialSymbol={params.get("symbol") ?? undefined} />
            )}
          </Tabs.TabPane>
        </Tabs>
      </div>
    </PremiumGate>
  )
}
