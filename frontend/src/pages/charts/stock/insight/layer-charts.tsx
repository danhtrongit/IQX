/**
 * L1–L4 layer cards get their chart here; L5 gets the structured news list.
 * `rawInput` is optional at runtime (older / partial payloads omit it), so an
 * absent payload renders nothing instead of inventing numbers.
 */
import type { InsightRawInput } from "../types"

import { ChartBlock } from "./chart-block"
import {
  InsiderRawChart,
  LiquidityRawChart,
  MoneyFlowRawChart,
  TrendRawChart,
} from "./raw-charts"

export function LayerCharts({
  layer,
  rawInput,
}: {
  layer: "L1" | "L2" | "L3" | "L4"
  rawInput?: InsightRawInput | null
}) {
  if (!rawInput) return null

  if (layer === "L1") {
    return (
      <ChartBlock title="Giá & MA">
        <TrendRawChart ohlcv={rawInput.trend?.ohlcv} />
      </ChartBlock>
    )
  }

  if (layer === "L2") {
    const avg30Volume = rawInput.liquidity?.avg30?.totalVolume
    return (
      <ChartBlock title="Thanh khoản 10 phiên">
        <LiquidityRawChart
          history={rawInput.liquidity?.history}
          avgVolume={typeof avg30Volume === "number" ? avg30Volume : undefined}
        />
      </ChartBlock>
    )
  }

  if (layer === "L3") {
    return (
      <>
        <ChartBlock title="Nước ngoài (10 phiên)">
          <MoneyFlowRawChart items={rawInput.moneyFlow?.foreign} title="Nước ngoài" />
        </ChartBlock>
        <ChartBlock title="Tự doanh (10 phiên)">
          <MoneyFlowRawChart items={rawInput.moneyFlow?.proprietary} title="Tự doanh" />
        </ChartBlock>
      </>
    )
  }

  if (layer === "L4") {
    return (
      <ChartBlock title="Giao dịch nội bộ">
        <InsiderRawChart txns={rawInput.insider?.transactions} />
      </ChartBlock>
    )
  }

  return null
}
