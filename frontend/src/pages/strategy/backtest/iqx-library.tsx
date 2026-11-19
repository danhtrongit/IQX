import type { TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { useIqxStrategies, type IqxStrategyItem } from "../shared/iqx"
import { IqxCard, IqxCardList } from "../shared/iqx-ui"
import { strategySummary } from "./draft"

export const STRATEGY_IQX_FOOTER =
  "Chiến lược dựng sẵn bởi IQX. Bấm Dùng để điền sẵn các thẻ chỉ báo vào Điều kiện Mua và Bán của bản nháp. Bot không đổi."

/** Tab IQX of the Backtest library: the shown Chiến lược IQX, in the admin's order (§3.2). */
export function IqxStrategyLibrary({
  indicators,
  activeId,
  onUse,
}: {
  indicators: readonly TechnicalIndicator[]
  activeId: string | null
  onUse: (item: IqxStrategyItem) => void
}) {
  const query = useIqxStrategies()
  const items = query.data ?? []
  return (
    <IqxCardList loading={query.isPending} error={query.isError ? query.error : null} onRetry={() => void query.refetch()} empty={items.length === 0} footer={STRATEGY_IQX_FOOTER}>
      {items.map((item) => {
        const summary = strategySummary(item.content.definition, indicators)
        return (
          <IqxCard key={item.id} testId={`iqx-strategy-${item.slug}`} name={item.content.name} idea={item.content.idea} active={activeId === item.id} onUse={() => onUse(item)}>
            <span className="block w-full text-price-up">{summary.buy}</span>
            <span className="block w-full text-price-down">{summary.sell}</span>
          </IqxCard>
        )
      })}
    </IqxCardList>
  )
}
