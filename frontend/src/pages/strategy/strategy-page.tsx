/**
 * `/chien-luoc`: Cảnh báo | Backtest | Bộ lọc.
 *
 * URL state (kept from the previous page, so every old link still opens the right place):
 * - `?tab=canh-bao` (default) | `?tab=backtest` | `?tab=bo-loc`. Changing tab writes with `replace`
 *   and keeps every other parameter.
 * - `?symbol=XXX`: the symbol the Backtest tab starts with (the target of `/backtest/:symbol`).
 *
 * A tab is mounted the first time it is opened and then kept (hidden when not selected), so going
 * to another tab and back keeps the confirmed state, the draft and the result on screen; nothing
 * re-runs or re-saves because of a tab change.
 */
import { useState } from "react"
import { useSearchParams } from "react-router"
import { Bell, ChartLine, Filter } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { AlertsView } from "./alerts/alerts-view"
import { BacktestTab } from "./backtest/backtest-tab"
import { FilterTab } from "./filter/filter-tab"
import { StrategyPremiumGate } from "./strategy-premium-gate"

const TABS = [
  { key: "canh-bao", label: "Cảnh báo", Icon: Bell },
  { key: "backtest", label: "Backtest", Icon: ChartLine },
  { key: "bo-loc", label: "Bộ lọc", Icon: Filter },
] as const

type TabKey = (typeof TABS)[number]["key"]

function toTab(value: string | null): TabKey {
  return TABS.find((item) => item.key === value)?.key ?? "canh-bao"
}

export function StrategyPage() {
  const [params, setParams] = useSearchParams()
  const tab = toTab(params.get("tab"))
  const symbol = params.get("symbol")?.trim().toUpperCase() || undefined
  const [visited, setVisited] = useState<ReadonlySet<TabKey>>(() => new Set([tab]))
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]))

  const onChangeTab = (next: string) => {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous)
        updated.set("tab", next)
        return updated
      },
      { replace: true },
    )
  }

  const keep = (key: TabKey) => (visited.has(key) || key === tab ? true : undefined)

  return (
    <WorkspacePage title="Chiến lược" description="Theo dõi tín hiệu, kiểm thử chiến lược và sàng lọc doanh nghiệp." scroll={false}>
      <StrategyPremiumGate>
        <Tabs value={tab} onValueChange={onChangeTab} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" aria-label="Chức năng Chiến lược" className="h-10 w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-card px-4">
            {TABS.map(({ key, label, Icon }) => (
              <TabsTrigger key={key} value={key} className="h-9 flex-none rounded-none px-3 text-sm font-medium after:bottom-0 after:bg-primary data-active:text-primary">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="canh-bao" forceMount={keep("canh-bao")} hidden={tab !== "canh-bao"} className="flex min-h-0 flex-col overflow-hidden data-[state=inactive]:hidden">
            {visited.has("canh-bao") && <AlertsView />}
          </TabsContent>
          <TabsContent value="backtest" forceMount={keep("backtest")} hidden={tab !== "backtest"} className="flex min-h-0 flex-col overflow-hidden data-[state=inactive]:hidden">
            {visited.has("backtest") && <BacktestTab key={symbol ?? "default"} initialSymbol={symbol} />}
          </TabsContent>
          <TabsContent value="bo-loc" forceMount={keep("bo-loc")} hidden={tab !== "bo-loc"} className="flex min-h-0 flex-col overflow-hidden data-[state=inactive]:hidden">
            {visited.has("bo-loc") && <FilterTab />}
          </TabsContent>
        </Tabs>
      </StrategyPremiumGate>
    </WorkspacePage>
  )
}
