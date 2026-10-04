/**
 * `/chien-luoc` — trang Chiến lược hợp nhất: tab Cảnh báo | Backtest | Bộ lọc.
 *
 * Đồng bộ URL (giống bản dashboard cũ):
 * - `?tab=canh-bao` (mặc định) | `?tab=backtest` | `?tab=bo-loc` — đổi tab ghi `replace` nên
 *   không làm nặng lịch sử trình duyệt, và giữ nguyên `?symbol=` đang có.
 * - `?symbol=XXX` — mã khởi tạo cho tab Backtest (nguồn của `/backtest/:symbol`
 *   và `/backtest` mà Main chuyển hướng về đây).
 *
 * Bố cục: một thanh tab cố định dưới tiêu đề trang, phần nội dung cao đúng phần
 * còn lại (`scroll={false}`) để mỗi tab tự quản vùng cuộn của nó — thư viện chỉ
 * tiêu và vùng kết quả cuộn riêng, không lồng thanh cuộn.
 */
import { useSearchParams } from "react-router"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { AlertsView } from "./alerts/alerts-view"
import { BacktestLab } from "./backtest/backtest-lab"
import { FilterTab } from "./filter/filter-tab"
import { StrategyPremiumGate } from "./strategy-premium-gate"

const TABS = [
  { key: "canh-bao", label: "Cảnh báo" },
  { key: "backtest", label: "Backtest" },
  { key: "bo-loc", label: "Bộ lọc" },
] as const

type TabKey = (typeof TABS)[number]["key"]

function toTab(value: string | null): TabKey {
  return TABS.find((item) => item.key === value)?.key ?? "canh-bao"
}

export function StrategyPage() {
  const [params, setParams] = useSearchParams()
  const tab = toTab(params.get("tab"))
  const symbol = params.get("symbol") ?? undefined

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

  return (
    <WorkspacePage
      title="Chiến lược"
      description="Cảnh báo tín hiệu kỹ thuật, Backtest chiến lược và Bộ lọc cổ phiếu."
      scroll={false}
    >
      <StrategyPremiumGate>
        <Tabs value={tab} onValueChange={onChangeTab} className="min-h-0 flex-1 gap-0">
          <TabsList
            variant="line"
            aria-label="Chiến lược"
            className="h-10 w-full shrink-0 justify-start gap-1 rounded-none border-b border-border bg-card px-4"
          >
            {TABS.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                className="h-9 flex-none rounded-none px-3 text-sm font-medium after:bottom-0 after:bg-primary data-active:text-primary"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="canh-bao" className="flex min-h-0 flex-col overflow-hidden">
            <AlertsView />
          </TabsContent>

          <TabsContent value="backtest" className="flex min-h-0 flex-col overflow-hidden">
            <BacktestLab initialSymbol={symbol} />
          </TabsContent>

          <TabsContent value="bo-loc" className="flex min-h-0 flex-col overflow-hidden">
            <FilterTab />
          </TabsContent>
        </Tabs>
      </StrategyPremiumGate>
    </WorkspacePage>
  )
}
